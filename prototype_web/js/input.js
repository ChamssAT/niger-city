// Clavier (positions physiques : ZQSD sur AZERTY = WASD sur QWERTY), souris et tactile.
export class Input {
  constructor(canvas) {
    this.keys = new Set(); this.pressed = new Set();
    this.mouseDX = 0; this.mouseDY = 0; this.locked = false;
    this.touch = { x: 0, y: 0, active: false };
    addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('click', () => { if (!this.isTouch && document.pointerLockElement !== canvas) canvas.requestPointerLock?.(); });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    addEventListener('mousemove', (e) => { if (this.locked) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; } });
    this.isTouch = matchMedia('(pointer: coarse)').matches;
    if (this.isTouch) this.setupTouch();
  }

  setupTouch() {
    const ui = document.getElementById('touch'); ui.hidden = false;
    const stick = document.getElementById('stick'), knob = stick.querySelector('i');
    let id = null, cx = 0, cy = 0;
    stick.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; id = t.identifier; const r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; this.touch.active = true; e.preventDefault(); }, { passive: false });
    addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) if (t.identifier === id) {
        const dx = Math.max(-1, Math.min(1, (t.clientX - cx) / 50)), dy = Math.max(-1, Math.min(1, (t.clientY - cy) / 50));
        this.touch.x = dx; this.touch.y = dy; knob.style.transform = `translate(${dx * 40}px, ${dy * 40}px)`;
      }
    }, { passive: false });
    addEventListener('touchend', (e) => { for (const t of e.changedTouches) if (t.identifier === id) { id = null; this.touch = { x: 0, y: 0, active: false }; knob.style.transform = ''; } });
    for (const b of ui.querySelectorAll('[data-key]')) {
      b.addEventListener('touchstart', (e) => { e.preventDefault(); this.pressed.add(b.dataset.key); this.keys.add(b.dataset.key); });
      b.addEventListener('touchend', () => this.keys.delete(b.dataset.key));
    }
    // glisser sur le reste de l'écran = caméra
    let last = null;
    addEventListener('touchmove', (e) => { for (const t of e.touches) if (t.identifier !== id && t.target.tagName === 'CANVAS') { if (last) this.mouseDX += (t.clientX - last) * 2; last = t.clientX; } });
    addEventListener('touchend', () => { last = null; });
  }

  down(...codes) { return codes.some((c) => this.keys.has(c)); }
  hit(...codes) { return codes.some((c) => this.pressed.has(c)); }

  axes() {
    let x = 0, y = 0;
    if (this.down('KeyW', 'ArrowUp')) y += 1;
    if (this.down('KeyS', 'ArrowDown')) y -= 1;
    if (this.down('KeyA', 'ArrowLeft')) x += 1;
    if (this.down('KeyD', 'ArrowRight')) x -= 1;
    if (this.touch.active) { x = -this.touch.x; y = -this.touch.y; }
    return { x, y };
  }

  endFrame() { this.pressed.clear(); this.mouseDX = 0; this.mouseDY = 0; }
}
