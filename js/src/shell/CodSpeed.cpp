/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "shell/CodSpeed.h"

#include "mozilla/Attributes.h"

#include <stdint.h>
#include <string>
#include <vector>

#include "jsapi.h"
#include "jsfriendapi.h"

#include "codspeed.h"     // codspeed::CodSpeed, RawWalltimeBenchmark
#include "measurement.hpp"  // measurement_*
#include "js/Array.h"
#include "js/CallAndConstruct.h"  // JS_CallFunctionValue
#include "js/CharacterEncoding.h"
#include "js/PropertyAndElement.h"  // JS_DefineProperty, JS_GetElement
#include "js/PropertySpec.h"
#include "js/RootingAPI.h"
#include "js/Value.h"

using JS::CallArgs;
using JS::CallArgsFromVp;
using JS::HandleObject;
using JS::HandleValue;
using JS::HandleValueArray;
using JS::RootedObject;
using JS::RootedString;
using JS::RootedValue;
using JS::UniqueChars;
using JS::Value;

// Walltime data accumulated by addWalltimeBenchmark, flushed by
// writeWalltimeReport.
static std::vector<codspeed::RawWalltimeBenchmark>* gWalltimeBenchmarks =
    nullptr;

static codspeed::CodSpeed* Instance() {
  return codspeed::CodSpeed::getInstance();
}

static bool ArgToUTF8(JSContext* cx, HandleValue v, const char* what,
                      std::string* out) {
  if (!v.isString()) {
    JS_ReportErrorASCII(cx, "codspeed: %s must be a string", what);
    return false;
  }
  RootedString str(cx, v.toString());
  UniqueChars chars = JS_EncodeStringToUTF8(cx, str);
  if (!chars) {
    return false;
  }
  out->assign(chars.get());
  return true;
}

static bool codspeed_isInstrumented(JSContext* cx, unsigned argc, Value* vp) {
  CallArgs args = CallArgsFromVp(argc, vp);
  Instance();
  args.rval().setBoolean(measurement_is_instrumented());
  return true;
}

// startBenchmark(uri): name the benchmark about to run and open its measured
// section.
static bool codspeed_startBenchmark(JSContext* cx, unsigned argc, Value* vp) {
  CallArgs args = CallArgsFromVp(argc, vp);
  std::string uri;
  if (args.length() != 1 || !ArgToUTF8(cx, args[0], "uri", &uri)) {
    return false;
  }
  Instance()->start_benchmark(uri);
  measurement_start();
  args.rval().setUndefined();
  return true;
}

static bool codspeed_endBenchmark(JSContext* cx, unsigned argc, Value* vp) {
  CallArgs args = CallArgsFromVp(argc, vp);
  measurement_stop();
  Instance()->end_benchmark();
  args.rval().setUndefined();
  return true;
}

// The benchmarked code runs inside this frame so profiles have a clean root.
// Must not be inlined, and must keep its name.
MOZ_NEVER_INLINE static bool __codspeed_root_frame__(JSContext* cx,
                                                     HandleValue fn,
                                                     uint64_t* startNs,
                                                     uint64_t* endNs) {
  RootedValue rval(cx);
  *startNs = measurement_current_timestamp();
  bool ok = JS_CallFunctionValue(cx, nullptr, fn, HandleValueArray::empty(),
                                 &rval);
  *endNs = measurement_current_timestamp();
  return ok;
}

// runRootFrame(fn): call fn once inside __codspeed_root_frame__, mark the
// interval for the profiler and return the elapsed nanoseconds. Callers put
// their iteration loop inside fn so the JIT sees it as one script.
static bool codspeed_runRootFrame(JSContext* cx, unsigned argc, Value* vp) {
  CallArgs args = CallArgsFromVp(argc, vp);
  if (args.length() != 1 || !args[0].isObject() ||
      !JS::IsCallable(&args[0].toObject())) {
    JS_ReportErrorASCII(cx, "codspeed.runRootFrame takes a function");
    return false;
  }

  uint64_t startNs = 0;
  uint64_t endNs = 0;
  if (!__codspeed_root_frame__(cx, args[0], &startNs, &endNs)) {
    return false;
  }

  Instance();
  if (measurement_is_instrumented()) {
    if (measurement_add_marker(MARKER_TYPE_BENCHMARK_START, startNs) != 0 ||
        measurement_add_marker(MARKER_TYPE_BENCHMARK_END, endNs) != 0) {
      JS_ReportErrorASCII(cx, "codspeed.runRootFrame: adding markers failed");
      return false;
    }
  }

  args.rval().setNumber(double(endNs - startNs));
  return true;
}

static bool ArrayToVector(JSContext* cx, HandleValue v, const char* what,
                          std::vector<double>* out) {
  bool isArray = false;
  if (!v.isObject() || !JS::IsArrayObject(cx, v, &isArray) || !isArray) {
    JS_ReportErrorASCII(cx, "codspeed: %s must be an array of numbers", what);
    return false;
  }
  RootedObject arr(cx, &v.toObject());
  uint32_t length = 0;
  if (!JS::GetArrayLength(cx, arr, &length)) {
    return false;
  }
  RootedValue elem(cx);
  for (uint32_t i = 0; i < length; i++) {
    if (!JS_GetElement(cx, arr, i, &elem)) {
      return false;
    }
    if (!elem.isNumber()) {
      JS_ReportErrorASCII(cx, "codspeed: %s must be an array of numbers", what);
      return false;
    }
    out->push_back(elem.toNumber());
  }
  return true;
}

// addWalltimeBenchmark(name, uri, itersPerRound, timesPerRoundNs): record the
// raw rounds of one benchmark; statistics are computed by codspeed-cpp core
// when the report is written.
static bool codspeed_addWalltimeBenchmark(JSContext* cx, unsigned argc,
                                          Value* vp) {
  CallArgs args = CallArgsFromVp(argc, vp);
  if (args.length() != 4) {
    JS_ReportErrorASCII(
        cx,
        "codspeed.addWalltimeBenchmark(name, uri, itersPerRound, timesNs)");
    return false;
  }
  codspeed::RawWalltimeBenchmark bench;
  std::vector<double> iters;
  if (!ArgToUTF8(cx, args[0], "name", &bench.name) ||
      !ArgToUTF8(cx, args[1], "uri", &bench.uri) ||
      !ArrayToVector(cx, args[2], "itersPerRound", &iters) ||
      !ArrayToVector(cx, args[3], "timesPerRoundNs",
                     &bench.times_per_round_ns)) {
    return false;
  }
  if (iters.size() != bench.times_per_round_ns.size() || iters.empty()) {
    JS_ReportErrorASCII(cx,
                        "codspeed.addWalltimeBenchmark: itersPerRound and "
                        "timesPerRoundNs must be non-empty and same length");
    return false;
  }
  bench.iters_per_round.reserve(iters.size());
  for (double n : iters) {
    bench.iters_per_round.push_back(uint64_t(n));
  }
  if (!gWalltimeBenchmarks) {
    gWalltimeBenchmarks = new std::vector<codspeed::RawWalltimeBenchmark>();
  }
  gWalltimeBenchmarks->push_back(std::move(bench));
  args.rval().setUndefined();
  return true;
}

// writeWalltimeReport(): write the accumulated benchmarks to
// $CODSPEED_PROFILE_FOLDER/results/<pid>.json (or ./results when unset).
static bool codspeed_writeWalltimeReport(JSContext* cx, unsigned argc,
                                         Value* vp) {
  CallArgs args = CallArgsFromVp(argc, vp);
  if (!gWalltimeBenchmarks || gWalltimeBenchmarks->empty()) {
    JS_ReportErrorASCII(cx,
                        "codspeed.writeWalltimeReport: no benchmarks recorded");
    return false;
  }
  codspeed::generate_codspeed_walltime_report(*gWalltimeBenchmarks);
  gWalltimeBenchmarks->clear();
  args.rval().setUndefined();
  return true;
}

static const JSFunctionSpecWithHelp codspeed_functions[] = {
    JS_FN_HELP("isInstrumented", codspeed_isInstrumented, 0, 0,
"isInstrumented()",
"  True when running under the CodSpeed runner."),

    JS_FN_HELP("startBenchmark", codspeed_startBenchmark, 1, 0,
"startBenchmark(uri)",
"  Name the benchmark about to run, as <git-relative file>::<name>, and open\n"
"  its measured section."),

    JS_FN_HELP("endBenchmark", codspeed_endBenchmark, 0, 0,
"endBenchmark()",
"  Close the measured section and report the benchmark as executed."),

    JS_FN_HELP("runRootFrame", codspeed_runRootFrame, 1, 0,
"runRootFrame(fn)",
"  Call fn once inside __codspeed_root_frame__, emit profiler markers around\n"
"  the call, and return the elapsed time in nanoseconds."),

    JS_FN_HELP("addWalltimeBenchmark", codspeed_addWalltimeBenchmark, 4, 0,
"addWalltimeBenchmark(name, uri, itersPerRound, timesPerRoundNs)",
"  Record the raw rounds of a benchmark for the walltime report."),

    JS_FN_HELP("writeWalltimeReport", codspeed_writeWalltimeReport, 0, 0,
"writeWalltimeReport()",
"  Write recorded benchmarks to $CODSPEED_PROFILE_FOLDER/results/<pid>.json."),

    JS_FS_HELP_END
};

bool js::shell::DefineCodSpeed(JSContext* cx, HandleObject global) {
  RootedObject obj(cx, JS_NewPlainObject(cx));
  if (!obj || !JS_DefineProperty(cx, global, "codspeed", obj, 0)) {
    return false;
  }
  return JS_DefineFunctionsWithHelp(cx, obj, codspeed_functions);
}

void js::shell::ShutdownCodSpeed() {
  delete gWalltimeBenchmarks;
  gWalltimeBenchmarks = nullptr;
}
