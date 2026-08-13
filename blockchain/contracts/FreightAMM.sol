// SPDX-License-Identifier: MIT
// Stub for spec 98
// === Spec 98: deadline ===
function _checkDeadline(uint d) internal view { require(block.timestamp <= d, "DeadlineExpired"); }

