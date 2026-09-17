/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// CodSpeed walltime harness for the SpiderMonkey JS shell.
//
// Suite drivers in this directory call `codspeedHarness.bench()` once per
// subtest and `codspeedHarness.finish()` at the end. Under the CodSpeed
// runner ($CODSPEED_PROFILE_FOLDER set) the results are written in the same
// JSON format codspeed-node produces; otherwise a table is printed.
//
// `codspeed.*` calls go through no-op stubs so the drivers keep working
// unchanged once the shell exposes native instrument-hooks builtins.

var codspeedHarness = (function () {
  "use strict";

  const INTEGRATION_NAME = "spidermonkey-jsshell";
  const INTEGRATION_VERSION = "0.1.0";
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

  const hooks =
    typeof codspeed === "object"
      ? codspeed
      : {
          startBenchmark() {},
          stopBenchmark() {},
          setExecutedBenchmark() {},
        };

  const benchmarks = [];

  function nowNs() {
    return performance.now() * 1e6;
  }

  function __codspeed_root_frame__(fn, iterations) {
    const start = nowNs();
    for (let i = 0; i < iterations; i++) {
      fn();
    }
    return nowNs() - start;
  }

  function quantile(sorted, position) {
    const index = (sorted.length - 1) * position;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) {
      return sorted[lower];
    }
    return sorted[lower] + (index - lower) * (sorted[upper] - sorted[lower]);
  }

  function computeStats(samplesNs, iterPerRound, warmupIters) {
    const sorted = samplesNs.slice().sort((a, b) => a - b);
    const n = sorted.length;
    const mean = sorted.reduce((acc, t) => acc + t, 0) / n;
    const variance =
      n > 1
        ? sorted.reduce((acc, t) => acc + (t - mean) * (t - mean), 0) / (n - 1)
        : 0;
    const stdev = Math.sqrt(variance);
    const q1 = quantile(sorted, 0.25);
    const q3 = quantile(sorted, 0.75);
    const iqr = q3 - q1;
    return {
      min_ns: sorted[0],
      max_ns: sorted[n - 1],
      mean_ns: mean,
      stdev_ns: stdev,
      q1_ns: q1,
      median_ns: quantile(sorted, 0.5),
      q3_ns: q3,
      rounds: n,
      total_time: (sorted.reduce((acc, t) => acc + t, 0) * iterPerRound) / 1e9,
      iqr_outlier_rounds: sorted.filter(t => t < q1 - 1.5 * iqr || t > q3 + 1.5 * iqr).length,
      stdev_outlier_rounds: sorted.filter(t => t < mean - 3 * stdev || t > mean + 3 * stdev).length,
      iter_per_round: iterPerRound,
      warmup_iters: warmupIters,
    };
  }

  // Records one benchmark from per-round sample durations. `samplesNs` are
  // per-iteration times; each round ran `iterPerRound` iterations.
  function record(name, file, samplesNs, { iterPerRound = 1, warmupIters = 0, benchConfig = {} } = {}) {
    const uri = URI_PREFIX + file + "::" + name;
    hooks.setExecutedBenchmark(uri);
    benchmarks.push({
      name,
      uri,
      config: {
        warmup_time_ns: benchConfig.warmup_time_ns ?? null,
        min_round_time_ns: benchConfig.min_round_time_ns ?? null,
        max_time_ns: benchConfig.max_time_ns ?? null,
        max_rounds: benchConfig.max_rounds ?? null,
      },
      stats: computeStats(samplesNs, iterPerRound, warmupIters),
    });
    return benchmarks[benchmarks.length - 1];
  }

  // Times `fn` in-process: warm up for `warmupTimeNs`, pick an iteration
  // count so a round lasts at least `minRoundTimeNs`, then run rounds until
  // both `minRounds` and `maxTimeNs` are satisfied.
  function bench(name, file, fn, { setup, teardown } = {}) {
    gc();
    if (setup) {
      setup();
    }

    let warmupIters = 0;
    const warmupStart = nowNs();
    do {
      fn();
      warmupIters++;
    } while (nowNs() - warmupStart < config.warmupTimeNs);

    let iterPerRound = 1;
    while (iterPerRound < 2 ** 30 && __codspeed_root_frame__(fn, iterPerRound) < config.minRoundTimeNs) {
      iterPerRound *= 2;
    }

    const samples = [];
    const start = nowNs();
    hooks.startBenchmark();
    do {
      samples.push(__codspeed_root_frame__(fn, iterPerRound) / iterPerRound);
    } while (samples.length < config.minRounds || nowNs() - start < config.maxTimeNs);
    hooks.stopBenchmark();

    if (teardown) {
      teardown();
    }

    const result = record(name, file, samples, {
      iterPerRound,
      warmupIters,
      benchConfig: {
        warmup_time_ns: config.warmupTimeNs,
        min_round_time_ns: config.minRoundTimeNs,
        max_time_ns: config.maxTimeNs,
      },
    });
    print(formatRow(result));
    return result;
  }

  function formatNs(ns) {
    if (ns >= 1e9) return (ns / 1e9).toFixed(3) + " s";
    if (ns >= 1e6) return (ns / 1e6).toFixed(3) + " ms";
    if (ns >= 1e3) return (ns / 1e3).toFixed(3) + " us";
    return ns.toFixed(1) + " ns";
  }

  function formatRow(b) {
    const s = b.stats;
    return (
      b.name.padEnd(40) +
      ("mean " + formatNs(s.mean_ns)).padEnd(20) +
      ("median " + formatNs(s.median_ns)).padEnd(22) +
      ("cv " + ((100 * s.stdev_ns) / s.mean_ns).toFixed(1) + "%").padEnd(12) +
      s.rounds + " rounds x " + s.iter_per_round
    );
  }

  function asciiBytes(text) {
    const escaped = text.replace(/[\u0080-\uffff]/g, c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
    const bytes = new Uint8Array(escaped.length);
    for (let i = 0; i < escaped.length; i++) {
      bytes[i] = escaped.charCodeAt(i);
    }
    return bytes;
  }

  function finish() {
    if (benchmarks.length === 0) {
      throw new Error("codspeed harness: no benchmarks were recorded");
    }
    const folder = os.getenv("CODSPEED_PROFILE_FOLDER");
    if (folder === undefined || folder === "") {
      print("\n" + benchmarks.length + " benchmarks (CODSPEED_PROFILE_FOLDER unset, results not written)");
      return;
    }
    const resultsDir = folder + "/results";
    if (os.system("mkdir -p '" + resultsDir + "'") !== 0) {
      throw new Error("codspeed harness: cannot create " + resultsDir);
    }
    const path = resultsDir + "/" + os.getpid() + ".json";
    const results = {
      creator: { name: INTEGRATION_NAME, version: INTEGRATION_VERSION, pid: os.getpid() },
      instrument: { type: "walltime" },
      benchmarks,
    };
    os.file.writeTypedArrayToFile(path, asciiBytes(JSON.stringify(results, null, 2)));
    print("\n[CodSpeed] " + benchmarks.length + " benchmarks written to " + path);
  }

  return { bench, record, finish, config };
})();
