/**
 * Procedural audio — every sound is synthesized with WebAudio at runtime (no sample files).
 * The context is created lazily on the first user gesture (browser autoplay policy).
 */
import type { RegimeId } from '../sim/config';

class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfxBus!: GainNode;
  musicBus!: GainNode;
  private noise!: AudioBuffer;
  sfxOn = true;
  musicOn = true;
  private musicTimer: number | null = null;
  private nextNote = 0;
  private step = 0;
  regime: RegimeId = 'CALM';
  intensity = 0;
  private playing = false;

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.musicBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus.connect(this.master);
      this.sfxBus.gain.value = this.sfxOn ? 1 : 0;
      this.musicBus.gain.value = this.musicOn ? 0.55 : 0;
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setSfx(on: boolean) {
    this.sfxOn = on;
    if (this.ctx) this.sfxBus.gain.value = on ? 1 : 0;
  }
  setMusic(on: boolean) {
    this.musicOn = on;
    if (this.ctx) this.musicBus.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.1);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, opts: { slide?: number; delay?: number; bus?: GainNode; attack?: number } = {}) {
    const c = this.ctx;
    if (!c || (!this.sfxOn && !opts.bus)) return;
    const t = c.currentTime + (opts.delay ?? 0);
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (opts.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(opts.bus ?? this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noiseHit(dur: number, vol: number, freq: number, type: BiquadFilterType = 'bandpass', opts: { delay?: number; bus?: GainNode; sweep?: number } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + (opts.delay ?? 0);
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (opts.sweep) f.frequency.exponentialRampToValueAtTime(opts.sweep, t + dur);
    f.Q.value = 1.2;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(opts.bus ?? this.sfxBus);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  // ---------------- SFX ----------------
  fill(combo: number, tier: number) {
    const base = 660 * Math.pow(2, Math.min(combo, 24) / 24);
    this.tone(base, 0.12, 'triangle', 0.22);
    this.tone(base * 1.5, 0.16, 'sine', 0.14, { delay: 0.04 });
    if (tier >= 3) this.tone(base * 2, 0.2, 'sine', 0.1, { delay: 0.08 });
  }
  toxic() {
    this.tone(180, 0.35, 'sawtooth', 0.16, { slide: 70 });
    this.noiseHit(0.25, 0.2, 400, 'lowpass');
  }
  miss() {
    this.tone(320, 0.05, 'square', 0.025);
  }
  lane() {
    this.noiseHit(0.12, 0.12, 2500, 'bandpass', { sweep: 900 });
  }
  jump() {
    this.tone(300, 0.22, 'sine', 0.18, { slide: 800 });
    this.noiseHit(0.15, 0.08, 1800, 'highpass');
  }
  boost() {
    this.noiseHit(0.5, 0.22, 600, 'bandpass', { sweep: 4000 });
    this.tone(220, 0.4, 'sawtooth', 0.06, { slide: 660 });
  }
  recLane() {
    [659, 880, 1175].forEach((n, i) => this.tone(n, 0.16, 'triangle', 0.12, { delay: i * 0.06 }));
  }
  coin(combo: number) {
    this.tone(1320 * Math.pow(2, Math.min(combo, 20) / 40), 0.07, 'square', 0.04);
  }
  settle(sweet: boolean) {
    const notes = sweet ? [523, 659, 784, 1046, 1318] : [523, 784];
    notes.forEach((n, i) => this.tone(n, 0.18, 'triangle', 0.14, { delay: i * 0.05 }));
    this.noiseHit(0.4, 0.2, 800, 'bandpass', { sweep: 5000 });
  }
  land() {
    this.noiseHit(0.1, 0.14, 300, 'lowpass');
  }
  nearMiss() {
    this.noiseHit(0.35, 0.3, 5000, 'bandpass', { sweep: 600 });
    this.tone(1200, 0.18, 'sine', 0.1, { slide: 1800, delay: 0.05 });
  }
  hit() {
    this.noiseHit(0.5, 0.5, 900, 'lowpass', { sweep: 80 });
    this.tone(110, 0.5, 'sawtooth', 0.25, { slide: 35 });
  }
  smash() {
    this.noiseHit(0.3, 0.35, 3000, 'bandpass', { sweep: 200 });
    this.tone(880, 0.2, 'square', 0.08, { slide: 220 });
  }
  hedge() {
    this.noiseHit(0.45, 0.25, 400, 'bandpass', { sweep: 6000 });
    this.tone(440, 0.3, 'sine', 0.15, { slide: 880 });
  }
  denied() {
    this.tone(200, 0.08, 'square', 0.08);
    this.tone(160, 0.1, 'square', 0.08, { delay: 0.09 });
  }
  gate(passed: boolean) {
    const notes = passed ? [523, 659, 784, 1046] : [392, 330];
    notes.forEach((n, i) => this.tone(n, 0.25, 'triangle', 0.18, { delay: i * 0.08 }));
  }
  alpha(on: boolean) {
    if (on) {
      this.noiseHit(1.2, 0.35, 200, 'bandpass', { sweep: 8000 });
      [262, 330, 392, 523, 659].forEach((n, i) => this.tone(n, 0.5, 'sawtooth', 0.08, { delay: i * 0.05 }));
    } else this.tone(600, 0.4, 'sine', 0.12, { slide: 200 });
  }
  ready() {
    [784, 988, 1175].forEach((n, i) => this.tone(n, 0.15, 'square', 0.06, { delay: i * 0.07 }));
  }
  regimeChange(r: RegimeId) {
    if (r === 'CRASH') {
      for (let i = 0; i < 4; i++) {
        this.tone(880, 0.25, 'sawtooth', 0.12, { delay: i * 0.5, slide: 440 });
        this.tone(660, 0.25, 'sawtooth', 0.1, { delay: i * 0.5 + 0.25, slide: 330 });
      }
      this.noiseHit(1.5, 0.3, 120, 'lowpass');
    } else if (r === 'VOLATILE') {
      this.noiseHit(1.2, 0.3, 200, 'lowpass', { sweep: 60 }); // thunder
      this.tone(1046, 0.15, 'square', 0.06);
    } else this.tone(r === 'TRENDING' ? 784 : 659, 0.3, 'sine', 0.12, { slide: r === 'TRENDING' ? 1046 : 523 });
  }
  thunder() {
    this.noiseHit(1.4, 0.25, 160, 'lowpass', { sweep: 50 });
  }
  combo(n: number) {
    [1, 1.25, 1.5, 2].forEach((m, i) => this.tone(523 * m * (1 + n / 100), 0.12, 'square', 0.06, { delay: i * 0.05 }));
  }
  comboBreak() {
    this.tone(500, 0.25, 'triangle', 0.1, { slide: 150 });
  }
  countdown(go: boolean) {
    this.tone(go ? 1046 : 523, go ? 0.5 : 0.18, 'square', 0.12);
  }
  limit() {
    this.tone(220, 0.12, 'square', 0.1);
  }
  end() {
    [784, 659, 523, 392].forEach((n, i) => this.tone(n, 0.4, 'triangle', 0.15, { delay: i * 0.12 }));
  }
  click() {
    this.tone(1200, 0.04, 'square', 0.05);
  }

  // ---------------- music (procedural 4-on-the-floor) ----------------
  startMusic() {
    if (!this.ctx || this.playing) return;
    this.playing = true;
    this.nextNote = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.musicTimer = window.setInterval(() => this.schedule(), 25);
  }
  stopMusic() {
    this.playing = false;
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  private schedule() {
    const c = this.ctx;
    if (!c) return;
    const bpm = this.regime === 'CRASH' ? 150 : this.regime === 'VOLATILE' ? 140 : 128;
    const sixteenth = 60 / bpm / 4;
    while (this.nextNote < c.currentTime + 0.12) {
      this.playStep(this.step, this.nextNote);
      this.nextNote += sixteenth;
      this.step = (this.step + 1) % 64;
    }
  }

  private playStep(s: number, t: number) {
    const c = this.ctx!;
    const bus = this.musicBus;
    const delay = Math.max(0, t - c.currentTime);
    const beat = s % 4 === 0;
    // kick
    if (beat) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o.connect(g).connect(bus);
      o.start(t);
      o.stop(t + 0.3);
    }
    // hats
    const hatEvery = this.regime === 'VOLATILE' || this.regime === 'CRASH' ? 1 : 2;
    if (s % hatEvery === 0 && !beat) this.noiseHit(0.04, s % 4 === 2 ? 0.14 : 0.06, 9000, 'highpass', { delay, bus });
    if (s % 8 === 4) this.noiseHit(0.18, 0.22, 1800, 'bandpass', { delay, bus }); // snare
    // bass line: minor progression
    const prog = this.regime === 'CRASH' ? [41, 41, 40, 40] : this.regime === 'TRENDING' ? [45, 41, 43, 40] : [45, 41, 36, 43];
    const root = prog[Math.floor(s / 16) % 4];
    if (s % 2 === 0) {
      const note = root + (s % 4 === 2 ? 12 : 0);
      const f = 440 * Math.pow(2, (note - 69) / 12);
      const o = c.createOscillator();
      const fl = c.createBiquadFilter();
      const g = c.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t);
      fl.type = 'lowpass';
      fl.frequency.setValueAtTime(400 + this.intensity * 900, t);
      fl.Q.value = 6;
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.connect(fl).connect(g).connect(bus);
      o.start(t);
      o.stop(t + 0.2);
    }
    // arpeggio
    if (this.intensity > 0.2 || s % 2 === 0) {
      const arp = [0, 7, 12, 15, 19, 15, 12, 7];
      const note = root + 24 + arp[s % 8];
      const f = 440 * Math.pow(2, (note - 69) / 12);
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.035 + this.intensity * 0.02, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      o.connect(g).connect(bus);
      o.start(t);
      o.stop(t + 0.12);
    }
  }
}

export const audio = new AudioEngine();
