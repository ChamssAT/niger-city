// Génération procédurale de Niamey (plan stylisé, pas à l'échelle).
// Rive gauche : centre-ville, Plateau, quartiers. Rive droite : Harobanda, Kirkissoye, université.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './util.js';
import { CollisionWorld } from './collision.js';

export const BS = 80, RW = 16, HALF = RW / 2, LANE = 3.6;
export const LEFT = { x0: -640, x1: 640, z0: -560, z1: 160 };
export const RIGHT = { x0: -320, x1: 560, z0: 400, z1: 560 };
export const BRIDGES = [{ x: -80, name: 'Pont Kennedy' }, { x: 400, name: 'Pont Seyni Kountché' }];
export const BRIDGE_Z0 = 160, BRIDGE_Z1 = 400;
export const RIVER_HALF = 62, WATER_Y = -1.6;
export const WORLD = { x0: -820, x1: 820, z0: -700, z1: 700 };
export const riverCenter = (x) => 285 + 22 * Math.sin(x / 260 + 0.6);

export function onBridge(x, z) {
  if (z < BRIDGE_Z0 || z > BRIDGE_Z1) return null;
  for (const b of BRIDGES) if (Math.abs(x - b.x) < HALF + 0.6) return b;
  return null;
}
export const isWater = (x, z) => Math.abs(z - riverCenter(x)) < RIVER_HALF && !onBridge(x, z);

const smooth = (a, b, t) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
const bankY = (x, z) => -3.5 * (1 - smooth(RIVER_HALF - 10, RIVER_HALF + 15, Math.abs(z - riverCenter(x))));
export const groundY = (x, z) => (onBridge(x, z) ? 0.05 : bankY(x, z));

export function zoneName(x, z) {
  if (z > 380) return x < 120 ? 'Harobanda' : 'Kirkissoye';
  if (z > 175) return onBridge(x, z)?.name ?? 'Fleuve Niger';
  if (x > 440) return z > -80 ? 'Gamkallé' : 'Talladjé';
  if (x < -280) return z > -240 ? 'Plateau' : 'Yantala';
  if (z < -380) return x < 120 ? 'Koira Kano' : 'Lazaret';
  if (z < -200) return x < 120 ? 'Boukoki' : 'Banifandou';
  return x < 200 ? 'Centre-ville' : 'Kalley';
}

const range = (a, b, s) => { const r = []; for (let v = a; v <= b; v += s) r.push(v); return r; };

const BANCO = [0xffffff, 0xf4dcc0, 0xe8c49c, 0xd9ab80, 0xf7e6d0];
const PAINT = [0xfff4e0, 0xffe6c0, 0xf0f4e0, 0xe4eef8, 0xffd8a8, 0xffe0d0];
const GATES = [0x2f7d4a, 0x2a5f9e, 0x9c2f2a, 0x3c8c8c, 0xc8a02a, 0x4a4a4a, 0x7a3fa0];
const IMMC = [0xffffff, 0xf6efe2, 0xf3e7c9, 0xe9f2ea, 0xf1e0d0, 0xe2ecf4];
const AWN = [0xd2382c, 0x2f8f4e, 0x2c62b0, 0xe0a020, 0xe05a1e, 0x7a3fa0];
const LEAF = [0x3f6b2a, 0x4b7a30, 0x35602a, 0x557f35, 0x466d2c];

class Batch {
  constructor(geo, mat, shadow = true) { this.geo = geo; this.mat = mat; this.it = []; this.shadow = shadow; }
  add(x, y, z, sx, sy, sz, color = 0xffffff, ry = 0, rx = 0, rz = 0) { this.it.push(x, y, z, sx, sy, sz, color, ry, rx, rz); }
  build(scene) {
    const n = this.it.length / 10;
    if (!n) return null;
    const m = new THREE.InstancedMesh(this.geo, this.mat, n), o = new THREE.Object3D(), c = new THREE.Color(), a = this.it;
    o.rotation.order = 'YXZ';
    for (let i = 0; i < n; i++) {
      const k = i * 10;
      o.position.set(a[k], a[k + 1], a[k + 2]);
      o.rotation.set(a[k + 8], a[k + 7], a[k + 9]);
      o.scale.set(a[k + 3], a[k + 4], a[k + 5]);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, c.set(a[k + 6]));
    }
    m.castShadow = this.shadow; m.receiveShadow = true;
    m.computeBoundingSphere();
    scene.add(m);
    return m;
  }
}

function label(text, sub) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.font = 'bold 54px "Segoe UI", Arial, sans-serif'; g.textAlign = 'center';
  g.lineWidth = 10; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.strokeText(text, 256, 66);
  g.fillStyle = '#ffffff'; g.fillText(text, 256, 66);
  if (sub) { g.font = '30px "Segoe UI", Arial'; g.lineWidth = 6; g.strokeText(sub, 256, 112); g.fillStyle = '#ffcf6a'; g.fillText(sub, 256, 112); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true, fog: false }));
  s.scale.set(28, 7, 1);
  return s;
}

export function buildWorld(scene, M) {
  const rnd = mulberry32(20261018);
  const R = (a, b) => a + (b - a) * rnd();
  const pick = (a) => a[(rnd() * a.length) | 0];
  const C = new CollisionWorld(32);

  const G = {
    box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 14).translate(0, 0.5, 0),
    cone: new THREE.ConeGeometry(0.5, 1, 14).translate(0, 0.5, 0),
    pyr: new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0),
    dome: new THREE.SphereGeometry(0.5, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2),
    blob: new THREE.IcosahedronGeometry(0.5, 1),
    ball: new THREE.SphereGeometry(0.5, 10, 8),
  };
  const P = {
    banco: new Batch(G.box, M.banco), plaster: new Batch(G.box, M.plaster), imm: new Batch(G.box, M.imm),
    paint: new Batch(G.box, M.paint), concrete: new Batch(G.box, M.concrete), tole: new Batch(G.box, M.tole),
    ground: new Batch(G.box, M.grass, false), slab: new Batch(G.box, M.concrete, false),
    cylPaint: new Batch(G.cyl, M.paint), cylConc: new Batch(G.cyl, M.concrete), cylBanco: new Batch(G.cyl, M.banco),
    thatch: new Batch(G.cone, M.thatch), parasol: new Batch(G.cone, M.paint), pyr: new Batch(G.pyr, M.paint),
    dome: new Batch(G.dome, M.dome), trunk: new Batch(G.cyl, M.bark), crown: new Batch(G.blob, M.leaf),
    glow: new Batch(G.ball, M.glow, false),
  };
  const box = (b, x, z, w, d, h, color = 0xffffff, o = {}) => {
    b.add(x, o.y ?? 0, z, w, h, d, color, o.ry ?? 0);
    if (o.col !== false) C.addCentered(x, z, w, d);
  };

  const landmarks = [], labels = [], parking = [], lamps = [];
  const addLandmark = (name, x, z, info, r = 45, h = 30) => {
    landmarks.push({ name, x, z, r, info });
    const s = label(name); s.position.set(x, h, z); scene.add(s); labels.push(s);
  };

  // ---------------- Arbres ----------------
  function tree(x, z, kind = 'neem', s = 1) {
    if (kind === 'neem') {
      const h = R(2.6, 3.6) * s;
      P.trunk.add(x, 0, z, 0.5 * s, h + 1.6 * s, 0.5 * s);
      const cr = R(4.8, 6.8) * s;
      for (let k = 0; k < 3; k++)
        P.crown.add(x + R(-1.3, 1.3) * s, h + R(0.3, 2) * s, z + R(-1.3, 1.3) * s, cr * R(0.75, 1.1), cr * R(0.55, 0.8), cr * R(0.75, 1.1), pick(LEAF), R(0, 6));
      C.addCentered(x, z, 0.7 * s, 0.7 * s);
    } else if (kind === 'baobab') {
      P.trunk.add(x, 0, z, 2.6 * s, 7 * s, 2.6 * s, 0xc9b9a6);
      for (let k = 0; k < 5; k++) {
        const a = k * 1.3 + R(0, 0.6);
        P.trunk.add(x + Math.cos(a) * 0.6 * s, 6 * s, z + Math.sin(a) * 0.6 * s, 0.55 * s, 4.5 * s, 0.55 * s, 0xc9b9a6, -a + Math.PI / 2, 0.75, 0);
        P.crown.add(x + Math.cos(a) * 3.2 * s, 9.2 * s, z + Math.sin(a) * 3.2 * s, 3.2 * s, 2 * s, 3.2 * s, 0x6f8a3a, a);
      }
      C.addCentered(x, z, 2.6 * s, 2.6 * s);
    } else if (kind === 'palm') {
      const h = R(8, 12) * s;
      P.trunk.add(x, 0, z, 0.55 * s, h, 0.55 * s, 0x9a8a78);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + R(0, 0.3);
        P.crown.add(x + Math.sin(a) * 1.8 * s, h - 0.4 * s, z + Math.cos(a) * 1.8 * s, 1.1 * s, 0.35 * s, 4.6 * s, 0x4f7a32, a, 0.45, 0);
      }
      C.addCentered(x, z, 0.7 * s, 0.7 * s);
    } else { // acacia (épineux du Sahel), couronne en parasol
      const h = R(2.2, 3) * s;
      P.trunk.add(x, 0, z, 0.32 * s, h + 0.5, 0.32 * s, 0x6b5a48);
      P.crown.add(x, h + 0.3, z, R(6, 8) * s, 1.4 * s, R(6, 8) * s, 0x6a7f34, R(0, 6));
      C.addCentered(x, z, 0.4 * s, 0.4 * s);
    }
  }

  // ---------------- Réseau routier ----------------
  const nodeMap = new Map(), segments = [];
  const node = (x, z) => {
    const k = x + ',' + z;
    if (!nodeMap.has(k)) nodeMap.set(k, { x, z, nb: [], paved: false, id: nodeMap.size });
    return nodeMap.get(k);
  };
  const link = (a, b, paved, bridge = false) => {
    a.nb.push(b); b.nb.push(a);
    segments.push({ a, b, paved, bridge });
    if (paved) a.paved = b.paved = true;
  };
  const xsL = range(LEFT.x0, LEFT.x1, BS), zsL = range(LEFT.z0, LEFT.z1, BS);
  const xsR = range(RIGHT.x0, RIGHT.x1, BS), zsR = range(RIGHT.z0, RIGHT.z1, BS);
  const central = (x, z) => Math.abs(x) <= 320 && z >= -320;
  const pavedV = (x) => x % 160 === 0 || x === -80 || x === 400;
  for (const z of zsL) for (let i = 0; i < xsL.length - 1; i++)
    link(node(xsL[i], z), node(xsL[i + 1], z), z % 160 === 0 || central(xsL[i], z));
  for (const x of xsL) for (let j = 0; j < zsL.length - 1; j++)
    link(node(x, zsL[j]), node(x, zsL[j + 1]), pavedV(x) || central(x, zsL[j]));
  for (const z of zsR) for (let i = 0; i < xsR.length - 1; i++)
    link(node(xsR[i], z), node(xsR[i + 1], z), z === 400);
  for (const x of xsR) for (let j = 0; j < zsR.length - 1; j++)
    link(node(x, zsR[j]), node(x, zsR[j + 1]), x === -80 || x === 400);
  for (const b of BRIDGES) link(node(b.x, BRIDGE_Z0), node(b.x, BRIDGE_Z1), true, true);

  {
    const pav = [], lat = [], dash = [];
    const plane = (cx, cz, w, l, y, rot) => {
      const g = new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2);
      if (rot) g.rotateY(Math.PI / 2);
      return g.translate(cx, y, cz);
    };
    for (const s of segments) {
      const horiz = s.a.z === s.b.z;
      const len = Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z) - RW;
      const cx = (s.a.x + s.b.x) / 2, cz = (s.a.z + s.b.z) / 2;
      const y = s.bridge ? 0.07 : 0.02;
      (s.paved ? pav : lat).push(plane(cx, cz, RW, len, y, horiz));
      if (s.paved) {
        for (let t = -len / 2 + 3; t < len / 2 - 3; t += 9)
          dash.push(plane(horiz ? cx + t : cx, horiz ? cz : cz + t, 0.22, 3, y + 0.012, horiz));
        // trottoirs en béton surélevés
        if (!s.bridge) for (const sd of [-1, 1]) {
          const ox = horiz ? 0 : sd * (HALF + 1.1), oz = horiz ? sd * (HALF + 1.1) : 0;
          P.slab.add(cx + ox, 0, cz + oz, horiz ? len : 2.2, 0.16, horiz ? 2.2 : len, 0xd8d0c4);
        }
      }
    }
    for (const n of nodeMap.values()) (n.paved ? pav : lat).push(plane(n.x, n.z, RW, RW, n.z === BRIDGE_Z0 || n.z === BRIDGE_Z1 ? 0.025 : 0.02, false));
    const mk = (arr, mat) => { const m = new THREE.Mesh(mergeGeometries(arr), mat); m.receiveShadow = true; scene.add(m); };
    mk(pav, M.asphalt); mk(lat, M.laterite); mk(dash, M.line);
  }

  // ---------------- Sol et vallée du fleuve ----------------
  {
    const xs = range(-1700, 1700, 10);
    const pos = [], idx = [];
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i], rc = riverCenter(x);
      const zl = [-1700];
      for (let k = 0; k <= 32; k++) zl.push(rc - 82 + k * (164 / 32));
      zl.push(1700);
      for (let r = 0; r < zl.length; r++) pos.push(x, bankY(x, zl[r]), zl[r]);
    }
    const nr = 35; // lignes par colonne (1 + 33 + 1)
    for (let i = 0; i < xs.length - 1; i++)
      for (let r = 0; r < nr - 1; r++) {
        const a = i * nr + r, b = (i + 1) * nr + r;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
    g.setIndex(idx); g.computeVertexNormals();
    const ground = new THREE.Mesh(g, M.sand); ground.receiveShadow = true; scene.add(ground);

    // eau : ruban qui suit le lit du fleuve
    const wp = [], wi = [], wx = range(-1700, 1700, 20);
    for (const x of wx) { const rc = riverCenter(x); wp.push(x, WATER_Y, rc - RIVER_HALF - 8, x, WATER_Y, rc + RIVER_HALF + 8); }
    for (let i = 0; i < wx.length - 1; i++) { const a = i * 2; wi.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
    const uvs = []; for (let i = 0; i < wp.length; i += 3) uvs.push(wp[i] / 23, wp[i + 2] / 17);
    wg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    wg.setIndex(wi); wg.computeVertexNormals();
    var water = new THREE.Mesh(wg, M.water); water.receiveShadow = true; scene.add(water);

    // bancs de sable et bourgou (herbe aquatique) dans le fleuve
    for (const [x, w, d] of [[180, 70, 22], [-420, 90, 26], [660, 60, 18], [-700, 50, 16]]) {
      P.ground.add(x, WATER_Y - 0.5, riverCenter(x) + R(-15, 15), w, 0.62, d, 0xffe2b0);
      for (let k = 0; k < 6; k++) P.crown.add(x + R(-w / 3, w / 3), WATER_Y, riverCenter(x) + R(-8, 8), R(4, 8), 0.8, R(3, 5), 0x6d8f3a, R(0, 6));
    }
    // végétation des berges
    for (let x = -800; x < 800; x += R(8, 22)) for (const sd of [-1, 1]) {
      const z = riverCenter(x) + sd * R(RIVER_HALF + 4, RIVER_HALF + 14);
      if (onBridge(x, z) || Math.abs(x + 80) < 14 || Math.abs(x - 400) < 14) continue;
      if (rnd() < 0.35) tree(x, z, rnd() < 0.3 ? 'palm' : 'neem', R(0.8, 1.1));
      else P.crown.add(x, bankY(x, z) - 0.2, z, R(2, 4), R(0.8, 1.6), R(2, 4), 0x617f30, R(0, 6));
    }
  }

  // ---------------- Ponts ----------------
  for (const b of BRIDGES) {
    const kennedy = b.x < 0, L = BRIDGE_Z1 - BRIDGE_Z0, cz = (BRIDGE_Z0 + BRIDGE_Z1) / 2;
    box(P.concrete, b.x, cz, RW + 1.6, L, 1.3, 0xe8e2d8, { y: -1.25, col: false });
    for (const sd of [-1, 1]) {
      const rx = b.x + sd * (HALF + 0.5);
      box(kennedy ? P.paint : P.concrete, rx, cz, 0.5, L, 1.1, kennedy ? 0x5f6e74 : 0xf0ece4, { y: 0, col: false });
      C.add(rx - 0.4, 190, rx + 0.4, 380);
      for (let z = BRIDGE_Z0 + 10; z < BRIDGE_Z1; z += 30) {
        P.cylPaint.add(rx, 0, z, 0.2, 8, 0.2, 0x4a5258);
        P.glow.add(rx - sd * 1.2, 8, z, 0.7, 0.4, 0.7, 0xffffff);
        lamps.push({ x: rx - sd * 1.2, z });
      }
      if (kennedy) // treillis métallique caractéristique
        for (let z = 200; z < 375; z += 12) P.paint.add(rx, 0.9, z, 0.3, 0.3, 12, 0x5f6e74, 0, sd * 0.0, 0);
    }
    for (let z = 205; z < 375; z += 34) box(P.cylConc, b.x, z, 5, 3, 6, 0xd8d2c8, { y: -6, col: false });
    if (!kennedy) // arches blanches du pont de l'Amitié
      for (let z = 215; z < 370; z += 34) for (const sd of [-1, 1])
        P.cylConc.add(b.x + sd * (HALF + 0.5), 1, z, 0.7, 7, 0.7, 0xf4f1ea, 0, 0, sd * 0.25);
    addLandmark(b.name, b.x, cz, kennedy
      ? 'Premier pont de Niamey, il relie les deux rives du fleuve Niger depuis 1970.'
      : 'Le pont de l\'Amitié Chine-Niger, deuxième pont de la capitale.', 60, 14);
  }
  addLandmark('Fleuve Niger', 180, riverCenter(180), 'Troisième plus long fleuve d\'Afrique (environ 4 200 km). Pirogues, pêcheurs et hippopotames.', 80, 8);

  // ---------------- Cellules (îlots) ----------------
  const cells = [];
  const pushCells = (xs, zs, bank) => {
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++)
      cells.push({ cx: xs[i] + BS / 2, cz: zs[j] + BS / 2, x0: xs[i] + HALF, x1: xs[i + 1] - HALF, z0: zs[j] + HALF, z1: zs[j + 1] - HALF, bank });
  };
  pushCells(xsL, zsL, 'L'); pushCells(xsR, zsR, 'R');

  // façade principale de la cellule (pour placer portails et enseignes)
  function compound(x0, z0, w, d, batch, color, gate) {
    const t = 0.35, h = 2.3, gw = 3.4, gc = pick(GATES);
    const sides = {
      N: [x0 + w / 2, z0, w, true], S: [x0 + w / 2, z0 + d, w, true],
      W: [x0, z0 + d / 2, d, false], E: [x0 + w, z0 + d / 2, d, false],
    };
    for (const [k, [cx, cz, len, horiz]] of Object.entries(sides)) {
      if (k === gate) {
        const seg = (len - gw) / 2;
        for (const sd of [-1, 1]) {
          const off = sd * (gw / 2 + seg / 2);
          batch.add(horiz ? cx + off : cx, 0, horiz ? cz : cz + off, horiz ? seg : t, h, horiz ? t : seg, color);
        }
        P.paint.add(cx, 0, cz, horiz ? gw : 0.12, h + 0.1, horiz ? 0.12 : gw, gc);
      } else batch.add(cx, 0, cz, horiz ? len : t, h, horiz ? t : len, color);
      C.addCentered(cx, cz, horiz ? len : t + 0.1, horiz ? t + 0.1 : len);
    }
  }

  function house(cx, cz, w, d, face, painted) {
    const twoFloors = rnd() < 0.15, h = twoFloors ? 6.4 : R(2.9, 3.5);
    const b = painted ? P.plaster : P.banco, col = painted ? pick(PAINT) : pick(BANCO);
    box(b, cx, cz, w, d, h, col);
    b.add(cx, h, cz, w + 0.25, 0.4, d + 0.25, col); // acrotère
    const fx = face === 'E' ? 1 : face === 'W' ? -1 : 0, fz = face === 'S' ? 1 : face === 'N' ? -1 : 0;
    const px = cx + fx * (w / 2 + 0.02), pz = cz + fz * (d / 2 + 0.02), along = fz !== 0;
    P.paint.add(px, 0, pz, along ? 1.1 : 0.08, 2.15, along ? 0.08 : 1.1, pick(GATES)); // porte métallique
    for (const s of [-1, 1]) {
      const o = s * (along ? w : d) * 0.28;
      P.paint.add(along ? px + o : px, 1.1, along ? pz : pz + o, along ? 1 : 0.08, 0.9, along ? 0.08 : 1, pick(GATES));
    }
    // gargouilles (gouttières en tôle typiques)
    P.cylPaint.add(px, h - 0.15, pz, 0.14, 0.9, 0.14, 0x8a8a84, along ? 0 : Math.PI / 2, along ? Math.PI / 2 * fz : 0, along ? 0 : Math.PI / 2 * fx);
    if (rnd() < 0.25) P.cylPaint.add(cx + R(-w / 4, w / 4), h + 0.35, cz + R(-d / 4, d / 4), 1.1, 1.4, 1.1, 0x1c1c1c); // polytank
    if (twoFloors && rnd() < 0.5) P.tole.add(cx, h + 0.4, cz - d * 0.2, w * 0.5, 0.08, d * 0.4, 0xffffff);
  }

  function hut(x, z) {
    P.cylBanco.add(x, 0, z, 4.2, 2.4, 4.2, pick(BANCO));
    P.thatch.add(x, 2.3, z, 5.4, 2.4, 5.4, 0xffffff);
    C.addCentered(x, z, 4, 4);
  }

  function residential(c, density = 1) {
    const nx = rnd() < 0.55 ? 2 : 3, nz = rnd() < 0.55 ? 2 : 3;
    const X0 = c.x0 + 4, Z0 = c.z0 + 4, W = c.x1 - c.x0 - 8, D = c.z1 - c.z0 - 8, pw = W / nx, pd = D / nz;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const px = X0 + i * pw, pz = Z0 + j * pd, cx = px + pw / 2, cz = pz + pd / 2;
      const outer = [];
      if (i === 0) outer.push('W'); if (i === nx - 1) outer.push('E');
      if (j === 0) outer.push('N'); if (j === nz - 1) outer.push('S');
      if (!outer.length || rnd() > density) {
        if (rnd() < 0.7) tree(cx + R(-3, 3), cz + R(-3, 3), rnd() < 0.1 ? 'baobab' : 'neem');
        continue;
      }
      const painted = rnd() < 0.15, gate = pick(outer);
      compound(px + 0.3, pz + 0.3, pw - 0.6, pd - 0.6, painted ? P.plaster : P.banco, painted ? pick(PAINT) : pick(BANCO), gate);
      const hw = Math.min(pw * R(0.45, 0.7), 14), hd = Math.min(pd * R(0.32, 0.45), 9);
      const back = { N: 'S', S: 'N', E: 'W', W: 'E' }[gate];
      let hx = cx, hz = cz;
      if (back === 'S') hz = pz + pd - 1.6 - hd / 2; if (back === 'N') hz = pz + 1.6 + hd / 2;
      if (back === 'E') hx = px + pw - 1.6 - hd / 2; if (back === 'W') hx = px + 1.6 + hd / 2;
      const vert = back === 'E' || back === 'W';
      house(hx, hz, vert ? hd : hw, vert ? hw : hd, gate, painted);
      const r2 = rnd();
      if (r2 < 0.18) hut(cx + (vert ? 0 : R(-3, 3)), cz + (vert ? R(-3, 3) : 0));
      else if (r2 < 0.6) tree(cx + R(-2, 2), cz + R(-2, 2), rnd() < 0.2 ? 'palm' : 'neem', R(0.8, 1));
    }
  }

  function commercial(c, maxFloors) {
    const X0 = c.x0 + 4, X1 = c.x1 - 4, Z0 = c.z0 + 4, Z1 = c.z1 - 4;
    const building = (cx, cz, w, d, face) => {
      const fl = 1 + ((rnd() * maxFloors) | 0), h = fl * 3.2 + 0.3;
      box(P.imm, cx, cz, w, d, h, pick(IMMC));
      P.plaster.add(cx, h, cz, w + 0.3, 0.45, d + 0.3, 0xffffff);
      const fx = face === 'E' ? 1 : face === 'W' ? -1 : 0, fz = face === 'S' ? 1 : face === 'N' ? -1 : 0, along = fz !== 0;
      P.paint.add(cx + fx * (w / 2 + 0.8), 2.9, cz + fz * (d / 2 + 0.8), along ? w - 1 : 1.6, 0.16, along ? 1.6 : d - 1, pick(AWN));
      if (rnd() < 0.35) P.cylPaint.add(cx + R(-w / 4, w / 4), h + 0.45, cz + R(-d / 4, d / 4), 1.2, 1.5, 1.2, 0x1c1c1c);
      if (rnd() < 0.25) P.paint.add(cx, h + 0.45, cz, 0.9, 0.9, 0.6, 0xd8d8d8); // climatiseur
    };
    for (const [face, z, d] of [['N', Z0, R(10, 15)], ['S', Z1, R(10, 15)]]) {
      for (let x = X0; x < X1 - 6;) {
        const w = Math.min(R(9, 18), X1 - x); building(x + w / 2, face === 'N' ? z + d / 2 : z - d / 2, w - 0.4, d, face); x += w;
      }
    }
    for (const [face, x] of [['W', X0], ['E', X1]]) {
      for (let z = Z0 + 16; z < Z1 - 22;) {
        const w = Math.min(R(9, 16), Z1 - 16 - z), d = R(10, 14); building(face === 'W' ? x + d / 2 : x - d / 2, z + w / 2, d, w - 0.4, face); z += w;
      }
    }
    if (rnd() < 0.6) tree(c.cx, c.cz, 'neem', 1.1);
  }

  function flag(x, z, h = 12) {
    P.cylPaint.add(x, 0, z, 0.2, h, 0.2, 0xdddddd);
    P.paint.add(x + 1.8, h - 0.9, z, 3.4, 0.7, 0.05, 0xe05206);
    P.paint.add(x + 1.8, h - 1.6, z, 3.4, 0.7, 0.05, 0xffffff);
    P.paint.add(x + 1.8, h - 2.3, z, 3.4, 0.7, 0.05, 0x0db02b);
    P.cylPaint.add(x + 1.8, h - 1.25, z + 0.04, 0.5, 0.06, 0.5, 0xe05206, 0, Math.PI / 2, 0);
    C.addCentered(x, z, 0.4, 0.4);
  }

  function waterTower(x, z) {
    box(P.cylConc, x, z, 3, 3, 22, 0xe8e2d6);
    P.cylConc.add(x, 20, z, 9, 2, 9, 0xe8e2d6, 0, Math.PI, 0);
    P.cylConc.add(x, 22, z, 13, 6, 13, 0xf2efe8);
    P.cylPaint.add(x, 28, z, 13.2, 0.4, 13.2, 0x2a6fb0);
  }

  function smallMosque(x, z) { // mosquée de quartier en banco, minaret hérissé de toron
    box(P.banco, x, z, 14, 11, 4.5, 0xf0d2a8);
    P.banco.add(x, 4.5, z, 14.3, 0.5, 11.3, 0xf0d2a8);
    box(P.banco, x - 5.5, z - 4, 3.4, 3.4, 11, 0xf0d2a8);
    P.pyr.add(x - 5.5, 11, z - 4, 3.4, 2.2, 3.4, 0xe8c49c);
    for (let k = 0; k < 4; k++) for (let a = 0; a < 4; a++)
      P.trunk.add(x - 5.5 + (a < 2 ? (a ? 1 : -1) * 2.1 : 0), 3 + k * 2.2, z - 4 + (a >= 2 ? (a === 3 ? 1 : -1) * 2.1 : 0), 0.14, 0.9, 0.14, 0x6b5a48, 0, a >= 2 ? Math.PI / 2 : 0, a < 2 ? Math.PI / 2 : 0);
    P.dome.add(x - 5.5, 13.2, z - 4, 0.8, 0.8, 0.8, 0x2a9a50);
  }

  function station(c) {
    const { cx, cz } = c;
    P.slab.add(cx, 0, cz, 40, 0.08, 40, 0xbdb6aa);
    for (const [dx, dz] of [[-9, -6], [9, -6], [-9, 6], [9, 6]]) box(P.cylPaint, cx + dx, cz + dz, 0.6, 0.6, 5.2, 0xeeeeee);
    P.paint.add(cx, 5.2, cz, 24, 0.8, 16, 0x0db02b);
    P.paint.add(cx, 5.2, cz, 24.3, 0.3, 16.3, 0xe05206);
    for (const dx of [-5, 0, 5]) box(P.paint, cx + dx, cz, 1.1, 0.8, 1.7, 0xf2f2f2);
    box(P.plaster, cx, cz - 15, 14, 7, 4, 0xf7f3ea);
    const s = label('STATION', 'Essence · Gasoil'); s.position.set(cx, 9, cz); s.scale.set(16, 4, 1); scene.add(s); labels.push(s);
    parking.push({ x: cx - 12, z: cz + 12, h: 0, type: 'pickup' });
  }

  function park(c) {
    P.ground.add(c.cx, 0, c.cz, c.x1 - c.x0 - 2, 0.06, c.z1 - c.z0 - 2, 0xffffff);
    for (let k = 0; k < 14; k++) tree(R(c.x0 + 6, c.x1 - 6), R(c.z0 + 6, c.z1 - 6), pick(['neem', 'neem', 'palm', 'baobab']));
  }

  // ---------------- Monuments ----------------
  const L = {};
  L['280,-120'] = (c) => { // Grande Mosquée
    const { cx, cz } = c;
    P.slab.add(cx, 0, cz, 60, 0.1, 60, 0xe9e1d2);
    compound(c.x0 + 2, c.z0 + 2, 60, 60, P.plaster, 0xf6efe0, 'S');
    box(P.plaster, cx, cz + 6, 32, 24, 11, 0xf8f2e6);
    P.plaster.add(cx, 11, cz + 6, 32.6, 0.8, 24.6, 0xf3ead8);
    P.cylConc.add(cx, 11.6, cz + 6, 17, 2.4, 17, 0xf8f2e6);
    P.dome.add(cx, 14, cz + 6, 17, 13, 17, 0x1f8a4c);
    P.cylPaint.add(cx, 20.4, cz + 6, 0.3, 3, 0.3, 0xd4af37);
    for (const [dx, dz] of [[-13, -4], [13, -4], [-13, 16], [13, 16]]) {
      P.cylConc.add(cx + dx, 11.6, cz + dz, 4.4, 1, 4.4, 0xf8f2e6);
      P.dome.add(cx + dx, 12.6, cz + dz, 4.4, 3.6, 4.4, 0x1f8a4c);
    }
    for (let k = -3; k <= 3; k++) P.cylConc.add(cx + k * 4.2, 0, cz - 6.5, 0.9, 8, 0.9, 0xffffff);
    const mx = cx + 20, mz = cz - 18;
    box(P.plaster, mx, mz, 5, 5, 46, 0xf8f2e6);
    for (const y of [28, 38]) P.plaster.add(mx, y, mz, 7, 1, 7, 0xf3ead8);
    P.cylConc.add(mx, 46, mz, 3.6, 4, 3.6, 0xf8f2e6);
    P.dome.add(mx, 50, mz, 3.8, 4.5, 3.8, 0x1f8a4c);
    P.cylPaint.add(mx, 52, mz, 0.2, 2.4, 0.2, 0xd4af37);
    tree(cx - 24, cz - 22, 'palm'); tree(cx - 24, cz + 24, 'palm'); tree(cx + 24, cz + 24, 'palm');
    addLandmark('Grande Mosquée', cx, cz, 'La Grande Mosquée de Niamey, son dôme vert et son minaret dominent la ville. On peut monter au minaret pour admirer la vue.', 50, 62);
  };
  L['40,-120'] = (c) => { // Grand Marché
    const { cx, cz } = c;
    P.slab.add(cx, 0, cz, 62, 0.08, 62, 0xb59a7a);
    for (const dz of [-14, 14]) {
      box(P.plaster, cx, cz + dz, 50, 16, 6, 0xe9dcc4);
      P.tole.add(cx, 6, cz + dz, 52, 0.3, 18, 0xbfc8cc);
      for (let k = -4; k <= 4; k++) P.paint.add(cx + k * 5.4, 0, cz + dz + (dz < 0 ? -8.05 : 8.05), 3.4, 2.6, 0.1, 0x5a4a3a);
    }
    for (let k = 0; k < 26; k++) {
      const x = cx + R(-28, 28), z = cz + (rnd() < 0.5 ? R(-3, 3) : (rnd() < 0.5 ? -27 : 27) + R(-2, 2));
      box(P.paint, x, z, 2.6, 2.2, 1, pick([0x8a6a4a, 0x6a5a48, 0x9a7a52]));
      P.paint.add(x, 1, z, 2.4, 0.08, 2, pick(AWN));
      P.cylPaint.add(x, 0, z, 0.08, 2.6, 0.08, 0x444444);
      P.parasol.add(x, 2.6, z, 3.6, 0.9, 3.6, pick(AWN));
    }
    addLandmark('Grand Marché', cx, cz, 'Le cœur commerçant de Niamey : tissus wax et bazin, épices, céréales, artisanat… On y trouve de tout.', 50, 16);
  };
  L['-120,-40'] = (c) => { // Petit Marché
    const { cx, cz } = c;
    P.slab.add(cx, 0, cz, 60, 0.08, 60, 0xb59a7a);
    box(P.plaster, cx, cz - 16, 40, 12, 5, 0xe0d4bc);
    P.tole.add(cx, 5, cz - 16, 42, 0.3, 14, 0xa8b0b4);
    for (let k = 0; k < 30; k++) {
      const x = cx + R(-26, 26), z = cz + R(-4, 26);
      box(P.paint, x, z, 2.2, 1.8, 0.9, 0x7a6248);
      P.parasol.add(x, 2.2, z, 3.2, 0.8, 3.2, pick(AWN));
      P.cylPaint.add(x, 0, z, 0.08, 2.2, 0.08, 0x444444);
    }
    addLandmark('Petit Marché', cx, cz, 'Fruits, légumes, poisson du fleuve et brochettes : l\'ambiance des marchés populaires de la capitale.', 45, 14);
  };
  L['-200,120'] = (c) => { // Musée national Boubou Hama
    const { cx, cz } = c;
    P.ground.add(cx, 0, cz, 62, 0.06, 62, 0xffffff);
    compound(c.x0 + 1, c.z0 + 1, 62, 62, P.banco, 0xe8c49c, 'N');
    for (const [dx, dz] of [[-16, -14], [14, -16], [-14, 14], [16, 12]]) {
      box(P.banco, cx + dx, cz + dz, 14, 9, 4.2, 0xf0d2a8);
      P.pyr.add(cx + dx, 4.2, cz + dz, 16, 3.8, 11, 0x8a4a2a);
    }
    // squelette de dinosaure (Jobaria, découvert au Niger)
    const bone = 0xf2ead8, dx = cx, dz = cz;
    P.paint.add(dx, 4, dz, 2, 2.2, 8, bone);
    P.paint.add(dx, 4.6, dz - 6.5, 1, 1, 8, bone, 0, -0.7, 0);
    P.paint.add(dx, 9.6, dz - 10.8, 1.2, 1.2, 2.2, bone);
    P.paint.add(dx, 4.2, dz + 8, 1, 1, 9, bone, 0, 0.35, 0);
    for (const [lx, lz] of [[-0.9, -2.8], [0.9, -2.8], [-0.9, 2.8], [0.9, 2.8]]) P.paint.add(dx + lx, 0, dz + lz, 0.6, 4.2, 0.6, bone);
    P.slab.add(dx, 0, dz, 8, 0.4, 16, 0x9a8a78);
    C.addCentered(dx, dz, 8, 16);
    for (let k = 0; k < 8; k++) tree(R(c.x0 + 5, c.x1 - 5), R(c.z0 + 5, c.z1 - 5), pick(['neem', 'baobab', 'palm']));
    addLandmark('Musée National Boubou Hama', cx, cz, 'Fondé en 1959 et rebaptisé en 2008 en l\'honneur de Boubou Hama. Célèbre pour ses squelettes de dinosaures du désert nigérien et son zoo.', 50, 18);
  };
  L['-40,120'] = (c) => { // Hôtel Gaweye
    const { cx, cz } = c;
    box(P.imm, cx - 4, cz - 6, 40, 16, 28.9, 0xf3e7d2);
    P.plaster.add(cx - 4, 28.9, cz - 6, 40.5, 0.6, 16.5, 0xffffff);
    P.slab.add(cx + 8, 0, cz + 16, 16, 0.3, 9, 0xffffff);
    P.paint.add(cx + 8, 0.29, cz + 16, 14, 0.04, 7, 0x2aa8d8);
    for (let k = 0; k < 6; k++) tree(cx - 26 + k * 8, cz + 26, 'palm');
    parking.push({ x: cx - 18, z: cz + 14, h: Math.PI / 2, type: 'berline' });
    addLandmark('Hôtel Gaweye', cx, cz, 'Grand hôtel au bord du fleuve, face au pont Kennedy.', 40, 34);
  };
  L['40,120'] = (c) => { // Palais des Congrès
    const { cx, cz } = c;
    P.slab.add(cx, 0, cz, 60, 0.08, 60, 0xd8d0c4);
    box(P.imm, cx, cz, 44, 28, 10.3, 0xffffff);
    P.plaster.add(cx, 10.3, cz, 48, 1.2, 32, 0xf4efe6);
    for (let k = -5; k <= 5; k++) P.cylConc.add(cx + k * 4, 0, cz - 15.5, 0.9, 10.3, 0.9, 0xffffff);
    flag(cx - 26, cz - 24); flag(cx + 26, cz - 24);
    addLandmark('Palais des Congrès', cx, cz, 'Lieu des grandes conférences internationales de Niamey.', 40, 18);
  };
  L['-440,40'] = (c) => { // Assemblée nationale
    const { cx, cz } = c;
    P.slab.add(cx, 0, cz, 60, 0.08, 60, 0xd8d0c4);
    box(P.imm, cx, cz + 6, 46, 26, 13, 0xfbf7ee);
    P.plaster.add(cx, 13, cz + 6, 48, 1, 28, 0xffffff);
    for (let k = -6; k <= 6; k++) P.cylConc.add(cx + k * 3.5, 0, cz - 8, 0.9, 13, 0.9, 0xffffff);
    flag(cx, cz - 22, 16);
    addLandmark('Assemblée Nationale', cx, cz, 'Siège du parlement du Niger, sur le Plateau.', 40, 22);
  };
  L['-520,120'] = (c) => { // Présidence
    const { cx, cz } = c;
    P.ground.add(cx, 0, cz, 62, 0.06, 62, 0xffffff);
    compound(c.x0 + 1, c.z0 + 1, 62, 62, P.plaster, 0xffffff, 'N');
    box(P.imm, cx, cz + 6, 36, 20, 10, 0xffffff);
    P.pyr.add(cx, 10, cz + 6, 38, 4, 22, 0x2f7d4a);
    flag(cx, cz - 16, 16);
    for (let k = 0; k < 6; k++) tree(cx - 25 + k * 10, cz - 26, 'palm');
    addLandmark('Palais Présidentiel', cx, cz, 'Le palais de la présidence, sur le Plateau, au-dessus du fleuve.', 40, 20);
  };
  L['-360,-40'] = (c) => { // Place de la Concertation
    const { cx, cz } = c;
    P.slab.add(cx, 0, cz, 62, 0.1, 62, 0xe2dccf);
    box(P.cylConc, cx, cz, 14, 14, 0.8, 0xd0c8ba);
    P.cylPaint.add(cx, 0.8, cz, 12, 0.1, 12, 0x3a8fc0);
    box(P.concrete, cx, cz, 2.6, 2.6, 20, 0xf4efe6, { y: 0.8 });
    P.pyr.add(cx, 20.8, cz, 2.6, 2.6, 2.6, 0xd4af37);
    for (let a = 0; a < 12; a++) tree(cx + Math.cos(a / 12 * 6.283) * 24, cz + Math.sin(a / 12 * 6.283) * 24, a % 2 ? 'palm' : 'neem', 0.9);
    flag(cx + 9, cz + 9);
    addLandmark('Place de la Concertation', cx, cz, 'Grande place du Plateau, lieu de rassemblements et de cérémonies.', 40, 26);
  };
  L['440,-360'] = (c) => { // Stade Général Seyni Kountché
    const { cx, cz } = c;
    const pts = [new THREE.Vector2(22, 0), new THREE.Vector2(22, 1.5), new THREE.Vector2(30, 11), new THREE.Vector2(31, 11), new THREE.Vector2(31, 0)];
    const g = new THREE.LatheGeometry(pts, 48); g.scale(1, 1, 0.82);
    const m = new THREE.Mesh(g, M.concrete); m.position.set(cx, 0, cz); m.castShadow = m.receiveShadow = true; scene.add(m);
    P.ground.add(cx, 0, cz, 40, 0.08, 32, 0xffffff);
    for (const [dx, dz] of [[-28, -22], [28, -22], [-28, 22], [28, 22]]) {
      box(P.cylPaint, cx + dx, cz + dz, 0.8, 0.8, 26, 0x9a9a9a);
      P.paint.add(cx + dx, 26, cz + dz, 4, 2, 0.6, 0x666666);
      P.glow.add(cx + dx, 26.4, cz + dz, 3.6, 1.4, 0.7, 0xffffff);
    }
    C.addCentered(cx, cz, 62, 52);
    addLandmark('Stade Seyni Kountché', cx, cz, 'Le stade Général Seyni Kountché, grand stade de Niamey où joue le Mena (équipe nationale).', 50, 22);
  };
  L['-40,-280'] = (c) => { // Gare routière
    const { cx, cz } = c;
    P.slab.add(cx, 0, cz, 62, 0.06, 62, 0x9a8466);
    for (const dz of [-16, 4]) {
      for (const dx of [-24, -8, 8, 24]) box(P.cylPaint, cx + dx, cz + dz, 0.4, 0.4, 4.5, 0x777777);
      P.tole.add(cx, 4.5, cz + dz, 54, 0.2, 8, 0xd0d4d6);
    }
    box(P.plaster, cx, cz + 24, 30, 8, 4, 0xf2e8d8);
    for (let k = 0; k < 5; k++) parking.push({ x: cx - 22 + k * 11, z: cz - 6, h: 0, type: k % 2 ? 'minibus' : 'talladje' });
    parking.push({ x: cx + 18, z: cz + 14, h: Math.PI / 2, type: 'camion' });
    addLandmark('Gare Routière', cx, cz, 'Départs vers Dosso, Tillabéri, Tahoua, Agadez, Zinder… Les « talladjé » et minibus faba-faba se remplissent ici.', 45, 12);
  };
  L['-280,-120'] = (c) => { // Commissariat
    const { cx, cz } = c;
    P.slab.add(cx, 0, cz, 60, 0.06, 60, 0xc8c0b2);
    box(P.imm, cx, cz - 8, 34, 16, 7, 0xf4f1ea);
    P.paint.add(cx, 5.2, cz - 16.05, 34, 1, 0.1, 0x1d4f9a);
    flag(cx, cz + 6);
    for (let k = 0; k < 3; k++) parking.push({ x: cx - 12 + k * 12, z: cz + 16, h: 0, type: 'police' });
    addLandmark('Commissariat Central', cx, cz, 'Police Nationale. C\'est ici qu\'on se retrouve quand on a été arrêté…', 40, 14);
  };
  L['-280,40'] = (c) => { // Hôpital
    const { cx, cz } = c;
    P.slab.add(cx, 0, cz, 60, 0.06, 60, 0xd0c8ba);
    box(P.imm, cx, cz, 40, 20, 9.9, 0xffffff);
    P.paint.add(cx, 6, cz - 10.06, 1.2, 4, 0.1, 0xd02020); P.paint.add(cx, 7.4, cz - 10.06, 4, 1.2, 0.1, 0xd02020);
    addLandmark('Hôpital National', cx, cz, 'Le grand hôpital de Niamey.', 40, 16);
  };
  L['120,-440'] = park; L['-520,-280'] = park;
  L['-360,-280'] = station; L['360,40'] = station; L['200,-40'] = station; L['-120,520'] = station;
  L['120,440'] = (c) => { // Université Abdou Moumouni
    const { cx, cz } = c;
    P.ground.add(cx, 0, cz, 62, 0.06, 62, 0xffffff);
    for (const [dx, dz, w, d] of [[-14, -14, 26, 12], [16, -12, 18, 16], [-12, 16, 24, 14], [16, 18, 16, 12]]) {
      box(P.imm, cx + dx, cz + dz, w, d, 9.9, pick(IMMC));
      P.plaster.add(cx + dx, 9.9, cz + dz, w + 0.4, 0.5, d + 0.4, 0xffffff);
    }
    for (let k = 0; k < 6; k++) tree(R(c.x0 + 4, c.x1 - 4), R(c.z0 + 4, c.z1 - 4), 'neem');
    addLandmark('Université Abdou Moumouni', cx, cz, 'La principale université publique du Niger, sur la rive droite.', 45, 16);
  };
  L['200,440'] = (c) => residential(c, 0.5);
  const rice = (c) => { // rizières de la rive droite
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const x = c.x0 + 2 + i * 15 + 7, z = c.z0 + 2 + j * 15 + 7;
      P.ground.add(x, 0, z, 13.4, 0.12, 13.4, rnd() < 0.5 ? 0xffffff : 0xd8f0a0);
    }
    hut(c.cx + 26, c.cz - 26);
  };
  L['-280,440'] = rice; L['-200,440'] = rice;
  const firstRice = { done: false };

  // ---------------- Remplissage des cellules ----------------
  const special = new Set(['-600,-520', '520,-200', '-120,-440', '360,-280', '-40,440', '440,520', '600,-40', '-440,-440']);
  for (const c of cells) {
    const key = c.cx + ',' + c.cz;
    if (L[key]) { L[key](c); c.kind = 'landmark'; if (L[key] === rice && !firstRice.done) { firstRice.done = true; addLandmark('Rizières', c.cx + 40, c.cz, 'Sur la rive droite, les rizières irriguées par le fleuve nourrissent la ville.', 50, 10); } continue; }
    const d = Math.hypot(c.cx - 0, c.cz + 100);
    if (special.has(key)) { residential(c, 0.7); waterTower(c.cx, c.cz); c.kind = 'res'; continue; }
    if (c.bank === 'L' && d < 230) { commercial(c, d < 140 ? 5 : 3); c.kind = 'com'; }
    else if (rnd() < 0.07) { c.kind = 'lot'; for (let k = 0; k < 3; k++) tree(R(c.x0 + 6, c.x1 - 6), R(c.z0 + 6, c.z1 - 6), rnd() < 0.4 ? 'acacia' : 'neem'); }
    else { residential(c, c.bank === 'R' ? 0.8 : 0.95); c.kind = 'res'; if (rnd() < 0.08) smallMosque(c.cx + R(-8, 8), c.cz + R(-8, 8)); }
  }

  // ---------------- Arbres d'alignement et lampadaires ----------------
  for (const s of segments) {
    if (!s.paved || s.bridge) continue;
    const horiz = s.a.z === s.b.z, len = Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z);
    for (let t = 14; t < len - 12; t += 20) {
      const k = t / len, x = s.a.x + (s.b.x - s.a.x) * k, z = s.a.z + (s.b.z - s.a.z) * k;
      const sd = ((t / 20) | 0) % 2 ? 1 : -1;
      const ox = horiz ? 0 : sd * (HALF + 3.2), oz = horiz ? sd * (HALF + 3.2) : 0;
      if (rnd() < 0.55) tree(x + ox, z + oz, 'neem', 0.9);
      if (((t / 20) | 0) % 2 === 0) {
        const lx = x - ox * 0.7, lz = z - oz * 0.7;
        P.cylPaint.add(lx, 0, lz, 0.2, 8, 0.2, 0x55585a);
        const ax = horiz ? 0 : -Math.sign(ox) * 1.2, az = horiz ? -Math.sign(oz) * 1.2 : 0;
        P.glow.add(lx + ax, 7.9, lz + az, 0.9, 0.35, 0.9, 0xffffff);
        lamps.push({ x: lx + ax, z: lz + az });
        C.addCentered(lx, lz, 0.3, 0.3);
      }
    }
  }

  // ---------------- Périphérie : concessions éparses et brousse ----------------
  const inGrid = (x, z, m) => (x > LEFT.x0 - m && x < LEFT.x1 + m && z > LEFT.z0 - m && z < LEFT.z1 + m)
    || (x > RIGHT.x0 - m && x < RIGHT.x1 + m && z > RIGHT.z0 - m && z < RIGHT.z1 + m);
  for (let k = 0; k < 900; k++) {
    const x = R(-1500, 1500), z = R(-1500, 1500);
    if (inGrid(x, z, 12) || Math.abs(z - riverCenter(x)) < RIVER_HALF + 22) continue;
    const near = Math.abs(x) < WORLD.x1 && Math.abs(z) < WORLD.z1;
    if (near && rnd() < 0.35) {
      compound(x - 10, z - 10, 20, 20, P.banco, pick(BANCO), pick(['N', 'S', 'E', 'W']));
      house(x, z + 4, 9, 6, 'N', false);
    } else tree(x, z, rnd() < 0.7 ? 'acacia' : (rnd() < 0.5 ? 'baobab' : 'neem'), R(0.8, 1.2));
  }

  // limites du monde
  C.add(WORLD.x0 - 50, WORLD.z0 - 50, WORLD.x0, WORLD.z1 + 50);
  C.add(WORLD.x1, WORLD.z0 - 50, WORLD.x1 + 50, WORLD.z1 + 50);
  C.add(WORLD.x0 - 50, WORLD.z0 - 50, WORLD.x1 + 50, WORLD.z0);
  C.add(WORLD.x0 - 50, WORLD.z1, WORLD.x1 + 50, WORLD.z1 + 50);

  // stationnement le long des rues de quartier
  for (const s of segments) {
    if (s.bridge || rnd() > 0.07) continue;
    const horiz = s.a.z === s.b.z, k = R(0.3, 0.7);
    const x = s.a.x + (s.b.x - s.a.x) * k, z = s.a.z + (s.b.z - s.a.z) * k;
    const off = HALF - 1.4;
    parking.push({ x: horiz ? x : x + off, z: horiz ? z + off : z, h: horiz ? Math.PI / 2 : 0, type: pick(['berline', 'berline', 'taxi', 'moto', 'moto', 'pickup', 'talladje']) });
  }

  for (const b of Object.values(P)) b.build(scene);

  // pirogues sur le fleuve (animées dans la boucle)
  const pirogueGeo = new THREE.SphereGeometry(0.5, 16, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  pirogueGeo.scale(1.4, 0.9, 9);
  const pirogues = new THREE.InstancedMesh(pirogueGeo, M.paint, 14);
  const pir = [];
  for (let i = 0; i < 14; i++) {
    pir.push({ x: R(-750, 750), off: R(-40, 40), v: R(-2.5, 2.5) });
    pirogues.setColorAt(i, new THREE.Color(pick([0x7a4a2a, 0x2f6d9e, 0xc8a02a, 0x3a8a4a, 0x9c2f2a])));
  }
  pirogues.castShadow = true; pirogues.frustumCulled = false; scene.add(pirogues);
  const tmpO = new THREE.Object3D();
  const animate = (t, dt) => {
    for (let i = 0; i < pir.length; i++) {
      const p = pir[i];
      p.x += p.v * dt;
      if (p.x > 800) p.x = -800; if (p.x < -800) p.x = 800;
      for (const b of BRIDGES) if (Math.abs(p.x - b.x) < 6 && Math.abs(p.v) < 0.3) p.v = 1;
      tmpO.position.set(p.x, WATER_Y + 0.05 + Math.sin(t * 1.3 + i) * 0.06, riverCenter(p.x) + p.off);
      tmpO.rotation.set(Math.sin(t + i) * 0.03, Math.PI / 2, 0);
      tmpO.updateMatrix();
      pirogues.setMatrixAt(i, tmpO.matrix);
    }
    pirogues.instanceMatrix.needsUpdate = true;
  };

  return {
    col: C, nodes: [...nodeMap.values()], nodeMap, segments, cells, landmarks, labels, parking, lamps, animate,
    spawn: { x: -92, z: 150, h: Math.PI },
  };
}
