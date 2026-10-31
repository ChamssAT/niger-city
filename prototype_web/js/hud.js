// Interface façon GTA : mini-carte orientée (bas gauche), argent et étoiles (haut droite),
// nom du quartier, aide contextuelle, sous-titres de mission, grande carte (touche M).
import { WORLD, riverCenter, RIVER_HALF, RW, BRIDGES, BRIDGE_Z0, BRIDGE_Z1 } from './world.js';
import { formatCFA } from './util.js';

const PX = 2; // mètres par pixel de la carte pré-rendue
const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(world) {
    this.world = world;
    this.map = this.renderMap(world);
    this.mini = $('minimap'); this.mctx = this.mini.getContext('2d');
    this.big = $('bigmap'); this.bctx = this.big.getContext('2d');
    this.zoneTimer = 0; this.lastZone = ''; this.helpTimer = 0; this.subTimer = 0; this.toastQ = []; this.toastT = 0;
  }

  w2m(x, z) { return [(x - WORLD.x0) / PX, (z - WORLD.z0) / PX]; }

  renderMap(world) {
    const W = (WORLD.x1 - WORLD.x0) / PX, H = (WORLD.z1 - WORLD.z0) / PX;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#c9a77a'; g.fillRect(0, 0, W, H);
    for (const cell of world.cells) {
      const [x0, z0] = this.w2m(cell.x0, cell.z0), [x1, z1] = this.w2m(cell.x1, cell.z1);
      g.fillStyle = cell.kind === 'landmark' ? '#a7b98a' : cell.kind === 'com' ? '#d8cfc0' : cell.kind === 'lot' ? '#cdb48a' : '#bf9a6e';
      g.fillRect(x0, z0, x1 - x0, z1 - z0);
    }
    g.fillStyle = '#4f86a8';
    g.beginPath();
    for (let x = WORLD.x0; x <= WORLD.x1; x += 10) { const [mx, mz] = this.w2m(x, riverCenter(x) - RIVER_HALF); x === WORLD.x0 ? g.moveTo(mx, mz) : g.lineTo(mx, mz); }
    for (let x = WORLD.x1; x >= WORLD.x0; x -= 10) { const [mx, mz] = this.w2m(x, riverCenter(x) + RIVER_HALF); g.lineTo(mx, mz); }
    g.fill();
    for (const s of world.segments) {
      const [ax, az] = this.w2m(s.a.x, s.a.z), [bx, bz] = this.w2m(s.b.x, s.b.z);
      g.strokeStyle = s.paved ? '#f4f1ea' : '#a86a48'; g.lineWidth = RW / PX * (s.paved ? 0.9 : 0.7);
      g.beginPath(); g.moveTo(ax, az); g.lineTo(bx, bz); g.stroke();
    }
    return c;
  }

  // ---- messages ----
  help(html, t = 5) { $('help').innerHTML = html; $('help').hidden = false; this.helpTimer = t; }
  subtitle(html, t = 6) { $('subtitle').innerHTML = html; $('subtitle').hidden = false; this.subTimer = t; }
  toast(title, text) { this.toastQ.push([title, text]); }
  big_(text, color, t = 3) { const b = $('bigtext'); b.textContent = text; b.style.color = color; b.hidden = false; clearTimeout(this._bt); this._bt = setTimeout(() => (b.hidden = true), t * 1000); }
  bigText(text, color, t) { this.big_(text, color, t); }
  objective(html) { $('objective').innerHTML = html || ''; $('objective').hidden = !html; }

  update(dt, g) {
    const p = g.player;
    $('money').textContent = formatCFA(g.money);
    $('stars').innerHTML = [1, 2, 3, 4, 5].map((i) => `<b class="${i <= g.wanted ? 'on' : ''}${g.wanted && g.wantedFlash ? ' flash' : ''}">★</b>`).join('');
    const hh = Math.floor(g.hour), mm = Math.floor((g.hour % 1) * 60);
    $('clock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    const v = p.vehicle;
    $('speed').hidden = !v;
    if (v) {
      $('speed').innerHTML = `<b>${Math.round(Math.abs(v.speed) * 3.6)}</b> km/h`;
      $('vhealth').style.width = v.health + '%';
    }
    $('healthbar').hidden = !v;
    const zone = g.zone;
    if (zone !== this.lastZone) { this.lastZone = zone; $('zone').innerHTML = `${zone}${v ? `<small>${v.spec.name}</small>` : ''}`; $('zone').classList.add('show'); this.zoneTimer = 4; }
    if ((this.zoneTimer -= dt) < 0) $('zone').classList.remove('show');
    if ((this.helpTimer -= dt) < 0) $('help').hidden = true;
    if ((this.subTimer -= dt) < 0) $('subtitle').hidden = true;
    if ((this.toastT -= dt) < 0) {
      $('toast').classList.remove('show');
      if (this.toastQ.length && this.toastT < -0.6) {
        const [t, x] = this.toastQ.shift();
        $('toast').innerHTML = `<h4>${t}</h4><p>${x}</p>`; $('toast').classList.add('show'); this.toastT = 7;
      }
    }
    this.drawMini(g);
    if (!this.big.hidden) this.drawBig(g);
    if (g.perf) $('perf').textContent = g.perf;
  }

  blips(g) {
    const out = [];
    for (const m of g.missions.blips()) out.push(m);
    for (const c of g.traffic.cars) if (c.ai.mode === 'chase') out.push({ x: c.pos.x, z: c.pos.z, color: g.wantedFlash ? '#ff3030' : '#3060ff', r: 4 });
    return out;
  }

  drawMini(g) {
    const ctx = this.mctx, W = this.mini.width, H = this.mini.height, p = g.player.pos;
    const zoom = 1.6 - Math.min(0.8, Math.abs(g.player.vehicle?.speed || 0) / 40);
    ctx.save();
    ctx.fillStyle = '#c9a77a'; ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2, H * 0.62);
    ctx.rotate(Math.PI + g.camYaw);
    ctx.scale(zoom, zoom);
    const [mx, mz] = this.w2m(p.x, p.z);
    ctx.drawImage(this.map, -mx, -mz);
    for (const L of this.world.landmarks) {
      const [lx, lz] = this.w2m(L.x, L.z);
      ctx.fillStyle = g.discovered.has(L.name) ? '#ffffff' : '#ffd23a';
      ctx.beginPath(); ctx.arc(lx - mx, lz - mz, 3 / zoom + 1, 0, 7); ctx.fill();
    }
    for (const b of this.blips(g)) {
      const [bx, bz] = this.w2m(b.x, b.z);
      ctx.fillStyle = b.color; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5 / zoom;
      ctx.beginPath(); ctx.arc(bx - mx, bz - mz, (b.r || 5) / zoom * 1.2, 0, 7); ctx.fill(); ctx.stroke();
    }
    // flèche du joueur
    const h = g.player.vehicle ? g.player.vehicle.heading : g.player.heading;
    ctx.rotate(Math.PI - h);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5 / zoom;
    ctx.beginPath(); ctx.moveTo(0, -7 / zoom); ctx.lineTo(5 / zoom, 6 / zoom); ctx.lineTo(0, 3 / zoom); ctx.lineTo(-5 / zoom, 6 / zoom); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // repères de mission hors champ : petite flèche sur le bord
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, W, 2);
  }

  drawBig(g) {
    const ctx = this.bctx, W = this.big.width, H = this.big.height;
    const s = Math.min(W / this.map.width, H / this.map.height);
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H);
    const ox = (W - this.map.width * s) / 2, oz = (H - this.map.height * s) / 2;
    ctx.drawImage(this.map, ox, oz, this.map.width * s, this.map.height * s);
    const pt = (x, z) => { const [a, b] = this.w2m(x, z); return [ox + a * s, oz + b * s]; };
    ctx.font = '600 13px system-ui, sans-serif'; ctx.textAlign = 'center';
    for (const L of this.world.landmarks) {
      const [x, z] = pt(L.x, L.z);
      ctx.fillStyle = g.discovered.has(L.name) ? '#fff' : '#ffd23a';
      ctx.beginPath(); ctx.arc(x, z, 5, 0, 7); ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(L.name, x, z - 9); ctx.fillText(L.name, x, z - 9);
    }
    for (const b of this.blips(g)) { const [x, z] = pt(b.x, b.z); ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(x, z, 6, 0, 7); ctx.fill(); }
    const [px, pz] = pt(g.player.pos.x, g.player.pos.z);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, pz, 7, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.font = '600 15px system-ui';
    ctx.fillText('NIAMEY — plan stylisé (pas à l\'échelle)   ● jaune : lieu à découvrir   ● blanc : découvert', 16, H - 16);
    for (const b of BRIDGES) { const [x, z] = pt(b.x, (BRIDGE_Z0 + BRIDGE_Z1) / 2); ctx.fillStyle = '#ddd'; ctx.fillRect(x - 2, z - 60 * s, 4, 120 * s); }
  }

  toggleBig() {
    this.big.hidden = !this.big.hidden;
    if (!this.big.hidden) { this.big.width = innerWidth; this.big.height = innerHeight; }
  }
}
