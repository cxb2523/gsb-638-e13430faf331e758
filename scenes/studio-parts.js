import * as THREE from 'three';
import * as K from './kit.js';
import { toon, fxMaterial, shared } from '../engine/materials.js';

// Building blocks for the Studio scene: per-face coloured boxes, a merge batch,
// pixel-art canvases (screen, posters, rug) and the room's own effects
// (window glass, outside sky, sun shaft, dust, steam, fairy lights).

export const NOXE = { ink: '#141823', graphite: '#69707F', paper: '#EDEFF2', violet: '#6E2BF0', lavender: '#B08CFF' };

const tmpC = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------- geometry

/** Colour a geometry by face direction: colors is a hex, or { px, nx, py, ny, pz, nz, all }. */
export function colorize(g, colors) {
  const n = g.attributes.normal;
  const arr = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) {
    let c = colors;
    if (typeof colors !== 'string') {
      const x = n.getX(i), y = n.getY(i), z = n.getZ(i);
      const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
      const k = ay >= ax && ay >= az ? (y > 0 ? 'py' : 'ny') : ax >= az ? (x > 0 ? 'px' : 'nx') : z > 0 ? 'pz' : 'nz';
      c = colors[k] ?? colors.all ?? '#ff00ff';
    }
    tmpC.set(c);
    arr[i * 3] = tmpC.r;
    arr[i * 3 + 1] = tmpC.g;
    arr[i * 3 + 2] = tmpC.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

export function box(w, h, d, colors = '#ffffff') {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.deleteAttribute('uv');
  return colorize(g, colors);
}

export function cyl(rt, rb, h, seg, color, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  g.deleteAttribute('uv');
  return K.paint(g, color);
}

/** Rotate (x, z, then y) and move a geometry in place. */
export function at(g, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) {
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

/** Cylinder running from a to b (Vector3s). */
export function rod(a, b, r, color, seg = 6) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.deleteAttribute('uv');
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return K.paint(g, color);
}

/** Quads into one non-indexed geometry with normals and colours. */
export class Mesher {
  constructor() {
    this.P = [];
    this.N = [];
    this.C = [];
  }
  quad(a, b, c, d, n, color) {
    tmpC.set(color);
    for (const v of [a, b, c, a, c, d]) {
      this.P.push(v[0], v[1], v[2]);
      this.N.push(n[0], n[1], n[2]);
      this.C.push(tmpC.r, tmpC.g, tmpC.b);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    return g;
  }
}

/** Collects painted geometry per material key and merges each key into one mesh. */
export class Batch {
  constructor() {
    this.lists = {};
  }
  add(key, g) {
    (this.lists[key] ||= []).push(g);
    return g;
  }
  box(key, w, h, d, x, y, z, colors, ry = 0) {
    return this.add(key, at(box(w, h, d, colors), x, y, z, ry));
  }
  build(mats, parent, { cast = true } = {}) {
    const out = {};
    for (const [key, list] of Object.entries(this.lists)) {
      if (!list.length) continue;
      const m = K.mesh(K.merge(list), mats[key], { cast });
      parent.add(m);
      out[key] = m;
    }
    this.lists = {};
    return out;
  }
}

/** A flat pointed leaf along +x in the xz plane, two-tone across the midrib, cupped and drooping. */
export function leafGeometry(len, wid, c1, c2, { droop = 0.18, cup = 0.22, steps = 7, notch = 0 } = {}) {
  const P = [], C = [];
  const a = new THREE.Color(c1), b = new THREE.Color(c2);
  const pt = (t, s) => {
    const w = Math.sin(Math.PI * Math.pow(t, 0.75)) * wid * 0.5 * (1 - notch * Math.max(0, 0.2 - t) * 5);
    return [t * len, Math.abs(s) * w * cup - droop * t * t * len, s * w];
  };
  const tri = (p, q, r, col) => {
    P.push(...p, ...q, ...r);
    for (let k = 0; k < 3; k++) C.push(col.r, col.g, col.b);
  };
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps, t1 = (i + 1) / steps;
    const m0 = pt(t0, 0), m1 = pt(t1, 0);
    tri(m0, pt(t0, 1), pt(t1, 1), a);
    tri(m0, pt(t1, 1), m1, a);
    tri(m0, m1, pt(t1, -1), b);
    tri(m0, pt(t1, -1), pt(t0, -1), b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- canvases

export function canvasTexture(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return { canvas, ctx, tex };
}

/** Pixel painter on a 2D context: crisp rects, discs, rings, arcs. */
export function pix(ctx) {
  return {
    rect(x, y, w, h, c) {
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    },
    disc(cx, cy, r, c, test = null) {
      ctx.fillStyle = c;
      for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++)
        for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
          if (dx * dx + dy * dy <= r * r && (!test || test(dx, dy))) ctx.fillRect(x, y, 1, 1);
        }
    },
    ring(cx, cy, r0, r1, c) {
      ctx.fillStyle = c;
      for (let y = Math.floor(cy - r1 - 1); y <= cy + r1 + 1; y++)
        for (let x = Math.floor(cx - r1 - 1); x <= cx + r1 + 1; x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          if (d <= r1 && d >= r0) ctx.fillRect(x, y, 1, 1);
        }
    },
  };
}

export function drawPoster(kind, g, w, h) {
  const p = pix(g);
  const { ink, paper, violet, lavender } = NOXE;
  if (kind === 0) {
    // violet field, big lavender sun, paper band, ink block
    p.rect(0, 0, w, h, violet);
    p.disc(w * 0.5, h * 0.38, w * 0.3, lavender);
    p.disc(w * 0.5, h * 0.38, w * 0.3, paper, (dx, dy) => dy > w * 0.12);
    p.rect(0, h * 0.68, w, 2, paper);
    p.rect(3, h - 7, 6, 3, ink);
    p.rect(w - 9, h - 7, 6, 1, lavender);
    p.rect(w - 9, h - 5, 4, 1, lavender);
  } else if (kind === 1) {
    // paper field, a 2 x 3 grid of quarter circles in ink, violet and lavender
    p.rect(0, 0, w, h, paper);
    const cw = Math.floor((w - 4) / 2), ch = Math.floor((h - 6) / 3);
    const cols = [ink, violet, lavender, violet, ink, lavender];
    for (let i = 0; i < 6; i++) {
      const x0 = 2 + (i % 2) * cw, y0 = 3 + Math.floor(i / 2) * ch;
      const corner = i % 4;
      const cx = x0 + (corner === 1 || corner === 2 ? cw : 0), cy = y0 + (corner >= 2 ? ch : 0);
      p.disc(cx, cy, Math.min(cw, ch) - 0.5, cols[i], (dx, dy) => Math.abs(cx + dx - x0 - cw / 2) <= cw / 2 && Math.abs(cy + dy - y0 - ch / 2) <= ch / 2);
    }
  } else {
    // ink field, lavender half sun on stripes
    p.rect(0, 0, w, h, ink);
    for (let k = 0; k < 4; k++) p.rect(2, h * 0.55 + k * 3, w - 4, 1, k % 2 ? violet : paper);
    p.disc(w * 0.5, h * 0.52, w * 0.32, lavender, (dx, dy) => dy < 0);
    p.rect(2, 2, 3, 3, violet);
  }
}

export function drawRug(g, w, h) {
  const p = pix(g);
  const { ink, violet, lavender } = NOXE;
  const cream = '#efe7da';
  p.rect(0, 0, w, h, '#ddd0bb');
  p.rect(1, 1, w - 2, h - 2, cream);
  // lavender border band with a violet pinstripe inside it
  p.rect(3, 3, w - 6, h - 6, '#a594dc');
  p.rect(5, 5, w - 10, h - 10, cream);
  p.rect(6, 6, w - 12, 1, violet);
  p.rect(6, h - 7, w - 12, 1, violet);
  p.rect(6, 6, 1, h - 12, violet);
  p.rect(w - 7, 6, 1, h - 12, violet);
  // the composition from the posters: a violet sun, a lavender half moon, an ink bar
  const cy = h / 2;
  p.disc(w * 0.34, cy, h * 0.22, violet);
  p.disc(w * 0.66, cy, h * 0.22, lavender, (dx) => dx <= 0);
  p.rect(w * 0.5 - 1, cy - h * 0.22, 2, h * 0.44, ink);
  for (const [x, y] of [[9, 9], [w - 11, 9], [9, h - 11], [w - 11, h - 11]]) p.rect(x, y, 2, 2, ink);
}

// The monitor shows design work in Noxe colours. Four pieces, each with its own small animation.
export const SCREEN_ART = [
  { light: '#8f63ff' },
  { light: '#c09cff' },
  { light: '#a88bff' },
  { light: '#7b5cff' },
];

export function drawScreen(g, w, h, art, t, opts = {}) {
  drawArt(g, w, h, art, t, opts);
  // music on: a little equalizer along the bottom of whatever is on screen
  const m = opts.music || 0;
  if (m > 0.05) {
    const p = pix(g);
    const bars = 9;
    for (let i = 0; i < bars; i++) {
      const x = 2 + i * 3;
      const lvl = 0.35 + 0.65 * Math.abs(Math.sin(t * (3.1 + i * 0.7) + i * 1.9));
      const bh = Math.max(1, Math.round(m * lvl * (2 + 4 * (opts.kick || 0)) + m));
      p.rect(x, h - 1 - bh, 2, bh, i % 3 === 1 ? NOXE.paper : NOXE.lavender);
    }
  }
}

function drawArt(g, w, h, art, t, { pulse = 0, edit = 0 } = {}) {
  const p = pix(g);
  const { ink, paper, violet, lavender, graphite } = NOXE;
  const blink = Math.floor(t * 2) % 2;
  if (art === 0) {
    // design app: artboard with a poster in progress, layers panel, moving cursor
    p.rect(0, 0, w, h, '#1b2030');
    p.rect(0, 0, w, 2, '#262c40');
    p.rect(3, 3, 16, 13, paper);
    const r = 4 + (pulse > 0.5 ? 1 : 0);
    p.disc(10, 8, r, edit % 2 ? violet : lavender);
    p.rect(5, 13, 12, 1, edit % 3 === 0 ? violet : ink);
    p.rect(14, 4, 4, 3, edit % 2 ? lavender : violet);
    // selection box around the circle, handles blink
    const sx = 5, sy = 3, sw = 11, sh = 11;
    p.rect(sx, sy, sw, 1, lavender);
    p.rect(sx, sy + sh - 1, sw, 1, lavender);
    p.rect(sx, sy, 1, sh, lavender);
    p.rect(sx + sw - 1, sy, 1, sh, lavender);
    if (blink) for (const [hx, hy] of [[sx, sy], [sx + sw - 1, sy], [sx, sy + sh - 1], [sx + sw - 1, sy + sh - 1]]) p.rect(hx, hy, 1, 1, paper);
    p.rect(21, 3, w - 23, h - 5, '#232838');
    for (let i = 0; i < 5; i++) {
      const hi = i === edit % 5;
      p.rect(22, 4 + i * 2, hi ? w - 25 : 4 + ((i * 3) % 4), 1, hi ? violet : graphite);
    }
    const cx = 12 + Math.round(Math.sin(t * 0.9) * 4), cy = 9 + Math.round(Math.cos(t * 0.7) * 3);
    p.rect(cx, cy, 1, 3, paper);
    p.rect(cx + 1, cy + 1, 1, 1, paper);
  } else if (art === 1) {
    // gradient bands with a rising sun and ink waves
    const bands = [violet, '#8a52f4', '#9d72fa', lavender, '#cdb8ff', paper];
    const bh = h / bands.length;
    bands.forEach((c, i) => p.rect(0, Math.floor(i * bh), w, Math.ceil(bh) + 1, c));
    const sy = h * 0.72 - (Math.sin(t * 0.5) * 0.5 + 0.5) * 2;
    p.disc(w * 0.5, sy, 5 + pulse, paper, (dx, dy) => sy + dy < h * 0.74);
    for (let x = 0; x < w; x++) {
      const y = Math.round(h * 0.78 + Math.sin(x * 0.5 + t * 2) * 1);
      p.rect(x, y, 1, h - y, ink);
    }
  } else if (art === 2) {
    // bauhaus tiles that turn one at a time
    const cols = [[ink, violet], [paper, ink], [violet, lavender], [lavender, ink], [paper, violet], [ink, lavender], [violet, paper], [lavender, violet]];
    const tw = w / 4, th = h / 2;
    const turning = Math.floor(t * 0.8) % 8;
    for (let i = 0; i < 8; i++) {
      const x0 = Math.floor((i % 4) * tw), y0 = Math.floor(Math.floor(i / 4) * th);
      const [bg, fg] = cols[(i + edit) % 8];
      p.rect(x0, y0, Math.ceil(tw), Math.ceil(th), bg);
      const corner = (i + (i === turning ? Math.floor(t * 4) : 0) + edit) % 4;
      const cx = x0 + (corner === 1 || corner === 2 ? tw : 0), cy = y0 + (corner >= 2 ? th : 0);
      p.disc(cx, cy, Math.min(tw, th) - 0.5 + (pulse > 0.5 && i % 2 ? 1 : 0), fg, (dx, dy) => cx + dx >= x0 && cx + dx < x0 + tw && cy + dy >= y0 && cy + dy < y0 + th);
    }
  } else {
    // a little iso cube over a grid: the engine, on the screen
    p.rect(0, 0, w, h, ink);
    for (let x = -h; x < w + h; x += 4) for (let y = 10; y < h; y++) {
      const gx = x + (y - 10) * 2;
      if (gx >= 0 && gx < w && (y - 10) % 2 === 0) p.rect(gx, y, 1, 1, '#2b2350');
    }
    for (let y = 10; y < h; y += 2) p.rect(0, y, w, 1, '#1d1f36');
    const bob = Math.round(Math.sin(t * 1.6) * 1) - (pulse > 0.5 ? 1 : 0);
    const cx = Math.floor(w / 2), cy = 6 + bob;
    for (let x = -8; x <= 8; x++) {
      const yb = 4 - Math.abs(x) / 2;
      for (let y = -4; y <= 4; y++) if (Math.abs(x) / 2 + Math.abs(y) <= 4) p.rect(cx + x, cy + y, 1, 1, lavender);
      for (let y = Math.floor(yb) + 1; y <= yb + 5; y++) p.rect(cx + x, cy + y, 1, 1, x < 0 ? violet : '#4a1fb0');
    }
    p.rect(cx - 1, cy - 1, 2, 1, paper);
    if (blink) p.rect(2, 2, 2, 1, lavender);
  }
}

export function drawLaptop(g, w, h, t, art) {
  const p = pix(g);
  p.rect(0, 0, w, h, '#1b2030');
  p.rect(0, 0, 4, h, '#2a2350');
  for (let i = 0; i < 4; i++) p.rect(1, 2 + i * 2, 2, 1, i === art ? NOXE.lavender : NOXE.graphite);
  p.rect(6, 2, w - 8, 4, SCREEN_ART[art].light);
  for (let i = 0; i < 2; i++) p.rect(6, 7 + i * 2, 4 + i * 3, 1, NOXE.graphite);
  if (Math.floor(t * 1.7) % 2) p.rect(6 + 7 + 1, 9, 1, 1, NOXE.paper);
}

// ---------------------------------------------------------------- effects

/** Window glass: faint tint and sheen, rain beads and trickles when wet, frosted corners in snow. */
export function glassMaterial({ w, h, cols, rows }) {
  return fxMaterial({
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform float uRain;
      uniform float uWet;
      uniform float uSnow;
      uniform float uDaylight;
      uniform float uLamps;
      uniform vec2 uSize;
      uniform vec2 uGrid;
      varying vec2 vUv;
      float hh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec2 p = vUv * uSize;
        vec3 tint = mix(vec3(0.05, 0.07, 0.16), vec3(0.75, 0.85, 1.0), uDaylight);
        float a = 0.08 + 0.05 * uDaylight;
        vec3 col = tint;
        // two diagonal glints
        float d = p.x - p.y * 0.75;
        float gl = step(abs(fract(d * 0.32 + 0.1) - 0.5), 0.025) + step(abs(fract(d * 0.32 + 0.16) - 0.5), 0.012);
        col = mix(col, vec3(0.9, 0.95, 1.0), gl * 0.6);
        a += gl * (0.07 + 0.05 * uDaylight);
        // rain: beads that sit, and trickles that run
        float wet = clamp(max(uRain * 1.1, uWet * 0.55), 0.0, 1.0);
        vec3 dropC = mix(vec3(0.62, 0.6, 0.85) * (0.6 + 0.6 * uLamps), vec3(0.85, 0.92, 1.0), uDaylight);
        vec2 g = p / vec2(0.15, 0.13);
        vec2 cell = floor(g);
        vec2 f = fract(g) - vec2(0.3 + 0.4 * hh(cell + 3.1), 0.3 + 0.4 * hh(cell + 7.3));
        float bead = step(hh(cell), wet * 0.2) * step(length(f), 0.3);
        float col_i = floor(p.x / 0.27);
        float r = hh(vec2(col_i, 9.0));
        float run = 0.0;
        if (r < wet * 0.5) {
          float speed = 0.35 + 0.5 * hh(vec2(col_i, 4.0));
          float head = uSize.y + 0.3 - fract(uTime * speed * 0.25 + r * 7.0) * (uSize.y + 1.2);
          float xc = (col_i + 0.25 + 0.5 * hh(vec2(col_i, 2.0))) * 0.27 + sin(p.y * 5.0 + col_i) * 0.025;
          float on = step(abs(p.x - xc), 0.035);
          float above = p.y - head;
          run = on * step(0.0, above) * (1.0 - smoothstep(0.0, 0.6, above));
          run = max(run, on * step(abs(above), 0.05) * 1.4);
        }
        float drop = clamp(bead * 0.8 + run, 0.0, 1.0) * smoothstep(0.02, 0.2, wet);
        col = mix(col, dropC, drop);
        a = mix(a, 0.75, drop);
        // frost creeping in from the corners of each pane
        vec2 pp = fract(vUv * uGrid);
        vec2 ps = uSize / uGrid;
        float edge = min(min(pp.x, 1.0 - pp.x) * ps.x, pp.y * ps.y * 0.7);
        float fn = hh(floor(p / 0.06));
        float frost = uSnow * step(edge + fn * 0.07, 0.03 + uSnow * 0.08);
        col = mix(col, vec3(0.86, 0.9, 0.98) * (0.45 + 0.55 * max(uDaylight, uLamps * 0.7)), frost);
        a = mix(a, 0.85, frost);
        gl_FragColor = vec4(col, a);
        gNormal = vec4(0.0);
      }`,
    uniforms: {
      uTime: shared.uTime, uRain: shared.uRain, uWet: shared.uWet, uSnow: shared.uSnow, uDaylight: shared.uDaylight, uLamps: shared.uLamps,
      uSize: { value: new THREE.Vector2(w, h) }, uGrid: { value: new THREE.Vector2(cols, rows) },
    },
  });
}

/** The sky outside the window: a gradient that follows the engine sky, stars, a moon, and a far skyline that lights up at night. */
export function skyBackdropMaterial(range) {
  const m = new THREE.ShaderMaterial({
    vertexShader: /* glsl */`
      varying vec3 vW;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: 'layout(location = 1) out highp vec4 gNormal;\n' + /* glsl */`
      uniform vec3 uTop;
      uniform vec3 uBot;
      uniform float uStars;
      uniform float uTime;
      uniform float uLamps;
      uniform float uNight;
      uniform float uSnow;
      uniform float uHaze;
      uniform float uMoon;
      uniform vec2 uMoonPos;
      uniform vec2 uRange;
      varying vec3 vW;
      float hh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec2 q = vW.xy;
        float t = clamp((q.y - uRange.x) / (uRange.y - uRange.x), 0.0, 1.0);
        vec3 sky = mix(uBot, uTop, smoothstep(0.0, 1.0, t));
        sky += vec3(0.11, 0.05, 0.13) * uLamps * uNight * (1.0 - smoothstep(0.0, 0.6, t));
        float s = hh(floor(q * vec2(15.0, 18.0)));
        sky += step(0.986, s) * uStars * vec3(0.75, 0.8, 1.0) * (0.55 + 0.45 * sin(uTime * (1.3 + s * 3.0) + s * 300.0)) * smoothstep(0.35, 0.8, t);
        if (uMoon > 0.01) {
          vec2 dm = (q - uMoonPos) * vec2(1.0, 1.15);
          float dd = length(dm);
          sky = mix(sky, vec3(1.0, 0.95, 0.82) * 1.3, uMoon * step(dd, 0.15) * (1.0 - 0.25 * step(0.6, hh(floor(dm / 0.05)))));
          sky += vec3(0.35, 0.4, 0.6) * uMoon * 0.25 * exp(-max(dd - 0.15, 0.0) * 8.0);
        }
        vec3 c = sky;
        vec3 dark = mix(vec3(0.06, 0.07, 0.12), vec3(0.006, 0.007, 0.018), uNight);
        for (int L = 0; L < 2; L++) {
          float fl = float(L);
          float bw = mix(0.62, 0.46, fl);
          float xo = q.x + fl * 0.21 + 40.0;
          float bi = floor(xo / bw);
          float fx = fract(xo / bw);
          float r1 = hh(vec2(bi, 1.0 + fl * 7.0));
          float r2 = hh(vec2(bi, 2.0 + fl * 7.0));
          float topY = mix(0.35, -0.05, fl) + r1 * mix(0.75, 0.5, fl);
          if (r2 > 0.55 && (fx < 0.22 || fx > 0.78)) topY -= 0.14;
          if (fx < 0.04) topY = -2.0;
          if (q.y < topY) {
            vec3 wall = mix(sky, dark, mix(0.55, 0.82, fl));
            vec2 wg = vec2((xo - bi * bw) / 0.11, (q.y + 3.0) / 0.1);
            vec2 wc = floor(wg);
            vec2 wf = fract(wg);
            float isWin = step(wf.x, 0.5) * step(wf.y, 0.5) * step(q.y, topY - 0.12) * step(0.12, fx) * step(fx, 0.9);
            float lit = step(hh(wc + bi * 3.7 + fl), 0.4);
            vec3 wcol = hh(wc.yx + bi) < 0.2 ? vec3(0.55, 0.75, 1.5) : vec3(1.7, 1.05, 0.45);
            wall = mix(wall, mix(wall * 1.25 + 0.01, wcol, lit * uLamps), isWin);
            wall = mix(wall, vec3(0.85, 0.9, 0.98) * (0.3 + 0.7 * (1.0 - uNight)), uSnow * step(topY - 0.04, q.y));
            if (L == 0 && r2 > 0.8 && q.y < topY + 0.3 && abs(fx - 0.5) < 0.04) wall = dark;
            c = wall;
          }
          if (L == 0 && r2 > 0.8 && q.y >= topY && q.y < topY + 0.3 && abs(fx - 0.5) < 0.05) {
            c = dark;
            if (q.y > topY + 0.24) c = mix(dark, vec3(3.0, 0.3, 0.25), step(0.5, fract(uTime * 0.5 + bi * 0.37)) * uNight);
          }
        }
        c = mix(c, sky, uHaze);
        gl_FragColor = vec4(c, 1.0);
        gNormal = vec4(0.0);
      }`,
    uniforms: {
      uTop: { value: new THREE.Color() }, uBot: { value: new THREE.Color() }, uStars: { value: 0 }, uTime: shared.uTime,
      uLamps: shared.uLamps, uNight: { value: 0 }, uSnow: shared.uSnow, uHaze: { value: 0 }, uMoon: { value: 0 },
      uMoonPos: { value: new THREE.Vector2(-2.6, 1.45) }, uRange: { value: new THREE.Vector2(...range) },
    },
  });
  return m;
}

/** Sun shaft: a faint additive prism from the window down to the floor. */
export function beam(corners, floor, color = '#fff0d0') {
  // corners: 4 Vector3 on the glass, floor: the same 4 pushed along the light to the floor
  const P = [], T = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4], c = floor[(i + 1) % 4], d = floor[i];
    for (const [v, t] of [[a, 0], [b, 0], [c, 1], [a, 0], [c, 1], [d, 1]]) {
      P.push(v.x, v.y, v.z);
      T.push(t);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(T, 1));
  const mat = fxMaterial({
    vertexShader: /* glsl */`
      attribute float aT;
      varying float vT;
      varying vec3 vW;
      void main() { vT = aT; vW = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      uniform float uOn;
      uniform float uTime;
      varying float vT;
      varying vec3 vW;
      void main() {
        float shimmer = 0.85 + 0.15 * sin(uTime * 0.7 + (vW.x - vW.z) * 2.0);
        float a = uOn * (1.0 - vT * 0.5) * 0.12 * shimmer;
        if (a < 0.003) discard;
        gl_FragColor = vec4(uColor, a);
        gNormal = vec4(0.0);
      }`,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOn: { value: 0 }, uTime: shared.uTime },
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  return m;
}

/** Dust motes drifting inside the sun shaft. */
export function dust(corners, floor, count = 140) {
  const pos = new Float32Array(count * 3), seed = new Float32Array(count * 4);
  const v = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const u = Math.random(), w = Math.random(), t = 0.08 + Math.random() * 0.75;
    a.copy(corners[0]).lerp(corners[1], u).lerp(b.copy(corners[3]).lerp(corners[2], u), w);
    const fa = new THREE.Vector3().copy(floor[0]).lerp(floor[1], u).lerp(new THREE.Vector3().copy(floor[3]).lerp(floor[2], u), w);
    v.copy(a).lerp(fa, t);
    pos.set([v.x, v.y, v.z], i * 3);
    seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const mat = fxMaterial({
    vertexShader: /* glsl */`
      uniform float uTime;
      attribute vec4 aSeed;
      varying float vA;
      void main() {
        vec3 p = position;
        float tt = uTime * (0.08 + aSeed.z * 0.1);
        p.x += sin(tt * 3.0 + aSeed.x * 30.0) * 0.18;
        p.z += cos(tt * 2.3 + aSeed.y * 30.0) * 0.18;
        p.y += sin(tt * 1.7 + aSeed.w * 20.0) * 0.22 + 0.1;
        vA = 0.5 + 0.5 * sin(uTime * (0.6 + aSeed.w) + aSeed.x * 40.0);
        gl_PointSize = 1.0;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uOn;
      uniform vec3 uColor;
      varying float vA;
      void main() {
        float a = uOn * vA;
        if (a < 0.25) discard;
        gl_FragColor = vec4(uColor * (0.7 + a * 0.9), a * 0.6);
        gNormal = vec4(0.0);
      }`,
    uniforms: { uTime: shared.uTime, uOn: { value: 0 }, uColor: { value: new THREE.Color('#fff2d6') } },
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return pts;
}

/** Steam curling up from a mug. */
export function steam(origin, count = 30) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const seed = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) seed.set([i / count, Math.random()], i * 2);
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 2));
  const mat = fxMaterial({
    vertexShader: /* glsl */`
      uniform float uTime;
      uniform vec3 uOrigin;
      attribute vec2 aSeed;
      varying float vA;
      void main() {
        float t = fract(uTime / 3.2 + aSeed.x);
        vec3 p = uOrigin;
        p.y += t * 0.62;
        p.x += sin(t * 7.0 + aSeed.y * 6.28) * 0.05 * (0.3 + t);
        p.z += cos(t * 5.0 + aSeed.y * 6.28) * 0.07 * (0.3 + t) + t * 0.05;
        vA = (1.0 - t) * smoothstep(0.0, 0.12, t);
        gl_PointSize = 1.0;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      varying float vA;
      void main() {
        if (vA < 0.2) discard;
        gl_FragColor = vec4(uColor, vA * 0.75);
        gNormal = vec4(0.0);
      }`,
    uniforms: { uTime: shared.uTime, uOrigin: { value: origin.clone() }, uColor: { value: new THREE.Color('#f4f1ff') } },
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return pts;
}

/** Fairy lights: a sagging wire between pins and bulbs that glow when the lamps come on. */
export function fairyLights(pins, { sag = 0.2, spacing = 0.24, lavenderEvery = 4 } = {}) {
  const wire = [], bulbs = [], seeds = [];
  let k = 0;
  for (let i = 0; i < pins.length - 1; i++) {
    const a = new THREE.Vector3(...pins[i]), b = new THREE.Vector3(...pins[i + 1]);
    const len = a.distanceTo(b);
    const steps = Math.max(4, Math.round(len / 0.08));
    let prev = a.clone();
    let acc = 0;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const p = a.clone().lerp(b, t);
      p.y -= sag * 4 * t * (1 - t) * Math.min(1, len / 1.6);
      wire.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
      acc += prev.distanceTo(p);
      if (acc >= spacing) {
        acc = 0;
        bulbs.push(p.x, p.y - 0.035, p.z);
        seeds.push(Math.random(), k++ % lavenderEvery === 0 ? 1 : 0, Math.random(), 0);
      }
      prev = p;
    }
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
  const wireMat = fxMaterial({
    vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uColor; void main() { gl_FragColor = vec4(uColor, 1.0); gNormal = vec4(0.0); }',
    uniforms: { uColor: { value: new THREE.Color('#2a2c38') } },
  });
  const wireObj = new THREE.LineSegments(wg, wireMat);
  wireObj.frustumCulled = false;
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(bulbs, 3));
  bg.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 4));
  const bulbMat = fxMaterial({
    vertexShader: /* glsl */`
      uniform float uTime;
      uniform float uOn;
      uniform float uBeat;
      uniform float uMusic;
      attribute vec4 aSeed;
      varying vec3 vC;
      varying float vA;
      void main() {
        float tw = 0.72 + 0.28 * sin(uTime * (0.9 + aSeed.x * 1.8) + aSeed.x * 40.0);
        // with music on, a violet and pink wave chases along the string
        float ph = sin((position.x - position.z) * 1.6 - uTime * 3.4);
        vec3 party = ph > 0.0 ? vec3(0.62, 0.42, 1.0) : vec3(1.0, 0.48, 0.82);
        vC = aSeed.y > 0.5 ? vec3(0.62, 0.42, 1.0) : vec3(1.0, 0.7, 0.36);
        vC = mix(vC, party, uMusic);
        vA = max(uOn, uMusic * 0.85) * tw * (1.0 + uBeat * 0.6) * mix(1.0, 0.45 + 0.8 * smoothstep(-0.3, 1.0, ph), uMusic);
        gl_PointSize = 1.0;
        gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uPower;
      varying vec3 vC;
      varying float vA;
      void main() {
        vec3 off = vec3(0.32, 0.31, 0.3);
        gl_FragColor = vec4(mix(off, vC * uPower, clamp(vA, 0.0, 1.5)), 1.0);
        gNormal = vec4(0.0);
      }`,
    uniforms: { uTime: shared.uTime, uOn: { value: 0 }, uBeat: { value: 0 }, uMusic: { value: 0 }, uPower: { value: 5.0 } },
  });
  const bulbObj = new THREE.Points(bg, bulbMat);
  bulbObj.frustumCulled = false;
  const group = new THREE.Group();
  group.add(wireObj, bulbObj);
  return { group, material: bulbMat, count: bulbs.length / 3 };
}

// ---------------------------------------------------------------- props

export function pot(B, x, y, z, r, color) {
  B.add('paint', at(cyl(r, r * 0.78, r * 1.3, 10, color), x, y + r * 0.65, z));
  B.add('paint', at(cyl(r * 0.86, r * 0.86, 0.015, 10, '#3b2a20'), x, y + r * 1.3, z));
}

export function succulent(B, rand, x, y, z, s) {
  const greens = ['#7fb38a', '#6aa27a', '#93c49b', '#5d9470'];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rand();
    const g = new THREE.ConeGeometry(s * 0.28, s * (0.7 + rand() * 0.4), 4);
    g.deleteAttribute('uv');
    K.paint(g, greens[i % greens.length]);
    const tilt = i === 0 ? 0 : 0.7;
    g.translate(0, s * 0.35, 0);
    g.rotateZ(tilt);
    g.rotateY(a);
    g.translate(x, y, z);
    B.add('leaf', g);
  }
}

export function camera(B, x, y, z, faceZ = false) {
  const ry = faceZ ? 0 : Math.PI / 2;
  const g = (geo, dx, dy, dz) => {
    if (faceZ) B.add('metal', at(geo, x + dx, y + dy, z + dz));
    else B.add('metal', at(geo.rotateY(ry), x + dz, y + dy, z - dx));
  };
  g(box(0.32, 0.2, 0.18, { all: '#1d2130', py: '#2a2f3e' }), 0, 0.1, 0);
  g(at(cyl(0.075, 0.08, 0.12, 10, '#2a2f3e'), 0, 0, 0, 0, Math.PI / 2), 0.02, 0.1, 0.14);
  g(at(cyl(0.055, 0.055, 0.01, 10, '#5b5ea8'), 0, 0, 0, 0, Math.PI / 2), 0.02, 0.1, 0.205);
  g(box(0.08, 0.05, 0.08, '#c9ccd4'), -0.09, 0.225, 0);
}

export function monstera(B, rand, px, py, pz, { leaves, hMin, hMax, a0, a1 }) {
  const greens = [['#3f8f4e', '#2f7440'], ['#4e9f58', '#3b8048'], ['#357a45', '#28633a'], ['#5aab5f', '#428a4b']];
  for (let i = 0; i < leaves; i++) {
    const a = a0 + (a1 - a0) * ((i + rand() * 0.6) / leaves);
    const h = hMin + (hMax - hMin) * Math.pow(rand(), 0.8);
    const r = 0.15 + rand() * 0.55;
    const end = new THREE.Vector3(px + Math.cos(a) * r, py + h, pz + Math.sin(a) * r);
    B.add('leaf', rod(new THREE.Vector3(px + Math.cos(a) * 0.05, py, pz + Math.sin(a) * 0.05), end, 0.025, '#4f7d3c', 4));
    const [c1, c2] = greens[Math.floor(rand() * greens.length)];
    const len = 0.75 + rand() * 0.35;
    const g = leafGeometry(len, len * 0.78, c1, c2, { droop: 0.3 + rand() * 0.2, cup: 0.25, steps: 7 });
    at(g, end.x, end.y, end.z, -a, (rand() - 0.5) * 0.5, -0.15 + rand() * 0.45);
    B.add('leaf', g);
  }
}

/** Small leaves scattered on points (trailing vines, pothos crowns). */
export function leafCloud(rand, pts, size) {
  const geo = new THREE.OctahedronGeometry(size * 0.6, 0);
  geo.scale(1.2, 0.55, 0.9);
  const m = new THREE.InstancedMesh(geo, toon('#ffffff', { ramp: 'foliage', noise: 0.1, snow: 0, wet: 0 }), pts.length);
  const d = new THREE.Object3D();
  const c = new THREE.Color();
  const greens = ['#4f9a55', '#62ad62', '#3f8a4a', '#7cbf6a', '#56a35a'];
  pts.forEach((p, i) => {
    d.position.set(p[0], p[1], p[2]);
    d.rotation.set(rand() * 0.8, rand() * Math.PI * 2, rand() * 0.8);
    d.scale.setScalar(0.8 + rand() * 0.5);
    d.updateMatrix();
    m.setMatrixAt(i, d.matrix);
    m.setColorAt(i, c.set(greens[Math.floor(rand() * greens.length)]));
  });
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function instancedBooks(list) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const m = new THREE.InstancedMesh(geo, toon('#ffffff', { noise: 0.06, noiseScale: 9, snow: 0, wet: 0 }), list.length);
  const d = new THREE.Object3D();
  const c = new THREE.Color();
  list.forEach((b, i) => {
    d.position.set(...b.p);
    d.rotation.set(b.axis === 'x' ? 0 : b.r, 0, b.axis === 'x' ? b.r : 0);
    d.scale.set(...b.s);
    d.updateMatrix();
    m.setMatrixAt(i, d.matrix);
    m.setColorAt(i, c.set(b.c));
  });
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Horizontal disc made of rings (for the record): rings [{ r0, r1, c(angle) }], with a side band. */
export function discGeometry(rings, seg, thick, sideColor) {
  const M = new Mesher();
  const y = thick;
  for (const ring of rings) {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const c = ring.c((a0 + a1) / 2);
      const p = (r, a) => [Math.cos(a) * r, y, Math.sin(a) * r];
      M.quad(p(ring.r0, a0), p(ring.r0, a1), p(ring.r1, a1), p(ring.r1, a0), [0, 1, 0], c);
    }
  }
  const R = rings[rings.length - 1].r1;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    M.quad([Math.cos(a0) * R, 0, Math.sin(a0) * R], [Math.cos(a0) * R, y, Math.sin(a0) * R], [Math.cos(a1) * R, y, Math.sin(a1) * R], [Math.cos(a1) * R, 0, Math.sin(a1) * R], [Math.cos(am), 0, Math.sin(am)], sideColor(am));
  }
  return M.geometry();
}

export function neonTube(points, color, power = 7) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const geo = new THREE.TubeGeometry(curve, points.length * 4, 0.045, 5, false);
  const material = toon('#2a2230', { emissive: color, emissiveIntensity: power, lamp: true, noise: 0, snow: 0, wet: 0 });
  return { mesh: K.mesh(geo, material, { cast: false, receive: false }), material };
}

/** Soft cone of lamp light, additive, fading away from the bulb. */
export function coneFx(apex, dir, len, radius) {
  const g = new THREE.ConeGeometry(radius, len, 18, 1, true);
  g.translate(0, -len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir));
  g.translate(apex.x, apex.y, apex.z);
  const mat = fxMaterial({
    vertexShader: /* glsl */`
      uniform vec3 uApex;
      uniform float uLen;
      varying float vD;
      void main() { vD = distance(position, uApex) / uLen; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uOn;
      varying float vD;
      void main() {
        float a = uOn * (1.0 - vD) * 0.09;
        if (a < 0.004) discard;
        gl_FragColor = vec4(vec3(1.0, 0.74, 0.42), a);
        gNormal = vec4(0.0);
      }`,
    uniforms: { uApex: { value: apex.clone() }, uLen: { value: len }, uOn: { value: 0 } },
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  return m;
}

/** A curled-up ginger cat. Returns { group, body, tail: [segments], ear }. */
export function buildCat(mats) {
  const group = new THREE.Group();
  const fur = '#e08a3c', stripe = '#b8642a', cream = '#f6dcb4';
  const bodyGeo = new THREE.SphereGeometry(0.3, 12, 8).toNonIndexed();
  bodyGeo.deleteAttribute('uv');
  bodyGeo.scale(1.3, 0.62, 1.0);
  {
    const p = bodyGeo.attributes.position, n = p.count;
    const arr = new Float32Array(n * 3);
    const a = new THREE.Color(fur), s = new THREE.Color(stripe), c = new THREE.Color(cream);
    for (let i = 0; i < n; i += 3) {
      const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
      const col = y < -0.06 && z > 0.05 ? c : y > 0.04 && Math.sin(x * 22) > 0.45 ? s : a;
      for (let k = 0; k < 3; k++) arr.set([col.r, col.g, col.b], (i + k) * 3);
    }
    bodyGeo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }
  bodyGeo.computeVertexNormals();
  const furMat = toon('#ffffff', { vertexColors: true, noise: 0.1, noiseScale: 14, snow: 0, wet: 0 });
  const body = K.mesh(bodyGeo, furMat);
  body.position.y = 0.17;
  group.add(body);
  const sphere = (r, color, sx = 1, sy = 1, sz = 1) => {
    const g = new THREE.SphereGeometry(r, 10, 8);
    g.deleteAttribute('uv');
    g.scale(sx, sy, sz);
    return K.paint(g, color);
  };
  const earGeo = (side) => {
    const e = new THREE.ConeGeometry(0.09, 0.2, 4);
    e.deleteAttribute('uv');
    K.paint(e, stripe);
    e.rotateY(Math.PI / 4);
    e.rotateX(side * 0.32);
    e.translate(0.02, 0.21, side * 0.1);
    return e;
  };
  const head = new THREE.Group();
  head.position.set(0.34, 0.25, 0.1);
  head.rotation.set(0.12, -0.6, -0.12);
  head.add(K.mesh(K.merge([
    sphere(0.19, fur, 0.95, 0.85, 1.0),
    sphere(0.085, cream, 0.8, 0.7, 1.1).translate(0.15, -0.06, 0),
    at(box(0.02, 0.02, 0.06, '#3a2418'), 0.165, 0.03, -0.065),
    at(box(0.02, 0.02, 0.06, '#3a2418'), 0.165, 0.03, 0.065),
    at(box(0.02, 0.025, 0.03, '#d9837a'), 0.225, -0.04, 0),
    earGeo(-1),
  ]), mats.fabric));
  const ear = new THREE.Group();
  ear.add(K.mesh(K.merge([earGeo(1)]), mats.fabric));
  head.add(ear);
  group.add(head);
  group.add(K.mesh(K.merge([sphere(0.055, cream).translate(0.44, 0.04, 0.0), sphere(0.055, cream).translate(0.42, 0.04, 0.15)]), mats.fabric));
  // tail: wraps round the front, tip free to swish
  const tail = [];
  let parent = group;
  const segGeo = new THREE.BoxGeometry(0.16, 0.09, 0.09);
  segGeo.translate(0.08, 0, 0);
  const tailMat = toon(fur, { noise: 0.08, snow: 0, wet: 0 });
  const tipMat = toon(stripe, { noise: 0.08, snow: 0, wet: 0 });
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.Group();
    if (i === 0) {
      seg.position.set(-0.33, 0.05, 0.12);
      seg.userData.base = -0.9;
    } else {
      seg.position.set(0.14, 0, 0);
      seg.userData.base = 0.3;
    }
    seg.rotation.y = seg.userData.base;
    seg.add(K.mesh(segGeo, i >= 4 ? tipMat : tailMat));
    parent.add(seg);
    tail.push(seg);
    parent = seg;
  }
  return { group, body, tail, ear };
}

/** Club armchair in mustard velvet with a lavender throw; front faces +x before turning by ry. */
export function armchair(B, x, z, ry) {
  const fab = '#d39a3a', dark = '#b9822c', top = '#e3b055', leg = '#5e3a24';
  const put = (key, g, lx, ly, lz, rz = 0, rx = 0) => {
    at(g, lx, ly, lz, 0, rx, rz);
    g.rotateY(ry);
    g.translate(x, 0, z);
    B.add(key, g);
  };
  put('fabric', box(0.95, 0.3, 1.05, { all: dark, py: fab }), 0, 0.22, 0);
  put('fabric', box(0.7, 0.15, 0.74, { all: fab, py: top }), 0.09, 0.44, 0);
  put('fabric', box(0.26, 0.68, 1.05, { all: dark, px: fab, py: top }), -0.36, 0.68, 0, 0.08);
  for (const s of [-1, 1]) put('fabric', box(0.92, 0.44, 0.19, { all: dark, py: top, px: fab }), 0, 0.52, s * 0.44);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put('wood', box(0.07, 0.08, 0.07, leg), sx * 0.39, 0.035, sz * 0.43);
  put('fabric', box(0.56, 0.04, 0.24, { all: '#8f7bd0', py: '#a996dc' }), 0.04, 0.755, 0.45);
  put('fabric', box(0.56, 0.4, 0.04, '#8f7bd0'), 0.04, 0.56, 0.56);
  put('fabric', box(0.12, 0.34, 0.42, { all: NOXE.violet, px: '#7d3ff2' }), -0.17, 0.68, -0.18, 0.25, 0.2);
}

/** Snake plant: stiff upright sword leaves, dark green with light edges. */
export function snakePlant(B, rand, x, y, z) {
  for (let i = 0; i < 9; i++) {
    const h = 0.95 + rand() * 0.8;
    const g = new THREE.ConeGeometry(0.15, h, 4, 1);
    g.deleteAttribute('uv');
    g.rotateY(Math.PI / 4);
    g.scale(1, 1, 0.3);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const a = new THREE.Color(i % 3 ? '#2f6b43' : '#3c7d4c'), e = new THREE.Color('#b9c46a');
    for (let k = 0; k < n; k++) {
      const c = Math.abs(g.attributes.position.getX(k)) > 0.12 ? e : a;
      col.set([c.r, c.g, c.b], k * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.translate(0, h / 2, 0);
    const ang = (i / 9) * Math.PI * 2 + rand();
    g.rotateZ((rand() - 0.5) * 0.35);
    g.rotateY(ang);
    g.translate(x + Math.cos(ang) * 0.13, y, z + Math.sin(ang) * 0.13);
    B.add('leaf', g);
  }
}
