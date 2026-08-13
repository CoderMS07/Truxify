// Stub for spec 83
// === Spec 83: bitmap NOT ===
function bitmapNot(b, r) {
  const out = new Array(r);
  for (let i = 0; i < r; i++) out[i] = !b.includes(i);
  return out;
}

