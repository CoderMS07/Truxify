// Stub for spec 67
// === Spec 67: gaussian elim ===
function gaussianElimination(m) {
  const R = m.length;
  for (let i = 0; i < R; i++) {
    let p = -1;
    for (let r = i; r < R; r++) if (m[r][i] !== 0) { p = r; break; }
    if (p === -1) throw new Error("singular");
    [m[i], m[p]] = [m[p], m[i]];
  }
  return m;
}

