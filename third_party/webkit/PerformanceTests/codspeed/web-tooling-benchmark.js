/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// CodSpeed driver for the Web Tooling Benchmark. Run from the fetched
// web-tooling-benchmark directory (taskcluster/kinds/fetch/benchmarks.yml):
//   js --strict-benchmark-mode ../codspeed/web-tooling-benchmark.js
//
// cli.js is a webpack bundle whose entry module builds a benchmark.js Suite
// and immediately calls `suite.run()`. That call is replaced so the suite is
// captured instead, then each benchmark's `fn` is timed by the harness.

loadRelativeToScript("harness.js");

var __codspeedSuite = null;

{
  const source = read("cli.js");
  const marker = "\nsuite.run();\n";
  const index = source.indexOf(marker);
  if (index < 0 || source.indexOf(marker, index + 1) >= 0) {
    throw new Error("cli.js: expected exactly one top-level suite.run()");
  }
  const patched =
    source.slice(0, index) + "\n__codspeedSuite = suite;\n" + source.slice(index + marker.length);
  evaluate(patched, { fileName: "cli.js" });
}

if (!__codspeedSuite || !__codspeedSuite.length) {
  throw new Error("cli.js did not build a benchmark suite");
}

for (let i = 0; i < __codspeedSuite.length; i++) {
  const benchmark = __codspeedSuite[i];
  codspeedHarness.bench(benchmark.name, "web-tooling-benchmark/cli.js", () => benchmark.fn());
}

codspeedHarness.finish();
