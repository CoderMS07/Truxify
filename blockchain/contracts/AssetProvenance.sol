// SPDX-License-Identifier: MIT
// Stub for spec 96
// === Spec 96: onlyAssetOwner ===
modifier onlyAssetOwner(uint256 id) { require(ownerOf(id) == msg.sender, "NotOwner"); _; }

