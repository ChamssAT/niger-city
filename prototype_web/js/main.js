// NIGER CITY — boucle principale : rendu (ciel physique, ombres, bloom), joueur, caméra, état de jeu.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createMaterials, loadingManager } from './materials.js';
import { buildWorld, groundY, isWater, zoneName, onBridge, riverCenter } from './world.js';
import { Vehicle, VMAT, randomPaint } from './vehicles.js';
import { Crowd } from './humans.js';
import { Traffic } from './traffic.js';
import { Peds } from './peds.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { GameAudio } from './audio.js';
import { clamp, angleDiff, dist2, lerp, formatCFA } from './util.js';

const QUALITY = {
  basse: { pr: 0.75, shadow: 0, aa: false, bloom: false, traffic: 14, peds: 35, far: 900, fog: 0.0018 },
  moyenne: { pr: 1, shadow: 1024, aa: false, bloom: true, traffic: 26, peds: 70, far: 1600, fog: 0.0011 },
  haute: { pr: Math.min(devicePixelRatio, 1.5), shadow: 2048, aa: true, bloom: true, traffic: 38, peds: 110, far: 2400, fog: 0.0009 },
  ultra: { pr: Math.min(devicePixelRatio, 2), shadow: 4096, aa: true, bloom: true, traffic: 50, peds: 150, far: 3000, fog: 0.0008 },
};
const SAVE_KEY = 'nigercity_save_v1';
const $ = (id) => document.getElementById(id);

function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s) return { money: 5000, discovered: [], crosses: [], route: 0, ...s }; } catch { /* stockage indisponible */ }
  return { money: 5000, discovered: [], crosses: [], route: 0 };
}

export function startGame(qName) {
  const Q = QUALITY[qName] || QUALITY.moyenne;
  const canvas = $('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: Q.aa, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Q.pr);
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.75;
  renderer.shadowMap.enabled = !!Q.shadow;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xd8c4a2, Q.fog);
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, Q.far);

  // ---- ciel physique + éclairage d'environnement ----
  const sky = new Sky(); sky.scale.setScalar(4500); scene.add(sky);
  const su = sky.material.uniforms;
  su.turbidity.value = 4; su.rayleigh.value = 2.2; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.8;
  const envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(sky.geometry, sky.material));
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;
  const refreshEnv = () => { const old = envRT; envRT = pmrem.fromScene(envScene, 0, 0.1, 5000); scene.environment = envRT.texture; old?.dispose(); };

  const sun = new THREE.DirectionalLight(0xfff0d8, 3);
  sun.castShadow = !!Q.shadow;
  if (Q.shadow) {
    sun.shadow.mapSize.set(Q.shadow, Q.shadow);
    const s = Q.shadow >= 2048 ? 110 : 80;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 10, far: 600 });
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
    sun.shadow.camera.updateProjectionMatrix();
  }
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xbfd4e8, 0xb08a5a, 0.6); scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x8fa8ff, 0); scene.add(moon);
  const headlight = new THREE.SpotLight(0xfff0d0, 0, 70, 0.55, 0.5, 1.2); scene.add(headlight, headlight.target);

  // étoiles
  const starGeo = new THREE.BufferGeometry(), sp = [];
  for (let i = 0; i < 1500; i++) { const v = new THREE.Vector3().randomDirection(); v.y = Math.abs(v.y); v.multiplyScalar(4000); sp.push(v.x, v.y, v.z); }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const stars = new THREE.Points(starGeo, starMat); scene.add(stars);

  // ---- post-traitement ----
  let composer = null, bloom = null;
  if (Q.bloom) {
    composer = new EffectComposer(renderer);
    composer.setPixelRatio(Q.pr);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.25, 0.5, 0.92);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  // ---- monde ----
  const M = createMaterials();
  const world = buildWorld(scene, M);
  // l'éclairage du ciel (IBL) reste discret pour laisser le soleil dessiner des ombres nettes
  for (const m of Object.values(M)) if (m.isMeshStandardMaterial) m.envMapIntensity = 0.12;
  M.water.envMapIntensity = 0.35; M.dome.envMapIntensity = 0.3;
  VMAT.paint.envMapIntensity = 0.5; VMAT.glass.envMapIntensity = 0.6; VMAT.chrome.envMapIntensity = 0.6;
  renderer.info.autoReset = false;
  const save = loadSave();
  const input = new Input(canvas);
  const audio = new GameAudio();
  const crowd = new Crowd(scene, Q.peds + 40);

  const g = {
    scene, world, input, audio, crowd, save, vehicles: [], money: save.money, wanted: 0, wantedT: 0, heat: 0,
    discovered: new Set(save.discovered), hour: 16.4, camYaw: world.spawn.h, zone: '', perf: '', hornAt: null,
    persist() {
      save.money = Math.round(g.money); save.discovered = [...g.discovered];
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* navigation privée */ }
    },
    removeVehicle(v) {
      const i = g.vehicles.indexOf(v); if (i >= 0) g.vehicles.splice(i, 1);
      v.dispose(scene);
    },
  };
  g.hud = new HUD(world);
  g.debug = { renderer, sun, scene, camera, M };
  g.traffic = new Traffic(scene, world, g); g.traffic.target = Q.traffic;
  g.peds = new Peds(crowd, world, g, Q.peds);

  // joueur
  const player = {
    pos: new THREE.Vector3(world.spawn.x, 0, world.spawn.z), heading: world.spawn.h, vy: 0, speed: 0,
    vehicle: null, h: crowd.alloc({ female: false, skin: 0x4a2c1a, cloth: 0x1f3f8a, top: 0x1f3f8a, pants: 0xe8e2d6, hat: 0xffffff, scale: 1 }),
  };
  g.player = player;
  g.missions = new Missions(scene, world, g);

  // véhicules garés
  for (const p of world.parking) {
    const v = new Vehicle(p.type, randomPaint(), scene); v.place(p.x, p.z, p.h); v.parked = true; g.vehicles.push(v);
  }
  { // moto et taxi de départ près du musée
    const m = new Vehicle('moto', 0xc81e1e, scene); m.place(-86.5, 140, Math.PI); g.vehicles.push(m);
    const t = new Vehicle('taxi', 0, scene); t.place(-85, 128, Math.PI); g.vehicles.push(t);
  }

  // ---- entrer / sortir d'un véhicule ----
  function tryEnter() {
    let best = null, bd = 1e9;
    for (const v of g.vehicles) {
      if (v.sinking) continue;
      const d = Math.sqrt(dist2(v.pos.x, v.pos.z, player.pos.x, player.pos.z)) - v.spec.len / 2;
      if (d < 2.5 && d < bd) { bd = d; best = v; }
    }
    if (!best) return;
    if (best.ai) {
      g.traffic.remove(best);
      g.peds.spawnFleeing(best.pos.x - Math.cos(best.heading) * 2, best.pos.z + Math.sin(best.heading) * 2);
      if (best.isPolice) addWanted(2, 'Vol d\'un véhicule de police !');
      else if (policeNear(70)) addWanted(1, 'Vol de véhicule sous les yeux de la police');
      else g.hud.help('Véhicule volé… le conducteur s\'enfuit.', 2.5);
    } else if (best.isPolice && !best.stolen) addWanted(2, 'Vol d\'un véhicule de police !');
    best.stolen = true; best.parked = false; best.driver = 'player';
    player.vehicle = best;
    player.h.visible = best.type === 'moto';
    g.hud.lastZone = '';
    if (best.type === 'taxi') g.hud.help('Taxi : appuie sur <b>T</b> pour prendre des clients.', 5);
  }
  function exitVehicle() {
    const v = player.vehicle; if (!v) return;
    if (Math.abs(v.speed) > 9) { g.hud.help('Ralentis avant de descendre !', 1.5); return; }
    v.driver = null; player.vehicle = null;
    const side = v.type === 'moto' ? 0.9 : v.spec.wid / 2 + 0.7;
    player.pos.set(v.pos.x + Math.cos(v.heading) * side, v.pos.y, v.pos.z - Math.sin(v.heading) * side);
    player.heading = v.heading; player.h.visible = true; player.h.pose = 'walk';
    world.col.resolveCircle(player.pos, 0.4);
    g.hud.lastZone = '';
  }

  // ---- police ----
  function policeNear(r) { return g.vehicles.some((v) => v.isPolice && !v.stolen && dist2(v.pos.x, v.pos.z, player.pos.x, player.pos.z) < r * r); }
  function addWanted(n, why) {
    const before = g.wanted;
    g.wanted = Math.min(5, g.wanted + n); g.wantedT = 0;
    if (g.wanted > before) { g.hud.help(`<b style="color:#ff5050">Recherché !</b> ${why}`, 3); g.traffic.dispatchPolice(Math.min(4, g.wanted)); }
  }
  let bustT = 0;
  function busted() {
    const fine = Math.min(g.money, 2000 + g.wanted * 3000);
    g.money -= fine; g.hud.bigText('ARRÊTÉ', '#5aa0ff', 4);
    g.hud.subtitle(`La Police Nationale t'a arrêté. Amende : <b>${formatCFA(fine)}</b>`, 6);
    respawnAt('Commissariat Central');
  }
  function hospital() {
    const fee = Math.min(g.money, 3000);
    g.money -= fee; g.hud.bigText('HOSPITALISÉ', '#ff4040', 4);
    g.hud.subtitle(`Renversé par une voiture… Frais d'hôpital : <b>${formatCFA(fee)}</b>`, 6);
    respawnAt('Hôpital National');
  }
  function respawnAt(name) {
    const L = world.landmarks.find((l) => l.name === name);
    if (player.vehicle) { player.vehicle.driver = null; player.vehicle = null; }
    if (g.missions.active) g.missions.end(false, 'Mission interrompue.');
    player.pos.set(L.x, 0, L.z + 36.5); player.heading = 0; player.h.visible = true; player.h.pose = 'walk';
    g.wanted = 0; g.traffic.calmPolice(); g.persist();
  }

  // ---- caméra ----
  let camDist = 6, camPitch = 0.28, mouseT = 9, camFar = false, shake = 0;
  const camPos = new THREE.Vector3(player.pos.x, 6, player.pos.z + 8), look = new THREE.Vector3();

  // ---- boucle ----
  const clock = new THREE.Clock();
  let t = 0, envT = 99, fpsAcc = 0, fpsN = 0, prT = 0, paused = false, curPR = Q.pr, slowT = 0;
  const pauseEl = $('pause');
  g.togglePause = (v = !paused) => { paused = v; pauseEl.hidden = !paused; if (paused) document.exitPointerLock?.(); };

  function updatePlayer(dt) {
    const P = player, ax = input.axes();
    if (input.hit('KeyE', 'KeyF')) { P.vehicle ? exitVehicle() : tryEnter(); }
    if (input.hit('KeyH') || (P.vehicle && input.hit('KeyG'))) { audio.horn(P.pos, 1); g.hornAt = { x: P.pos.x, z: P.pos.z }; setTimeout(() => (g.hornAt = null), 600); }
    const v = P.vehicle;
    if (v) {
      const hit = v.update(dt, { throttle: ax.y, steer: ax.x, handbrake: input.down('Space') }, world.col);
      if (hit) { shake = Math.min(1, hit.impact / 15); audio.crash(hit.impact); }
      P.pos.copy(v.pos);
      if (v.type === 'moto') Object.assign(P.h, { x: v.pos.x - Math.sin(v.heading) * 0.2, y: v.pos.y + 0.2, z: v.pos.z - Math.cos(v.heading) * 0.2, h: v.heading, pose: 'ride', speed: 0 });
      if (v.sinking > 0 && !v.splashed) { v.splashed = true; audio.splash(); g.hud.bigText('PLOUF !', '#5ad0ff', 2.5); g.hud.subtitle('Le fleuve Niger a avalé ton véhicule… Tu nages jusqu\'à la berge.', 4); }
      if (v.sinking > 2.2) {
        v.driver = null; P.vehicle = null; P.h.visible = true; P.h.pose = 'walk';
        const rc = riverCenter(P.pos.x), side = P.pos.z < rc ? -1 : 1;
        P.pos.z = rc + side * 70;
        if (g.missions.active) g.missions.end(false, 'Véhicule perdu dans le fleuve.');
      }
      audio.engine(true, v.speed, v.spec.max, v.type === 'moto');
      // phares la nuit
      headlight.position.set(v.pos.x + v.fx * 1.5, v.pos.y + 1, v.pos.z + v.fz * 1.5);
      headlight.target.position.set(v.pos.x + v.fx * 20, 0, v.pos.z + v.fz * 20);
    } else {
      audio.engine(false, 0, 1, false);
      const run = input.down('ShiftLeft', 'ShiftRight');
      const f = { x: Math.sin(g.camYaw), z: Math.cos(g.camYaw) }, r = { x: -f.z, z: f.x };
      let mx = f.x * ax.y - r.x * ax.x, mz = f.z * ax.y - r.z * ax.x;
      const l = Math.hypot(mx, mz);
      const sp = l > 0.01 ? (run ? 7 : 3.2) : 0;
      if (l > 0.01) { mx /= l; mz /= l; P.heading += angleDiff(P.heading, Math.atan2(mx, mz)) * Math.min(1, dt * 12); }
      P.speed = lerp(P.speed, sp, Math.min(1, dt * 10));
      const ox = P.pos.x, oz = P.pos.z;
      P.pos.x += mx * P.speed * dt; P.pos.z += mz * P.speed * dt;
      world.col.resolveCircle(P.pos, 0.4);
      if (isWater(P.pos.x, P.pos.z)) { P.pos.x = ox; P.pos.z = oz; g.hud.help('Le courant du fleuve est trop fort pour nager ici.', 1.5); }
      for (const o of g.vehicles) { // ne pas traverser les véhicules
        const dx = P.pos.x - o.pos.x, dz = P.pos.z - o.pos.z, rr = o.spec.wid / 2 + 0.5;
        const along = dx * o.fx + dz * o.fz, side = dx * -o.fz + dz * o.fx;
        if (Math.abs(along) < o.spec.len / 2 + 0.3 && Math.abs(side) < rr) {
          const push = rr - Math.abs(side); P.pos.x += -o.fz * Math.sign(side) * push; P.pos.z += o.fx * Math.sign(side) * push;
          if (o.ai && Math.abs(o.speed) > 7) { hospital(); return; }
        }
      }
      // saut
      const gy = groundY(P.pos.x, P.pos.z);
      if (input.hit('Space') && P.pos.y <= gy + 0.01) P.vy = 4.5;
      P.vy -= 12 * dt; P.pos.y = Math.max(gy, P.pos.y + P.vy * dt); if (P.pos.y <= gy) P.vy = 0;
      Object.assign(P.h, { x: P.pos.x, y: P.pos.y, z: P.pos.z, h: P.heading, speed: P.speed, pose: P.pos.y > gy + 0.05 ? 'jump' : 'walk' });
    }
  }

  // collisions véhicule/véhicule et véhicule/piéton
  function contacts() {
    const V = g.vehicles;
    for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) {
      const a = V[i], b = V[j];
      if (a.parked && b.parked) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d2 = dx * dx + dz * dz, R = (a.spec.len + b.spec.len) * 0.36;
      if (d2 > R * R || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, pen = R - d;
      const ka = a.parked ? 0.25 : 0.5, kb = b.parked ? 0.25 : 0.5;
      a.pos.x -= nx * pen * ka; a.pos.z -= nz * pen * ka; b.pos.x += nx * pen * kb; b.pos.z += nz * pen * kb;
      const rel = (a.vel.x - b.vel.x) * nx + (a.vel.y - b.vel.y) * nz;
      if (rel > 0) {
        a.vel.x -= nx * rel * 0.6; a.vel.y -= nz * rel * 0.6; b.vel.x += nx * rel * 0.6; b.vel.y += nz * rel * 0.6;
        if (a === player.vehicle || b === player.vehicle) {
          if (rel > 4) { audio.crash(rel); shake = Math.min(1, rel / 12); }
          const other = a === player.vehicle ? b : a;
          if (rel > 6 && other.isPolice && !other.stolen) addWanted(1, 'Agression d\'un véhicule de police');
          if (rel > 8) other.health -= rel;
        }
      }
      if (a.parked) a.parked = Math.hypot(a.vel.x, a.vel.y) < 0.5; if (b.parked) b.parked = Math.hypot(b.vel.x, b.vel.y) < 0.5;
      a.sync(0); b.sync(0);
    }
    const pv = player.vehicle;
    if (pv && Math.abs(pv.speed) > 4) for (const p of g.peds.list) {
      const dx = p.h.x - pv.pos.x, dz = p.h.z - pv.pos.z;
      const along = dx * pv.fx + dz * pv.fz, side = dx * -pv.fz + dz * pv.fx;
      if (Math.abs(along) < pv.spec.len / 2 + 0.3 && Math.abs(side) < pv.spec.wid / 2 + 0.3 && g.peds.knock(p, pv.vel.x, pv.vel.y)) {
        audio.crash(6); addWanted(policeNear(120) ? 2 : 1, 'Piéton renversé');
      }
    }
  }

  // véhicules garés ou abandonnés : inertie + collisions
  function idleVehicles(dt) {
    for (const v of g.vehicles) if (!v.ai && v !== player.vehicle && (!v.parked || v.sinking)) v.update(dt, { throttle: 0, steer: 0, handbrake: true }, world.col);
  }

  function updateWanted(dt) {
    g.wantedFlash = Math.floor(t * 4) % 2 === 0;
    const flashOn = g.wanted > 0 && Math.floor(t * 6) % 2 === 0;
    VMAT.sirenR.color.setRGB(flashOn ? 6 : 0.25, 0, 0); VMAT.sirenB.color.setRGB(0, 0, !flashOn && g.wanted ? 6 : 0.25);
    if (!g.wanted) { audio.siren(0); return; }
    g.traffic.dispatchPolice(Math.min(4, g.wanted));
    let nearest = 1e9;
    for (const c of g.traffic.cars) if (c.ai.mode === 'chase') nearest = Math.min(nearest, Math.sqrt(dist2(c.pos.x, c.pos.z, player.pos.x, player.pos.z)));
    audio.siren(Math.max(0, 1 - nearest / 150));
    if (nearest > 130) {
      g.wantedT += dt;
      if (g.wantedT > 10) { g.wanted--; g.wantedT = 0; if (!g.wanted) { g.traffic.calmPolice(); g.hud.help('La police a perdu ta trace.', 3); } }
    } else g.wantedT = 0;
    const slowPlayer = !player.vehicle || Math.abs(player.vehicle.speed) < 2;
    if (nearest < 7 && slowPlayer) { bustT += dt; if (bustT > 1.8) { bustT = 0; busted(); } } else bustT = Math.max(0, bustT - dt);
  }

  function updateSky(dt) {
    g.hour = (g.hour + dt / 40) % 24; // 1 h de jeu = 40 s
    const a = (g.hour - 6) / 12 * Math.PI, el = Math.sin(a);
    const dir = new THREE.Vector3(Math.cos(a), Math.max(-0.4, el) * 1.1, 0.38).normalize();
    su.sunPosition.value.copy(dir);
    const day = clamp((el + 0.05) / 0.25, 0, 1), dusk = clamp(1 - Math.abs(el) / 0.3, 0, 1) * (el > -0.1 ? 1 : 0);
    sun.intensity = 3.4 * day; sun.color.setHSL(0.09, 0.6 + dusk * 0.3, 0.95 - dusk * 0.25);
    hemi.intensity = 0.1 + 0.55 * day;
    moon.intensity = (1 - day) * 0.35; moon.position.set(player.pos.x - dir.x * 100, 200, player.pos.z - 60);
    moon.target.position.copy(player.pos);
    renderer.toneMappingExposure = 0.62 + day * 0.18 + (1 - day) * 0.25;
    starMat.opacity = clamp(1 - day * 1.5, 0, 1); stars.position.copy(camera.position);
    const fogDay = new THREE.Color(0xd6c9b0), fogDusk = new THREE.Color(0xc98a5a), fogNight = new THREE.Color(0x10141f);
    scene.fog.color.copy(fogNight).lerp(fogDay, day).lerp(fogDusk, dusk * 0.6);
    // focus des ombres sur le joueur (ancrage au mètre pour limiter le scintillement)
    const cx = Math.round(player.pos.x), cz = Math.round(player.pos.z);
    sun.target.position.set(cx, 0, cz); sun.position.set(cx + dir.x * 300, Math.max(30, dir.y * 300), cz + dir.z * 300);
    const night = 1 - day;
    M.glow.color.setRGB(0.3 + night * 5, 0.28 + night * 3.3, 0.25 + night * 1.6);
    M.imm.emissiveIntensity = night * 0.9;
    VMAT.head.emissiveIntensity = 0.2 + night * 4; VMAT.tail.emissiveIntensity = 0.25 + night * 2.5;
    headlight.intensity = player.vehicle && night > 0.3 ? 60 * night : 0;
    if (bloom) bloom.strength = 0.18 + night * 0.55;
    audio.ambience(0.06 + day * 0.08);
    envT += dt;
    if (envT > 6) { envT = 0; refreshEnv(); }
  }

  function updateCamera(dt) {
    const v = player.vehicle;
    if (input.hit('KeyC')) camFar = !camFar;
    if (input.mouseDX || input.mouseDY) { g.camYaw -= input.mouseDX * 0.0028; camPitch = clamp(camPitch + input.mouseDY * 0.002, -0.15, 1.1); mouseT = 0; }
    mouseT += dt;
    const targetH = v ? v.heading : player.heading;
    if (v && mouseT > 1.5 && Math.abs(v.speed) > 1) g.camYaw += angleDiff(g.camYaw, v.speed < -1 ? targetH + Math.PI : targetH) * Math.min(1, dt * 2.5);
    if (v && mouseT > 1.5) camPitch = lerp(camPitch, 0.22, dt);
    const base = v ? (v.type === 'camion' ? 15 : v.type === 'moto' ? 6 : 8.5) : 4.6;
    camDist = lerp(camDist, base * (camFar ? 1.7 : 1) + (v ? Math.abs(v.speed) * 0.06 : 0), Math.min(1, dt * 3));
    const tgtY = (v ? v.pos.y + (v.type === 'camion' ? 2.6 : 1.4) : player.pos.y + 1.6);
    look.set(player.pos.x, tgtY, player.pos.z);
    const fx = Math.sin(g.camYaw), fz = Math.cos(g.camYaw);
    const want = new THREE.Vector3(look.x - fx * camDist * Math.cos(camPitch), tgtY + 0.6 + camDist * Math.sin(camPitch), look.z - fz * camDist * Math.cos(camPitch));
    want.y = Math.max(want.y, groundY(want.x, want.z) + 0.6);
    camPos.lerp(want, Math.min(1, dt * (v ? 9 : 14)));
    camera.position.copy(camPos);
    if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake * 0.6; camera.position.y += (Math.random() - 0.5) * shake * 0.6; shake = Math.max(0, shake - dt * 3); }
    camera.lookAt(look);
    camera.fov = lerp(camera.fov, 62 + (v ? Math.min(14, Math.abs(v.speed) * 0.35) : 0), dt * 2); camera.updateProjectionMatrix();
    audio.listener = player.pos;
    for (const s of world.labels) { const d2 = dist2(s.position.x, s.position.z, player.pos.x, player.pos.z); s.visible = d2 < 260 * 260 && d2 > 15 * 15; }
  }

  let lastNow = performance.now();
  function frame() {
    requestAnimationFrame(frame);
    const now = performance.now(), realDt = (now - lastNow) / 1000; lastNow = now;
    const dt = Math.min(clock.getDelta(), 1 / 20);
    renderer.info.reset();
    if (input.hit('Escape', 'KeyP')) g.togglePause();
    if (input.hit('KeyM')) g.hud.toggleBig();
    if (input.hit('KeyN')) { audio.setMuted(!audio.muted); g.hud.help(audio.muted ? 'Son coupé' : 'Son activé', 1.5); }
    if (input.hit('KeyI')) $('perf').hidden = !$('perf').hidden;
    if (paused) { input.endFrame(); return; }
    t += dt;
    updatePlayer(dt);
    g.traffic.update(dt);
    idleVehicles(dt);
    contacts();
    g.peds.update(dt);
    crowd.update(dt);
    updateWanted(dt);
    g.missions.update(dt, t);
    world.animate(t, dt);
    M.water.normalMap.offset.set(t * 0.012, t * 0.02);
    updateSky(dt);
    updateCamera(dt);
    g.zone = zoneName(player.pos.x, player.pos.z);
    g.hud.update(dt, g);
    if (composer) composer.render(); else renderer.render(scene, camera);
    input.endFrame();

    // mesure de performance + résolution dynamique
    fpsAcc += realDt; fpsN++;
    if (fpsAcc > 0.5) {
      const fps = fpsN / fpsAcc, info = renderer.info.render;
      g.perf = `${fps.toFixed(0)} FPS · ${(1000 / fps).toFixed(1)} ms · ${info.calls} appels · ${(info.triangles / 1000).toFixed(0)}k tri · rés. ×${curPR.toFixed(2)} · ${g.vehicles.length} véh. · ${g.peds.list.length} piétons`;
      slowT = fps < 28 ? slowT + fpsAcc : 0;
      if (slowT > 2 && curPR > 0.6) { curPR = Math.max(0.6, curPR - 0.1); renderer.setPixelRatio(curPR); composer?.setPixelRatio(curPR); onResize(); slowT = 0; }
      fpsAcc = 0; fpsN = 0;
    }
  }

  function onResize() {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight); composer?.setSize(innerWidth, innerHeight);
  }
  addEventListener('resize', onResize);
  addEventListener('beforeunload', () => g.persist());
  setInterval(() => g.persist(), 15000);

  return new Promise((resolve) => {
    const go = async () => {
      refreshEnv();
      updateSky(0); updateCamera(0);
      try { await renderer.compileAsync(scene, camera); } catch { /* compilation au premier rendu */ }
      player.pos.y = groundY(player.pos.x, player.pos.z);
      $('loading').hidden = true; $('hud').hidden = false;
      g.hud.help('<b>ZQSD / WASD</b> : se déplacer · <b>E</b> : monter / descendre · <b>Maj</b> : courir<br><b>Espace</b> : sauter / frein à main · <b>H</b> : klaxon · <b>M</b> : carte · <b>C</b> : caméra · <b>P</b> : pause', 10);
      g.hud.subtitle('Bienvenue à <b>Niamey</b> ! Une moto et un taxi t\'attendent juste à côté. Les marqueurs <span style="color:#ffc020">jaunes</span> et <span style="color:#40a0ff">bleus</span> sur la carte sont des missions.', 9);
      frame();
      resolve(g);
    };
    loadingManager.onProgress = (_, a, b) => { $('loadbar').style.width = (a / b * 100).toFixed(0) + '%'; };
    if (loadingManager.itemsLoaded >= loadingManager.itemsTotal && loadingManager.itemsTotal > 0) go();
    else loadingManager.onLoad = go;
    loadingManager.onError = (u) => console.warn('Texture manquante :', u);
    addEventListener('pointerdown', () => audio.start(), { once: true });
    addEventListener('keydown', () => audio.start(), { once: true });
  });
}
