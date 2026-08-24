/* ============================================================
 * AETHER ARENA — util.js
 * Math helpers, seeded RNG, and a tiny WebAudio synth for SFX.
 * No external assets — everything is generated in code.
 * ============================================================ */
'use strict';

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
const fmtTime = (s) => {
  s = Math.max(0, Math.floor(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};

/* Deterministic RNG for map decoration, so the map looks the same every run. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- SFX: synthesized sound effects ---------------- */
class SFX {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
    this.musicNodes = [];
    this.musicTimer = null;
    this.musicStep = 0;
  }
  /* ambient battlefield music: slow pad chords, pure WebAudio */
  startMusic() {
    if (!this.enabled || !this.ctx || this.musicTimer) return;
    const CHORDS = [[110, 164.8, 220], [87.3, 130.8, 174.6], [130.8, 196, 261.6], [98, 146.8, 196]];
    const playChord = () => {
      if (!this.ctx) return;
      const chord = CHORDS[this.musicStep++ % CHORDS.length];
      for (const f of chord) {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sine'; o.frequency.value = f * (1 + rand(-0.001, 0.001));
        o.detune.value = rand(-6, 6);
        const t0 = this.ctx.currentTime;
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(0.028, t0 + 2);
        g.gain.linearRampToValueAtTime(0, t0 + 4.6);
        o.connect(g); g.connect(this.master);
        o.start(t0); o.stop(t0 + 5);
        this.musicNodes.push(o);
      }
    };
    playChord();
    this.musicTimer = setInterval(playChord, 4200);
  }
  stopMusic() {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
    for (const o of this.musicNodes) { try { o.stop(); } catch (e) {} }
    this.musicNodes = [];
  }
  resume() {
    try {
      if (!this.ctx) {
        const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
        if (!AC) { this.enabled = false; return; }
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.32;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) { this.enabled = false; }
  }
  tone(freq, dur, type = 'sine', vol = 0.5, slideTo = null, when = 0) {
    if (!this.enabled || !this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  noise(dur, vol = 0.3, when = 0) {
    if (!this.enabled || !this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 1400;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0);
  }
  play(name) {
    if (!this.enabled || !this.ctx) return;
    switch (name) {
      case 'hit':      this.noise(0.06, 0.16); break;
      case 'shot':     this.tone(760, 0.07, 'triangle', 0.16, 320); break;
      case 'skill':    this.tone(560, 0.16, 'sawtooth', 0.16, 180); break;
      case 'ult':      this.tone(160, 0.4, 'sawtooth', 0.24, 60); this.noise(0.25, 0.2); break;
      case 'stun':     this.tone(1200, 0.25, 'square', 0.12, 400); break;
      case 'heal':     this.tone(620, 0.2, 'sine', 0.2, 980); break;
      case 'kill':     this.tone(392, 0.3, 'square', 0.2); this.tone(523, 0.3, 'square', 0.18, null, 0.08); this.tone(659, 0.34, 'square', 0.18, null, 0.16); break;
      case 'death':    this.tone(300, 0.5, 'sawtooth', 0.2, 60); break;
      case 'tower':    this.tone(90, 0.7, 'sawtooth', 0.34, 35); this.noise(0.5, 0.32); break;
      case 'gold':     this.tone(1320, 0.09, 'sine', 0.14, 1760); break;
      case 'level':    this.tone(523, 0.12, 'triangle', 0.2); this.tone(659, 0.12, 'triangle', 0.2, null, 0.09); this.tone(784, 0.16, 'triangle', 0.2, null, 0.18); break;
      case 'announce': this.tone(880, 0.14, 'square', 0.14); this.tone(660, 0.2, 'square', 0.12, null, 0.1); break;
      case 'recall':   this.tone(440, 0.5, 'sine', 0.14, 880); break;
      case 'victory':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.24, null, i * 0.14));
        break;
      case 'defeat':
        [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.45, 'sawtooth', 0.16, null, i * 0.16));
        break;
    }
  }
}
