// Monde de collisions 2D (plan XZ) : boîtes alignées rangées dans une grille de hachage.

export class CollisionWorld {
  constructor(cell = 32) {
    this.cell = cell;
    this.map = new Map();
    this.boxes = [];
    this.stamp = 0;
  }

  key(i, j) { return (i + 1000) * 4000 + (j + 1000); }

  add(minX, minZ, maxX, maxZ, tag = null) {
    const b = { minX, minZ, maxX, maxZ, tag, s: 0 };
    this.boxes.push(b);
    const c = this.cell;
    for (let i = Math.floor(minX / c); i <= Math.floor(maxX / c); i++)
      for (let j = Math.floor(minZ / c); j <= Math.floor(maxZ / c); j++) {
        const k = this.key(i, j);
        let arr = this.map.get(k);
        if (!arr) this.map.set(k, (arr = []));
        arr.push(b);
      }
    return b;
  }

  addCentered(x, z, w, d, tag) { return this.add(x - w / 2, z - d / 2, x + w / 2, z + d / 2, tag); }

  query(x, z, r, out) {
    out.length = 0;
    const s = ++this.stamp, c = this.cell;
    for (let i = Math.floor((x - r) / c); i <= Math.floor((x + r) / c); i++)
      for (let j = Math.floor((z - r) / c); j <= Math.floor((z + r) / c); j++) {
        const arr = this.map.get(this.key(i, j));
        if (!arr) continue;
        for (const b of arr) if (b.s !== s) { b.s = s; out.push(b); }
      }
    return out;
  }

  // Repousse un cercle (pos.x, pos.z, rayon r) hors des boîtes. Retourne la normale cumulée ou null.
  resolveCircle(pos, r) {
    const list = this.query(pos.x, pos.z, r + 1, this._tmp || (this._tmp = []));
    let hit = false, nx = 0, nz = 0;
    for (const b of list) {
      const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      let dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        dx /= d; dz /= d;
        pos.x += dx * (r - d); pos.z += dz * (r - d);
        nx += dx; nz += dz;
      } else {
        // centre à l'intérieur de la boîte : sortie par le côté le plus proche
        const l = pos.x - b.minX, rr = b.maxX - pos.x, t = pos.z - b.minZ, bt = b.maxZ - pos.z;
        const m = Math.min(l, rr, t, bt);
        if (m === l) { pos.x = b.minX - r; nx -= 1; }
        else if (m === rr) { pos.x = b.maxX + r; nx += 1; }
        else if (m === t) { pos.z = b.minZ - r; nz -= 1; }
        else { pos.z = b.maxZ + r; nz += 1; }
      }
    }
    if (!hit) return null;
    const l = Math.hypot(nx, nz) || 1;
    return { x: nx / l, z: nz / l };
  }
}
