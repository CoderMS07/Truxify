// SPDX-License-Identifier: MIT
// Stub for spec 102
// === Spec 102: dynamic chainid ===
function _domainSeparatorV2() internal view returns (bytes32) { return keccak256(abi.encode(block.chainid, address(this))); }

