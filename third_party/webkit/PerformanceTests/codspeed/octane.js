/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// CodSpeed driver for Octane 2.0. Run from the fetched octane directory
// (taskcluster/kinds/fetch/benchmarks.yml):
//   js --strict-benchmark-mode ../codspeed/octane.js
//
// Loads the same files as run.js but drives each `Benchmark` directly
// instead of through BenchmarkSuite.RunSuites: `Setup()`, timed `run()`
// iterations, `TearDown()`. The Splay/Mandreel latency scores are GC-pause
// statistics with no walltime equivalent and are not reported.

loadRelativeToScript("harness.js");

var base_dir = "";
load("base.js");

const files = [
  "richards.js",
  "deltablue.js",
  "crypto.js",
  "raytrace.js",
  "earley-boyer.js",
  "regexp.js",
  "splay.js",
  "navier-stokes.js",
  "pdfjs.js",
  "mandreel.js",
  "gbemu-part1.js",
  "gbemu-part2.js",
  "code-load.js",
  "box2d.js",
  "zlib.js",
  "zlib-data.js",
  "typescript.js",
  "typescript-input.js",
  "typescript-compiler.js",
];

// Suites register themselves in BenchmarkSuite.suites as their file loads.
const suiteFiles = new Map();
for (const file of files) {
  const before = BenchmarkSuite.suites.length;
  load(file);
  for (const suite of BenchmarkSuite.suites.slice(before)) {
    suiteFiles.set(suite, file);
  }
}

for (const suite of BenchmarkSuite.suites) {
  const file = "octane/" + suiteFiles.get(suite);
  for (const benchmark of suite.benchmarks) {
    const name = suite.benchmarks.length === 1 ? suite.name : suite.name + "-" + benchmark.name;
    BenchmarkSuite.ResetRNG();
    codspeedHarness.bench(name, file, () => benchmark.run(), {
      setup: () => benchmark.Setup(),
      teardown: () => benchmark.TearDown(),
    });
  }
}

codspeedHarness.finish();
