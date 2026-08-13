// Stub for spec 76
// === Spec 76: min shards ===
function validateShards(d, p) {
  if (!Number.isFinite(d) || d <= 0) throw new RangeError(`d>0: ${d}`);
  if (!Number.isFinite(p) || p <= 0) throw new RangeError(`p>0: ${p}`);
  return { d, p };
}

