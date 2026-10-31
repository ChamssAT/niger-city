// Véhicules : modèles procéduraux (carrosserie extrudée, vitres, jantes, phares)
// et physique arcade avec dérive (frein à main), collisions et chute dans le fleuve.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp } from './util.js';
import { isWater, groundY, WATER_Y } from './world.js';

export const SPECS = {
  berline:  { name: 'Berline',              max: 40, rev: 9, accel: 9,  brake: 20, turn: 2.0, grip: 7,  len: 4.4, wid: 1.8,  wheel: 0.33 },
  taxi:     { name: 'Taxi',                 max: 38, rev: 9, accel: 8.5, brake: 20, turn: 2.0, grip: 7,  len: 4.4, wid: 1.8,  wheel: 0.33 },
  police:   { name: 'Police Nationale',     max: 44, rev: 9, accel: 11, brake: 22, turn: 2.1, grip: 8,  len: 4.5, wid: 1.82, wheel: 0.34 },
  talladje: { name: 'Talladjé (504 break)', max: 34, rev: 8, accel: 7,  brake: 16, turn: 1.8, grip: 6,  len: 4.8, wid: 1.75, wheel: 0.34 },
  pickup:   { name: 'Pick-up',              max: 38, rev: 8, accel: 8.5, brake: 18, turn: 1.8, grip: 6.5, len: 5.1, wid: 1.85, wheel: 0.4 },
  minibus:  { name: 'Faba-faba (minibus)',  max: 30, rev: 7, accel: 6,  brake: 15, turn: 1.6, grip: 6,  len: 5.4, wid: 1.95, wheel: 0.36 },
  camion:   { name: 'Camion',               max: 25, rev: 6, accel: 4,  brake: 12, turn: 1.25, grip: 6, len: 8.2, wid: 2.5,  wheel: 0.55 },
  moto:     { name: 'Kabou-kabou (moto)',   max: 30, rev: 4, accel: 11, brake: 18, turn: 2.8, grip: 9,  len: 1.95, wid: 0.75, wheel: 0.32 },
};

const PAINTS = [0xf2f2f2, 0x1c1c1e, 0x8f9499, 0x7b1e22, 0x1f3f6e, 0xc9b48a, 0xd8d4c8, 0x2e4d3a, 0x5b5f63, 0xa0381c];
export const randomPaint = (r = Math.random) => PAINTS[(r() * PAINTS.length) | 0];

// matériaux partagés par toutes les carrosseries
export const VMAT = {
  paint: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.08 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x0c1418, roughness: 0.04, metalness: 0.9, transparent: true, opacity: 0.88 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.18, metalness: 1 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.92 }),
  plastic: new THREE.MeshStandardMaterial({ color: 0x1e1e1e, roughness: 0.6, metalness: 0.1 }),
  head: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d8, emissiveIntensity: 0.2, roughness: 0.1 }),
  tail: new THREE.MeshStandardMaterial({ color: 0x5a0000, emissive: 0xff1a10, emissiveIntensity: 0.25, roughness: 0.2 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.9 }),
  sirenR: new THREE.MeshBasicMaterial({ color: 0x330000, toneMapped: false }),
  sirenB: new THREE.MeshBasicMaterial({ color: 0x000833, toneMapped: false }),
};
const ORDER = ['paint', 'glass', 'chrome', 'rubber', 'plastic', 'head', 'tail', 'wood', 'sirenR', 'sirenB'];

function withColor(g, fn) {
  g = g.index ? g.toNonIndexed() : g;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const p = g.attributes.position, arr = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { c.set(fn(p.getX(i), p.getY(i), p.getZ(i))); arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

class Parts {
  constructor() { this.by = {}; }
  add(mat, g, color = 0xffffff) {
    const fn = typeof color === 'function' ? color : () => color;
    (this.by[mat] ||= []).push(withColor(g, fn));
  }
  box(mat, w, h, d, x, y, z, color, rx = 0) {
    const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx);
    this.add(mat, g.translate(x, y, z), color);
  }
  // plaque inclinée entre deux points du profil (z, y) : pare-brise, lunette arrière
  slab(mat, za, ya, zb, yb, w, color) {
    const L = Math.hypot(zb - za, yb - ya), th = Math.atan2(-(yb - ya), zb - za);
    const g = new THREE.BoxGeometry(w, 0.03, L).rotateX(th);
    const nz = -(yb - ya) / L, ny = (zb - za) / L; // normale extérieure
    this.add(mat, g.translate(0, (ya + yb) / 2 + ny * 0.02, (za + zb) / 2 + nz * 0.02), color);
  }
  wheel(x, y, z, r, w) {
    this.add('rubber', new THREE.CylinderGeometry(r, r, w, 20).rotateZ(Math.PI / 2).translate(x, y, z));
    this.add('chrome', new THREE.CylinderGeometry(r * 0.62, r * 0.62, w + 0.02, 12).rotateZ(Math.PI / 2).translate(x, y, z));
  }
  build() {
    const geos = [], mats = [];
    for (const k of ORDER) if (this.by[k]) { geos.push(mergeGeometries(this.by[k])); mats.push(VMAT[k]); }
    const m = new THREE.Mesh(mergeGeometries(geos, true), mats);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
}

// carrosserie : profil latéral (z, y) extrudé sur la largeur
function body(parts, pts, w, color, bevel = 0.06) {
  const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: w - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
  g.rotateY(-Math.PI / 2).translate(w / 2 - bevel, 0, 0);
  parts.add('paint', g, color);
}
function sideWindows(parts, polys, w) {
  for (const poly of polys) for (const sd of [-1, 1]) {
    const s = new THREE.Shape(poly.map(([z, y]) => new THREE.Vector2(z, y)));
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false });
    g.rotateY(-Math.PI / 2).translate(sd * (w / 2 + 0.012) + 0.01, 0, 0);
    parts.add('glass', g);
  }
}
function lights(parts, w, zf, zr, yf, yr) {
  for (const sd of [-1, 1]) {
    parts.box('head', 0.34, 0.13, 0.06, sd * (w / 2 - 0.3), yf, zf);
    parts.box('tail', 0.3, 0.12, 0.06, sd * (w / 2 - 0.25), yr, zr);
  }
}
function bumpers(parts, w, zf, zr, y) {
  parts.box('plastic', w + 0.04, 0.18, 0.14, 0, y, zf);
  parts.box('plastic', w + 0.04, 0.18, 0.14, 0, y, zr);
}

const cache = new Map();
export function vehicleMesh(type, color) {
  const key = type + ':' + color;
  if (cache.has(key)) return cache.get(key).clone();
  const p = new Parts(), S = SPECS[type], w = S.wid, r = S.wheel;
  if (type === 'berline' || type === 'taxi' || type === 'police') {
    const pts = [[-2.2, 0.32], [-2.25, 0.8], [-2.05, 0.98], [-1.3, 1.04], [-0.82, 1.44], [0.45, 1.47], [1.08, 1.04], [2.12, 0.9], [2.25, 0.6], [2.2, 0.32]];
    const col = type === 'taxi' ? (x, y) => (y < 0.86 ? 0xc41e1e : 0xf4f4f0)
      : type === 'police' ? (x, y) => (y > 0.66 && y < 0.86 ? 0x1d4f9a : 0xf4f4f6) : color;
    body(p, pts, w, col);
    p.slab('glass', 1.07, 1.05, 0.46, 1.46, w - 0.16);
    p.slab('glass', -0.83, 1.43, -1.29, 1.05, w - 0.16);
    sideWindows(p, [[[-1.22, 1.08], [-0.8, 1.4], [-0.2, 1.42], [-0.2, 1.08]], [[-0.08, 1.08], [-0.08, 1.42], [0.43, 1.43], [0.98, 1.08]]], w);
    lights(p, w, 2.22, -2.24, 0.78, 0.84); bumpers(p, w, 2.24, -2.24, 0.42);
    for (const sd of [-1, 1]) p.box('plastic', 0.18, 0.08, 0.1, sd * (w / 2 + 0.06), 1.05, 0.95); // rétroviseurs
    if (type === 'taxi') { p.box('paint', 0.7, 0.2, 0.3, 0, 1.58, -0.1, 0xffd23a); }
    if (type === 'police') {
      p.box('plastic', 1.1, 0.08, 0.32, 0, 1.52, -0.15);
      p.box('sirenR', 0.48, 0.14, 0.26, -0.27, 1.6, -0.15);
      p.box('sirenB', 0.48, 0.14, 0.26, 0.27, 1.6, -0.15);
    }
    for (const [x, z] of [[-1, 1.38], [1, 1.38], [-1, -1.35], [1, -1.35]]) p.wheel(x * (w / 2 - 0.12), r, z, r, 0.24);
  } else if (type === 'talladje') {
    const pts = [[-2.4, 0.34], [-2.42, 0.9], [-2.32, 1.5], [0.42, 1.52], [1.12, 1.05], [2.32, 0.9], [2.42, 0.58], [2.38, 0.34]];
    body(p, pts, w, color);
    p.slab('glass', 1.1, 1.06, 0.43, 1.5, w - 0.16);
    p.slab('glass', -2.33, 1.47, -2.4, 1.0, w - 0.2);
    sideWindows(p, [[[-2.2, 1.08], [-2.15, 1.45], [-0.9, 1.46], [-0.9, 1.08]], [[-0.8, 1.08], [-0.8, 1.46], [-0.1, 1.46], [-0.1, 1.08]], [[0.0, 1.08], [0.0, 1.46], [0.4, 1.47], [1.0, 1.08]]], w);
    lights(p, w, 2.4, -2.42, 0.76, 0.86); bumpers(p, w, 2.42, -2.43, 0.44);
    for (const sd of [-1, 1]) p.box('chrome', 0.05, 0.05, 2.6, sd * 0.7, 1.62, -0.9);
    p.box('wood', 1.2, 0.5, 1.0, 0, 1.85, -1.4, 0x8a6a42); p.box('paint', 1.0, 0.4, 0.8, 0.1, 1.85, -0.4, 0x2a5f9e);
    for (const [x, z] of [[-1, 1.48], [1, 1.48], [-1, -1.52], [1, -1.52]]) p.wheel(x * (w / 2 - 0.12), r, z, r, 0.24);
  } else if (type === 'pickup') {
    const pts = [[-2.55, 0.48], [-2.55, 1.12], [-0.7, 1.12], [-0.65, 1.88], [0.5, 1.88], [1.18, 1.22], [2.5, 1.08], [2.58, 0.62], [2.5, 0.48]];
    body(p, pts, w, color);
    p.box('plastic', w - 0.3, 0.05, 1.75, 0, 1.0, -1.6);
    p.slab('glass', 1.16, 1.24, 0.48, 1.86, w - 0.16);
    sideWindows(p, [[[-0.55, 1.2], [-0.55, 1.8], [0.45, 1.82], [1.05, 1.2]]], w);
    lights(p, w, 2.55, -2.56, 0.9, 0.95); bumpers(p, w, 2.58, -2.57, 0.55);
    for (const [x, z] of [[-1, 1.6], [1, 1.6], [-1, -1.65], [1, -1.65]]) p.wheel(x * (w / 2 - 0.1), r, z, r, 0.3);
  } else if (type === 'minibus') {
    const pts = [[-2.7, 0.4], [-2.72, 2.2], [-2.6, 2.34], [1.6, 2.34], [2.6, 1.3], [2.72, 1.02], [2.72, 0.4]];
    body(p, pts, w, (x, y) => (y > 1.55 && y < 1.7 ? 0x2a62b0 : color));
    p.slab('glass', 2.55, 1.35, 1.65, 2.25, w - 0.16);
    sideWindows(p, [[[-2.5, 1.5], [-2.5, 2.1], [1.4, 2.1], [2.0, 1.5]]], w);
    lights(p, w, 2.7, -2.73, 0.9, 1.1); bumpers(p, w, 2.73, -2.73, 0.48);
    p.box('wood', w - 0.2, 0.12, 4, 0, 2.45, -0.4, 0x6a5a48);
    p.box('paint', 1.4, 0.6, 1.2, 0, 2.8, -1.2, 0xe0a020); p.box('paint', 1.2, 0.5, 1.0, 0.1, 2.75, 0.3, 0x2f7d4a);
    for (const [x, z] of [[-1, 1.75], [1, 1.75], [-1, -1.8], [1, -1.8]]) p.wheel(x * (w / 2 - 0.12), r, z, r, 0.26);
  } else if (type === 'camion') {
    p.box('paint', w, 2.4, 2.3, 0, 1.75, 2.9, color);
    p.box('glass', w - 0.2, 0.9, 0.04, 0, 2.3, 4.06);
    p.box('plastic', w, 0.4, 7.8, 0, 0.75, -0.2);
    p.box('wood', w + 0.05, 2.0, 5.4, 0, 2.0, -1.2);
    p.box('paint', w + 0.1, 0.15, 5.5, 0, 3.05, -1.2, 0xe05206);
    lights(p, w, 4.07, -3.95, 1.0, 1.0); bumpers(p, w, 4.1, -3.95, 0.6);
    for (const z of [2.9, -1.2, -2.8]) for (const sd of [-1, 1]) p.wheel(sd * (w / 2 - 0.2), r, z, r, 0.4);
  } else if (type === 'moto') {
    p.wheel(0, r, 0.68, r, 0.12); p.wheel(0, r, -0.66, r, 0.12);
    p.box('paint', 0.28, 0.24, 0.6, 0, 0.82, 0.18, color);              // réservoir
    p.box('plastic', 0.26, 0.12, 0.7, 0, 0.86, -0.35);                   // selle
    p.box('chrome', 0.1, 0.1, 1.2, 0, 0.6, 0, 0xaaaaaa);                 // cadre
    p.box('chrome', 0.06, 0.62, 0.06, 0, 0.72, 0.62, 0xaaaaaa, -0.35);    // fourche
    p.box('chrome', 0.7, 0.04, 0.04, 0, 1.05, 0.5);                      // guidon
    p.box('paint', 0.22, 0.22, 0.16, 0, 0.98, 0.66, color);              // carénage phare
    p.box('head', 0.14, 0.12, 0.04, 0, 0.98, 0.75);
    p.box('tail', 0.12, 0.06, 0.04, 0, 0.82, -0.72);
    p.box('chrome', 0.08, 0.08, 0.6, 0.18, 0.4, -0.35);                  // pot d'échappement
  }
  const m = p.build();
  cache.set(key, m);
  return m.clone();
}

const _t = new THREE.Vector3();
export class Vehicle {
  constructor(type, color, scene) {
    this.type = type; this.spec = SPECS[type]; this.color = color;
    this.mesh = vehicleMesh(type, color); scene.add(this.mesh);
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector2(); this.heading = 0; this.speed = 0;
    this.health = 100; this.driver = null; this.ai = null; this.sinking = 0; this.y = 0;
    this.lastHit = 0; this.isPolice = type === 'police'; this.sirenOn = false;
    const S = this.spec;
    this.radius = S.wid / 2 + 0.05;
    this.off = Math.max(0, (S.len - S.wid) / 2);
  }
  place(x, z, h) { this.pos.set(x, groundY(x, z), z); this.heading = h; this.vel.set(0, 0); this.speed = 0; this.sync(0); }
  get fx() { return Math.sin(this.heading); }
  get fz() { return Math.cos(this.heading); }

  // inp : { throttle -1..1, steer -1..1 (gauche +), handbrake bool }
  update(dt, inp, col) {
    const S = this.spec;
    if (this.sinking > 0) { this.sinking += dt; this.vel.multiplyScalar(Math.exp(-2 * dt)); this.pos.x += this.vel.x * dt; this.pos.z += this.vel.y * dt; this.sync(dt); return null; }
    if (this.health <= 0) inp = { throttle: 0, steer: inp.steer, handbrake: true };
    const fx = this.fx, fz = this.fz, rx = -fz, rz = fx;
    let vf = this.vel.x * fx + this.vel.y * fz, vl = this.vel.x * rx + this.vel.y * rz;
    const t = inp.throttle;
    if (t > 0) vf += (vf < -0.5 ? S.brake : S.accel * (1 - 0.55 * Math.max(0, vf) / S.max)) * t * dt;
    else if (t < 0) vf += (vf > 0.5 ? -S.brake : -S.accel * 0.6) * -t * dt;
    else vf -= Math.sign(vf) * Math.min(Math.abs(vf), 2.2 * dt);
    if (inp.handbrake) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 9 * dt);
    vf -= vf * Math.abs(vf) * 0.0009 * dt * 10;
    vf = clamp(vf, -S.rev, S.max);
    const grip = inp.handbrake ? S.grip * 0.18 : S.grip;
    vl *= Math.exp(-grip * dt);
    const speedK = clamp(Math.abs(vf) / 5, 0, 1) / (1 + Math.abs(vf) * 0.022);
    this.heading += inp.steer * S.turn * speedK * Math.sign(vf) * dt * (inp.handbrake ? 1.5 : 1);
    const nfx = Math.sin(this.heading), nfz = Math.cos(this.heading);
    this.vel.set(nfx * vf + -nfz * vl, nfz * vf + nfx * vl);
    this.speed = vf; this.lateral = vl; this.steerVis = inp.steer;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.y * dt;

    // collisions avec le décor : deux cercles (avant/arrière)
    let impact = 0, hitN = null;
    for (const s of this.off ? [this.off, -this.off] : [0]) {
      _t.set(this.pos.x + nfx * s, 0, this.pos.z + nfz * s);
      const ox = _t.x, oz = _t.z, n = col.resolveCircle(_t, this.radius);
      if (n) {
        this.pos.x += _t.x - ox; this.pos.z += _t.z - oz;
        const into = -(this.vel.x * n.x + this.vel.y * n.z);
        if (into > 0) { this.vel.x += n.x * into * 1.25; this.vel.y += n.z * into * 1.25; impact = Math.max(impact, into); hitN = n; }
      }
    }
    if (impact > 0) {
      this.speed = this.vel.x * nfx + this.vel.y * nfz;
      if (impact > 5) this.health = Math.max(0, this.health - impact * 1.1);
    }
    if (isWater(this.pos.x, this.pos.z)) this.sinking = 0.001;
    this.sync(dt);
    return impact > 2 ? { impact, n: hitN } : null;
  }

  sync(dt) {
    const g = this.sinking > 0 ? Math.max(WATER_Y - 3, WATER_Y + 0.4 - this.sinking * 0.9) : groundY(this.pos.x, this.pos.z);
    this.y += dt ? (g - this.y) * Math.min(1, dt * 12) : g - this.y;
    this.pos.y = this.y;
    const m = this.mesh;
    m.position.set(this.pos.x, this.y, this.pos.z);
    m.rotation.order = 'YXZ';
    m.rotation.y = this.heading;
    const lean = this.type === 'moto' ? -(this.steerVis || 0) * clamp(Math.abs(this.speed) / 15, 0, 1) * 0.35 : clamp(-(this.lateral || 0) * 0.012, -0.06, 0.06);
    m.rotation.z += ((this.sinking ? 0.3 : lean) - m.rotation.z) * Math.min(1, (dt || 1) * 8);
    if (this.health <= 0 && !this.burnt) { this.burnt = true; m.material = m.material.map((x) => (x === VMAT.paint ? burnt : x)); }
  }

  dispose(scene) { scene.remove(this.mesh); }
}
const burnt = new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 1 });
