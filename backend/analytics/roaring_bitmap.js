// Stub for spec 77
// === Spec 77: deserialization bounds ===
function parseBitmapHeader(buf) {
  if (buf.length < 4) throw new Error("short");
  const c = buf.readUInt32BE(0);
  if (c < 0 || c > 1_000_000) throw new Error("implausible");
  return { containerCount: c };
}

