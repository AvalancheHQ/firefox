/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// CodSpeed driver for ARES-6. Run from the ARES-6 directory:
//   js --strict-benchmark-mode ../codspeed/ares6.js
//
// Reuses the shell runners from cli.js: each benchmark is evaluated in a
// fresh global and times its own 200 iterations (60 for ML). Like
// results.js, the per-iteration times are split into the three ARES-6
// metrics; each metric becomes a CodSpeed benchmark whose rounds are the
// outer repetitions (`driver.start(6)` upstream).

loadRelativeToScript("harness.js");

// cli.js defines isInBrowser, readFile, makeDoRun and makeBenchmarkRunner
// before it loads driver.js; those are all we need from it.
{
  const source = read("cli.js");
  const end = source.indexOf('load("driver.js");');
  if (end < 0) {
    throw new Error("cli.js: could not find the driver load");
  }
  evaluate(source.slice(0, end), { fileName: "cli.js" });
}

var reportedTimes = null;
function reportResult(times) {
  reportedTimes = times;
}

load("air_benchmark.js");
load("basic_benchmark.js");
load("babylon_benchmark.js");
load("ml_benchmark.js");

const REPETITIONS = Number(os.getenv("CODSPEED_JS_ARES6_REPETITIONS") || 6);

const runners = [
  [AirBenchmarkRunner, "air_benchmark.js"],
  [BasicBenchmarkRunner, "basic_benchmark.js"],
  [BabylonBenchmarkRunner, "babylon_benchmark.js"],
  [MLBenchmarkRunner, "ml_benchmark.js"],
];

for (const [runner, file] of runners) {
  const path = "ARES-6/" + file;
  const firstIteration = [];
  const averageWorstCase = [];
  const steadyState = [];

  // One program run is the profiler's unit; its 200 iterations feed all
  // three metrics, so the run is reported under the steadyState name.
  for (let i = 0; i < REPETITIONS; i++) {
    gc();
    reportedTimes = null;
    codspeedHarness.runInstrumented(codspeedHarness.uriFor(path, runner.name + "-steadyState"), () =>
      runner.run()
    );
    if (!reportedTimes) {
      throw new Error(runner.name + " did not report results");
    }
    const timesNs = reportedTimes.map(ms => ms * 1e6);
    firstIteration.push(timesNs[0]);
    const steady = timesNs.slice(1).sort((a, b) => b - a);
    averageWorstCase.push((steady[0] + steady[1] + steady[2] + steady[3]) / 4);
    steadyState.push(...steady);
  }

  for (const [metric, samples] of [
    ["firstIteration", firstIteration],
    ["averageWorstCase", averageWorstCase],
    ["steadyState", steadyState],
  ]) {
    codspeedHarness.record(runner.name + "-" + metric, path, samples.map(() => 1), samples);
  }
}

codspeedHarness.finish();
