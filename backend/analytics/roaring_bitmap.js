// Stub for spec 72
// === Spec 72: clear container ===
class RoaringBitmap {
  constructor() { this.containers = []; }
  clear() { this.containers.length = 0; }
  add(v) { this.containers.push(v); }
  get size() { return this.containers.length; }
}

