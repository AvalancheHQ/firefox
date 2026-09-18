/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// CodSpeed driver for SunSpider 0.9.1. Run from the sunspider-0.9.1
// directory:
//   js --strict-benchmark-mode ../../codspeed/sunspider.js
//
// As in sunspider-standalone-driver.js, one iteration is a `load()` of the
// test file: the programs do their work at top level, so parsing is part of
// what is measured.

loadRelativeToScript("harness.js");

var testNames = [
  "3d-cube",
  "3d-morph",
  "3d-raytrace",
  "access-binary-trees",
  "access-fannkuch",
  "access-nbody",
  "access-nsieve",
  "bitops-3bit-bits-in-byte",
  "bitops-bits-in-byte",
  "bitops-bitwise-and",
  "bitops-nsieve-bits",
  "controlflow-recursive",
  "crypto-aes",
  "crypto-md5",
  "crypto-sha1",
  "date-format-tofte",
  "date-format-xparb",
  "math-cordic",
  "math-partial-sums",
  "math-spectral-norm",
  "regexp-dna",
  "string-base64",
  "string-fasta",
  "string-tagcloud",
  "string-unpack-code",
  "string-validate-input",
];

for (const name of testNames) {
  const file = name + ".js";
  codspeedHarness.bench(name, "SunSpider/sunspider-0.9.1/" + file, () => load(file));
}

codspeedHarness.finish();
