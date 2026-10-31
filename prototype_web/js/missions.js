// Missions : découvertes des lieux, livraisons, courses de taxi, course de kabou-kabou,
// et les 12 Croix d'Agadez cachées dans Niamey.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, dist2, formatCFA } from './util.js';
import { groundY, LANE } from './world.js';

const beamMat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false });
const beamGeo = new THREE.CylinderGeometry(2.2, 2.2, 36, 24, 1, true).translate(0, 18, 0);
const ringGeo = new THREE.TorusGeometry(2.4, 0.18, 8, 32).rotateX(Math.PI / 2);

class Marker {
  constructor(scene, color) {
    this.g = new THREE.Group();
    const m = beamMat(color);
    this.g.add(new THREE.Mesh(beamGeo, m), new THREE.Mesh(ringGeo, m));
    this.g.visible = false; scene.add(this.g);
    this.color = '#' + new THREE.Color(color).getHexString();
  }
  set(x, z) { this.x = x; this.z = z; this.g.position.set(x, groundY(x, z) + 0.1, z); this.g.visible = true; }
  hide() { this.g.visible = false; }
}

function agadezCross() {
  const m = new THREE.MeshStandardMaterial({ color: 0xe8e8ee, metalness: 1, roughness: 0.2, emissive: 0x554422, emissiveIntensity: 0.6 });
  const g = mergeGeometries([
    new THREE.TorusGeometry(0.34, 0.08, 8, 20).translate(0, 0.62, 0),
    new THREE.BoxGeometry(0.14, 0.7, 0.08).translate(0, 0, 0),
    new THREE.BoxGeometry(0.9, 0.14, 0.08).translate(0, 0.12, 0),
    new THREE.ConeGeometry(0.16, 0.36, 4).rotateZ(Math.PI).translate(0, -0.5, 0),
  ]);
  return new THREE.Mesh(g, m);
}

export class Missions {
  constructor(scene, world, game) {
    this.scene = scene; this.world = world; this.g = game; this.active = null;
    const lm = (n) => world.landmarks.find((l) => l.name === n);
    const front = (l) => ({ x: l.x, z: l.z + 34 });
    this.routes = [
      { from: 'Gare Routière', to: 'Grand Marché', cargo: 'des ballots de bazin et de wax', reward: 15000, time: 80 },
      { from: 'Petit Marché', to: 'Hôtel Gaweye', cargo: 'du poisson capitaine tout frais du fleuve', reward: 12000, time: 75 },
      { from: 'Rizières', to: 'Grand Marché', cargo: 'des sacs de riz de la rive droite', reward: 18000, time: 110 },
      { from: 'Grand Marché', to: 'Université Abdou Moumouni', cargo: 'des cartons de livres et de cahiers', reward: 16000, time: 100 },
      { from: 'Gare Routière', to: 'Commissariat Central', cargo: 'un colis oublié dans un talladjé', reward: 9000, time: 70 },
    ].map((r) => ({ ...r, a: front(lm(r.from)), b: front(lm(r.to)) }));
    this.startDeliver = new Marker(scene, 0xffc020);
    this.startRace = new Marker(scene, 0x40a0ff);
    this.goal = new Marker(scene, 0xffe040);
    const stade = lm('Stade Seyni Kountché');
    this.raceStart = { x: stade.x - 40 + LANE, z: stade.z + 20 };
    this.passenger = null;

    // Croix d'Agadez
    const r = mulberry32(777), nodes = world.nodes;
    this.crosses = [];
    const base = agadezCross();
    for (let i = 0; i < 12; i++) {
      let n;
      do n = nodes[(r() * nodes.length) | 0]; while (this.crosses.some((c) => dist2(c.x, c.z, n.x, n.z) < 150 * 150));
      const x = n.x + 10.4 * (r() < 0.5 ? 1 : -1), z = n.z + 10.4 * (r() < 0.5 ? 1 : -1);
      const m = base.clone(); m.position.set(x, groundY(x, z) + 1.3, z); scene.add(m);
      const got = game.save.crosses.includes(i);
      m.visible = !got;
      this.crosses.push({ i, x, z, m, got });
    }
    this.refreshStarts();
  }

  refreshStarts() {
    const r = this.routes[this.g.save.route % this.routes.length];
    this.startDeliver.set(r.a.x, r.a.z);
    this.startRace.set(this.raceStart.x, this.raceStart.z);
  }

  blips() {
    const out = [];
    if (!this.active) {
      out.push({ x: this.startDeliver.x, z: this.startDeliver.z, color: '#ffc020', r: 5 });
      out.push({ x: this.startRace.x, z: this.startRace.z, color: '#40a0ff', r: 5 });
    }
    if (this.goal.g.visible) out.push({ x: this.goal.x, z: this.goal.z, color: '#ffe040', r: 6 });
    return out;
  }

  near(m, r) { const p = this.g.player.pos; return dist2(p.x, p.z, m.x, m.z) < r * r; }
  slow() { const v = this.g.player.vehicle; return !v || Math.abs(v.speed) < 3; }

  begin(o) {
    this.active = o; this.startDeliver.hide(); this.startRace.hide();
    if (o.time) this.timeLeft = o.time;
  }
  end(ok, msg) {
    const g = this.g, a = this.active;
    this.active = null; this.goal.hide(); g.hud.objective('');
    if (ok) { g.money += a.reward; g.audio.chime(); g.hud.bigText('MISSION RÉUSSIE', '#ffd23a', 3); g.hud.subtitle(`${msg} <b>+${formatCFA(a.reward)}</b>`); }
    else { g.hud.bigText('MISSION ÉCHOUÉE', '#ff4040', 3); g.hud.subtitle(msg); }
    if (this.passenger) { this.g.crowd.release(this.passenger); this.passenger = null; }
    g.persist(); this.refreshStarts();
  }

  update(dt, t) {
    const g = this.g, P = g.player;
    // découverte des lieux
    for (const L of this.world.landmarks) {
      if (g.discovered.has(L.name)) continue;
      if (dist2(P.pos.x, P.pos.z, L.x, L.z) < L.r * L.r) {
        g.discovered.add(L.name); g.money += 2000; g.audio.chime();
        g.hud.toast(`📍 ${L.name}`, `${L.info}<br><b>+2 000 FCFA</b> · ${g.discovered.size}/${this.world.landmarks.length} lieux découverts`);
        g.persist();
      }
    }
    // croix d'Agadez
    for (const c of this.crosses) {
      if (c.got) continue;
      c.m.rotation.y = t * 2 + c.i; c.m.position.y = groundY(c.x, c.z) + 1.3 + Math.sin(t * 2 + c.i) * 0.15;
      if (dist2(P.pos.x, P.pos.z, c.x, c.z) < 6.25) {
        c.got = true; c.m.visible = false; g.save.crosses.push(c.i); g.audio.chime();
        const n = g.save.crosses.length;
        g.money += n === 12 ? 50000 : 1000;
        g.hud.toast('✦ Croix d\'Agadez', n === 12 ? 'Les 12 croix sont réunies ! Bonus <b>+50 000 FCFA</b>' : `Bijou touareg emblématique du Niger. <b>${n}/12</b> trouvées · +1 000 FCFA`);
        g.persist();
      }
    }
    for (const m of [this.startDeliver, this.startRace, this.goal]) if (m.g.visible) m.g.children[0].material.opacity = 0.25 + Math.sin(t * 4) * 0.08;

    const a = this.active;
    if (!a) {
      if (this.near(this.startDeliver, 4.5) && this.slow()) this.startDelivery();
      else if (this.near(this.startRace, 4.5) && this.slow()) {
        if (P.vehicle?.type === 'moto') this.startRaceMission();
        else g.hud.help('Course de kabou-kabou : viens ici <b>avec une moto</b>.', 2);
      }
      if (P.vehicle?.type === 'taxi' && g.input.hit('KeyT')) this.startTaxi();
      return;
    }
    if (a.time) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) return this.end(false, 'Temps écoulé…');
    }
    if (a.type === 'deliver') {
      g.hud.objective(`Livre ${a.route.cargo} : <b>${a.route.to}</b> · ⏱ ${Math.ceil(this.timeLeft)} s`);
      if (this.near(this.goal, 5) && this.slow()) { g.save.route++; this.end(true, `Livraison terminée à ${a.route.to}.`); }
    } else if (a.type === 'race') {
      g.hud.objective(`Course de kabou-kabou · point ${a.k + 1}/${a.cps.length} · ⏱ ${Math.ceil(this.timeLeft)} s`);
      if (P.vehicle?.type !== 'moto') return this.end(false, 'Tu as quitté ta moto.');
      if (this.near(this.goal, 7)) {
        g.audio.chime(); a.k++;
        if (a.k >= a.cps.length) return this.end(true, 'Tu connais les rues de Niamey comme ta poche !');
        this.goal.set(a.cps[a.k].x, a.cps[a.k].z);
      }
    } else if (a.type === 'taxi') {
      if (P.vehicle?.type !== 'taxi') return this.end(false, 'Tu as quitté le taxi : service terminé.');
      if (g.input.hit('KeyT')) return this.end(false, 'Service de taxi terminé.');
      if (a.stage === 0) {
        g.hud.objective('Taxi : récupère le client qui fait signe 🖐');
        if (this.near(this.goal, 7) && this.slow()) {
          this.passenger.visible = false;
          const far = this.world.landmarks.filter((l) => l.name !== 'Fleuve Niger' && dist2(l.x, l.z, P.pos.x, P.pos.z) > 250 * 250);
          a.dest = far[(Math.random() * far.length) | 0];
          const d = Math.sqrt(dist2(a.dest.x, a.dest.z, P.pos.x, P.pos.z));
          a.stage = 1; this.timeLeft = Math.round(d / 9 + 25); a.time = this.timeLeft; a.reward = Math.round((500 + d * 7) / 50) * 50;
          this.goal.set(a.dest.x, a.dest.z + 34);
          g.hud.subtitle(`« Bonjour ! Emmène-moi à <b>${a.dest.name}</b>, s'il te plaît. Fofo ! »`);
        }
      } else {
        g.hud.objective(`Taxi → <b>${a.dest.name}</b> · ${formatCFA(a.reward)} · ⏱ ${Math.ceil(this.timeLeft)} s`);
        if (this.near(this.goal, 7) && this.slow()) {
          const name = a.dest.name;
          this.end(true, `Client déposé à ${name}. « Merci, à la prochaine ! »`);
          setTimeout(() => { if (!this.active && P.vehicle?.type === 'taxi') this.startTaxi(); }, 2500);
        }
      }
    }
  }

  startDelivery() {
    const r = this.routes[this.g.save.route % this.routes.length];
    this.begin({ type: 'deliver', route: r, reward: r.reward, time: r.time });
    this.goal.set(r.b.x, r.b.z);
    this.g.hud.subtitle(`« Salam ! Il faut livrer ${r.cargo} à <b>${r.to}</b>, et vite ! »`);
    this.g.audio.chime();
  }

  startRaceMission() {
    const nodes = this.world.nodes, P = this.g.player.pos;
    let n = nodes.reduce((b, x) => (dist2(x.x, x.z, P.x, P.z) < dist2(b.x, b.z, P.x, P.z) ? x : b));
    const cps = [];
    let prev = null;
    while (cps.length < 8) {
      for (let s = 0; s < 3; s++) { const nb = n.nb.filter((x) => x !== prev); const nx = nb[(Math.random() * nb.length) | 0] || prev; prev = n; n = nx; }
      cps.push({ x: n.x, z: n.z });
    }
    let len = Math.sqrt(dist2(P.x, P.z, cps[0].x, cps[0].z));
    for (let i = 1; i < cps.length; i++) len += Math.sqrt(dist2(cps[i - 1].x, cps[i - 1].z, cps[i].x, cps[i].z));
    this.begin({ type: 'race', cps, k: 0, reward: 25000, time: Math.round(len / 13 + 20) });
    this.goal.set(cps[0].x, cps[0].z);
    this.g.hud.bigText('COURSE !', '#40a0ff', 2);
  }

  startTaxi() {
    const tr = this.g.traffic, P = this.g.player.pos;
    const e = tr.randomEdgeNear(P.x, P.z, 70, 230);
    if (!e) return;
    const [a, b] = e, dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz);
    const x = (a.x + b.x) / 2 + (-dz / l) * 9.6, z = (a.z + b.z) / 2 + (dx / l) * 9.6;
    this.begin({ type: 'taxi', stage: 0, reward: 0, time: 0 });
    this.passenger = this.g.crowd.alloc(this.g.crowd.constructor.randomLook());
    if (this.passenger) Object.assign(this.passenger, { x, z, y: groundY(x, z), pose: 'wave', speed: 0, h: Math.atan2(dz, -dx) });
    this.goal.set((a.x + b.x) / 2 + (-dz / l) * LANE, (a.z + b.z) / 2 + (dx / l) * LANE);
    this.g.hud.help('Service de taxi en cours. <b>T</b> pour arrêter.', 4);
  }
}
