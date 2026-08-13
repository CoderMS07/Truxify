// Stub for spec 70
// === Spec 70: size header ===
function encodeWithSizeHeader(buf, size) {
  const s = Buffer.alloc(8);
  s.writeBigUInt64BE(BigInt(size));
  return Buffer.concat([s, buf]);
}
function decodeWithSizeHeader(enc) {
  if (enc.length < 8) throw new Error("short");
  return { originalSize: Number(enc.readBigUInt64BE(0)), body: enc.subarray(8) };
}

