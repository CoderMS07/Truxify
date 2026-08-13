// Stub for spec 73
// === Spec 73: popcount ===
function popcount(n) {
  if (typeof n !== 'number' || n < 0) return 0;
  let c = 0; while (n) { n &= (n - 1); c++; }
  return c;
}

