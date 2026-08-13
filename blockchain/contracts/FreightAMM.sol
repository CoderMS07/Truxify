// SPDX-License-Identifier: MIT
// Stub for spec 99
// === Spec 99: pause ===
bool public paused;
modifier whenNotPaused() { require(!paused, "Paused"); _; }

