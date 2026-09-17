/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// CodSpeed harness for the SpiderMonkey JS shell.
//
// Suite drivers in this directory call `codspeedHarness.bench()` once per
// subtest and `codspeedHarness.finish()` at the end. Measurement, runner
// communication and the walltime report are done by the shell's `codspeed`
// object (js/src/shell/CodSpeed.cpp, on top of the vendored codspeed-cpp
// core); this file only decides how many times to run what.

var codspeedHarness = (function () {
  "use strict";

  if (typeof codspeed !== "object") {
    throw new Error("this shell has no codspeed object; build js/src/shell with CodSpeed.cpp");
  }

  const URI_PREFIX = "third_party/webkit/PerformanceTests/";

  function envNumber(name, fallback) {
    const value = os.getenv(name);
    return value === undefined || value === "" ? fallback : Number(value);
  }

  const config = {
    warmupTimeNs: envNumber("CODSPEED_JS_WARMUP_MS", 1000) * 1e6,
    minRoundTimeNs: envNumber("CODSPEED_JS_MIN_ROUND_MS", 20) * 1e6,
    maxTimeNs: envNumber("CODSPEED_JS_MAX_TIME_MS", 3000) * 1e6,
    minRounds: envNumber("CODSPEED_JS_MIN_ROUNDS", 10),
  };

  // Under CPU simulation the runner counts instructions between start and
  // end, so exactly one call is measured instead of timed rounds.
  const runnerMode = os.getenv("CODSPEED_RUNNER_MODE") || "walltime";
  const singleShot = runnerMode === "simulation" || runnerMode === "instrumentation";

  let count = 0;

  function nowNs() {
    return performance.now() * 1e6;
  }

  function uriFor(file, name) {
    return URI_PREFIX + file + "::" + name;
  }

  // One measured round: `iterations` calls of `fn` as a single script so the
  // JIT inlines the loop, executed under __codspeed_root_frame__.
  function measureRound(fn, iterations) {
    return codspeed.runRootFrame(() => {
      for (let i = 0; i < iterations; i++) {
        fn();
      }
    });
  }

  // Records one benchmark from raw rounds. `timesPerRoundNs[i]` is the total
  // time of round i, which ran `itersPerRound[i]` iterations.
  function record(name, file, itersPerRound, timesPerRoundNs) {
    codspeed.addWalltimeBenchmark(name, uriFor(file, name), itersPerRound, timesPerRoundNs);
    count++;
    const perIter = timesPerRoundNs.map((t, i) => t / itersPerRound[i]).sort((a, b) => a - b);
    const mean = perIter.reduce((a, t) => a + t, 0) / perIter.length;
    print(
      name.padEnd(40) +
        ("mean " + formatNs(mean)).padEnd(20) +
        ("median " + formatNs(perIter[perIter.length >> 1])).padEnd(22) +
        perIter.length + " rounds"
    );
  }

  // Times `fn` in-process: warm up for `warmupTimeNs`, pick an iteration
  // count so a round lasts at least `minRoundTimeNs`, then run rounds until
  // both `minRounds` and `maxTimeNs` are satisfied.
  function bench(name, file, fn, { setup, teardown } = {}) {
    gc();
    if (setup) {
      setup();
    }

    const warmupStart = nowNs();
    do {
      fn();
    } while (nowNs() - warmupStart < config.warmupTimeNs);

    let iterPerRound = 1;
    if (!singleShot) {
      while (iterPerRound < 2 ** 30 && measureRound(fn, iterPerRound) < config.minRoundTimeNs) {
        iterPerRound *= 2;
      }
    }

    const times = [];
    const start = nowNs();
    codspeed.startBenchmark(uriFor(file, name));
    do {
      times.push(measureRound(fn, iterPerRound));
    } while (!singleShot && (times.length < config.minRounds || nowNs() - start < config.maxTimeNs));
    codspeed.endBenchmark();

    if (teardown) {
      teardown();
    }

    record(name, file, times.map(() => iterPerRound), times);
  }

  // For drivers that time their own iterations: run `fn` once under the
  // profiler root frame, as the named benchmark.
  function runInstrumented(uri, fn) {
    codspeed.startBenchmark(uri);
    try {
      codspeed.runRootFrame(fn);
    } finally {
      codspeed.endBenchmark();
    }
  }

  function formatNs(ns) {
    if (ns >= 1e9) return (ns / 1e9).toFixed(3) + " s";
    if (ns >= 1e6) return (ns / 1e6).toFixed(3) + " ms";
    if (ns >= 1e3) return (ns / 1e3).toFixed(3) + " us";
    return ns.toFixed(1) + " ns";
  }

  function finish() {
    if (count === 0) {
      throw new Error("codspeed harness: no benchmarks were recorded");
    }
    if (singleShot) {
      print("\n" + count + " benchmarks measured by the runner (" + runnerMode + ")");
      return;
    }
    const folder = os.getenv("CODSPEED_PROFILE_FOLDER");
    if (folder === undefined || folder === "") {
      print("\n" + count + " benchmarks (CODSPEED_PROFILE_FOLDER unset, report not written)");
      return;
    }
    codspeed.writeWalltimeReport();
    print("[CodSpeed] " + count + " benchmarks reported");
  }

  return { bench, record, runInstrumented, uriFor, finish, config };
})();
