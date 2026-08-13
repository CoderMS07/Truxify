// SPDX-License-Identifier: MIT
// Stub for spec 100
// === Spec 100: onlyActiveProvider ===
modifier onlyActiveProvider() { require(stakes[msg.sender] > 0, "NoStake"); _; }

