// Foule instanciée : chaque partie du corps (jambes, boubou, bras, tête, coiffe) est un InstancedMesh,
// animé par matrices. Le joueur est l'instance 0.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const SKINS = [0x3b2416, 0x4a2c1a, 0x5a3520, 0x6b4128, 0x7a4c2e, 0x2e1c12];
export const CLOTHS = [0xf4f4f0, 0x1f3f8a, 0x2a6fb0, 0x6a2a8a, 0x2f8a4e, 0xd8b02a, 0xb83a2a, 0x3a3a3a, 0xe8dcc0, 0x1a7a7a, 0x9a5a2a, 0xe05206];
export const PAGNES = [0xe05206, 0xc81e5a, 0x2a6fb0, 0x0db02b, 0xf0b020, 0x7a2aa0, 0xd02020];

const PART = ['legL', 'legR', 'body', 'armL', 'armR', 'head', 'hat'];

function geometries() {
  const leg = mergeGeometries([
    new THREE.CapsuleGeometry(0.075, 0.72, 4, 8).translate(0, -0.44, 0),
    new THREE.BoxGeometry(0.11, 0.05, 0.26).translate(0, -0.88, 0.05),
  ]);
  const body = mergeGeometries([
    new THREE.CylinderGeometry(0.19, 0.27, 1.0, 14, 1, true).translate(0, 0.98, 0),   // boubou / pagne
    new THREE.CylinderGeometry(0.17, 0.19, 0.12, 14).translate(0, 1.52, 0),             // épaules
    new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.2, 0.5, 0.85).translate(0, 1.56, 0),
    new THREE.CylinderGeometry(0.268, 0.27, 0.02, 14).translate(0, 0.48, 0),           // ourlet
  ]);
  const arm = new THREE.CapsuleGeometry(0.058, 0.55, 4, 8).translate(0, -0.33, 0);
  const head = mergeGeometries([
    new THREE.SphereGeometry(0.105, 16, 12).scale(0.92, 1.08, 1).translate(0, 1.71, 0.005),
    new THREE.CylinderGeometry(0.05, 0.055, 0.12, 8).translate(0, 1.6, 0),
    new THREE.SphereGeometry(0.022, 6, 4).translate(0, 1.7, 0.1),                          // nez
  ]);
  const hat = new THREE.CylinderGeometry(0.1, 0.108, 0.1, 14).translate(0, 1.8, 0);
  return { legL: leg, legR: leg, body, armL: arm, armR: arm, head, hat };
}

const _m = new THREE.Matrix4(), _b = new THREE.Matrix4(), _p = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class Crowd {
  constructor(scene, cap) {
    this.cap = cap; this.h = []; this.free = []; this.used = 0;
    const g = geometries();
    const cloth = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, side: THREE.DoubleSide, envMapIntensity: 0.12 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, envMapIntensity: 0.12 });
    this.mesh = {};
    for (const k of PART) {
      const mat = k === 'head' ? skin : cloth;
      const im = new THREE.InstancedMesh(g[k], mat, cap);
      im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < cap; i++) { im.setMatrixAt(i, ZERO); im.setColorAt(i, new THREE.Color(0xffffff)); }
      im.count = 0; scene.add(im); this.mesh[k] = im;
    }
    for (let i = cap - 1; i >= 0; i--) this.free.push(i);
  }

  alloc(look) {
    const i = this.free.pop();
    if (i === undefined) return null;
    for (const k of PART) this.mesh[k].count = Math.max(this.used, i + 1);
    this.used = Math.max(this.used, i + 1);
    const h = { i, x: 0, y: 0, z: 0, h: 0, phase: Math.random() * 6, speed: 0, pose: 'walk', fall: 0, visible: true, look };
    this.h[i] = h; this.applyLook(h);
    return h;
  }
  release(h) { this.h[h.i] = null; for (const k of PART) this.mesh[k].setMatrixAt(h.i, ZERO); this.free.push(h.i); }

  static randomLook(r = Math.random) {
    const p = (a) => a[(r() * a.length) | 0];
    const female = r() < 0.45, cloth = female ? p(PAGNES) : p(CLOTHS);
    return {
      female, skin: p(SKINS), cloth, top: female ? p(CLOTHS) : cloth, pants: female ? cloth : p([0x2a2a2a, 0xe8e2d6, 0x3a3a50, cloth]),
      hat: female ? p(PAGNES) : (r() < 0.6 ? p([0xffffff, 0xf0e8d0, 0x2a2a2a, 0x8a2a2a, 0x2a6fb0]) : null), scale: 0.93 + r() * 0.12,
    };
  }

  applyLook(h) {
    const L = h.look, c = new THREE.Color(), set = (k, col) => { this.mesh[k].setColorAt(h.i, c.set(col)); this.mesh[k].instanceColor.needsUpdate = true; };
    set('legL', L.pants); set('legR', L.pants); set('body', L.cloth); set('armL', L.top); set('armR', L.top); set('head', L.skin); set('hat', L.hat ?? L.skin);
  }

  update(dt) {
    for (let i = 0; i < this.used; i++) {
      const h = this.h[i];
      if (!h) continue;
      if (!h.visible) { for (const k of PART) this.mesh[k].setMatrixAt(i, ZERO); continue; }
      const L = h.look, s = L.scale;
      h.phase += dt * (h.speed * 2.1 + 0.001);
      const sw = Math.sin(h.phase), moving = Math.min(1, h.speed / 1.4);
      let legA = sw * 0.55 * moving, armA = -sw * 0.45 * moving, bob = Math.abs(Math.cos(h.phase)) * 0.04 * moving;
      let legX = 0, armX = 0, armSide = 0.07, lean = h.speed > 4 ? 0.18 : 0.03 * moving;
      if (h.pose === 'ride') { legA = -1.35; legX = 0.08; armA = -1.1; armX = 0; armSide = 0.02; bob = 0; lean = 0.15; }
      if (h.pose === 'sit') { legA = -1.5; armA = -0.3; bob = -0.45; lean = 0; }
      if (h.pose === 'wave') { armA = 0; armX = 2.8 + Math.sin(h.phase * 4) * 0.3; legA = 0; }
      if (h.pose === 'jump') { legA = 0.4; armA = -2.4; }
      _e.set(lean, h.h, 0, 'YXZ');
      if (h.pose === 'fall') _e.set(-Math.min(1, h.fall * 3) * Math.PI / 2, h.h, 0, 'YXZ');
      _q.setFromEuler(_e);
      _b.compose(_v.set(h.x, h.y + bob + (h.pose === 'fall' ? 0.15 : 0), h.z), _q, _s.set(s, s, s));
      const hip = 0.92;
      this.part('legL', i, 0.1 + legX * 0, hip, legA, 0, 0);
      this.part('legR', i, -0.1, hip, h.pose === 'ride' || h.pose === 'sit' ? legA : -legA, 0, 0);
      this.part('body', i, 0, 0, 0, 0, 0, true);
      this.part('armL', i, 0.25, 1.5, h.pose === 'wave' ? 0 : armA, 0, armSide + (h.pose === 'wave' ? armX : 0), false, true);
      this.part('armR', i, -0.25, 1.5, h.pose === 'ride' ? armA : -armA, 0, -armSide);
      this.part('head', i, 0, 0, 0, 0, 0, true);
      if (L.hat != null) {
        if (L.female) { // foulard : coiffe agrandie autour du sommet du crâne
          _p.makeTranslation(0, -1.8, 0);
          _m.makeScale(1.35, 1.7, 1.35); _p.premultiply(_m);
          _m.makeTranslation(0, 1.83, -0.01); _p.premultiply(_m);
          _m.multiplyMatrices(_b, _p);
        } else _m.copy(_b);
        this.mesh.hat.setMatrixAt(i, _m);
      } else this.mesh.hat.setMatrixAt(i, ZERO);
    }
    for (const k of PART) this.mesh[k].instanceMatrix.needsUpdate = true;
  }

  part(k, i, x, y, rx, ry, rz, identity = false) {
    if (identity) { this.mesh[k].setMatrixAt(i, _b); return; }
    _e.set(rx, ry, rz, 'XYZ'); _q.setFromEuler(_e);
    _p.compose(_v.set(x, y, 0), _q, _s.set(1, 1, 1));
    _m.multiplyMatrices(_b, _p);
    this.mesh[k].setMatrixAt(i, _m);
  }
}
