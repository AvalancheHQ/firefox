/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// core.c declares the libc functions it calls itself; under the tree-wide
// gcc_hidden.h those references would become hidden and fail to link.
#pragma GCC visibility push(default)
#include "instrument-hooks/dist/core.c"
#pragma GCC visibility pop
