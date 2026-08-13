// Stub for spec 66
// === Spec 66: GF(2^8) modulo ===
function gfMod(i) { return ((i % 255) + 255) % 255; }
function gfMul(a, b, exp, log) {
  if (a === 0 || b === 0) return 0;
  return exp[gfMod((log[a]||0) + (log[b]||0))];
}

