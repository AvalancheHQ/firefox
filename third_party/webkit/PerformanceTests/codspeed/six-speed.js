/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// CodSpeed driver for six-speed. Run from the six-speed directory:
//   js --strict-benchmark-mode ../codspeed/six-speed.js
//
// Mirrors ../six-speed/test.js: each snippet in tests/ is evaluated with
// `new Function` and registers its workload through the global `test()`.
// The harness owns the iteration count instead of `iteration_for_test`.

loadRelativeToScript("harness.js");

var tests = [
  "template_string",
  "defaults",
  "map-set-lookup",
  "spread",
  "object-assign",
  "spread-literal",
  "map-set",
  "destructuring-simple",
  "super",
  "for-of-object",
  "rest",
  "regex-u",
  "arrow",
  "bindings-compound",
  "classes",
  "template_string_tag",
  "map-string",
  "arrow-declare",
  "spread-generator",
  "object-literal-ext",
  "generator",
  "arrow-args",
  "for-of-array",
  "bindings",
  "destructuring",
  "map-set-object",
];

var registered = null;

function assertEqual() {}
function test(fn) {
  registered = fn;
}

for (const name of tests) {
  for (const variant of ["es5", "es6"]) {
    const file = "tests/" + name + "." + variant;
    registered = null;
    new Function(read(file))();
    if (registered === null) {
      throw new Error(file + " did not call test()");
    }
    codspeedHarness.bench(name + "-" + variant, "six-speed/" + file, registered);
  }
}

codspeedHarness.finish();
