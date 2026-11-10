// Procedural ambience, all synthesised (no sound files): wind, rain, water, birds by day,
// crickets by night, thunder after lightning, a foghorn in fog. Follows the Environment.
// Scenes add their own with audio.play(name) and audio.setLoop(name, level).
// Routed to the speakers and to a stream the recorder can capture.

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function tone(a, t, { type = 'sine', curve, dur, gain = 0.1, attack = 0.02, release, dest, vibrato }) {
  const ctx = a.ctx;
  const o = ctx.createOscillator();
  o.type = type;
  const [f0, ...rest] = curve;
  o.frequency.setValueAtTime(f0[0], t);
  for (const [f, at] of rest) o.frequency.linearRampToValueAtTime(f, t + at);
  if (vibrato) {
    const l = ctx.createOscillator();
    l.frequency.value = vibrato[0];
    const lg = ctx.createGain();
    lg.gain.value = vibrato[1];
    l.connect(lg);
    lg.connect(o.frequency);
    l.start(t);
    l.stop(t + dur + 0.1);
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.setValueAtTime(gain, t + Math.max(attack, dur - (release ?? dur * 0.3)));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(dest || a.master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

const VOICES = {
  bell(a, t, o) {
    const f = 1250 * (o.pitch ?? 1);
    for (const s of [0, 0.3]) {
      for (const [p, v] of [[1, 0.16], [2.76, 0.06], [5.4, 0.025], [0.5, 0.05]]) {
        const osc = a.ctx.createOscillator();
        const g = a.ctx.createGain();
        osc.frequency.value = f * p;
        g.gain.setValueAtTime(0.0001, t + s);
        g.gain.exponentialRampToValueAtTime(v * (o.gain ?? 1), t + s + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + s + 1.3);
        osc.connect(g);
        g.connect(a.master);
        osc.start(t + s);
        osc.stop(t + s + 1.4);
      }
    }
  },
  horn(a, t, o) {
    const p = o.pitch ?? 1, dur = o.dur ?? 2.2;
    const f = a.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 650;
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.13 * (o.gain ?? 1), t + 0.14);
    g.gain.setValueAtTime(0.13 * (o.gain ?? 1), t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.6);
    f.connect(g);
    g.connect(a._echo(0.42, 0.3, 0.35));
    for (const hz of [110, 138.6, 165]) {
      const osc = a.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = hz * p;
      osc.connect(f);
      osc.start(t);
      osc.stop(t + dur + 0.7);
    }
  },
  loon(a, t) {
    const dest = a._echo(0.38, 0.42, 0.5);
    tone(a, t, { curve: [[600, 0], [980, 0.45], [930, 1.1], [1180, 1.6], [1120, 2.2], [720, 2.9]], dur: 3.0, gain: 0.1, attack: 0.15, release: 0.5, vibrato: [5.5, 14], dest });
  },
  boom(a, t, o) {
    const p = o.power ?? 1;
    tone(a, t, { curve: [[72, 0], [30, 0.6]], dur: 0.9, gain: 0.9 * p, attack: 0.005, release: 0.85 });
    a._burst(t, 1.6, { buf: a.brown, type: 'lowpass', freq: 520, gain: 0.7 * p });
    for (let i = 0; i < 36; i++) a._burst(t + 0.5 + Math.random() * 1.3, 0.012, { freq: 3200 + Math.random() * 3000, q: 1, gain: (0.04 + Math.random() * 0.12) * p });
  },
  whoosh(a, t, o) {
    const d = o.dur ?? 2.6;
    const ctx = a.ctx;
    const s = ctx.createBufferSource();
    s.buffer = a.pink;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(260, t);
    f.frequency.linearRampToValueAtTime(950, t + d * 0.5);
    f.frequency.linearRampToValueAtTime(300, t + d);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4 * (o.gain ?? 1), t + d * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(f);
    f.connect(g);
    g.connect(a.master);
    s.start(t, Math.random());
    s.stop(t + d + 0.05);
  },
  typing(a, t) {
    let s = 0;
    const n = 6 + Math.floor(Math.random() * 9);
    for (let i = 0; i < n; i++) {
      a._burst(t + s, 0.012, { type: 'highpass', freq: 1800, gain: 0.07 + Math.random() * 0.05 });
      s += 0.06 + Math.random() * 0.12;
    }
  },
  tick(a, t) { a._burst(t, 0.006, { freq: 3200, q: 4, gain: 0.12 }); },
  eagle(a, t) {
    const dest = a._echo(0.5, 0.33, 0.4);
    tone(a, t, { type: 'triangle', curve: [[2900, 0], [2500, 0.15], [3100, 0.4], [2000, 1.1]], dur: 1.2, gain: 0.05, attack: 0.04, release: 0.4, vibrato: [9, 60], dest });
  },
  coyote(a, t) {
    const dest = a._echo(0.55, 0.35, 0.45);
    tone(a, t, { curve: [[420, 0], [880, 1.0], [760, 2.4]], dur: 2.5, gain: 0.07, attack: 0.2, release: 0.6, vibrato: [6, 18], dest });
    tone(a, t + 0.7, { curve: [[560, 0], [1050, 0.9], [900, 2.0]], dur: 2.1, gain: 0.05, attack: 0.2, release: 0.5, vibrato: [7, 22], dest });
    for (let i = 0; i < 3; i++) tone(a, t + 2.5 + i * 0.18, { curve: [[900, 0], [1300, 0.1]], dur: 0.13, gain: 0.05, attack: 0.01, release: 0.06, dest });
  },
  gull(a, t) {
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const s = t + i * 0.32;
      tone(a, s, { type: 'triangle', curve: [[1900, 0], [1250, 0.22]], dur: 0.26, gain: 0.05, attack: 0.02, release: 0.12 });
      tone(a, s, { curve: [[3800, 0], [2500, 0.22]], dur: 0.24, gain: 0.015, attack: 0.02, release: 0.1 });
    }
  },
  rumble(a, t, o) {
    const d = o.dur ?? 4;
    const ctx = a.ctx;
    const s = ctx.createBufferSource();
    s.buffer = a.brown;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 150;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.8 * (o.gain ?? 1), t + d * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(f);
    f.connect(g);
    g.connect(a.master);
    s.start(t, Math.random());
    s.stop(t + d + 0.05);
    for (let k = 0.2; k < d - 0.3; k += 0.19) a._burst(t + k, 0.03, { freq: 1100, q: 3, gain: 0.04 * Math.sin((k / d) * Math.PI) * (o.gain ?? 1) });
  },
  spark(a, t) {
    for (let i = 0; i < 3; i++) a._burst(t + i * 0.04 + Math.random() * 0.03, 0.02, { type: 'highpass', freq: 2600, gain: 0.12 });
    tone(a, t, { type: 'square', curve: [[2800, 0], [1900, 0.08]], dur: 0.09, gain: 0.015, attack: 0.002, release: 0.05 });
  },
  owl(a, t) {
    for (const [s, f] of [[0, 330], [0.6, 320], [0.85, 325]]) tone(a, t + s, { curve: [[f, 0], [f * 0.97, 0.3]], dur: 0.38, gain: 0.08, attack: 0.06, release: 0.2 });
  },
  chord(a, t, o) {
    const dur = o.dur ?? 3;
    for (const n of o.notes || [60, 64, 67]) {
      const f = mtof(n);
      for (const [mult, lvl, det] of [[1, 1, -3], [1, 0.6, 4], [2, 0.12, 0]]) {
        const osc = a.ctx.createOscillator();
        osc.type = mult === 2 ? 'triangle' : 'sine';
        osc.frequency.value = f * mult;
        osc.detune.value = det;
        const g = a.ctx.createGain();
        const peak = (o.gain ?? 0.05) * lvl;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + 0.02);
        g.gain.exponentialRampToValueAtTime(peak * 0.45, t + 0.7);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(g);
        g.connect(o.dest || a.master);
        osc.start(t);
        osc.stop(t + dur + 0.05);
      }
    }
    // soft bass an octave under the root
    tone(a, t, { curve: [[mtof((o.notes || [48])[0] - 12), 0]], dur, gain: (o.gain ?? 0.05) * 1.6, attack: 0.03, release: dur * 0.5, dest: o.dest });
  },
};

export class Ambience {
  constructor() {
    this.ctx = null;
    this.on = false;
    this.volume = 0.6;
    this.scene = {};
    this._acc = 0;
    this.birdTimer = 1;
    this.cricketTimer = 0.5;
    this.hornTimer = 4;
  }

  get stream() {
    return this.dest ? this.dest.stream : null;
  }

  /** Audio clock. Offline renders drive it from the simulation instead of the hardware. */
  now() {
    return this._clock ?? this.ctx.currentTime;
  }

  /**
   * Offline rendering for clip export: everything the scene plays or loops is scheduled on an
   * OfflineAudioContext while the export steps the world; set audio._clock to the clip time before
   * each update. endOffline() renders and returns the AudioBuffer, then the live graph comes back.
   */
  beginOffline(seconds, sampleRate = 48000) {
    const keys = ['ctx', 'master', 'dest', 'white', 'brown', 'pink', 'wind', 'rain', 'rainLow', 'water', 'waterSwell', 'birdBus', 'bugBus', 'loops', 'lofiBus', 'roofBus', 'dripTimer', 'on', '_acc', 'birdTimer', 'cricketTimer', 'hornTimer', '_clock', '_offline'];
    this._live = Object.fromEntries(keys.map((k) => [k, this[k]]));
    this.loops = {};
    this.lofiBus = null;
    this.roofBus = null;
    this._acc = 0;
    this._offline = true;
    this._clock = 0;
    this._build(new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate));
    this.master.gain.setValueAtTime(this.volume, 0);
    this.on = true;
  }

  async endOffline() {
    const buffer = await this.ctx.startRendering();
    Object.assign(this, this._live);
    this._live = null;
    return buffer;
  }

  async start() {
    if (!this.ctx) this._build();
    if (this.ctx.state !== 'running') await this.ctx.resume();
    this.on = true;
    this.master.gain.setTargetAtTime(this.volume, this.now(), 0.4);
  }

  stop() {
    if (!this.ctx) return;
    this.on = false;
    this.master.gain.setTargetAtTime(0, this.now(), 0.25);
  }

  setVolume(v) {
    this.volume = v;
    if (this.ctx && this.on) this.master.gain.setTargetAtTime(v, this.now(), 0.1);
  }

  _noise(kind, seconds = 4) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else if (kind === 'pink') {
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
      } else d[i] = w * 0.5;
    }
    return buf;
  }

  _loop(buffer, filters) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    let node = src;
    const fs = filters.map(([type, freq, q]) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      node.connect(f);
      node = f;
      return f;
    });
    const gain = ctx.createGain();
    gain.gain.value = 0;
    node.connect(gain);
    gain.connect(this.master);
    src.start(0, Math.random() * buffer.duration);
    return { src, gain, filters: fs };
  }

  _lfo(freq, depth, param) {
    const o = this.ctx.createOscillator();
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = depth;
    o.connect(g);
    g.connect(param);
    o.start();
    return o;
  }

  _build(given) {
    const ctx = (this.ctx = given || new (window.AudioContext || window.webkitAudioContext)());
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.dest = ctx.createMediaStreamDestination ? ctx.createMediaStreamDestination() : null;
    if (this.dest) comp.connect(this.dest);

    this.white = this._noise('white');
    this.brown = this._noise('brown');
    this.pink = this._noise('pink');

    this.wind = this._loop(this.brown, [['bandpass', 420, 0.7]]);
    this._lfo(0.07, 160, this.wind.filters[0].frequency);
    this.rain = this._loop(this.white, [['highpass', 900, 0.5], ['lowpass', 7000, 0.4]]);
    this.rainLow = this._loop(this.pink, [['lowpass', 900, 0.4]]);
    this.water = this._loop(this.brown, [['lowpass', 520, 0.5]]);
    this.waterSwell = ctx.createGain();
    this.waterSwell.gain.value = 0.65;
    this._lfo(0.16, 0.35, this.waterSwell.gain);
    this.water.gain.disconnect();
    this.water.gain.connect(this.waterSwell);
    this.waterSwell.connect(this.master);

    this.birdBus = ctx.createGain();
    this.birdBus.gain.value = 0.5;
    this.birdBus.connect(this.master);
    this.bugBus = ctx.createGain();
    this.bugBus.gain.value = 0.14;
    this.bugBus.connect(this.master);
  }

  _chirp(t0, f, dur, vol) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t0);
    o.frequency.exponentialRampToValueAtTime(f * (1.25 + Math.random() * 0.3), t0 + dur * 0.4);
    o.frequency.exponentialRampToValueAtTime(f * 0.88, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(this.birdBus);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  _birdPhrase() {
    const t = this.now() + 0.02;
    const base = 2400 + Math.random() * 1800;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) this._chirp(t + i * (0.09 + Math.random() * 0.08), base * (0.9 + Math.random() * 0.25), 0.07 + Math.random() * 0.06, 0.08 + Math.random() * 0.06);
  }

  _cricket(level) {
    const ctx = this.ctx;
    const t = this.now() + 0.02;
    const f = 4300 + Math.random() * 500;
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      const s = t + i * 0.055;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.3 * level, s + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.035);
      o.connect(g);
      g.connect(this.bugBus);
      o.start(s);
      o.stop(s + 0.05);
    }
  }

  thunder(delay = 0.6, power = 0.8) {
    if (!this.ctx || !this.on) return;
    const ctx = this.ctx;
    const t = this.now() + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.brown;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(320, t);
    f.frequency.exponentialRampToValueAtTime(90, t + 3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1.4 * power, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.5 * power, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t, Math.random() * 2);
    src.stop(t + 3.8);
  }

  _foghorn() {
    const ctx = this.ctx;
    const t = this.now() + 0.05;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.5);
    g.gain.setValueAtTime(0.16, t + 2.0);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
    f.connect(g);
    g.connect(this.master);
    for (const hz of [98, 147]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz;
      o.connect(f);
      o.start(t);
      o.stop(t + 3.5);
    }
  }

  // ------------------------------------------------------------ scene sounds

  /** One-shot by name: bell, horn, loon, boom, whoosh, typing, tick, eagle, coyote, gull, rumble, spark, owl, chord, thunder. */
  play(name, o = {}) {
    if (!this.ctx || !this.on) return;
    if (name === 'thunder') return this.thunder(o.delay ?? 0.4, o.power ?? 0.8);
    const v = VOICES[name];
    if (v) v(this, this.now() + 0.02 + (o.delay || 0), o);
  }

  /** Looping bed by name, level 0..1: traffic, buzz, fire, vinyl, lofi, howl, cicadas, hum. */
  setLoop(name, level) {
    this.loopLevels = this.loopLevels || {};
    this.loopLevels[name] = level;
  }

  _out(gain = 1) {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    g.connect(this.master);
    return g;
  }

  _echo(time = 0.38, feedback = 0.38, wet = 0.45) {
    const ctx = this.ctx;
    const inp = ctx.createGain();
    const d = ctx.createDelay(2);
    d.delayTime.value = time;
    const fb = ctx.createGain();
    fb.gain.value = feedback;
    const w = this._out(wet);
    inp.connect(this.master);
    inp.connect(d);
    d.connect(fb);
    fb.connect(d);
    d.connect(w);
    if (!this._offline) setTimeout(() => { try { inp.disconnect(); d.disconnect(); fb.disconnect(); w.disconnect(); } catch (e) { /* gone */ } }, 9000);
    return inp;
  }

  _burst(t, dur, { buf = this.white, type = 'bandpass', freq = 3000, q = 1, gain = 0.2, dest = this.master, offset } = {}) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.004, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(dest);
    s.start(t, offset ?? Math.random() * (buf.duration - dur - 0.1));
    s.stop(t + dur + 0.02);
  }

  _ensureLoop(name) {
    this.loops = this.loops || {};
    if (this.loops[name]) return this.loops[name];
    const ctx = this.ctx;
    let L = null;
    if (name === 'traffic') L = this._loop(this.brown, [['lowpass', 230, 0.5]]);
    else if (name === 'hum') L = this._loop(this.pink, [['lowpass', 320, 0.4]]);
    else if (name === 'fire') L = this._loop(this.brown, [['highpass', 140, 0.5], ['lowpass', 950, 0.5]]);
    else if (name === 'vinyl') L = this._loop(this.white, [['highpass', 3600, 0.6]]);
    else if (name === 'howl') {
      L = this._loop(this.white, [['bandpass', 620, 9]]);
      this._lfo(0.06, 220, L.filters[0].frequency);
      const b = this._loop(this.white, [['bandpass', 980, 11]]);
      this._lfo(0.045, 260, b.filters[0].frequency);
      b.gain.disconnect();
      b.gain.connect(L.gain);
      b.gain.gain.value = 0.8;
    } else if (name === 'cicadas') {
      L = this._loop(this.white, [['bandpass', 5200, 3]]);
      const am = ctx.createGain();
      am.gain.value = 0.5;
      this._lfo(46, 0.5, am.gain);
      L.gain.disconnect();
      L.gain.connect(am);
      am.connect(this.master);
    } else if (name === 'buzz') {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 120;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 240;
      f.Q.value = 5;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      o.connect(f);
      f.connect(gain);
      gain.connect(this.master);
      o.start();
      L = { gain, filters: [f] };
    } else if (name === 'lofi') {
      const gain = this._out(0);
      L = { gain, filters: [] };
    }
    if (!L) return null;
    const base = { traffic: 0.35, hum: 0.12, fire: 0.3, vinyl: 0.05, howl: 0.5, cicadas: 0.06, buzz: 0.05, lofi: 1 }[name] ?? 0.3;
    this.loops[name] = { ...L, base, timer: 0, beat: 0 };
    return this.loops[name];
  }

  _lofiStep(L, level, t) {
    // 72 bpm: one chord per bar, soft kick on 1 and 3, rim on 2 and 4, quiet hats on eighths
    const ctx = this.ctx;
    const beat = 60 / 72;
    const bar = Math.floor(L.beat / 4) % 4;
    const b = L.beat % 4;
    if (!this.lofiBus) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1700;
      const trem = ctx.createGain();
      trem.gain.value = 0.85;
      this._lfo(4.2, 0.12, trem.gain);
      lp.connect(trem);
      trem.connect(L.gain);
      this.lofiBus = lp;
    }
    const chords = [[50, 53, 57, 60, 64], [43, 53, 59, 62, 65], [48, 52, 55, 59, 62], [45, 52, 55, 60, 64]];
    if (b === 0) VOICES.chord(this, t, { notes: chords[bar], dur: beat * 4 - 0.1, gain: 0.05 * level, dest: this.lofiBus });
    if (b === 0 || b === 2) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.32 * level, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g);
      g.connect(L.gain);
      o.start(t);
      o.stop(t + 0.4);
    }
    if (b === 1 || b === 3) this._burst(t, 0.06, { freq: 1900, q: 2, gain: 0.07 * level, dest: L.gain });
    this._burst(t, 0.03, { type: 'highpass', freq: 7000, gain: 0.025 * level, dest: L.gain });
    this._burst(t + beat / 2, 0.03, { type: 'highpass', freq: 7000, gain: 0.018 * level, dest: L.gain });
    L.beat++;
    return beat;
  }

  _updateLoops(step) {
    if (!this.loopLevels) return;
    const t = this.now();
    for (const [name, level] of Object.entries(this.loopLevels)) {
      const L = level > 0 ? this._ensureLoop(name) : this.loops?.[name];
      if (!L) continue;
      L.gain.gain.setTargetAtTime(name === 'lofi' ? (level > 0 ? 1 : 0) : level * L.base, t, 0.4);
      if (level <= 0) continue;
      L.timer -= step;
      if (L.timer > 0) continue;
      if (name === 'fire') {
        const n = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) this._burst(t + Math.random() * 0.1, 0.008 + Math.random() * 0.02, { freq: 1500 + Math.random() * 3500, q: 0.8, gain: (0.05 + Math.random() * 0.22) * level });
        L.timer = 0.03 + Math.random() * 0.18;
      } else if (name === 'vinyl') {
        this._burst(t, 0.004, { type: 'lowpass', freq: 2200, gain: (0.04 + Math.random() * 0.1) * level });
        L.timer = 0.15 + Math.random() * 0.8;
      } else if (name === 'lofi') {
        // schedule on the audio clock so the beat stays tight
        if (!L.next || L.next < t) L.next = t + 0.08;
        while (L.next < t + 0.4) L.next += this._lofiStep(L, level, L.next);
        L.timer = 0.1;
      } else L.timer = 1;
    }
  }

  /** Rain on the roof, heard from inside: dense hollow taps on the boards, heavier drops, a gutter drip, the odd tick on the glass. */
  _roofRain(step, level, vol = 1) {
    const ctx = this.ctx;
    if (!this.roofBus) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2600;
      lp.Q.value = 0.7;
      const body = ctx.createBiquadFilter();
      body.type = 'peaking';
      body.frequency.value = 420;
      body.Q.value = 1.1;
      body.gain.value = 5;
      lp.connect(body);
      body.connect(this.master);
      this.roofBus = lp;
    }
    const t = this.now();
    const taps = Math.round(level * 60 * step * (0.8 + Math.random() * 0.4));
    for (let i = 0; i < taps; i++) {
      this._burst(t + Math.random() * step, 0.006 + Math.random() * 0.016, { type: 'bandpass', freq: 600 + Math.random() * 2000, q: 3 + Math.random() * 6, gain: (0.03 + Math.random() * 0.06) * level * vol, dest: this.roofBus });
    }
    // heavier drops thudding on the boards
    const thuds = Math.random() < level * step * 6 ? 1 + Math.floor(Math.random() * 2) : 0;
    for (let i = 0; i < thuds; i++) this._burst(t + Math.random() * step, 0.05 + Math.random() * 0.03, { buf: this.brown, type: 'bandpass', freq: 160 + Math.random() * 220, q: 4, gain: 0.16 * level * vol, dest: this.roofBus });
    // a steady gutter drip outside the window
    this.dripTimer = (this.dripTimer ?? 0.7) - step;
    if (this.dripTimer <= 0) {
      tone(this, t + 0.01, { curve: [[1450 + Math.random() * 250, 0], [680, 0.05]], dur: 0.08, gain: 0.05 * level * vol, attack: 0.002, release: 0.06, dest: this.roofBus });
      this.dripTimer = 0.55 + Math.random() * 0.8;
    }
    // the odd drop ticking on the window glass
    if (Math.random() < 0.45 * level) this._burst(t + Math.random() * step, 0.004, { type: 'bandpass', freq: 3400 + Math.random() * 1500, q: 9, gain: 0.03 * level * vol });
  }

  update(dt, env) {
    if (!this.ctx || !this.on) return;
    this._acc += dt;
    if (this._acc < 0.1) return;
    const step = this._acc;
    this._acc = 0;
    this._updateLoops(step);
    const W = env.cur, t = this.now();
    const set = (param, v) => param.setTargetAtTime(v, t, 0.5);
    const roof = this.scene.rain === 'roof';
    const rv = this.scene.rainLevel ?? 1; // per-scene rain volume
    set(this.wind.gain.gain, (0.05 + W.wind * 0.32) * (roof ? 0.3 : 1));
    // indoors the hiss is muffled by the ceiling: a darker, narrower bed with more low drumming
    set(this.rain.gain.gain, W.rain * (roof ? 0.05 : 0.2) * rv);
    set(this.rain.filters[0].frequency, roof ? 240 : 900);
    set(this.rain.filters[1].frequency, roof ? 1300 : 7000);
    set(this.rainLow.gain.gain, (W.rain * 0.16 + W.storm * 0.14) * (roof ? 1.35 : 1) * rv);
    if (roof && W.rain > 0.04) this._roofRain(step, W.rain, rv);
    set(this.water.gain.gain, (this.scene.water ?? 0) * 0.35);

    const day = env.daylight * (1 - W.rain) * (1 - W.storm) * (1 - W.snow * 0.7) * (this.scene.birds ?? 1);
    this.birdTimer -= step;
    if (this.birdTimer <= 0) {
      if (Math.random() < day) this._birdPhrase();
      this.birdTimer = 1.2 + Math.random() * 3.5;
    }
    const night = env.night * (1 - W.rain) * (1 - W.snow) * (1 - W.storm) * (this.scene.crickets ?? 1);
    this.cricketTimer -= step;
    if (this.cricketTimer <= 0) {
      if (night > 0.3) this._cricket(night);
      this.cricketTimer = 0.4 + Math.random() * 0.5;
    }
    if (W.fog > 0.5 && (this.scene.foghorn ?? 0) > 0) {
      this.hornTimer -= step;
      if (this.hornTimer <= 0) {
        this._foghorn();
        this.hornTimer = 14 + Math.random() * 10;
      }
    }
  }
}
