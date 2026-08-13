// Stub for spec 82
// === Spec 82: cauchy matrix ===
function cauchyMatrix(R, C) {
  const m = [];
  for (let i = 0; i < R; i++) {
    const row = [];
    for (let j = 0; j < C; j++) row.push(1 / (i - (R + j)));
    m.push(row);
  }
  return m;
}

