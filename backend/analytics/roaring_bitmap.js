// Stub for spec 79
// === Spec 79: bitmap XOR ===
function bitmapXor(a, b) {
  if (a.length !== b.length) throw new Error("len");
  return a.map((v, i) => v ^ b[i]);
}

