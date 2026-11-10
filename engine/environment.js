import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { shared, toon, fxMaterial } from './materials.js';

export const TIME_PRESETS = { dawn: 6.5, day: 11.5, dusk: 18.7, night: 22.5 };

export const WEATHER = {
  clear: { clouds: 0.08, rain: 0, snow: 0, fog: 0, wind: 0.25, storm: 0 },
  cloudy: { clouds: 0.8, rain: 0, snow: 0, fog: 0.06, wind: 0.45, storm: 0 },
  rain: { clouds: 0.92, rain: 0.7, snow: 0, fog: 0.1, wind: 0.55, storm: 0 },
  storm: { clouds: 1, rain: 1, snow: 0, fog: 0.14, wind: 1, storm: 1 },
  snow: { clouds: 0.85, rain: 0, snow: 0.85, fog: 0.12, wind: 0.3, storm: 0 },
  fog: { clouds: 0.45, rain: 0, snow: 0, fog: 0.5, wind: 0.08, storm: 0 },
};

// Time of day keyframes. Colours are sRGB hex, blended in linear light.
// sun/sunI = key light, sky/gnd/amb = ambient, top/bot = background, tint = grade, night = 0..1.
const RAW = [
  { h: 0, sun: '#000000', sunI: 0, sky: '#3a4a86', gnd: '#1c2033', amb: 0.68, top: '#060815', bot: '#162050', tint: '#9fb2ff', exp: 1.35, stars: 1, night: 1 },
  { h: 4.6, sun: '#000000', sunI: 0, sky: '#3a4a86', gnd: '#1c2033', amb: 0.68, top: '#070a1a', bot: '#1b2558', tint: '#a4b4ff', exp: 1.3, stars: 1, night: 1 },
  { h: 5.6, sun: '#ff8a5c', sunI: 0, sky: '#6a6aa8', gnd: '#3b3040', amb: 0.6, top: '#1e2558', bot: '#e9876c', tint: '#ffc9b8', exp: 1.15, stars: 0.35, night: 0.6 },
  { h: 6.6, sun: '#ffa86e', sunI: 1.3, sky: '#a9b8e8', gnd: '#5e5048', amb: 0.62, top: '#4c74c8', bot: '#ffc39a', tint: '#fff0e2', exp: 1.0, stars: 0, night: 0.12 },
  { h: 8.5, sun: '#fff0d4', sunI: 2.0, sky: '#bcd6ff', gnd: '#6a6650', amb: 0.68, top: '#4f8fe6', bot: '#cde6ff', tint: '#ffffff', exp: 1.0, stars: 0, night: 0 },
  { h: 12, sun: '#fffaf0', sunI: 2.25, sky: '#c4dbff', gnd: '#6e6a52', amb: 0.72, top: '#4489e8', bot: '#d2eaff', tint: '#ffffff', exp: 1.0, stars: 0, night: 0 },
  { h: 16, sun: '#ffeccc', sunI: 2.1, sky: '#c2d6f6', gnd: '#6e6450', amb: 0.68, top: '#4a86e0', bot: '#d8e6f8', tint: '#fffaf2', exp: 1.0, stars: 0, night: 0 },
  { h: 18.1, sun: '#ffb46a', sunI: 1.7, sky: '#c4a9c6', gnd: '#6a4c3c', amb: 0.6, top: '#5a72c2', bot: '#ffb98c', tint: '#ffe6cc', exp: 1.0, stars: 0, night: 0.05 },
  { h: 19.1, sun: '#ff7444', sunI: 0.5, sky: '#7c6a9e', gnd: '#3c2c35', amb: 0.55, top: '#2d3678', bot: '#ff8c68', tint: '#ffc4b4', exp: 1.08, stars: 0.15, night: 0.45 },
  { h: 20.3, sun: '#000000', sunI: 0, sky: '#3e4884', gnd: '#20233a', amb: 0.62, top: '#0d1232', bot: '#373c78', tint: '#a0b0ff', exp: 1.25, stars: 0.8, night: 0.92 },
  { h: 24, sun: '#000000', sunI: 0, sky: '#3a4a86', gnd: '#1c2033', amb: 0.68, top: '#060815', bot: '#162050', tint: '#9fb2ff', exp: 1.35, stars: 1, night: 1 },
];
const FIELDS_C = ['sun', 'sky', 'gnd', 'top', 'bot', 'tint'];
const FIELDS_N = ['sunI', 'amb', 'exp', 'stars', 'night'];
const KEYS = RAW.map((k) => {
  const o = { h: k.h };
  FIELDS_C.forEach((f) => (o[f] = new THREE.Color(k[f])));
  FIELDS_N.forEach((f) => (o[f] = k[f]));
  return o;
});

const C = (hex) => new THREE.Color(hex);
const PAL = {
  moon: C('#9fb4ff'),
  overTopDay: C('#7f8a9c'), overBotDay: C('#b8c0cc'),
  overTopNight: C('#0c0e16'), overBotNight: C('#20242f'),
  overSkyDay: C('#9aa4b4'), overSkyNight: C('#2a3040'),
  fogDay: C('#d3d8df'), fogNight: C('#2a3042'),
  grade: C('#dfe5ee'),
  white: C('#f4f6fb'), rainGrey: C('#a3abba'), stormGrey: C('#5f6676'),
  rainDay: C('#c3d0e2'), rainNight: C('#4a5778'),
};
const MOON_DIR = new THREE.Vector3(Math.sin(-0.35) * Math.cos(0.87), Math.sin(0.87), Math.cos(-0.35) * Math.cos(0.87)).normalize();

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function sampleKeys(h, out) {
  h = ((h % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && h >= KEYS[i + 1].h) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  let t = (h - a.h) / (b.h - a.h);
  t = t * t * (3 - 2 * t);
  FIELDS_C.forEach((f) => out[f].lerpColors(a[f], b[f], t));
  FIELDS_N.forEach((f) => (out[f] = a[f] + (b[f] - a[f]) * t));
  return out;
}

// The sun sweeps across the front of the default view: morning light from the left,
// midday from the front, golden hour from the right, so the faces you see stay lit.
function sunDirection(h, out) {
  const t = THREE.MathUtils.clamp((h - 6.0) / (19.4 - 6.0), 0, 1);
  const el = THREE.MathUtils.degToRad(5 + Math.sin(Math.PI * t) * 50);
  const az = THREE.MathUtils.degToRad(-50 + 190 * t);
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
}

/**
 * Time of day, weather and everything they drive: key light (sun or moon), ambient, sky,
 * rain, splashes, snow (with settling), clouds, fireflies, lightning, lamps.
 * Change things with setWeather(name) and goToHour(h); both animate on camera.
 */
export class Environment {
  constructor() {
    this.hour = 10;
    this.cycle = false;
    this.dayLength = 150;
    this.tween = null;
    this.weather = 'clear';
    this.target = { ...WEATHER.clear };
    this.cur = { ...WEATHER.clear };
    this.wet = 0;
    this.snowCover = 0;
    this.lamps = 0;
    this.lampsOverride = null;
    this.flash = 0;
    this._flash2 = 0;
    this.fireflies = 0;
    this.night = 0;
    this.daylight = 1;
    this.time = 0;
    this.nextBolt = 2;
    this.onThunder = null;
    this.windDir = new THREE.Vector2(0.85, 0.53).normalize();
    this.center = new THREE.Vector3();
    this.k = { sun: new THREE.Color(), sky: new THREE.Color(), gnd: new THREE.Color(), top: new THREE.Color(), bot: new THREE.Color(), tint: new THREE.Color(), sunI: 0, amb: 0, exp: 1, stars: 0, night: 0 };
    this.post = { skyTop: new THREE.Color(), skyBottom: new THREE.Color(), stars: 0, fog: 0, fogColor: new THREE.Color(), flash: 0, tint: new THREE.Color(1, 1, 1), exposure: 1, milky: 0, aurora: 0, moon: 0, moonPos: new THREE.Vector2(0.82, 0.8) };
    // per-scene sky extras (set from the scene's `sky`), plus a live aurora switch scenes can flip
    this.sky = { milky: 0, aurora: 0, moon: 0.9, moonPos: [0.82, 0.8] };
    this.auroraOn = false;
    this._aurora = 0;

    this.key = new THREE.DirectionalLight('#ffffff', 2);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0006;
    this.key.shadow.normalBias = 0.04;
    this.hemi = new THREE.HemisphereLight('#c4dbff', '#6e6a52', 0.7);
    this.group = new THREE.Group();
    this.group.add(this.key, this.key.target, this.hemi);
    this.fx = null;
    this._v = new THREE.Vector3();
    this._c1 = new THREE.Color();
    this._c2 = new THREE.Color();
  }

  /**
   * info: { size, top, bottom, surfaceAt(x, z), isLand(x, z),
   *         weather?: { cx, cz, w, d, top, bottom, snowScale, splash } }
   * `weather` limits rain, splashes and snow to a box (e.g. outside a window).
   */
  attach(scene, info) {
    this.info = info;
    scene.add(this.group);
    if (this.fx) {
      this.group.remove(this.fx.group);
      this.fx.dispose();
    }
    this.fx = buildFX(info);
    this.group.add(this.fx.group);
    const s = info.size * 0.8;
    Object.assign(this.key.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 90 });
    this.key.shadow.camera.updateProjectionMatrix();
  }

  setWeather(name, instant = false) {
    if (!WEATHER[name]) return;
    this.weather = name;
    this.target = { ...WEATHER[name] };
    if (instant) {
      this._snap = true;
      this.cur = { ...this.target };
      this.wet = this.cur.rain > 0.15 ? 1 : 0;
      this.snowCover = this.cur.snow > 0.2 ? 1 : 0;
    }
  }

  setHour(h) {
    this.tween = null;
    this.hour = ((h % 24) + 24) % 24;
    this._snap = true; // jumps (not animated changes) put the lamps straight into the right state
  }

  /** Runs the clock forward to hour h, so dusk passes on camera on the way to night. */
  goToHour(h, secs = 2.8) {
    const from = this.hour;
    const dist = (((h - from) % 24) + 24) % 24;
    if (dist < 0.02) return;
    this.tween = { from, dist, t: 0, dur: Math.max(0.4, secs * (0.45 + dist / 24)) };
  }

  update(dt) {
    this.time += dt;
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const e = tw.t < 0.5 ? 4 * tw.t ** 3 : 1 - (-2 * tw.t + 2) ** 3 / 2;
      this.hour = (tw.from + tw.dist * e) % 24;
      if (tw.t >= 1) this.tween = null;
    } else if (this.cycle) {
      this.hour = (this.hour + (dt * 24) / this.dayLength) % 24;
    }

    const W = this.cur, T = this.target;
    const kw = 1 - Math.exp(-dt * 0.9);
    for (const key in T) W[key] += (T[key] - W[key]) * kw;
    const raining = W.rain > 0.15;
    this.wet += ((raining ? 1 : 0) - this.wet) * (1 - Math.exp(-dt * (raining ? 0.6 : 0.12)));
    if (W.snow > 0.2) this.snowCover = Math.min(1, this.snowCover + dt * 0.11 * W.snow);
    else this.snowCover = Math.max(0, this.snowCover - dt * 0.05);

    const k = sampleKeys(this.hour, this.k);
    this.night = k.night;
    this.daylight = 1 - k.night;

    // key light: the sun by day, the moon by night (both fade out around the swap)
    const cover = (0.55 + 0.3 * W.rain + 0.1 * W.storm) * W.clouds;
    const sunI = k.sunI * (1 - cover) * (1 - 0.35 * W.fog);
    const moonI = 0.65 * smooth(0.55, 0.95, k.night) * (1 - 0.85 * W.clouds);
    const useSun = k.sunI > 0.02;
    const dir = useSun ? sunDirection(this.hour, this._v) : this._v.copy(MOON_DIR);
    this.key.position.copy(this.center).addScaledVector(dir, 40);
    this.key.target.position.copy(this.center);
    this.key.color.copy(useSun ? k.sun : PAL.moon);
    this.key.intensity = useSun ? sunI : moonI;

    this._c1.lerpColors(PAL.overSkyDay, PAL.overSkyNight, k.night);
    this.hemi.color.copy(k.sky).lerp(this._c1, W.clouds * 0.6);
    this.hemi.groundColor.copy(k.gnd);
    this.hemi.intensity = k.amb * (1 + 0.35 * W.clouds + 0.25 * W.snow) * (1 - 0.3 * W.storm) + this.flash * 1.6;

    // lightning
    if (W.storm > 0.6) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.flash = 1;
        this._flash2 = 0.12 + Math.random() * 0.1;
        this.nextBolt = 3.5 + Math.random() * 7;
        this.onThunder?.(0.35 + Math.random() * 1.4, 0.6 + Math.random() * 0.4);
        this.fx?.bolt();
      }
    }
    if (this._flash2 > 0) {
      this._flash2 -= dt;
      if (this._flash2 <= 0) this.flash = Math.max(this.flash, 0.75);
    }
    this.flash *= Math.exp(-dt * 10);

    // lamps come on at dusk, and earlier under heavy cloud
    const dark = k.night + W.clouds * 0.22 + W.storm * 0.2 + W.fog * 0.15;
    const lampT = this.lampsOverride ?? smooth(0.3, 0.6, dark);
    this.lamps = this._snap ? lampT : this.lamps + (lampT - this.lamps) * (1 - Math.exp(-dt * 2.2));
    this._snap = false;
    this.fireflies = k.night * (1 - W.rain) * (1 - W.snow) * (1 - W.storm) * (1 - 0.6 * W.fog);

    // post (sky, fog, grade)
    const P = this.post;
    this._c1.lerpColors(PAL.overTopDay, PAL.overTopNight, k.night);
    this._c2.lerpColors(PAL.overBotDay, PAL.overBotNight, k.night);
    P.skyTop.copy(k.top).lerp(this._c1, W.clouds * 0.85).multiplyScalar(1 - 0.35 * W.storm);
    P.skyBottom.copy(k.bot).lerp(this._c2, W.clouds * 0.85).multiplyScalar(1 - 0.3 * W.storm);
    P.stars = k.stars * (1 - W.clouds) * (1 - W.fog);
    P.fog = W.fog * 0.8;
    this._c1.lerpColors(PAL.fogDay, PAL.fogNight, k.night);
    P.fogColor.copy(P.skyBottom).lerp(this._c1, 0.75);
    P.flash = this.flash;
    P.tint.copy(k.tint).lerp(PAL.grade, W.clouds * 0.45);
    P.exposure = k.exp;
    const clearSky = (1 - W.clouds * 0.9) * (1 - W.fog);
    P.milky = (this.sky.milky || 0) * k.stars * clearSky;
    this._aurora += ((this.auroraOn || this.sky.aurora > 0 ? 1 : 0) - this._aurora) * (1 - Math.exp(-dt * 0.8));
    P.aurora = this._aurora * Math.max(this.sky.aurora || 0, this.auroraOn ? 1 : 0) * smooth(0.5, 0.9, k.night) * clearSky;
    P.moon = (this.sky.moon ?? 0) * smooth(0.45, 0.85, k.night) * (1 - W.clouds * 0.95) * (1 - W.fog * 0.8);
    P.moonPos.fromArray(this.sky.moonPos || [0.82, 0.8]);
    shared.uSkyRefl.value.copy(P.skyBottom).lerp(P.skyTop, 0.35);

    // shared material uniforms
    shared.uTime.value = this.time;
    shared.uWind.value.set(this.windDir.x, 0, this.windDir.y);
    shared.uWindStrength.value = W.wind;
    shared.uSnow.value = this.snowCover;
    shared.uWet.value = this.wet;
    shared.uRain.value = W.rain;
    shared.uCloudShadow.value = W.clouds * (1 - k.night) * 0.6;
    shared.uCloudOffset.value.x -= this.windDir.x * dt * (0.02 + W.wind * 0.06);
    shared.uCloudOffset.value.y -= this.windDir.y * dt * (0.02 + W.wind * 0.06);
    shared.uLamps.value = this.lamps;
    shared.uDaylight.value = this.daylight;
    shared.uGlint.value.copy(k.sun).multiplyScalar(k.sunI * (1 - W.clouds) * 0.9);

    this.fx?.update(this, dt);
  }
}

// ---------------------------------------------------------------- weather effects

const RAIN_VERT = /* glsl */`
uniform float uTime;
uniform vec3 uWind;
uniform float uWindStrength;
uniform float uAmount;
uniform vec2 uArea;
uniform vec2 uCenter;
uniform float uTop;
uniform float uBottom;
uniform float uLen;
attribute vec4 aSeed;
attribute float aEnd;
varying float vOn;
void main() {
  float span = uTop - uBottom;
  float speed = 10.0 + aSeed.z * 5.0;
  float y = uTop - mod(uTime * speed + aSeed.w * 131.7, span);
  vec2 slant = uWind.xz * (0.15 + uWindStrength * 0.55);
  vec3 p = vec3(uCenter.x + (aSeed.x - 0.5) * uArea.x, y, uCenter.y + (aSeed.y - 0.5) * uArea.y);
  p.xz += slant * ((uTop - y) - span * 0.5) * 0.25;
  vec3 v = normalize(vec3(slant.x * 0.25, -1.0, slant.y * 0.25));
  p -= v * uLen * aEnd;
  vOn = step(fract(aSeed.w * 7.31), uAmount);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;
const RAIN_FRAG = /* glsl */`
uniform vec3 uColor;
varying float vOn;
void main() {
  if (vOn < 0.5) discard;
  gl_FragColor = vec4(uColor, 0.36);
  gNormal = vec4(0.0);
}
`;
const SPLASH_VERT = /* glsl */`
uniform float uTime;
uniform float uAmount;
attribute vec3 aSeed;
varying float vOn;
varying float vT;
void main() {
  float t = fract(uTime * (1.2 + aSeed.y * 1.3) + aSeed.x);
  vT = t;
  vOn = step(aSeed.z, uAmount) * step(t, 0.16);
  gl_PointSize = t < 0.08 ? 1.0 : 2.0;
  gl_Position = projectionMatrix * viewMatrix * vec4(position + vec3(0.0, t * 0.12, 0.0), 1.0);
}
`;
const SPLASH_FRAG = /* glsl */`
uniform vec3 uColor;
varying float vOn;
varying float vT;
void main() {
  if (vOn < 0.5) discard;
  gl_FragColor = vec4(uColor, 0.8 - vT * 2.5);
  gNormal = vec4(0.0);
}
`;
const SNOW_VERT = /* glsl */`
uniform float uTime;
uniform vec3 uWind;
uniform float uWindStrength;
uniform float uAmount;
uniform vec2 uArea;
uniform vec2 uCenter;
uniform float uTop;
uniform float uBottom;
attribute vec4 aSeed;
varying float vOn;
void main() {
  float span = uTop - uBottom;
  float speed = 0.8 + aSeed.z * 0.7;
  float y = uTop - mod(uTime * speed + aSeed.w * 53.0, span);
  float fall = uTop - y;
  vec3 p = vec3(uCenter.x + (aSeed.x - 0.5) * uArea.x, y, uCenter.y + (aSeed.y - 0.5) * uArea.y);
  p.x += sin(uTime * (0.7 + aSeed.z) + aSeed.x * 40.0) * 0.35 + uWind.x * uWindStrength * (fall - span * 0.5) * 0.2;
  p.z += cos(uTime * (0.6 + aSeed.w) + aSeed.y * 40.0) * 0.35 + uWind.z * uWindStrength * (fall - span * 0.5) * 0.2;
  vOn = step(fract(aSeed.w * 7.13), uAmount);
  gl_PointSize = aSeed.z > 0.82 ? 2.0 : 1.0;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;
const SNOW_FRAG = /* glsl */`
uniform vec3 uColor;
varying float vOn;
void main() {
  if (vOn < 0.5) discard;
  gl_FragColor = vec4(uColor, 0.95);
  gNormal = vec4(0.0);
}
`;
const FLY_VERT = /* glsl */`
uniform float uTime;
uniform float uAmount;
attribute vec4 aSeed;
varying float vA;
void main() {
  vec3 p = position;
  p.x += sin(uTime * 0.5 + aSeed.x * 30.0) * 0.6 + sin(uTime * 1.3 + aSeed.y * 20.0) * 0.2;
  p.y += sin(uTime * 0.8 + aSeed.z * 25.0) * 0.35;
  p.z += cos(uTime * 0.45 + aSeed.y * 30.0) * 0.6;
  float blink = smoothstep(0.1, 1.0, sin(uTime * (1.4 + aSeed.w * 2.0) + aSeed.x * 50.0));
  vA = blink * uAmount;
  gl_PointSize = 1.0;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;
const FLY_FRAG = /* glsl */`
varying float vA;
void main() {
  if (vA < 0.02) discard;
  gl_FragColor = vec4(vec3(1.0, 0.92, 0.45) * 7.0 * vA, 1.0);
  gNormal = vec4(0.0);
}
`;

const BOLT_VERT = /* glsl */`
void main() { gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }
`;
const BOLT_FRAG = /* glsl */`
uniform float uOn;
void main() {
  if (uOn < 0.05) discard;
  gl_FragColor = vec4(vec3(0.85, 0.82, 1.0) * 9.0 * uOn, 1.0);
  gNormal = vec4(0.0);
}
`;

function points(count, seedSize, posFn) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count * seedSize);
  for (let i = 0; i < count; i++) {
    if (posFn) pos.set(posFn(i), i * 3);
    for (let j = 0; j < seedSize; j++) seed[i * seedSize + j] = Math.random();
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, seedSize));
  return g;
}

function cloudGeometry(rand) {
  const parts = [];
  const n = 4 + Math.floor(rand() * 4);
  for (let i = 0; i < n; i++) {
    const r = 0.45 + rand() * 0.55;
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.scale(1, 0.72, 1);
    g.translate((i - n / 2) * 0.58 + (rand() - 0.5) * 0.3, (rand() - 0.3) * 0.25 + r * 0.2, (rand() - 0.5) * 0.6);
    parts.push(g);
  }
  const merged = mergeGeometries(parts, false);
  const pos = merged.attributes.position;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0) pos.setY(i, pos.getY(i) * 0.3);
  return merged;
}

function buildFX(info) {
  const group = new THREE.Group();
  const S = info.size;
  const box = { cx: 0, cz: 0, w: S, d: S, top: info.top + 7, bottom: info.bottom, snowScale: 1.7, splash: true, ...(info.weather || {}) };
  const disposables = [];
  const add = (obj) => {
    obj.frustumCulled = false;
    group.add(obj);
    disposables.push(obj.geometry, obj.material);
    return obj;
  };
  const sh = { uTime: shared.uTime, uWind: shared.uWind, uWindStrength: shared.uWindStrength };

  // rain: short streaks, one segment per drop
  const N = 2200;
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3));
  const rs = new Float32Array(N * 8), re = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const s = [Math.random(), Math.random(), Math.random(), Math.random()];
    rs.set(s, i * 8);
    rs.set(s, i * 8 + 4);
    re[i * 2 + 1] = 1;
  }
  rg.setAttribute('aSeed', new THREE.BufferAttribute(rs, 4));
  rg.setAttribute('aEnd', new THREE.BufferAttribute(re, 1));
  const rainMat = fxMaterial({
    vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG,
    uniforms: { ...sh, uAmount: { value: 0 }, uColor: { value: new THREE.Color() }, uArea: { value: new THREE.Vector2(box.w, box.d) }, uCenter: { value: new THREE.Vector2(box.cx, box.cz) }, uTop: { value: box.top }, uBottom: { value: box.bottom }, uLen: { value: 0.2 } },
  });
  const rain = add(new THREE.LineSegments(rg, rainMat));

  // splashes where drops land
  const M = box.splash ? 520 : 1;
  const splashGeo = points(M, 3, () => {
    const x = box.cx + (Math.random() - 0.5) * box.w * 0.98, z = box.cz + (Math.random() - 0.5) * box.d * 0.98;
    return box.splash ? [x, info.surfaceAt(x, z) + 0.03, z] : [0, -999, 0];
  });
  const splashMat = fxMaterial({ vertexShader: SPLASH_VERT, fragmentShader: SPLASH_FRAG, uniforms: { uTime: shared.uTime, uAmount: { value: 0 }, uColor: { value: new THREE.Color() } } });
  const splash = add(new THREE.Points(splashGeo, splashMat));

  // snow, falling around the island as well as on it
  const snowGeo = points(2200, 4);
  const snowMat = fxMaterial({
    vertexShader: SNOW_VERT, fragmentShader: SNOW_FRAG,
    uniforms: { ...sh, uAmount: { value: 0 }, uColor: { value: new THREE.Color() }, uArea: { value: new THREE.Vector2(box.w * box.snowScale, box.d * box.snowScale) }, uCenter: { value: new THREE.Vector2(box.cx, box.cz) }, uTop: { value: box.top + (info.weather ? 0 : 1) }, uBottom: { value: box.bottom - (info.weather ? 0 : 3) } },
  });
  const snow = add(new THREE.Points(snowGeo, snowMat));

  // fireflies over land
  const flyGeo = points(70, 4, () => {
    for (let tries = 0; tries < 40; tries++) {
      const x = (Math.random() - 0.5) * S * 0.9, z = (Math.random() - 0.5) * S * 0.9;
      if (!info.isLand || info.isLand(x, z)) return [x, info.surfaceAt(x, z) + 0.3 + Math.random() * 1.3, z];
    }
    return [0, -999, 0]; // no land found: park it out of view instead of stacking at the centre
  });
  const flyMat = fxMaterial({ vertexShader: FLY_VERT, fragmentShader: FLY_FRAG, uniforms: { uTime: shared.uTime, uAmount: { value: 0 } }, blending: THREE.AdditiveBlending });
  const flies = add(new THREE.Points(flyGeo, flyMat));

  // lightning bolt: a jagged HDR line regenerated on each strike
  const boltPos = new Float32Array(60 * 6);
  const boltGeo = new THREE.BufferGeometry();
  boltGeo.setAttribute('position', new THREE.BufferAttribute(boltPos, 3));
  const boltMat = fxMaterial({ vertexShader: BOLT_VERT, fragmentShader: BOLT_FRAG, uniforms: { uOn: { value: 0 } }, blending: THREE.AdditiveBlending });
  const bolt = add(new THREE.LineSegments(boltGeo, boltMat));
  bolt.visible = false;
  let boltT = 0;
  const strike = () => {
    let n = 0;
    const seg = (a, b) => {
      if (n >= 60) return;
      boltPos.set([a.x, a.y, a.z, b.x, b.y, b.z], n * 6);
      n++;
    };
    const ang = Math.random() * Math.PI * 2, rad = S * (0.15 + Math.random() * 0.35);
    const gx = box.cx + Math.cos(ang) * rad * (box.w / S), gz = box.cz + Math.sin(ang) * rad * (box.d / S);
    const gy = info.surfaceAt(gx, gz);
    const top = new THREE.Vector3(gx + (Math.random() - 0.5) * 3, info.top + 9, gz + (Math.random() - 0.5) * 3);
    const steps = 16;
    let prev = top.clone();
    const main = [];
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const p = new THREE.Vector3(top.x + (gx - top.x) * t + (Math.random() - 0.5) * 0.9 * (1 - t * 0.6), top.y + (gy - top.y) * t, top.z + (gz - top.z) * t + (Math.random() - 0.5) * 0.9 * (1 - t * 0.6));
      seg(prev, p);
      main.push(p);
      prev = p;
    }
    for (let b = 0; b < 3; b++) {
      let q = main[2 + Math.floor(Math.random() * 8)].clone();
      const dir = new THREE.Vector3((Math.random() - 0.5) * 1.2, -0.7 - Math.random() * 0.4, (Math.random() - 0.5) * 1.2);
      for (let i = 0; i < 4; i++) {
        const r2 = q.clone().addScaledVector(dir, 0.55).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4));
        seg(q, r2);
        q = r2;
      }
    }
    boltPos.fill(0, n * 6);
    boltGeo.attributes.position.needsUpdate = true;
    boltGeo.setDrawRange(0, n * 2);
    boltT = 0.32;
  };

  // clouds drifting behind and around the island
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const cloudMat = toon('#f4f6fb', { noise: 0.04, snow: 0, wet: 0 });
  disposables.push(cloudMat);
  const clouds = [];
  const K = 9;
  for (let i = 0; i < K; i++) {
    const geo = cloudGeometry(rand);
    disposables.push(geo);
    const mesh = new THREE.Mesh(geo, cloudMat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
    clouds.push({
      mesh,
      a: THREE.MathUtils.degToRad(225 + (i / (K - 1) - 0.5) * 200 + (rand() - 0.5) * 12),
      r: S * (0.66 + rand() * 0.24),
      y: info.top + 1.5 + rand() * 2.8,
      size: 0.9 + rand() * 0.8,
      th: 0.04 + ((i * 5) % K) / K * 0.75,
      ph: rand() * 10,
      s: 0,
    });
  }

  return {
    group,
    bolt: strike,
    dispose() { disposables.forEach((d) => d.dispose()); },
    update(env, dt) {
      const W = env.cur;
      boltT = Math.max(0, boltT - dt);
      bolt.visible = boltT > 0;
      boltMat.uniforms.uOn.value = boltT > 0 ? Math.min(1, env.flash * 1.3) * (0.6 + 0.4 * Math.sin(boltT * 90)) : 0;
      rain.visible = W.rain > 0.01;
      rainMat.uniforms.uAmount.value = W.rain;
      rainMat.uniforms.uColor.value.lerpColors(PAL.rainNight, PAL.rainDay, env.daylight);
      splash.visible = W.rain > 0.01;
      splashMat.uniforms.uAmount.value = W.rain;
      splashMat.uniforms.uColor.value.lerpColors(PAL.rainNight, PAL.rainDay, env.daylight);
      snow.visible = W.snow > 0.01;
      snowMat.uniforms.uAmount.value = W.snow;
      snowMat.uniforms.uColor.value.setScalar(0.35 + 0.65 * env.daylight).add(env.post.skyBottom.clone().multiplyScalar(0.1));
      flies.visible = env.fireflies > 0.01;
      flyMat.uniforms.uAmount.value = env.fireflies;
      cloudMat.color.copy(PAL.white).lerp(PAL.rainGrey, Math.min(1, W.rain * 0.8 + W.snow * 0.3)).lerp(PAL.stormGrey, W.storm * 0.8);
      for (const c of clouds) {
        const want = W.clouds > c.th ? 1 : 0;
        c.s += (want - c.s) * (1 - Math.exp(-dt * 1.2));
        c.mesh.visible = c.s > 0.02;
        c.mesh.scale.setScalar(c.size * Math.max(c.s, 0.001));
        const a = c.a + Math.sin(env.time * 0.04 + c.ph) * 0.18;
        c.mesh.position.set(Math.cos(a) * c.r, c.y + Math.sin(env.time * 0.3 + c.ph) * 0.05, Math.sin(a) * c.r);
      }
    },
  };
}
