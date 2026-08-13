// Stub for spec 69
// === Spec 69: RLE ===
function toRle(bits) {
  if (!bits) return [];
  const out = []; let i = 0;
  while (i < bits.length) {
    if (bits[i]) { let j = i; while (j < bits.length && bits[j]) j++; out.push([i, j-1]); i = j; }
    else i++;
  }
  return out;
}

