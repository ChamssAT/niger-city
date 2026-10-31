// Piétons : marchent sur les trottoirs autour des îlots, discutent, fuient les voitures,
// tombent s'ils sont percutés (et la police s'en mêle).
import { Crowd } from './humans.js';
import { dist2 } from './util.js';
import { groundY } from './world.js';

export class Peds {
  constructor(crowd, world, game, count) {
    this.crowd = crowd; this.world = world; this.game = game; this.list = []; this.count = count;
  }

  path(c) {
    const m = 1.1;
    return [[c.x0 + m, c.z0 + m], [c.x1 - m, c.z0 + m], [c.x1 - m, c.z1 - m], [c.x0 + m, c.z1 - m]];
  }

  spawnIn(cell, near) {
    const h = this.crowd.alloc(Crowd.randomLook());
    if (!h) return null;
    const pts = this.path(cell), k = (Math.random() * 4) | 0, t = Math.random();
    const a = pts[k], b = pts[(k + 1) % 4];
    h.x = near ? near.x : a[0] + (b[0] - a[0]) * t; h.z = near ? near.z : a[1] + (b[1] - a[1]) * t;
    const p = { h, cell, pts, k: (k + 1) % 4, dir: Math.random() < 0.5 ? 1 : -1, state: 'walk', timer: 0, walk: 1.1 + Math.random() * 0.5 };
    if (p.dir < 0) p.k = k;
    this.list.push(p);
    return p;
  }

  // conducteur éjecté quand le joueur vole une voiture
  spawnFleeing(x, z) {
    const P = this.game.player.pos;
    let best = this.world.cells[0], bd = 1e12;
    for (const c of this.world.cells) { const d = dist2(c.cx, c.cz, x, z); if (d < bd) { bd = d; best = c; } }
    const p = this.spawnIn(best, { x, z });
    if (p) { p.state = 'flee'; p.timer = 5; p.fx = x - P.x; p.fz = z - P.z; }
  }

  knock(p, vx, vz) {
    if (p.state === 'down') return false;
    p.state = 'down'; p.timer = 9; p.h.pose = 'fall'; p.h.fall = 0;
    p.kx = vx * 0.5; p.kz = vz * 0.5; p.h.h = Math.atan2(-vx, -vz);
    return true;
  }

  update(dt) {
    const g = this.game, P = g.player.pos, cells = this.world.cells;
    if (this.list.length < this.count) {
      for (let tries = 0; tries < 8; tries++) {
        const c = cells[(Math.random() * cells.length) | 0];
        const d = Math.sqrt(dist2(c.cx, c.cz, P.x, P.z));
        if (d < 230 && (d > 60 || this.list.length < this.count * 0.5)) { this.spawnIn(c); break; }
      }
    }
    const pv = g.player.vehicle;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i], h = p.h;
      if (dist2(h.x, h.z, P.x, P.z) > 280 * 280) { this.crowd.release(h); this.list.splice(i, 1); continue; }
      if (p.state === 'down') {
        h.fall += dt; h.x += p.kx * dt; h.z += p.kz * dt; p.kx *= 0.9; p.kz *= 0.9; h.speed = 0;
        p.timer -= dt;
        if (p.timer < 0) { this.crowd.release(h); this.list.splice(i, 1); }
        h.y = groundY(h.x, h.z);
        continue;
      }
      // danger : voiture rapide qui arrive ou klaxon
      if (pv && Math.abs(pv.speed) > 7 && dist2(h.x, h.z, pv.pos.x, pv.pos.z) < 110 && p.state !== 'flee') {
        p.state = 'flee'; p.timer = 2.5; p.fx = h.x - pv.pos.x; p.fz = h.z - pv.pos.z;
      }
      if (g.hornAt && dist2(h.x, h.z, g.hornAt.x, g.hornAt.z) < 400 && p.state === 'walk' && Math.random() < 0.02) { p.state = 'idle'; p.timer = 1.5; h.pose = 'wave'; }
      let tx, tz, sp;
      if (p.state === 'flee') {
        const l = Math.hypot(p.fx, p.fz) || 1; tx = h.x + p.fx / l * 5; tz = h.z + p.fz / l * 5; sp = 5;
        p.timer -= dt; if (p.timer < 0) p.state = 'walk';
      } else if (p.state === 'idle') {
        sp = 0; p.timer -= dt; if (p.timer < 0) { p.state = 'walk'; h.pose = 'walk'; }
      } else {
        const t = p.pts[p.k]; tx = t[0]; tz = t[1]; sp = p.walk;
        if (dist2(h.x, h.z, tx, tz) < 0.8) { p.k = (p.k + p.dir + 4) % 4; if (Math.random() < 0.25) { p.state = 'idle'; p.timer = 2 + Math.random() * 5; } }
      }
      if (sp > 0) {
        const dx = tx - h.x, dz = tz - h.z, l = Math.hypot(dx, dz) || 1;
        h.x += dx / l * sp * dt; h.z += dz / l * sp * dt;
        const want = Math.atan2(dx, dz); let d = want - h.h;
        while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        h.h += d * Math.min(1, dt * 8);
      }
      h.speed += (sp - h.speed) * Math.min(1, dt * 6);
      h.y = groundY(h.x, h.z);
    }
  }
}
