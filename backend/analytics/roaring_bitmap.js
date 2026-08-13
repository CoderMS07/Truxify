// Stub for spec 85
// === Spec 85: portable serialize ===
const MAGIC = 0x1234;
function serializeRoaring(b) {
  const buf = Buffer.alloc(4 + b.length * 4);
  buf.writeUInt16LE(MAGIC & 0xFFFF, 0);
  buf.writeUInt16LE(b.length, 2);
  return buf;
}

