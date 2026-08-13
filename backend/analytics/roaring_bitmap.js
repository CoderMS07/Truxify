// Stub for spec 81
// === Spec 81: container upgrade ===
const LIM = 4096;
class ArrayContainer { constructor() { this.a = []; } add(v) { this.a.push(v); } get shouldUp() { return this.a.length > LIM; } up() { return new BitsetContainer(this.a); } }
class BitsetContainer { constructor(v=[]) { this.b = new Uint8Array(8192); for (const x of v) this.b[x>>3] |= 1 << (x & 7); } }

