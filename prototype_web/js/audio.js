// Sons synthétisés (Web Audio) : moteur, klaxon, sirène, ambiance de ville, chocs, bonus.
export class GameAudio {
  constructor() { this.ctx = null; this.muted = false; }

  start() {
    if (this.ctx) return;
    const C = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = C.createGain(); this.master.gain.value = 0.55; this.master.connect(C.destination);
    // bruit réutilisable
    const len = C.sampleRate * 2, buf = C.createBuffer(1, len, C.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    this.noise = buf;
    // moteur
    this.eng = C.createOscillator(); this.eng.type = 'sawtooth';
    this.eng2 = C.createOscillator(); this.eng2.type = 'square';
    this.engF = C.createBiquadFilter(); this.engF.type = 'lowpass'; this.engF.frequency.value = 600;
    this.engG = C.createGain(); this.engG.gain.value = 0;
    const g2 = C.createGain(); g2.gain.value = 0.35;
    this.eng.connect(this.engF); this.eng2.connect(g2); g2.connect(this.engF); this.engF.connect(this.engG); this.engG.connect(this.master);
    this.eng.start(); this.eng2.start();
    // ambiance urbaine (rumeur filtrée)
    const amb = C.createBufferSource(); amb.buffer = buf; amb.loop = true;
    const af = C.createBiquadFilter(); af.type = 'bandpass'; af.frequency.value = 420; af.Q.value = 0.4;
    this.ambG = C.createGain(); this.ambG.gain.value = 0.12;
    amb.connect(af); af.connect(this.ambG); this.ambG.connect(this.master); amb.start();
    // sirène
    this.sir = C.createOscillator(); this.sir.type = 'triangle'; this.sirG = C.createGain(); this.sirG.gain.value = 0;
    this.sir.connect(this.sirG); this.sirG.connect(this.master); this.sir.start();
  }

  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.55; }

  engine(on, speed, max, moto) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, r = Math.min(1, Math.abs(speed) / max);
    const gear = moto ? r * 4 % 1 : r * 5 % 1;
    const f = (moto ? 70 : 42) + r * (moto ? 160 : 90) + gear * (moto ? 60 : 40);
    this.eng.frequency.setTargetAtTime(f, t, 0.05); this.eng2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    this.engF.frequency.setTargetAtTime(400 + r * 1600, t, 0.08);
    this.engG.gain.setTargetAtTime(on ? 0.07 + r * 0.06 : 0, t, 0.1);
  }

  siren(level) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sir.frequency.setTargetAtTime(650 + Math.sin(t * 5) * 220, t, 0.02);
    this.sirG.gain.setTargetAtTime(level * 0.05, t, 0.2);
  }

  ambience(level) { if (this.ctx) this.ambG.gain.setTargetAtTime(level, this.ctx.currentTime, 0.5); }

  vol(pos) {
    if (!pos || !this.listener) return 1;
    const d = Math.hypot(pos.x - this.listener.x, pos.z - this.listener.z);
    return Math.max(0, 1 - d / 80);
  }

  horn(pos, k = 1) {
    if (!this.ctx) return;
    const v = this.vol(pos) * k; if (v < 0.02) return;
    const C = this.ctx, t = C.currentTime, g = C.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12 * v, t + 0.02); g.gain.setValueAtTime(0.12 * v, t + 0.32); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    g.connect(this.master);
    for (const f of [392, 494]) { const o = C.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + 0.42); }
  }

  burst(gain, freq, dur) {
    if (!this.ctx) return;
    const C = this.ctx, t = C.currentTime, s = C.createBufferSource(); s.buffer = this.noise;
    const f = C.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = C.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur);
  }
  crash(k) { this.burst(Math.min(0.6, 0.1 + k * 0.03), 900, 0.35); }
  splash() { this.burst(0.5, 2500, 1.2); }

  chime() {
    if (!this.ctx) return;
    const C = this.ctx, t = C.currentTime;
    [660, 880, 1320].forEach((f, i) => {
      const o = C.createOscillator(), g = C.createGain(); o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.09); g.gain.exponentialRampToValueAtTime(0.15, t + i * 0.09 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.5);
      o.connect(g); g.connect(this.master); o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.55);
    });
  }
}
