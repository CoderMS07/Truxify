// Stub for spec 80
// === Spec 80: max chunk ===
const MAX = 64 * 1024 * 1024;
function chunkBuffer(buf) {
  const out = [];
  for (let i = 0; i < buf.length; i += MAX) out.push(buf.subarray(i, Math.min(i + MAX, buf.length)));
  return out;
}

