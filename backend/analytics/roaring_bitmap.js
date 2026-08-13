// Stub for spec 75
// === Spec 75: sorted AND ===
function sortedAnd(a, b) {
  const sa = [...a].sort((x,y) => x-y);
  const sb = [...b].sort((x,y) => x-y);
  const out = []; let i = 0, j = 0;
  while (i < sa.length && j < sb.length) {
    if (sa[i] === sb[j]) { out.push(sa[i]); i++; j++; }
    else if (sa[i] < sb[j]) i++; else j++;
  }
  return out;
}

