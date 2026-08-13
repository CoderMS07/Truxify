// Stub for spec 78
// === Spec 78: GF inverse table ===
const _inv = new Array(256);
(function build() {
  _inv[0] = 0;
  for (let a = 1; a < 256; a++) {
    for (let b = 1; b < 256; b++) {
      if ((a * b) % 255 === 1) { _inv[a] = b; break; }
    }
  }
})();
function gfInverse(a) { return _inv[a] || 0; }

