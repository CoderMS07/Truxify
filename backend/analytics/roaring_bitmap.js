// Stub for spec 68
// === Spec 68: bitmap OR ===
function alignPrefix16(a, b) { return (a & 0xFFFF) === (b & 0xFFFF); }
function bitmapOr(a, b) {
  if (!alignPrefix16(a.prefix, b.prefix)) throw new Error("mismatch");
  return { prefix: a.prefix, bits: a.bits | b.bits };
}

