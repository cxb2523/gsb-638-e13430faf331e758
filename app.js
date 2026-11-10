import * as THREE from 'three';
import GUI from 'lil-gui';
import { PixelEngine, defaultLook, LOOK_PRESETS, QUANTIZE } from './engine/pixel-engine.js';
import { Environment, TIME_PRESETS, WEATHER } from './engine/environment.js';
import { Ambience } from './engine/audio.js';
import { PALETTES } from './engine/palettes.js';
import { Recorder, download, stamp, toStandardMp4 } from './engine/recorder.js';
import { renderClip } from './engine/exporter.js';
import { disposeTree } from './scenes/kit.js';
import Cove from './scenes/cove.js';
import Streetcar from './scenes/streetcar.js';
import Studio from './scenes/studio.js';
import Ferry from './scenes/ferry.js';
import Campsite from './scenes/campsite.js';
import Lookout from './scenes/lookout.js';
import Motel from './scenes/motel.js';
import Alpine from './scenes/alpine.js';

const SCENES = { Streetcar, Studio, Ferry, Campsite, Lookout, Motel, Alpine, Cove };
// Local-only scenes: scenes/private/ is git-ignored and never published. Its index.js may export
// { scenes: { Name: def }, clips: { Name: storyboard } }. Only tried on localhost, so the public demo never asks for it.
let LOCAL = null;
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
  try {
    LOCAL = await import('./scenes/private/index.js');
    Object.assign(SCENES, LOCAL.scenes || {});
  } catch (e) {
    console.info('No local scenes loaded', e?.message || e);
  }
}
const params = new URLSearchParams(location.search);
// ?scene=Name opens a scene, ?clean=1 ignores and never writes saved settings (for testing)
const CLEAN = params.has('clean');
const STAGES = {
  '16:9 · 1920×1080': [1920, 1080],
  '4:5 · 1080×1350': [1080, 1350],
  '1:1 · 1080×1080': [1080, 1080],
  '9:16 · 1080×1920': [1080, 1920],
};
const STORE = 'noxe-pixel-engine/v1';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------------------------------------------------------------- state
const app = { scene: 'Alpine', stage: '16:9 · 1920×1080', paused: false, timeScale: 1, recordSeconds: 12, sound: false, volume: 0.6, hud: true, cursor: false, panel: true, clipSound: true };
const store = { looks: {}, views: {} };
try {
  const saved = CLEAN ? null : JSON.parse(localStorage.getItem(STORE) || 'null');
  if (saved) {
    Object.assign(app, saved.app || {}, { paused: false, sound: false });
    Object.assign(store, { looks: saved.looks || {}, views: saved.views || {} });
  }
} catch (e) { /* ignore */ }
if (params.get('scene') && SCENES[params.get('scene')]) app.scene = params.get('scene');
if (!SCENES[app.scene]) app.scene = Object.keys(SCENES)[0];
if (!STAGES[app.stage]) app.stage = Object.keys(STAGES)[0];
const save = () => { if (!CLEAN) localStorage.setItem(STORE, JSON.stringify({ app, ...store })); };

const stageEl = document.getElementById('stage');
const canvas = document.getElementById('c');
const engine = new PixelEngine(canvas);
const env = new Environment();
const audio = new Ambience();
const recorder = new Recorder();
env.onThunder = (delay, power) => audio.thunder(delay, power);
audio.setVolume(app.volume);

// ---------------------------------------------------------------- stage
// phones and narrow windows: the stage takes the full width and the panel floats over it, folded
const narrow = () => window.innerWidth < 900;
// touch screens in portrait get the full-screen layout: the scene fills the screen and the controls float at the
// bottom (?phone=1 forces it, for testing on a computer)
const COARSE = window.matchMedia('(pointer: coarse)');
const phone = () => (COARSE.matches || params.has('phone')) && window.innerWidth < 900 && window.innerHeight > window.innerWidth;
let phoneMode = false;
// the diorama sits a little high, clear of the control bar
const PHONE = { fill: 0.92, fillY: 0.62, lift: 0.08 };
function fitPhone() {
  const vw = window.innerWidth, vh = window.innerHeight, dpr = Math.min(3, window.devicePixelRatio || 1);
  // about one art pixel per CSS pixel: the same detail as the square and portrait exports
  const ps = Math.max(2, Math.round(dpr));
  const w = Math.round((vw * dpr) / ps) * ps, h = Math.round((vh * dpr) / ps) * ps;
  if (!phoneMode) {
    phoneMode = true;
    document.body.classList.add('phone');
  }
  Object.assign(stageEl.style, { width: `${vw}px`, height: `${vh}px`, marginRight: '0' });
  if (engine.out.w !== w || engine.out.h !== h) engine.setOutput(w, h);
  if (engine.look.pixelSize !== ps) {
    engine.look.pixelSize = ps;
    engine.applyLook();
  }
  if (world) {
    resetView(store.views[app.scene]);
    fitView(PHONE, 'phone');
  }
  fitHud();
}
function leavePhone() {
  phoneMode = false;
  document.body.classList.remove('phone', 'menu-open');
  engine.setOutput(...STAGES[app.stage]);
  engine.look.pixelSize = { ...defaultLook(), ...(def?.look || {}), ...(store.looks[app.scene] || {}) }.pixelSize;
  engine.applyLook();
  if (def) resetView(store.views[app.scene]);
}
function fitStage() {
  if (phone()) return fitPhone();
  if (phoneMode) leavePhone();
  const [w, h] = STAGES[app.stage];
  const panelW = app.panel && gui && !narrow() ? 300 : 0;
  const pad = narrow() ? 12 : 40;
  const aw = window.innerWidth - panelW - pad, ah = window.innerHeight - pad;
  const s = Math.min(aw / w, ah / h);
  stageEl.style.width = `${Math.floor(w * s)}px`;
  stageEl.style.height = `${Math.floor(h * s)}px`;
  stageEl.style.marginRight = `${panelW}px`;
  fitHud();
}
// the control bar scales down to fit narrow stages (it never grows past its CSS size)
function fitHud() {
  const hud = document.getElementById('hud');
  if (!hud) return;
  if (phoneMode) {
    hud.style.transform = 'none';
    return;
  }
  hud.style.transform = 'translateX(-50%)';
  const k = Math.min(1, (stageEl.clientWidth * 0.94) / Math.max(1, hud.scrollWidth));
  hud.style.transformOrigin = '50% 100%';
  hud.style.transform = `translateX(-50%) scale(${k})`;
}
document.fonts?.ready?.then(() => fitHud());
function applyStage() {
  const [w, h] = STAGES[app.stage];
  engine.setOutput(w, h);
  fitStage();
  save();
}
window.addEventListener('resize', fitStage);

// ---------------------------------------------------------------- scenes
let hudState = '';
let world = null;
let scene3d = null;
let def = null;

function loadScene(name) {
  if (scene3d) {
    world?.dispose?.();
    disposeTree(world.root);
  }
  app.scene = name;
  def = SCENES[name];
  scene3d = new THREE.Scene();
  env.auroraOn = false;
  env.lampsOverride = null;
  env.sky = { milky: 0, aurora: 0, moon: 0.9, moonPos: [0.82, 0.8], ...(def.sky || {}) };
  if (def.wind) env.windDir.set(def.wind[0], def.wind[1]).normalize();
  world = def.create({ engine, env, audio });
  scene3d.add(world.root);
  env.attach(scene3d, world.info);
  engine.mirror = def.mirror ? { ...def.mirror } : null;
  engine.prepareScene(scene3d);
  audio.loopLevels = {};
  if (audio.loops) for (const L of Object.values(audio.loops)) L.gain.gain.value = 0;
  Object.assign(engine.look, defaultLook(), def.look || {}, store.looks[name] || {});
  engine.applyLook();
  resetView(store.views[name]);
  env.setHour(def.env?.hour ?? 10);
  env.setWeather(def.env?.weather ?? 'clear', true);
  audio.scene = def.audio || {};
  buildGUI();
  buildActions();
  hudState = '';
  save();
}

function resetView(saved) {
  const v = def.view || {};
  Object.assign(engine.view, { size: v.size ?? 16, azimuth: v.azimuth ?? 45, elevation: v.elevation ?? 30, zoom: 1 }, saved || {});
  engine.view.target.fromArray(v.target || [0, 0, 0]);
}

const lookChanged = () => {
  engine.applyLook();
  const base = { ...defaultLook(), ...(def.look || {}) };
  const diff = {};
  for (const k in engine.look) if (engine.look[k] !== base[k]) diff[k] = engine.look[k];
  store.looks[app.scene] = diff;
  save();
};
const viewChanged = () => {
  if (phoneMode) return;
  const { azimuth, elevation, size } = engine.view;
  store.views[app.scene] = { azimuth, elevation, size };
  save();
};

// ---------------------------------------------------------------- time / weather / sound
const setTime = (name) => { logTake('time', name); env.goToHour(TIME_PRESETS[name]); };
const setWeather = (name) => { logTake('weather', name); env.setWeather(name); };
const toggleCycle = () => { env.cycle = !env.cycle; logTake('cycle', env.cycle); };
async function setSound(on) {
  app.sound = on;
  if (on) await audio.start();
  else audio.stop();
  save();
}
const timeName = (h) => (h >= 5 && h < 8.5 ? 'dawn' : h >= 8.5 && h < 17.5 ? 'day' : h >= 17.5 && h < 20.5 ? 'dusk' : 'night');

// ---------------------------------------------------------------- export
let pendingPNG = false;
const recEl = document.getElementById('rec');
const toastEl = document.getElementById('toast');
let toastTimer = 0;
function toast(msg, ms = 2200) {
  toastEl.textContent = msg;
  toastEl.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('on'), ms);
}
async function finishRecording(blob, name, ext) {
  recEl.classList.remove('on');
  document.body.classList.remove('recording');
  if (ext === 'mp4') {
    try { blob = await toStandardMp4(blob); } catch (e) { console.warn('MP4 rewrite failed, saving as recorded', e); }
  }
  download(blob, name);
  toast(ext === 'mp4' ? 'Clip saved as MP4' : 'Saved as WebM. X needs MP4, record in Chrome for MP4');
}
function startTimer() {
  const t0 = performance.now();
  recEl.classList.add('on');
  const tick = () => {
    if (!recorder.active) return;
    recEl.querySelector('span').textContent = ((performance.now() - t0) / 1000).toFixed(1) + 's';
    requestAnimationFrame(tick);
  };
  tick();
}
// Demo storyboards: one click renders each scene's signature moment.
// events: { at: seconds, kind: 'time' | 'weather' | 'action' | 'cycle' | 'hour', arg }
const CLIPS = {
  Streetcar: { seconds: 22, start: { hour: 18.0, weather: 'clear' }, events: [{ at: 1.5, kind: 'hour', arg: [21.6, 12] }, { at: 9.5, kind: 'weather', arg: 'rain' }] },
  Studio: { seconds: 18, start: { hour: 17.6, weather: 'clear' }, events: [{ at: 1, kind: 'hour', arg: [20.6, 9] }, { at: 5, kind: 'weather', arg: 'rain' }, { at: 8, kind: 'action', arg: 0 }, { at: 13, kind: 'action', arg: 2 }] },
  Ferry: { seconds: 20, start: { hour: 18.9, weather: 'clear' }, events: [{ at: 1, kind: 'action', arg: 2 }, { at: 9, kind: 'action', arg: 1 }, { at: 12.5, kind: 'action', arg: 0 }] },
  Campsite: { seconds: 18, start: { hour: 21.5, weather: 'clear' }, events: [{ at: 1.5, kind: 'action', arg: 0 }, { at: 6.5, kind: 'action', arg: 1 }, { at: 12.5, kind: 'action', arg: 2 }] },
  Lookout: { seconds: 18, start: { hour: 18.4, weather: 'clear' }, events: [{ at: 1.5, kind: 'action', arg: 0 }, { at: 14, kind: 'hour', arg: [21.5, 5] }] },
  Motel: { seconds: 16, start: { hour: 19.6, weather: 'clear' }, events: [{ at: 2, kind: 'action', arg: 0 }, { at: 8.5, kind: 'action', arg: 1 }] },
  Alpine: { seconds: 18, start: { hour: 16.9, weather: 'clear' }, events: [{ at: 1.0, kind: 'action', arg: 0 }, { at: 5.2, kind: 'action', arg: 2 }, { at: 11.6, kind: 'action', arg: 1 }, { at: 13.8, kind: 'hour', arg: [21.6, 3.4] }] },
  Cove: { seconds: 16, start: { hour: 17.8, weather: 'clear' }, events: [{ at: 1, kind: 'hour', arg: [21.5, 7] }, { at: 9, kind: 'weather', arg: 'storm' }] },
};
if (LOCAL?.clips) Object.assign(CLIPS, LOCAL.clips);
let exporting = false;
let take = { active: false, t0: 0, events: [], start: null };
function logTake(kind, arg) {
  if (take.active) take.events.push({ at: env.time - take.t0, kind, arg });
}
function replay(e) {
  if (e.kind === 'time') env.goToHour(TIME_PRESETS[e.arg]);
  else if (e.kind === 'weather') env.setWeather(e.arg);
  else if (e.kind === 'action') world?.actions?.[e.arg]?.run(env, audio);
  else if (e.kind === 'cycle') env.cycle = e.arg;
  else if (e.kind === 'hour') env.goToHour(e.arg[0], e.arg[1]);
}
/** Renders a clip offline at a perfect 60 fps from a fresh copy of the scene, with sound, as a standard MP4. */
// Exports for X draw at twice the size with twice the pixel size: the same art, pixel for pixel, as a 4K file.
// X's 1080p copy of it is an exact half, so that copy is the original frame again with every art pixel on
// whole pixels (square and 4:5 also stay whole in X's 720p copy).
const X_SCALE = 2;
function scaleOutput(k) {
  const prev = { w: engine.out.w, h: engine.out.h, ps: engine.look.pixelSize };
  if (k !== 1) {
    engine.setOutput(prev.w * k, prev.h * k);
    engine.look.pixelSize = prev.ps * k;
    engine.applyLook();
  }
  return () => {
    if (k === 1) return;
    engine.setOutput(prev.w, prev.h);
    engine.look.pixelSize = prev.ps;
    engine.applyLook();
  };
}

async function exportClip({ seconds, start, events, name, keep = false, setup }) {
  if (exporting) return null;
  exporting = true;
  document.body.classList.add('recording');
  recEl.classList.add('on');
  const label = recEl.querySelector('span');
  let restore = null;
  try {
    loadScene(app.scene);
    setup?.();
    restore = scaleOutput(X_SCALE);
    env.setHour(start.hour);
    env.setWeather(start.weather, true);
    env.cycle = !!start.cycle;
    const blob = await renderClip({
      canvas, seconds, fps: 60,
      // ~18 Mbps per 1080p worth of pixels, up to 50: X re-encodes everything, so start it from a near-clean file
      bitrate: Math.min(50e6, (18e6 * canvas.width * canvas.height) / (1920 * 1080)),
      audio: app.clipSound ? audio : null,
      script: events.map((e) => ({ at: e.at, run: () => replay(e) })),
      step: (dt) => { env.update(dt); world?.update?.(env.time, dt, env); audio.update(dt, env); },
      render: () => engine.render(scene3d, env),
      onProgress: (p) => { label.textContent = `rendering ${Math.round(p * 100)}%`; },
    });
    if (!keep) download(blob, `${name}.mp4`);
    toast(`Clip ready: ${seconds.toFixed(1)}s, ${canvas.width}×${canvas.height} at 60 fps, MP4 for X`, 3500);
    return blob;
  } catch (e) {
    console.error(e);
    toast('Render failed: ' + e.message, 5000);
    return null;
  } finally {
    restore?.();
    exporting = false;
    document.body.classList.remove('recording');
    recEl.classList.remove('on');
    clock.getDelta();
  }
}
// ---------------------------------------------------------------- formats for X
// 16:9 is the authored frame. Square and portrait render at pixel size 3 (1080 divides cleanly, about the
// same detail as 16:9 at 4) with the camera fitted to the diorama. fill/fillY: share of the frame width/height
// the diorama may take, lift: how far above centre it sits (share of the frame height).
const FORMATS = {
  '16x9': { stage: '16:9 · 1920×1080' },
  '1x1': { stage: '1:1 · 1080×1080', pixelSize: 3, fill: 0.88, fillY: 0.86, lift: 0.015 },
  '4x5': { stage: '4:5 · 1080×1350', pixelSize: 3, fill: 0.88, fillY: 0.8, lift: 0.01 },
};
// per-scene overrides: { fill, fillY, lift, x: [left, right], y: [bottom, top] } with x, y as shares of the 16:9 frame (0 = centre),
// plus optional per-format ones under the format's key ('1x1', '4x5', 'phone')
const FIT = {
  // the cloud sea runs off every edge: frame the summit and let the clouds bleed out. On a phone, crop in so the
  // tall frame never reaches below the cloud deck
  Lookout: { x: [-0.375, 0.36], y: [-0.5, 0.5], fill: 0.96, phone: { x: [-0.26, 0.26], fill: 1, lift: -0.06 } },
};
// hero moment for photos; defaults to the scene's own starting hour and weather
const PHOTOS = {
  Motel: { action: 0, adv: 5 },
};

// Silhouette of the scene's own geometry (no weather, sky or clouds) seen from the camera, in camera units
// around the target. Pieces floating apart from the diorama (parked vehicles, stray props) are ignored, and
// nothing outside the authored 16:9 frame counts.
function measureDiorama() {
  const v = engine.view, cam = engine.camera;
  engine._updateCamera();
  const frameH = v.size / v.zoom, frameW = (frameH * 16) / 9;
  const span = frameW * 1.4, N = 560;
  const mc = new THREE.OrthographicCamera(-span / 2, span / 2, span / 2, -span / 2, cam.near, cam.far);
  mc.position.copy(cam.position);
  mc.quaternion.copy(cam.quaternion);
  mc.layers.enableAll();
  mc.updateProjectionMatrix();
  mc.updateMatrixWorld();
  const rt = new THREE.WebGLRenderTarget(N, N);
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const tmp = new THREE.Scene();
  tmp.overrideMaterial = white;
  const parent = world.root.parent;
  tmp.add(world.root);
  const r = engine.renderer, prevRT = r.getRenderTarget(), prevColor = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
  r.setRenderTarget(rt);
  r.setClearColor(0x000000, 0);
  r.clear();
  r.render(tmp, mc);
  const px = new Uint8Array(N * N * 4);
  r.readRenderTargetPixels(rt, 0, 0, N, N, px);
  r.setRenderTarget(prevRT);
  r.setClearColor(prevColor, prevAlpha);
  parent.add(world.root);
  rt.dispose();
  white.dispose();
  const on = (x, y) => px[(y * N + x) * 4 + 3] > 0;
  // the run of occupied columns (or rows) around the busiest one, bridging gaps under 1% of the span
  const run = (counts) => {
    let best = 0;
    for (let i = 1; i < counts.length; i++) if (counts[i] > counts[best]) best = i;
    const gap = Math.ceil(counts.length * 0.01);
    let a = best, b = best;
    for (let i = best, miss = 0; i >= 0 && miss <= gap; i--) { if (counts[i]) { a = i; miss = 0; } else miss++; }
    for (let i = best, miss = 0; i < counts.length && miss <= gap; i++) { if (counts[i]) { b = i; miss = 0; } else miss++; }
    return [a, b];
  };
  const cols = new Array(N).fill(0);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (on(x, y)) cols[x]++;
  const [xa, xb] = run(cols);
  const rows = new Array(N).fill(0);
  for (let y = 0; y < N; y++) for (let x = xa; x <= xb; x++) if (on(x, y)) rows[y]++;
  const [ya, yb] = run(rows);
  const u = span / N, toCam = (i) => (i - N / 2) * u;
  const cx = (x) => clamp(x, -frameW / 2, frameW / 2), cy = (y) => clamp(y, -frameH / 2, frameH / 2);
  return { x0: cx(toCam(xa)), x1: cx(toCam(xb + 1)), y0: cy(toCam(ya)), y1: cy(toCam(yb + 1)), frameW, frameH };
}

/** Fits the camera so the diorama fills the current output (square and portrait formats). */
function fitView(f, key) {
  const b = measureDiorama(), o = { ...(FIT[app.scene] || {}), ...(FIT[app.scene]?.[key] || {}) };
  const x0 = o.x ? o.x[0] * b.frameW : b.x0, x1 = o.x ? o.x[1] * b.frameW : b.x1;
  const y0 = o.y ? o.y[0] * b.frameH : b.y0, y1 = o.y ? o.y[1] * b.frameH : b.y1;
  const aspect = engine.out.w / engine.out.h;
  const viewH = Math.max((x1 - x0) / (o.fill ?? f.fill) / aspect, (y1 - y0) / (o.fillY ?? f.fillY));
  const cam = engine.camera;
  const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
  engine.view.target.addScaledVector(right, (x0 + x1) / 2).addScaledVector(up, (y0 + y1) / 2 - (o.lift ?? f.lift) * viewH);
  engine.view.size = viewH;
  engine.view.zoom = 1;
  // density: art pixels per world unit compared with the authored 16:9 frame (1 = same detail)
  return { x0, x1, y0, y1, frameW: b.frameW, frameH: b.frameH, viewH, density: engine.low.h / viewH / (270 / b.frameH) };
}

function applyFormat(key) {
  const f = FORMATS[key];
  app.stage = f.stage;
  applyStage();
  if (f.pixelSize) {
    engine.look.pixelSize = f.pixelSize;
    engine.applyLook();
  }
  return f.fill ? fitView(f, key) : null;
}

/** Renders a scene's hero moment in a format and returns a copy of the frame. */
function heroPhoto(name, key, adv, scale = 1) {
  loadScene(name);
  const fit = applyFormat(key);
  const restore = scaleOutput(scale);
  const p = PHOTOS[name] || {};
  env.setHour(p.hour ?? def.env?.hour ?? 10);
  env.setWeather(p.weather ?? def.env?.weather ?? 'clear', true);
  if (p.action != null) world?.actions?.[p.action]?.run(env, audio);
  window.__pixel.advance(adv ?? p.adv ?? 4);
  const c = document.createElement('canvas');
  c.width = canvas.width;
  c.height = canvas.height;
  c.getContext('2d').drawImage(canvas, 0, 0);
  restore();
  return { canvas: c, fit };
}

const actions = {
  demo: () => {
    const c = CLIPS[app.scene];
    if (c) exportClip({ ...c, name: `noxe-pixel-${app.scene.toLowerCase()}-${stamp()}` });
  },
  take: async () => {
    if (exporting) return;
    if (!take.active) {
      const start = { hour: env.hour, weather: env.weather, cycle: env.cycle };
      loadScene(app.scene);
      env.setHour(start.hour);
      env.setWeather(start.weather, true);
      env.cycle = start.cycle;
      take = { active: true, t0: env.time, events: [], start };
      recEl.classList.add('on');
      recEl.querySelector('span').textContent = 'take: play your clip, T to stop';
      toast('Take started. Use the buttons, then press T to stop and render.', 3500);
    } else {
      take.active = false;
      recEl.classList.remove('on');
      const seconds = Math.min(60, Math.max(3, env.time - take.t0));
      await exportClip({ seconds, start: take.start, events: take.events, name: `noxe-pixel-${app.scene.toLowerCase()}-take-${stamp()}` });
    }
  },
  png: () => { pendingPNG = true; },
  clip: async () => {
    if (recorder.active) return recorder.stop();
    if (app.sound && !audio.ctx) await audio.start();
    const stream = recorder.canvasStream(canvas, app.sound ? audio.stream : null);
    recorder.start(stream, app.recordSeconds, `noxe-pixel-${app.scene.toLowerCase()}-${stamp()}`, finishRecording);
    startTimer();
    toast(`Recording ${app.recordSeconds}s${app.sound ? ' with sound' : ''}`);
  },
  clipUI: async () => {
    if (recorder.active) return recorder.stop();
    try {
      const stream = await recorder.tabStream(stageEl);
      document.body.classList.add('recording');
      recorder.start(stream, app.recordSeconds, `noxe-pixel-${app.scene.toLowerCase()}-ui-${stamp()}`, finishRecording);
      startTimer();
      toast('Recording the stage with the panel');
    } catch (e) {
      toast('Tab capture was cancelled or is not available here. Use Chrome, or Cmd+Shift+5');
    }
  },
  copy: async () => {
    await navigator.clipboard.writeText(JSON.stringify({ scene: app.scene, look: engine.look, view: { ...engine.view, target: engine.view.target.toArray() }, hour: env.hour, weather: env.weather }, null, 2));
    toast('Settings copied');
  },
};

// ---------------------------------------------------------------- dev panel
let gui = null;
const lookPreset = { preset: '·' };
function buildGUI() {
  if (gui) gui.destroy();
  gui = new GUI({ title: 'Pixel Engine' });
  const refresh = () => gui.controllersRecursive().forEach((c) => c.updateDisplay());

  const fScene = gui.addFolder('Scene');
  fScene.add(app, 'scene', Object.keys(SCENES)).name('scene').onChange(loadScene);
  fScene.add(app, 'stage', Object.keys(STAGES)).name('output').onChange(applyStage);
  fScene.add(app, 'paused').name('pause (space)').listen();
  fScene.add(app, 'timeScale', 0, 3, 0.05).name('speed');

  const fTime = gui.addFolder('Time');
  fTime.add(env, 'hour', 0, 23.99, 0.01).name('hour').listen().onChange(() => (env.tween = null));
  fTime.add(env, 'cycle').name('let the day run').listen();
  fTime.add(env, 'dayLength', 20, 600, 5).name('day length (s)');

  const fSky = gui.addFolder('Weather');
  fSky.add(env, 'weather', Object.keys(WEATHER)).name('weather').listen().onChange(setWeather);

  const L = engine.look;
  const fLook = gui.addFolder('Look');
  fLook.add(lookPreset, 'preset', ['·', ...Object.keys(LOOK_PRESETS)]).name('preset').onChange((p) => {
    if (LOOK_PRESETS[p]) Object.assign(L, LOOK_PRESETS[p]);
    lookChanged();
    refresh();
  });
  fLook.add(L, 'pixelSize', 2, 8, 1).name('pixel size').onChange(lookChanged);
  fLook.add(L, 'quantize', Object.keys(QUANTIZE)).name('colours').onChange(lookChanged);
  fLook.add(L, 'levels', 3, 32, 1).name('levels').onChange(lookChanged);
  fLook.add(L, 'palette', Object.keys(PALETTES)).name('palette').onChange(lookChanged);
  fLook.add(L, 'dither', 0, 1, 0.01).onChange(lookChanged);
  fLook.add(L, 'outline', 0, 1, 0.01).onChange(lookChanged);
  fLook.add(L, 'highlight', 0, 1, 0.01).name('edge light').onChange(lookChanged);
  fLook.add(L, 'edge', 0.05, 1.5, 0.01).name('outline depth').onChange(lookChanged);
  fLook.add(L, 'bloom', 0, 3, 0.01).name('glow').onChange(lookChanged);
  fLook.add(L, 'bloomThreshold', 0.5, 6, 0.05).name('glow from').onChange(lookChanged);
  fLook.add(L, 'exposure', 0.3, 2.5, 0.01).onChange(lookChanged);
  fLook.add(L, 'contrast', 0.6, 1.6, 0.01).onChange(lookChanged);
  fLook.add(L, 'saturation', 0, 2, 0.01).onChange(lookChanged);
  fLook.add(L, 'vignette', 0, 1, 0.01).onChange(lookChanged);
  fLook.add(L, 'texture', 0, 3, 0.01).name('surface texture').onChange(lookChanged);
  fLook.add({ reset: () => { Object.assign(L, defaultLook(), def.look || {}); lookChanged(); refresh(); } }, 'reset').name('reset look');

  const V = engine.view;
  const fCam = gui.addFolder('Camera');
  fCam.add(V, 'azimuth', -180, 180, 1).listen().onChange(viewChanged);
  fCam.add(V, 'elevation', 10, 80, 0.5).listen().onChange(viewChanged);
  fCam.add(V, 'size', 4, 40, 0.1).name('frame size').listen().onChange(viewChanged);
  fCam.add(V, 'snap').name('pixel snap');
  fCam.add({ reset: () => { resetView(); viewChanged(); } }, 'reset').name('reset camera');
  fCam.close();

  const fSound = gui.addFolder('Sound');
  fSound.add(app, 'sound').name('sound on').listen().onChange(setSound);
  fSound.add(app, 'volume', 0, 1, 0.01).onChange((v) => { audio.setVolume(v); save(); });

  const fOut = gui.addFolder('Export');
  fOut.add(actions, 'demo').name('render demo clip (G)');
  fOut.add(actions, 'take').name('take: play, then render (T)');
  fOut.add(app, 'clipSound').name('sound in clips').onChange(save);
  fOut.add(app, 'recordSeconds', 3, 60, 1).name('live clip seconds').onChange(save);
  fOut.add(actions, 'clip').name('live record (R)');
  fOut.add(actions, 'clipUI').name('record with panel');
  fOut.add(actions, 'png').name('save PNG (P)');
  fOut.add(app, 'hud').name('panel on stage (U)').listen().onChange(syncHud);
  fOut.add(app, 'cursor').name('pixel cursor').listen().onChange(syncCursor);
  fOut.add(actions, 'copy').name('copy settings');

  gui.domElement.style.display = app.panel ? '' : 'none';
  if (narrow() && !document.body.classList.contains('menu-open')) gui.close();
  fitStage();
}

// ---------------------------------------------------------------- on-stage panel (HUD)
const ICONS = {
  dawn: ['.........', '....#....', '.#.....#.', '...###...', '..#####..', '#.#####.#', '.........', '#########', '.........'],
  day: ['....#....', '.#.....#.', '...###...', '..#####..', '#.#####.#', '..#####..', '...###...', '.#.....#.', '....#....'],
  dusk: ['.........', '.........', '...###...', '..#####..', '.#######.', '.........', '#########', '.........', '..#.#.#..'],
  night: ['..####...', '.##......', '##.......', '##.......', '##.......', '##.......', '.##....#.', '..#####..', '.........'],
  clear: ['.........', '...###...', '..#...#..', '.#.....#.', '.#.....#.', '.#.....#.', '..#...#..', '...###...', '.........'],
  cloudy: ['.........', '...###...', '..#####..', '.#######.', '#########', '#########', '.#######.', '.........', '.........'],
  rain: ['...###...', '..#####..', '.#######.', '#########', '.#######.', '.........', '.#..#..#.', '#..#..#..', '.........'],
  storm: ['...###...', '..#####..', '.#######.', '#########', '.###.###.', '....#....', '...##....', '....#....', '...#.....'],
  snow: ['....#....', '.#..#..#.', '..#.#.#..', '...###...', '#########', '...###...', '..#.#.#..', '.#..#..#.', '....#....'],
  fog: ['.........', '#######..', '.........', '..#######', '.........', '#######..', '.........', '..#######', '.........'],
  cycle: ['..#......', '..##.....', '..###....', '..####...', '..#####..', '..####...', '..###....', '..##.....', '..#......'],
  pause: ['.........', '.##...##.', '.##...##.', '.##...##.', '.##...##.', '.##...##.', '.##...##.', '.##...##.', '.........'],
  sound: ['....#....', '...##..#.', '####.#..#', '####..#.#', '####..#.#', '####.#..#', '...##..#.', '....#....', '.........'],
  mute: ['....#....', '...##....', '####.#.#.', '####..#..', '####.#.#.', '####.....', '...##....', '....#....', '.........'],
};
const svg = (rows) => {
  let d = '';
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') d += `M${x} ${y}h1v1h-1z`; }));
  return `<svg viewBox="0 0 9 9" shape-rendering="crispEdges" aria-hidden="true"><path d="${d}" fill="currentColor"/></svg>`;
};
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const hudEl = document.getElementById('hud');
function group(label, keys, onPick) {
  const g = document.createElement('div');
  g.className = 'group';
  g.innerHTML = `<div class="meta"><div class="label">${label}</div><div class="value"></div></div><div class="btns"></div>`;
  const btns = g.querySelector('.btns');
  for (const k of keys) {
    const b = document.createElement('button');
    b.dataset.key = k;
    b.title = cap(k);
    b.innerHTML = svg(ICONS[k]);
    b.addEventListener('click', (e) => { e.stopPropagation(); onPick(k); });
    btns.appendChild(b);
  }
  hudEl.appendChild(g);
  return g;
}
const gTime = group('Time', Object.keys(TIME_PRESETS), setTime);
const gSky = group('Sky', Object.keys(WEATHER), setWeather);
gTime.classList.add('time');
gSky.classList.add('sky');
const gScene = document.createElement('div');
gScene.className = 'group scene';
gScene.innerHTML = `<div class="meta"><div class="label">Scene</div><div class="value"></div></div><div class="btns"></div>`;
hudEl.appendChild(gScene);
const ACTION_KEYS = ['q', 'w', 'e'];
function runAction(i) {
  const a = world?.actions?.[i];
  if (!a) return;
  logTake('action', i);
  a.run(env, audio);
  hudState = '';
}
function buildActions() {
  const acts = world?.actions || [];
  gScene.style.display = acts.length ? '' : 'none';
  gScene.querySelector('.label').textContent = def.actionsLabel || def.name || 'Scene';
  const tab = tabs.querySelector('[data-tab=scene]');
  tab.textContent = def.actionsLabel || def.name || 'Scene';
  tab.style.display = acts.length ? '' : 'none';
  if (!acts.length && hudEl.classList.contains('tab-scene')) pickTab('time');
  const btns = gScene.querySelector('.btns');
  btns.innerHTML = '';
  acts.forEach((a, i) => {
    const b = document.createElement('button');
    b.title = `${a.label} (${ACTION_KEYS[i]?.toUpperCase() || ''})`;
    b.innerHTML = svg(a.icon || ICONS.cycle);
    b.addEventListener('click', (e) => { e.stopPropagation(); runAction(i); });
    btns.appendChild(b);
  });
  fitHud();
}
const tools = document.createElement('div');
tools.className = 'tools';
tools.innerHTML = `<button data-act="cycle" title="Let the day run"></button><button data-act="sound" title="Sound"></button>`;
hudEl.appendChild(tools);
tools.querySelector('[data-act=cycle]').addEventListener('click', (e) => { e.stopPropagation(); toggleCycle(); });
tools.querySelector('[data-act=sound]').addEventListener('click', (e) => { e.stopPropagation(); setSound(!app.sound); });
// phones: tabs pick which group shows in the bar (hidden on larger screens)
const tabs = document.createElement('div');
tabs.className = 'tabs';
tabs.innerHTML = '<button data-tab="time">Time</button><button data-tab="sky">Sky</button><button data-tab="scene">Scene</button>';
hudEl.prepend(tabs);
function pickTab(t) {
  hudEl.classList.remove('tab-time', 'tab-sky', 'tab-scene');
  hudEl.classList.add(`tab-${t}`);
  tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.dataset.tab === t));
}
tabs.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  e.stopPropagation();
  pickTab(b.dataset.tab);
});
pickTab('time');
// phones: the round button in the corner opens the settings panel
document.getElementById('menu')?.addEventListener('click', (e) => {
  e.stopPropagation();
  const open = !document.body.classList.contains('menu-open');
  document.body.classList.toggle('menu-open', open);
  if (open && gui) {
    gui.domElement.style.display = '';
    gui.open();
  }
});
function syncHudState() {
  const t = env.tween ? timeName((env.tween.from + env.tween.dist) % 24) : timeName(env.hour);
  const acts = world?.actions || [];
  const actState = acts.map((a) => (a.active ? (a.active() ? 1 : 0) : 0)).join('');
  const state = `${t}|${env.weather}|${env.cycle}|${app.sound}|${actState}`;
  if (state === hudState) return;
  hudState = state;
  const btnsA = gScene.querySelectorAll('.btns button');
  acts.forEach((a, i) => btnsA[i]?.classList.toggle('on', !!a.active?.()));
  const lastAct = acts.find((a) => a.active?.());
  gScene.querySelector('.value').textContent = lastAct ? lastAct.label : (acts[0] ? 'Ready' : '');
  gTime.querySelector('.value').textContent = cap(t);
  gSky.querySelector('.value').textContent = cap(env.weather);
  gTime.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.key === t));
  gSky.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.key === env.weather));
  const cyc = tools.querySelector('[data-act=cycle]');
  cyc.innerHTML = svg(env.cycle ? ICONS.pause : ICONS.cycle);
  cyc.classList.toggle('on', env.cycle);
  const snd = tools.querySelector('[data-act=sound]');
  snd.innerHTML = svg(app.sound ? ICONS.sound : ICONS.mute);
  snd.classList.toggle('on', app.sound);
}
function syncHud() {
  hudEl.style.display = app.hud ? '' : 'none';
  save();
}

// pixel cursor, so cursor moves show up in panel recordings
const CURSOR = ['#...........', '##..........', '#o#.........', '#oo#........', '#ooo#.......', '#oooo#......', '#ooooo#.....', '#oooooo#....', '#ooooooo#...', '#oooooooo#..', '#ooooo#####.', '#oo#oo#.....', '#o#.#oo#....', '##..#oo#....', '#....#oo#...', '.....####...'];
const cursorEl = document.getElementById('cursor');
{
  let ink = '', paper = '';
  CURSOR.forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch === '#') ink += `M${x} ${y}h1v1h-1z`;
    if (ch === 'o') paper += `M${x} ${y}h1v1h-1z`;
  }));
  cursorEl.innerHTML = `<svg viewBox="0 0 12 16" shape-rendering="crispEdges"><path d="${paper}" fill="#EDEFF2"/><path d="${ink}" fill="#141823"/></svg>`;
}
function syncCursor() {
  stageEl.classList.toggle('pixel-cursor', app.cursor);
  save();
}
stageEl.addEventListener('pointermove', (e) => {
  const r = stageEl.getBoundingClientRect();
  cursorEl.style.transform = `translate(${e.clientX - r.left}px, ${e.clientY - r.top}px)`;
});
stageEl.addEventListener('pointerdown', () => cursorEl.classList.add('down'));
window.addEventListener('pointerup', () => cursorEl.classList.remove('down'));

// ---------------------------------------------------------------- camera drag, zoom, clicks
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY, az: engine.view.azimuth, el: engine.view.elevation, moved: false };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.hypot(dx, dy) > 4) drag.moved = true;
  if (drag.moved) {
    engine.view.azimuth = drag.az - dx * 0.35;
    engine.view.elevation = clamp(drag.el + dy * 0.25, 10, 80);
  }
});
canvas.addEventListener('pointerup', (e) => {
  if (drag?.moved) viewChanged();
  else if (drag && world?.onClick) {
    const r = canvas.getBoundingClientRect();
    world.onClick(engine.raycaster((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height), env);
  }
  drag = null;
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  engine.view.size = clamp(engine.view.size * (1 + Math.sign(e.deltaY) * 0.06), 4, 40);
  viewChanged();
}, { passive: false });

// ---------------------------------------------------------------- keys
const TIME_KEYS = { 1: 'dawn', 2: 'day', 3: 'dusk', 4: 'night' };
const SKY_KEYS = { 5: 'clear', 6: 'cloudy', 7: 'rain', 8: 'storm', 9: 'snow', 0: 'fog' };
window.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, select, textarea') || e.metaKey || e.ctrlKey) return;
  const k = e.key.toLowerCase();
  if (k === 'h') { app.panel = !app.panel; gui.domElement.style.display = app.panel ? '' : 'none'; fitStage(); save(); }
  else if (k === 'u') { app.hud = !app.hud; syncHud(); }
  else if (k === ' ') { app.paused = !app.paused; e.preventDefault(); }
  else if (k === 'p') actions.png();
  else if (k === 'r') actions.clip();
  else if (k === 't') actions.take();
  else if (k === 'g') actions.demo();
  else if (k === 'c') toggleCycle();
  else if (ACTION_KEYS.includes(k)) runAction(ACTION_KEYS.indexOf(k));
  else if (k === '[' || k === ']') {
    const names = Object.keys(SCENES);
    const i = (names.indexOf(app.scene) + (k === ']' ? 1 : names.length - 1)) % names.length;
    loadScene(names[i]);
  }
  else if (TIME_KEYS[k]) setTime(TIME_KEYS[k]);
  else if (SKY_KEYS[k]) setWeather(SKY_KEYS[k]);
});

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  if (exporting) return;
  const dt = Math.min(clock.getDelta(), 1 / 20) * (app.paused ? 0 : app.timeScale);
  env.update(dt);
  world?.update?.(env.time, dt, env);
  audio.update(dt, env);
  engine.render(scene3d, env);
  if (pendingPNG) {
    pendingPNG = false;
    canvas.toBlob((b) => { download(b, `noxe-pixel-${app.scene.toLowerCase()}-${stamp()}.png`); toast('PNG saved'); }, 'image/png');
  }
  syncHudState();
}

engine.setOutput(...STAGES[app.stage]);
loadScene(app.scene);
syncHud();
syncCursor();
frame();
window.__pixel = {
  engine, env, audio, app,
  get world() { return world; },
  get def() { return def; },
  scenes: Object.keys(SCENES),
  load(name) { loadScene(name); },
  clips: CLIPS,
  exportClip: (o) => exportClip(o),
  formats: FORMATS,
  fitOverrides: FIT,
  photos: PHOTOS,
  format: (key) => applyFormat(key),
  hero: (name, key, adv, scale) => heroPhoto(name, key, adv, scale),
  /** Saves a scene's hero photo in a format ('16x9', '1x1', '4x5') as exports/<file>. */
  async photo(name, key, file) {
    const { canvas: c, fit } = heroPhoto(name, key, undefined, X_SCALE);
    return { status: await this._post(file, c), fit };
  },
  // X kit: per scene, its demo clip as 16:9 and 1:1 MP4 and its hero moment as 4:5 and 1:1 PNG, posted to
  // the save endpoint as xkit-<scene>-<photo|video>-<ratio>.png/.mp4 (then moved into exports/X Posts).
  async kit({ scenes = Object.keys(CLIPS), videos = ['16x9', '1x1'], photos = ['4x5', '1x1'], onFile } = {}) {
    const back = app.scene, files = [];
    for (const name of scenes) {
      for (const f of photos) {
        const file = `xkit-${name.toLowerCase()}-photo-${f}.png`;
        const { status, fit } = await this.photo(name, f, file);
        files.push({ file, status, density: fit && +fit.density.toFixed(2) });
        onFile?.(files.at(-1));
      }
      for (const f of videos) {
        if (!CLIPS[name]) continue;
        app.scene = name;
        let fit = null;
        const blob = await exportClip({ ...CLIPS[name], name, keep: true, setup: () => { fit = applyFormat(f); } });
        const file = `xkit-${name.toLowerCase()}-video-${f}.mp4`;
        const res = blob ? await fetch('http://localhost:5185/save/' + file, { method: 'POST', body: blob }) : null;
        files.push({ file, status: res?.status ?? 'failed', mb: blob && +(blob.size / 1e6).toFixed(1), density: fit && +fit.density.toFixed(2) });
        onFile?.(files.at(-1));
      }
    }
    applyFormat('16x9');
    loadScene(back);
    return files;
  },
  // debug: show the canvas at true size (or bigger), centred on output pixel (cx, cy)
  inspect(cx = 960, cy = 540, scale = 1) {
    const [w, h] = STAGES[app.stage];
    Object.assign(stageEl.style, { width: `${w * scale}px`, height: `${h * scale}px`, position: 'fixed', marginRight: '0',
      left: `${window.innerWidth / 2 - cx * scale}px`, top: `${window.innerHeight / 2 - cy * scale}px` });
  },
  fit() { Object.assign(stageEl.style, { position: '', left: '', top: '' }); fitStage(); },
  // review: render a grid of states and save it as exports/<name>.png (needs the save endpoint on :5185)
  // states: [[hour, weather, seconds to advance, optional fn(world, env) before advancing], ...]
  async sheet(name, states, { cols = 3, cellW = 960 } = {}) {
    const cellH = Math.round((cellW * canvas.height) / canvas.width);
    const rows = Math.ceil(states.length / cols);
    const c = document.createElement('canvas');
    c.width = cellW * Math.min(cols, states.length);
    c.height = cellH * rows;
    const g = c.getContext('2d');
    states.forEach(([h, w, adv = 3, fn], i) => {
      env.setHour(h);
      env.setWeather(w, true);
      fn?.(world, env);
      this.advance(adv);
      g.drawImage(canvas, (i % cols) * cellW, Math.floor(i / cols) * cellH, cellW, cellH);
    });
    return this._post(name + '.png', c);
  },
  async still(name, hour, weather, adv = 3, fn) {
    env.setHour(hour);
    env.setWeather(weather, true);
    fn?.(world, env);
    this.advance(adv);
    const c = document.createElement('canvas');
    c.width = canvas.width;
    c.height = canvas.height;
    c.getContext('2d').drawImage(canvas, 0, 0);
    return this._post(name + '.png', c);
  },
  _post(file, c) {
    return new Promise((res) => c.toBlob((b) => fetch('http://localhost:5185/save/' + file, { method: 'POST', body: b }).then((r) => res(r.status)).catch((e) => res(String(e))), 'image/png'));
  },
  // debug: run the world forward without waiting for frames (background tabs barely tick)
  advance(seconds, dt = 1 / 30) {
    for (let t = 0; t < seconds; t += dt) {
      env.update(dt);
      world?.update?.(env.time, dt, env);
    }
    engine.render(scene3d, env);
    syncHudState();
  },
};
