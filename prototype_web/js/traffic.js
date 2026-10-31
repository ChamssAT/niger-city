// Circulation : véhicules IA qui suivent le graphe routier (conduite à droite),
// freinent devant les obstacles, et voitures de police qui prennent le joueur en chasse.
import { Vehicle, randomPaint } from './vehicles.js';
import { angleDiff, clamp, dist2 } from './util.js';
import { LANE } from './world.js';

const TYPES = ['berline', 'berline', 'taxi', 'taxi', 'taxi', 'moto', 'moto', 'moto', 'talladje', 'pickup', 'minibus', 'camion', 'police'];

export class Traffic {
  constructor(scene, world, game) {
    this.scene = scene; this.world = world; this.game = game;
    this.cars = []; this.target = 30;
  }

  laneTarget(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz);
    return { x: b.x + (-dz / l) * LANE, z: b.z + (dx / l) * LANE };
  }

  spawn(type, a, b, mode = 'road') {
    const v = new Vehicle(type, randomPaint(), this.scene);
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz), k = 0.2 + Math.random() * 0.6;
    v.place(a.x + dx * k + (-dz / l) * LANE, a.z + dz * k + (dx / l) * LANE, Math.atan2(dx, dz));
    v.ai = { mode, a, b, stuck: 0, reverse: 0, ignore: 0, honk: 0, cruise: 0 };
    v.driver = 'ai';
    v.vel.set(Math.sin(v.heading) * 6, Math.cos(v.heading) * 6);
    this.cars.push(v); this.game.vehicles.push(v);
    return v;
  }

  randomEdgeNear(px, pz, rmin, rmax) {
    const ns = this.world.nodes;
    for (let k = 0; k < 40; k++) {
      const a = ns[(Math.random() * ns.length) | 0];
      const d = Math.sqrt(dist2(a.x, a.z, px, pz));
      if (d < rmin || d > rmax) continue;
      return [a, a.nb[(Math.random() * a.nb.length) | 0]];
    }
    return null;
  }

  remove(v) {
    const i = this.cars.indexOf(v); if (i >= 0) this.cars.splice(i, 1);
    v.ai = null;
  }

  update(dt) {
    const g = this.game, P = g.player.pos;
    // densité : on maintient la circulation autour du joueur
    const road = this.cars.filter((c) => c.ai.mode === 'road');
    if (road.length < this.target) {
      const e = this.randomEdgeNear(P.x, P.z, 120, 380);
      if (e) this.spawn(TYPES[(Math.random() * TYPES.length) | 0], e[0], e[1]);
    }
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const v = this.cars[i];
      const d2 = dist2(v.pos.x, v.pos.z, P.x, P.z);
      if ((d2 > 480 * 480 && v.ai.mode === 'road') || (v.sinking > 4)) { this.cars.splice(i, 1); g.removeVehicle(v); continue; }
      const inp = v.ai.mode === 'chase' ? this.chase(v, dt) : this.drive(v, dt);
      const hit = v.update(dt, inp, this.world.col);
      if (hit && v.ai.mode === 'road') v.ai.stuck += 0.5;
    }
  }

  // obstacle devant le véhicule (autres véhicules, joueur, piétons)
  blocked(v, range) {
    const fx = v.fx, fz = v.fz, g = this.game;
    const test = (x, z, w) => {
      const dx = x - v.pos.x, dz = z - v.pos.z, ahead = dx * fx + dz * fz;
      if (ahead <= 0 || ahead > range) return false;
      return Math.abs(dx * -fz + dz * fx) < w;
    };
    for (const o of g.vehicles) if (o !== v && !o.sinking && test(o.pos.x, o.pos.z, 1.9)) return true;
    if (!g.player.vehicle && test(g.player.pos.x, g.player.pos.z, 1.4)) return true;
    for (const p of g.peds.list) if (p.h.visible && p.state !== 'down' && test(p.h.x, p.h.z, 1.3)) return true;
    return false;
  }

  drive(v, dt) {
    const ai = v.ai;
    let t = this.laneTarget(ai.a, ai.b);
    let dx = t.x - v.pos.x, dz = t.z - v.pos.z, d = Math.hypot(dx, dz);
    if (d < 5) {
      const nb = ai.b.nb.filter((n) => n !== ai.a);
      const next = nb.length ? nb[(Math.random() * nb.length) | 0] : ai.a;
      ai.a = ai.b; ai.b = next;
      t = this.laneTarget(ai.a, ai.b); dx = t.x - v.pos.x; dz = t.z - v.pos.z; d = Math.hypot(dx, dz);
    }
    const diff = angleDiff(v.heading, Math.atan2(dx, dz));
    const paved = ai.a.paved && ai.b.paved;
    ai.cruise ||= (v.type === 'moto' ? 13 : 11) + Math.random() * 4;
    let target = (paved ? ai.cruise : ai.cruise * 0.75) * (1 - Math.min(0.65, Math.abs(diff)));
    if (d < 22) target = Math.min(target, 7 + d * 0.3);
    ai.ignore -= dt;
    if (ai.ignore <= 0 && this.blocked(v, 7 + Math.abs(v.speed) * 0.9)) {
      target = 0; ai.stuck += dt;
      if (ai.stuck > 1.5 && ai.honk <= 0) { this.game.audio?.horn(v.pos, 0.35); ai.honk = 4; }
      if (ai.stuck > 5) { ai.ignore = 1.5; ai.stuck = 0; }
    } else ai.stuck = Math.max(0, ai.stuck - dt);
    ai.honk -= dt;
    const throttle = v.speed < target - 0.5 ? 1 : v.speed > target + 1.5 ? -1 : 0;
    return { throttle, steer: clamp(diff * 2.2, -1, 1), handbrake: false };
  }

  chase(v, dt) {
    const ai = v.ai, P = this.game.player;
    const tx = P.pos.x + (P.vehicle ? P.vehicle.vel.x * 0.6 : 0), tz = P.pos.z + (P.vehicle ? P.vehicle.vel.y * 0.6 : 0);
    const dx = tx - v.pos.x, dz = tz - v.pos.z, d = Math.hypot(dx, dz);
    let diff = angleDiff(v.heading, Math.atan2(dx, dz));
    if (ai.reverse > 0) { ai.reverse -= dt; return { throttle: -1, steer: -Math.sign(diff), handbrake: false }; }
    if (Math.abs(v.speed) < 1.2) { ai.stuck += dt; if (ai.stuck > 1.4) { ai.stuck = 0; ai.reverse = 1.1; } } else ai.stuck = 0;
    const target = d < 9 ? 2 : Math.min(v.spec.max * 0.92, 8 + d * 0.5);
    return { throttle: v.speed < target ? 1 : -0.6, steer: clamp(diff * 2.5, -1, 1), handbrake: Math.abs(diff) > 1.4 && v.speed > 12 };
  }

  // passe une voiture de police en mode poursuite, ou en crée une hors de vue
  dispatchPolice(n) {
    const P = this.game.player.pos;
    let chasing = this.cars.filter((c) => c.ai.mode === 'chase').length;
    for (const c of this.cars) {
      if (chasing >= n) break;
      if (c.isPolice && c.ai.mode === 'road' && dist2(c.pos.x, c.pos.z, P.x, P.z) < 300 * 300) { c.ai.mode = 'chase'; chasing++; }
    }
    while (chasing < n) {
      const e = this.randomEdgeNear(P.x, P.z, 110, 220);
      if (!e) break;
      this.spawn('police', e[0], e[1], 'chase'); chasing++;
    }
  }

  calmPolice() {
    for (const c of this.cars) if (c.ai.mode === 'chase') {
      c.ai.mode = 'road';
      let best = null, bd = 1e12;
      for (const n of this.world.nodes) { const dd = dist2(n.x, n.z, c.pos.x, c.pos.z); if (dd < bd) { bd = dd; best = n; } }
      c.ai.a = best; c.ai.b = best.nb[0];
    }
  }
}
