/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// CodSpeed.h - `codspeed` object bridging JS benchmarks to the CodSpeed
// runner through instrument-hooks.

#ifndef shell_CodSpeed_h
#define shell_CodSpeed_h

#include "js/TypeDecls.h"

namespace js {
namespace shell {

// Define a `codspeed` object on the given global object.
bool DefineCodSpeed(JSContext* cx, JS::HandleObject global);

// Release the instrument-hooks connection, if one was opened.
void ShutdownCodSpeed();

}  // namespace shell
}  // namespace js

#endif /* shell_CodSpeed_h */
