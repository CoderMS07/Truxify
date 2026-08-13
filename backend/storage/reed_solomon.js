// Stub for spec 84
// === Spec 84: corrupt recovery ===
function decodeShardsWithRecovery(s, dc) {
  const v = s.filter((x) => x != null);
  if (v.length < dc) throw new Error("not enough");
  return v.slice(0, dc);
}

