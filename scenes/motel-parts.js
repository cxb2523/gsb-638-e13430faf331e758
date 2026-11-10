import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as K from './kit.js';
import { toon, fxMaterial } from '../engine/materials.js';

// Building blocks for the Motel scene: strata terrain, neon tubes, motel wings, office,
// the roadside sign, vehicles, desert plants, windmill and a small particle emitter.

const { paint, merge, mesh } = K;
const UP = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------- geometry helpers

function orient(g, rot) {
  if (!rot) return g;
  if (rot[0]) g.rotateX(rot[0]);
  if (rot[1]) g.rotateY(rot[1]);
  if (rot[2]) g.rotateZ(rot[2]);
  return g;
}

/** Painted box, rotated (x, y, z order) then moved. */
export function box(w, h, d, x, y, z, color, rot) {
  const g = orient(new THREE.BoxGeometry(w, h, d), rot);
  g.translate(x, y, z);
  return paint(g, color);
}

/** Painted cylinder (axis along y before rotation). */
export function cyl(rt, rb, h, x, y, z, color, seg = 8, rot) {
  const g = orient(new THREE.CylinderGeometry(rt, rb, h, seg), rot);
  g.translate(x, y, z);
  return paint(g, color);
}

/** Painted square beam from a to b. */
export function beam(a, b, t, color) {
  const d = b.clone().sub(a);
  const len = d.length();
  const g = new THREE.BoxGeometry(t, len, t);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  g.translate(a.x, a.y, a.z);
  return paint(g, color);
}

/** Merge painted parts into one vertex-coloured toon mesh. facet: recompute flat normals. */
export function solid(parts, opts = {}, { facet = false, cast = true, receive = true } = {}) {
  const g = merge(parts);
  if (facet) g.computeVertexNormals();
  return mesh(g, toon('#ffffff', { vertexColors: true, noise: 0.08, ...opts }), { cast, receive });
}

function mergePN(list) {
  return mergeGeometries(list.map((g) => {
    const x = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(x.attributes)) if (k !== 'position' && k !== 'normal') x.deleteAttribute(k);
    return x;
  }), false);
}

// ---------------------------------------------------------------- strata terrain

/**
 * Stepped diorama block like kit.terrain, but every wall (inner cliffs too) is cut at the
 * strata lines in `bands`, so mesas and the block sides share the same horizontal rock layers.
 * side(x, z, y, h, outer, color, face) colours each wall piece.
 */
export function strataTerrain({ size = 16, cells = 48, height, step = 0.3, base = -2.4, top, side, bands = [], lip = 0.08 }) {
  const cs = size / cells, half = size / 2;
  const H = new Float32Array(cells * cells);
  for (let i = 0; i < cells; i++)
    for (let j = 0; j < cells; j++) {
      const x = -half + (i + 0.5) * cs, z = -half + (j + 0.5) * cs;
      H[i * cells + j] = Math.round(height(x, z) / step) * step;
    }
  const hAt = (i, j) => (i < 0 || j < 0 || i >= cells || j >= cells ? null : H[i * cells + j]);
  const P = [], N = [], C = [];
  const col = new THREE.Color();
  const quad = (a, b, c, d, n) => {
    for (const v of [a, b, c, a, c, d]) {
      P.push(v[0], v[1], v[2]);
      N.push(n[0], n[1], n[2]);
      C.push(col.r, col.g, col.b);
    }
  };
  for (let i = 0; i < cells; i++)
    for (let j = 0; j < cells; j++) {
      const h = H[i * cells + j];
      const x0 = -half + i * cs, x1 = x0 + cs, z0 = -half + j * cs, z1 = z0 + cs;
      const xc = x0 + cs / 2, zc = z0 + cs / 2;
      top(xc, zc, h, col);
      quad([x0, h, z0], [x0, h, z1], [x1, h, z1], [x1, h, z0], [0, 1, 0]);
      const sides = [
        [1, 0, (lo, hi) => [[x1, lo, z0], [x1, hi, z0], [x1, hi, z1], [x1, lo, z1]], [1, 0, 0], '+x'],
        [-1, 0, (lo, hi) => [[x0, lo, z1], [x0, hi, z1], [x0, hi, z0], [x0, lo, z0]], [-1, 0, 0], '-x'],
        [0, 1, (lo, hi) => [[x1, lo, z1], [x1, hi, z1], [x0, hi, z1], [x0, lo, z1]], [0, 0, 1], '+z'],
        [0, -1, (lo, hi) => [[x0, lo, z0], [x0, hi, z0], [x1, hi, z0], [x1, lo, z0]], [0, 0, -1], '-z'],
      ];
      for (const [di, dj, verts, n, face] of sides) {
        const hn = hAt(i + di, j + dj);
        const outer = hn === null;
        const lo = outer ? base : hn;
        if (lo >= h - 1e-4) continue;
        const cuts = [lo, h];
        for (const b of bands) if (b > lo + 1e-3 && b < h - lip - 1e-3) cuts.push(b);
        if (h - lip > lo + 1e-3) cuts.push(h - lip);
        cuts.sort((p, q) => p - q);
        for (let k = 0; k < cuts.length - 1; k++) {
          const a = cuts[k], b = cuts[k + 1];
          if (b - a < 1e-4) continue;
          side(xc, zc, (a + b) / 2, h, outer, col, face);
          const [p0, p1, p2, p3] = verts(a, b);
          quad(p0, p1, p2, p3, n);
        }
      }
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  const m = mesh(g, toon('#ffffff', { vertexColors: true, noise: 0.15, noiseScale: 3.2 }));
  const heightAt = (x, z) => {
    const i = Math.min(cells - 1, Math.max(0, Math.floor((x + half) / cs)));
    const j = Math.min(cells - 1, Math.max(0, Math.floor((z + half) / cs)));
    return H[i * cells + j];
  };
  let max = -Infinity;
  for (const v of H) max = Math.max(max, v);
  return { mesh: m, heightAt, max, cs };
}

/** Flat rectangles at height y with vertex colours: [x0, x1, z0, z1, colour, lift?]. */
export function flatRects(rects, y) {
  const P = [], N = [], C = [];
  const c = new THREE.Color();
  for (const [x0, x1, z0, z1, hex, lift = 0] of rects) {
    c.set(hex);
    const yy = y + lift;
    for (const [x, z] of [[x0, z0], [x0, z1], [x1, z1], [x0, z0], [x1, z1], [x1, z0]]) {
      P.push(x, yy, z);
      N.push(0, 1, 0);
      C.push(c.r, c.g, c.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  return g;
}

// ---------------------------------------------------------------- neon

/** Straight-segment tube through points (rounded joints). */
export function tubeGeometry(pts, r = 0.04, { closed = false, seg = 6 } = {}) {
  const P = pts.map((p) => (p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2])));
  const parts = [];
  const n = closed ? P.length : P.length - 1;
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    const d = b.clone().sub(a);
    const len = d.length();
    if (len < 1e-4) continue;
    const c = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
    c.translate(0, len / 2, 0);
    c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
    c.translate(a.x, a.y, a.z);
    parts.push(c);
  }
  for (const p of P) {
    const s = new THREE.SphereGeometry(r * 1.03, seg, 4);
    s.translate(p.x, p.y, p.z);
    parts.push(s);
  }
  return mergePN(parts);
}

/** Neon glass: a pale tube by day, emissive colour when glow > 0 (animate with setGlow). */
export function neonMat(color, power = 6.5, glow = 0) {
  const base = new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.5).multiplyScalar(0.62);
  return toon(base, { emissive: color, emissiveIntensity: power, noise: 0, snow: 0, wet: 0, glow });
}

/** Light-up box material (lamp glass) with manual glow control. */
export function lightMat(day, glowColor, power = 4, glow = 0) {
  return toon(day, { emissive: glowColor, emissiveIntensity: power, noise: 0, snow: 0, wet: 0, glow });
}

/**
 * The roadside sign: pole, cabinet with three neon bars, a bent arrow with chaser bulbs and a
 * neon outline, a starburst on top and a small two-bar panel under the cabinet. Faces local +z.
 */
export function neonSign() {
  const g = new THREE.Group();
  const TEAL = '#1d7476', TEAL2 = '#29988f', CREAM = '#f3e3c2', YEL = '#f3bd3a', RED = '#d4432f';
  const P = [];
  // planter base
  P.push(box(1.0, 0.3, 0.66, 0, 0.15, 0, '#b8a284'));
  P.push(box(1.1, 0.06, 0.76, 0, 0.33, 0, '#eadfc8'));
  // pole and braces
  P.push(box(0.2, 5.0, 0.2, 0, 2.82, -0.14, TEAL));
  P.push(box(0.36, 0.16, 0.3, 0, 0.44, -0.14, TEAL));
  // cabinet: cream frame, teal face
  P.push(box(2.1, 1.3, 0.14, 0, 3.3, 0, CREAM));
  P.push(box(2.1, 0.1, 0.18, 0, 2.63, 0, RED));
  // lower panel
  P.push(box(1.24, 0.64, 0.12, 0, 2.08, 0, CREAM));
  // pole cap under the star
  P.push(box(0.3, 0.12, 0.3, 0, 5.36, -0.14, TEAL));
  g.add(solid(P, { noise: 0.1, noiseScale: 5 }));

  // arrow body: one extruded outline, yellow with a red rim drawn by a darker back layer
  const AY = 4.36, AX = -1.42, W = 0.32, YH = 2.6;
  const outline = [
    [1.78, AY + W / 2 + 0.13], [1.62, AY], [1.78, AY - W / 2 - 0.13], [1.44, AY - W / 2],
    [AX + W / 2, AY - W / 2], [AX + W / 2, YH], [AX + 0.4, YH], [AX, YH - 0.56], [AX - 0.4, YH],
    [AX - W / 2, YH], [AX - W / 2, AY + W / 2], [1.44, AY + W / 2],
  ];
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const ag = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false });
  ag.translate(0, 0, -0.02);
  const back = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false });
  back.scale(1.0, 1.0, 1);
  back.translate(0, 0, -0.08);
  g.add(mesh(paint(back, RED), toon('#ffffff', { vertexColors: true, noise: 0.06 })));

  const parts = {};
  const add = (geo, mat, name) => {
    const m = mesh(geo, mat, { cast: false, receive: false });
    g.add(m);
    (parts[name] = parts[name] || []).push(mat);
    return m;
  };
  const face = new THREE.BoxGeometry(1.88, 1.08, 0.06);
  face.translate(0, 3.3, 0.06);
  add(face, lightMat(TEAL2, '#1fcfbd', 0.8), 'face');
  const lower = new THREE.BoxGeometry(1.06, 0.46, 0.05);
  lower.translate(0, 2.08, 0.05);
  add(lower, lightMat('#e9dcc0', '#fff0d2', 1.25), 'lowerFace');
  add(ag, lightMat(YEL, '#ffc23e', 1.35), 'arrowBody');
  // arrow neon outline (pink), sitting on the front face
  add(tubeGeometry(outline.map(([x, y]) => [x, y, 0.085]), 0.042, { closed: true }), neonMat('#ff2b74', 7), 'arrow');
  // chaser bulbs along the arrow's spine, three interleaved groups
  const spine = [];
  for (let x = 1.36; x > AX + 0.05; x -= 0.19) spine.push([x, AY]);
  for (let y = AY - 0.2; y > YH + 0.05; y -= 0.19) spine.push([AX, y]);
  spine.push([AX, YH - 0.2]);
  for (let k = 0; k < 3; k++) {
    const list = [];
    spine.forEach(([x, y], i) => {
      if (i % 3 !== k) return;
      const b = new THREE.BoxGeometry(0.09, 0.09, 0.05);
      b.translate(x, y, 0.08);
      list.push(b);
    });
    add(mergePN(list), lightMat('#efe2b8', '#ffe2a0', 6.5), 'bulbs');
  }
  // cabinet bars and a cyan border
  [[3.6, 1.38], [3.3, 0.92], [3.0, 1.38]].forEach(([y, len]) => add(tubeGeometry([[-len / 2, y, 0.11], [len / 2, y, 0.11]], 0.045), neonMat('#ff3a80', 7), 'bars'));
  add(tubeGeometry([[-0.98, 2.72, 0.1], [-0.98, 3.88, 0.1], [0.98, 3.88, 0.1], [0.98, 2.72, 0.1]], 0.035, { closed: true }), neonMat('#35e8ff', 6), 'border');
  // lower panel: green bar over a red bar
  add(tubeGeometry([[-0.36, 2.2, 0.1], [0.36, 2.2, 0.1]], 0.045), neonMat('#62ff4a', 6.5), 'go');
  add(tubeGeometry([[-0.36, 1.96, 0.1], [0.36, 1.96, 0.1]], 0.045), neonMat('#ff3b3b', 6.5), 'stop');
  // starburst
  const SY = 5.62;
  const longRays = [], shortRays = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 2;
    const R = k % 2 ? 0.44 : 0.78;
    const pts = [[Math.cos(a) * 0.14, SY + Math.sin(a) * 0.14, 0.02], [Math.cos(a) * R, SY + Math.sin(a) * R, 0.02]];
    (k % 2 ? shortRays : longRays).push(tubeGeometry(pts, 0.042));
    if (!(k % 2)) {
      const tip = new THREE.SphereGeometry(0.075, 6, 4);
      tip.translate(Math.cos(a) * (R + 0.04), SY + Math.sin(a) * (R + 0.04), 0.02);
      longRays.push(tip);
    }
  }
  add(mergePN(longRays), neonMat('#3ff3ff', 7), 'starLong');
  add(mergePN(shortRays), neonMat('#ffd84a', 7), 'starShort');
  const core = new THREE.SphereGeometry(0.15, 8, 6);
  core.translate(0, SY, 0.02);
  add(core, neonMat('#fff4dc', 6), 'starCore');
  return { group: g, parts, light: new THREE.Vector3(0, 3.1, 1.1), top: SY + 0.8 };
}

// ---------------------------------------------------------------- motel

/**
 * Single-storey motel wing running along local x, doors on the +z face, covered walkway with
 * posts. Footprint centred on the origin, base y = 0. blank: room slots without door/window.
 * Returns { group, windows: [{ mat, x }] } (x in local space).
 */
export function motelWing({ rooms = 6, roomW = 1.0, depth = 1.5, h = 1.12, canopy = 0.55, wall = '#f2dcbc', fascia = '#2aa39b', doors = ['#2aa39b', '#e7684c', '#e9b04a'], blank = [], skipPosts = [], coolers = [] } = {}) {
  const L = rooms * roomW;
  const g = new THREE.Group();
  const body = mesh(new THREE.BoxGeometry(L, h, depth), toon(wall, { noise: 0.16, noiseScale: 6 }));
  body.position.y = h / 2;
  g.add(body);
  const P = [];
  const fz = depth / 2;
  P.push(box(L + 0.04, 0.09, depth + 0.04, 0, 0.045, 0, '#bfa98a'));
  const walk = canopy + 0.04;
  P.push(box(L, 0.07, walk, 0, 0.035, fz + walk / 2, '#d8cfbf'));
  const z0 = -fz - 0.05, z1 = fz + canopy;
  P.push(box(L + 0.1, 0.09, z1 - z0, 0, h + 0.045, (z0 + z1) / 2, '#d2c6b1'));
  P.push(box(L + 0.14, 0.15, 0.07, 0, h + 0.035, z1, fascia));
  for (const s of [-1, 1]) P.push(box(0.07, 0.15, z1 - z0, s * (L / 2 + 0.05), h + 0.035, (z0 + z1) / 2, fascia));
  for (let k = 0; k <= rooms; k++) {
    if (skipPosts.includes(k)) continue;
    const x = -L / 2 + k * roomW + (k === 0 ? 0.06 : k === rooms ? -0.06 : 0);
    P.push(box(0.08, h - 0.07, 0.08, x, 0.07 + (h - 0.07) / 2, z1 - 0.07, '#f6f1e6'));
  }
  const windows = [];
  for (let k = 0; k < rooms; k++) {
    if (blank.includes(k)) continue;
    const xc = -L / 2 + (k + 0.5) * roomW;
    P.push(box(0.38, 0.67, 0.03, xc + 0.2, 0.405, fz + 0.012, '#f7f2e8'));
    P.push(box(0.3, 0.6, 0.04, xc + 0.2, 0.37, fz + 0.02, doors[k % doors.length]));
    P.push(box(0.04, 0.04, 0.03, xc + 0.3, 0.37, fz + 0.045, '#e8d9a8'));
    P.push(box(0.52, 0.36, 0.03, xc - 0.2, 0.53, fz + 0.012, '#f7f2e8'));
    P.push(box(0.24, 0.13, 0.11, xc - 0.2, 0.25, fz + 0.055, '#bdb7ab'));
    const mat = lightMat('#3b4864', '#ffb45e', 3.2, 0);
    const win = mesh(new THREE.BoxGeometry(0.42, 0.27, 0.04), mat, { cast: false });
    win.position.set(xc - 0.2, 0.53, fz + 0.02);
    g.add(win);
    windows.push({ mat, x: xc - 0.2 });
  }
  for (const k of coolers) {
    const xc = -L / 2 + (k + 0.5) * roomW;
    P.push(box(0.38, 0.26, 0.36, xc, h + 0.22, -0.15, '#c4bcad'));
    P.push(box(0.3, 0.03, 0.28, xc, h + 0.36, -0.15, '#a49b8b'));
    P.push(box(0.03, 0.18, 0.28, xc + 0.2, h + 0.2, -0.15, '#8e8676'));
  }
  for (let k = 0; k < rooms; k++) {
    if (coolers.includes(k) || blank.includes(k)) continue;
    const xc = -L / 2 + (k + 0.5) * roomW;
    P.push(cyl(0.05, 0.05, 0.2, xc + (k % 2 ? 0.28 : -0.22), h + 0.19, -0.42, '#9f978a', 6));
    if (k % 3 === 1) P.push(box(0.16, 0.08, 0.16, xc - 0.3, h + 0.13, 0.2, '#bdb3a3'));
  }
  g.add(solid(P, { noise: 0.08, noiseScale: 6 }));
  return { group: g, windows, length: L };
}

/** Plain block with roof slab (the corner laundry room). */
export function motelBlock({ w = 1.5, d = 1.5, h = 1.12, wall = '#f2dcbc', fascia = '#2aa39b' } = {}) {
  const g = new THREE.Group();
  const body = mesh(new THREE.BoxGeometry(w, h, d), toon(wall, { noise: 0.16, noiseScale: 6 }));
  body.position.y = h / 2;
  g.add(body);
  g.add(solid([
    box(w + 0.04, 0.09, d + 0.04, 0, 0.045, 0, '#bfa98a'),
    box(w + 0.1, 0.09, d + 0.1, 0, h + 0.048, 0, '#d2c6b1'),
    box(0.42, 0.34, 0.42, -0.1, h + 0.27, -0.1, '#c4bcad'),
    box(0.34, 0.03, 0.34, -0.1, h + 0.45, -0.1, '#a49b8b'),
  ], { noise: 0.08 }));
  return g;
}

/**
 * Office with corner glass, a tilted roof and a cyan neon trim. Visible faces +x and +z.
 * Returns { group, glass: material, trim: material, light: Vector3 }.
 */
export function office({ w = 1.9, d = 1.9, h = 1.5, wall = '#2b9f96', stone = '#c99a6c', roofC = '#f3e6cc', fascia = '#e7684c' } = {}) {
  const g = new THREE.Group();
  const body = mesh(new THREE.BoxGeometry(w, h, d), toon(wall, { noise: 0.14, noiseScale: 6 }));
  body.position.y = h / 2;
  g.add(body);
  const P = [];
  P.push(box(w + 0.06, 0.1, d + 0.06, 0, 0.05, 0, '#bfa98a'));
  // stone wing wall on the left of the +z face
  P.push(box(0.5, h * 0.92, 0.1, -w / 2 + 0.25, h * 0.46, d / 2 + 0.04, stone));
  // window frames (cream)
  P.push(box(w - 0.48, 0.74, 0.03, 0.2, 0.74, d / 2 + 0.012, '#f6efe2'));
  P.push(box(0.03, 0.74, d - 0.36, w / 2 + 0.012, 0.74, 0.1, '#f6efe2'));
  // mullions
  for (const x of [-0.06, 0.4]) P.push(box(0.07, 0.68, 0.05, x, 0.74, d / 2 + 0.03, '#f6efe2'));
  for (const z of [-0.26, 0.38]) P.push(box(0.05, 0.68, 0.07, w / 2 + 0.03, 0.74, z, '#f6efe2'));
  // door
  P.push(box(0.36, 0.7, 0.04, -w / 2 + 0.25, 0.42, d / 2 + 0.1, '#e9b04a'));
  // walkway apron
  P.push(box(w + 0.5, 0.07, 0.55, 0.25, 0.035, d / 2 + 0.3, '#d8cfbf'));
  P.push(box(0.55, 0.07, d, w / 2 + 0.3, 0.035, 0.0, '#d8cfbf'));
  g.add(solid(P, { noise: 0.08, noiseScale: 6 }));
  const glass = lightMat('#3b4864', '#ffcc7a', 3.6, 0);
  const gz = mesh(new THREE.BoxGeometry(w - 0.56, 0.66, 0.04), glass, { cast: false });
  gz.position.set(0.2, 0.74, d / 2 + 0.02);
  const gx = mesh(new THREE.BoxGeometry(0.04, 0.66, d - 0.44), glass, { cast: false });
  gx.position.set(w / 2 + 0.02, 0.74, 0.1);
  g.add(gz, gx);
  // tilted roof floating over a clerestory
  const clere = mesh(new THREE.BoxGeometry(w - 0.1, 0.16, d - 0.1), glass, { cast: false });
  clere.position.set(0, h + 0.08, 0);
  g.add(clere);
  const roof = solid([
    box(w + 0.7, 0.1, d + 0.7, 0, 0, 0, roofC),
    box(w + 0.74, 0.14, 0.06, 0, -0.01, (d + 0.7) / 2, fascia),
    box(0.06, 0.14, d + 0.74, (w + 0.7) / 2, -0.01, 0, fascia),
  ], { noise: 0.06 });
  roof.rotation.set(-0.13, 0, 0.11);
  roof.position.set(0.12, h + 0.3, 0.12);
  g.add(roof);
  // cyan neon along the roof's two front edges
  roof.updateMatrix();
  const e = [[-(w + 0.7) / 2, 0.02, (d + 0.7) / 2 + 0.05], [(w + 0.7) / 2 + 0.05, 0.02, (d + 0.7) / 2 + 0.05], [(w + 0.7) / 2 + 0.05, 0.02, -(d + 0.7) / 2]]
    .map(([x, y, z]) => new THREE.Vector3(x, y, z).applyMatrix4(roof.matrix));
  const trim = neonMat('#40f0ff', 6, 0);
  g.add(mesh(tubeGeometry(e, 0.04), trim, { cast: false, receive: false }));
  return { group: g, glass, trim, light: new THREE.Vector3(w / 2 + 0.6, 0.8, d / 2 + 0.6) };
}

/** Glowing soda machine, front on local +z. */
export function vending({ body = '#d6363a' } = {}) {
  const g = new THREE.Group();
  g.add(solid([
    box(0.42, 0.7, 0.34, 0, 0.35, 0, body),
    box(0.44, 0.06, 0.36, 0, 0.72, 0, '#f2ece0'),
    box(0.11, 0.3, 0.03, 0.12, 0.34, 0.175, '#2b2d36'),
    box(0.3, 0.08, 0.03, -0.02, 0.07, 0.175, '#2b2d36'),
  ], { noise: 0.05 }));
  const panel = K.glass('#e9f6ff', 3.4, '#cdd8e2');
  const p = mesh(new THREE.BoxGeometry(0.22, 0.46, 0.03), panel, { cast: false });
  p.position.set(-0.07, 0.42, 0.175);
  g.add(p);
  return g;
}

/** Ice machine with a blue lit strip. */
export function iceMachine() {
  const g = new THREE.Group();
  g.add(solid([box(0.44, 0.56, 0.34, 0, 0.28, 0, '#e9edf0'), box(0.46, 0.05, 0.36, 0, 0.58, 0, '#b8c0c8'), box(0.34, 0.2, 0.03, 0, 0.22, 0.175, '#c7cfd6')], { noise: 0.05 }));
  const strip = K.glass('#5ac8ff', 3.2, '#9fc6dc');
  const s = mesh(new THREE.BoxGeometry(0.34, 0.1, 0.03), strip, { cast: false });
  s.position.set(0, 0.46, 0.175);
  g.add(s);
  return g;
}

// ---------------------------------------------------------------- vehicles

/** Late-fifties car with fins, two-tone, facing +x. */
export function vintageCar({ body = '#3fb5a8', roof = '#f1e6cf', len = 1.2, wid = 0.5 } = {}) {
  const g = new THREE.Group();
  const L = len, W = wid, CH = '#dfe3e8';
  const P = [];
  P.push(box(L, 0.17, W, 0, 0.195, 0, body));
  P.push(box(L * 0.98, 0.04, W + 0.012, 0, 0.255, 0, roof));
  for (const s of [1, -1]) P.push(box(0.34, 0.08, 0.075, -L / 2 + 0.18, 0.3, s * (W / 2 - 0.04), body, [0, 0, 0.16]));
  P.push(box(L * 0.44, 0.13, W * 0.84, -0.07, 0.34, 0, '#28324a'));
  P.push(box(L * 0.5, 0.045, W * 0.9, -0.08, 0.42, 0, roof));
  P.push(box(0.05, 0.075, W + 0.03, L / 2 + 0.02, 0.14, 0, CH));
  P.push(box(0.05, 0.075, W + 0.03, -L / 2 - 0.02, 0.14, 0, CH));
  for (const [x, z] of [[L * 0.31, W / 2], [L * 0.31, -W / 2], [-L * 0.31, W / 2], [-L * 0.31, -W / 2]]) {
    P.push(cyl(0.095, 0.095, 0.08, x, 0.095, z, '#1c1d22', 10, [Math.PI / 2, 0, 0]));
    P.push(cyl(0.05, 0.05, 0.09, x, 0.095, z, '#d9d6cc', 8, [Math.PI / 2, 0, 0]));
  }
  g.add(solid(P, { noise: 0.04 }));
  const head = K.glass('#fff2c8', 6.5, '#efe9d6'), tail = K.glass('#ff3b30', 5, '#9a2c28');
  for (const s of [1, -1]) {
    const hl = mesh(new THREE.BoxGeometry(0.03, 0.07, 0.09), head, { cast: false });
    hl.position.set(L / 2 + 0.008, 0.22, s * 0.16);
    const tl = mesh(new THREE.BoxGeometry(0.03, 0.06, 0.07), tail, { cast: false });
    tl.position.set(-L / 2 - 0.008, 0.28, s * (W / 2 - 0.04));
    g.add(hl, tl);
  }
  return { group: g, front: L / 2 + 0.05, back: L / 2 + 0.05, lamp: new THREE.Vector3(L / 2 + 0.02, 0.22, 0) };
}

/** Pickup truck facing +x. */
export function pickup({ body = '#b8553a', len = 1.2, wid = 0.5 } = {}) {
  const g = new THREE.Group();
  const L = len, W = wid;
  const P = [];
  P.push(box(L, 0.18, W, 0, 0.2, 0, body));
  P.push(box(0.36, 0.2, W * 0.92, 0.1, 0.39, 0, body));
  P.push(box(0.3, 0.13, W * 0.94, 0.12, 0.4, 0, '#28324a'));
  P.push(box(0.5, 0.08, W - 0.08, -0.33, 0.3, 0, '#5a3a2c'));
  P.push(box(0.05, 0.07, W + 0.03, L / 2 + 0.02, 0.14, 0, '#c9ccd2'));
  for (const [x, z] of [[L * 0.32, W / 2], [L * 0.32, -W / 2], [-L * 0.3, W / 2], [-L * 0.3, -W / 2]]) P.push(cyl(0.1, 0.1, 0.08, x, 0.1, z, '#1c1d22', 10, [Math.PI / 2, 0, 0]));
  g.add(solid(P, { noise: 0.06 }));
  const head = K.glass('#fff2c8', 6.5, '#efe9d6'), tail = K.glass('#ff3b30', 5, '#9a2c28');
  for (const s of [1, -1]) {
    const hl = mesh(new THREE.BoxGeometry(0.03, 0.06, 0.08), head, { cast: false });
    hl.position.set(L / 2 + 0.008, 0.24, s * 0.16);
    const tl = mesh(new THREE.BoxGeometry(0.03, 0.06, 0.06), tail, { cast: false });
    tl.position.set(-L / 2 - 0.008, 0.24, s * 0.19);
    g.add(hl, tl);
  }
  return { group: g, front: L / 2 + 0.05, back: L / 2 + 0.05, lamp: new THREE.Vector3(L / 2, 0.24, 0) };
}

/** Big rig: long-nose tractor and a box trailer strung with marker lights, facing +x. */
export function semiTruck({ cab = '#c8372d', trailer = '#eceef0', stripe = '#2aa39b', scale = 1.25 } = {}) {
  const outer = new THREE.Group();
  const g = new THREE.Group();
  g.scale.setScalar(scale);
  outer.add(g);
  const W = 0.58, CH = '#e3e6ea';
  const P = [];
  P.push(box(4.3, 0.1, 0.42, -1.05, 0.21, 0, '#26272d'));
  // tractor
  P.push(box(0.6, 0.32, 0.52, 0.86, 0.4, 0, cab));
  P.push(box(0.04, 0.28, 0.38, 1.17, 0.39, 0, CH));
  P.push(box(0.09, 0.09, W + 0.04, 1.18, 0.21, 0, CH));
  for (const s2 of [1, -1]) P.push(box(0.36, 0.06, 0.1, 0.86, 0.28, s2 * (W / 2 - 0.02), '#2b2c33'));
  P.push(box(0.52, 0.68, W, 0.31, 0.57, 0, cab));
  P.push(box(0.03, 0.24, W - 0.1, 0.575, 0.73, 0, '#253049'));
  for (const s2 of [1, -1]) P.push(box(0.24, 0.2, 0.02, 0.4, 0.72, s2 * (W / 2 + 0.006), '#253049'));
  P.push(box(0.46, 0.64, W, -0.18, 0.55, 0, cab));
  P.push(box(0.5, 0.06, W + 0.02, 0.31, 0.92, 0, '#a52b23'));
  for (const s2 of [1, -1]) {
    P.push(cyl(0.045, 0.045, 0.9, 0.06, 0.72, s2 * (W / 2 + 0.04), CH, 8));
    P.push(cyl(0.095, 0.095, 0.34, 0.3, 0.22, s2 * (W / 2 - 0.02), CH, 10, [0, 0, Math.PI / 2]));
  }
  // trailer
  const TX0 = -3.3, TX1 = -0.46;
  P.push(box(TX1 - TX0, 0.86, W + 0.02, (TX0 + TX1) / 2, 0.79, 0, trailer));
  P.push(box(TX1 - TX0 - 0.12, 0.13, W + 0.035, (TX0 + TX1) / 2, 0.98, 0, stripe));
  P.push(box(TX1 - TX0 - 0.12, 0.05, W + 0.035, (TX0 + TX1) / 2, 0.84, 0, stripe));
  P.push(box(0.05, 0.84, W + 0.03, TX0 - 0.01, 0.79, 0, '#c9ccd2'));
  for (const x of [0.88, -0.22, -0.5, -2.75, -3.03])
    for (const s2 of [1, -1]) P.push(cyl(0.14, 0.14, 0.1, x, 0.14, s2 * (W / 2 - 0.04), '#1b1c21', 10, [Math.PI / 2, 0, 0]));
  g.add(solid(P, { noise: 0.05, noiseScale: 5 }));
  // lights, merged per colour
  const head = lightMat('#efe9d6', '#fff4d0', 8, 1);
  const amber = lightMat('#d39a3c', '#ffb02e', 5.5, 1);
  const red = lightMat('#8a2a26', '#ff3426', 5, 1);
  const sets = { head: [], amber: [], red: [] };
  const lamp = (set, w, h, d, x, y, z) => {
    const b = new THREE.BoxGeometry(w, h, d);
    b.translate(x, y, z);
    sets[set].push(b);
  };
  for (const s2 of [1, -1]) lamp('head', 0.04, 0.09, 0.12, 1.18, 0.44, s2 * 0.19);
  for (const z of [-0.2, -0.1, 0, 0.1, 0.2]) lamp('amber', 0.07, 0.05, 0.06, 0.55, 0.96, z);
  for (const s2 of [1, -1]) {
    for (let x = TX1 - 0.12; x > TX0 + 0.05; x -= 0.36) {
      lamp('amber', 0.07, 0.06, 0.03, x, 1.19, s2 * (W / 2 + 0.025));
      lamp('amber', 0.07, 0.06, 0.03, x - 0.18, 0.4, s2 * (W / 2 + 0.025));
    }
    lamp('amber', 0.07, 0.06, 0.03, 0.86, 0.5, s2 * (W / 2 - 0.0));
    lamp('red', 0.03, 0.1, 0.08, TX0 - 0.04, 0.44, s2 * 0.2);
    lamp('red', 0.03, 0.06, 0.06, TX0 - 0.04, 1.16, s2 * 0.22);
  }
  for (let k = -2; k <= 2; k++) lamp('red', 0.03, 0.05, 0.05, TX0 - 0.04, 1.16, k * 0.06);
  for (const [k, mat] of [['head', head], ['amber', amber], ['red', red]]) g.add(mesh(mergePN(sets[k]), mat, { cast: false }));
  const S = scale;
  return {
    group: outer, front: 1.25 * S, back: 3.36 * S, mats: { head, amber, red },
    stack: { y: 1.2 * S, side: (W / 2 + 0.04) * S, x: 0.06 * S },
  };
}

/** Silver travel trailer (capsule) facing +x. */
export function airstream({ len = 1.7 } = {}) {
  const g = new THREE.Group();
  const shell = new THREE.CapsuleGeometry(0.34, len - 0.68, 4, 10);
  shell.rotateZ(Math.PI / 2);
  shell.scale(1, 1.05, 0.92);
  shell.translate(0, 0.52, 0);
  const sh = mesh(paint(shell.toNonIndexed(), '#d5dbe2'), toon('#ffffff', { vertexColors: true, noise: 0.05 }));
  sh.geometry.computeVertexNormals();
  g.add(sh);
  g.add(solid([
    box(len * 0.82, 0.05, 0.66, 0, 0.18, 0, '#7f8791'),
    cyl(0.11, 0.11, 0.08, 0, 0.11, 0.3, '#1c1d22', 10, [Math.PI / 2, 0, 0]),
    cyl(0.11, 0.11, 0.08, 0, 0.11, -0.3, '#1c1d22', 10, [Math.PI / 2, 0, 0]),
    box(0.5, 0.04, 0.05, len / 2 + 0.2, 0.2, 0, '#54595f'),
    box(0.3, 0.38, 0.03, -0.25, 0.5, 0.315, '#e7c34a'),
  ], { noise: 0.05 }));
  const win = lightMat('#3b4864', '#ffbd6a', 3, 0);
  const w = mesh(new THREE.BoxGeometry(0.62, 0.12, 0.04), win, { cast: false });
  w.position.set(0.32, 0.62, 0.3);
  g.add(w);
  return { group: g, window: win };
}

// ---------------------------------------------------------------- desert

export function saguaroGeometry(rand, { h = 1.6, r = 0.14, arms = 2, color = '#5b8a4b', tip = '#79a35e' } = {}) {
  const parts = [];
  const seg = 8;
  const trunk = new THREE.CylinderGeometry(r * 0.94, r * 1.05, h, seg);
  trunk.translate(0, h / 2, 0);
  parts.push(paint(trunk, color));
  const cap = new THREE.SphereGeometry(r * 0.94, seg, 3, 0, Math.PI * 2, 0, Math.PI / 2);
  cap.translate(0, h, 0);
  parts.push(paint(cap, tip));
  const base = rand() * Math.PI * 2;
  for (let k = 0; k < arms; k++) {
    const ang = base + k * Math.PI + (rand() - 0.5) * 0.9;
    const ay = h * (0.34 + rand() * 0.22);
    const out = r + 0.13 + rand() * 0.1;
    const up = h * (0.22 + rand() * 0.24);
    const ar = r * 0.74;
    const arm = [];
    const stub = new THREE.CylinderGeometry(ar, ar, out, seg);
    stub.rotateZ(Math.PI / 2);
    stub.translate(out / 2, ay, 0);
    arm.push(paint(stub, color));
    const elbow = new THREE.SphereGeometry(ar, seg, 4);
    elbow.translate(out, ay, 0);
    arm.push(paint(elbow, color));
    const rise = new THREE.CylinderGeometry(ar * 0.95, ar, up, seg);
    rise.translate(out, ay + up / 2, 0);
    arm.push(paint(rise, color));
    const acap = new THREE.SphereGeometry(ar * 0.95, seg, 3, 0, Math.PI * 2, 0, Math.PI / 2);
    acap.translate(out, ay + up, 0);
    arm.push(paint(acap, tip));
    for (const a of arm) {
      a.rotateY(ang);
      parts.push(a);
    }
  }
  const g = merge(parts);
  g.computeVertexNormals();
  return g;
}

export function tumbleweedGeometry(rand, r = 0.3) {
  // a dark core inside a tangled shell of straw twigs (random chords of the sphere)
  const parts = [];
  const core = new THREE.IcosahedronGeometry(r * 0.55, 0);
  K.jitter(core, r * 0.25, Math.floor(rand() * 1000));
  parts.push(paint(core, '#6e5536'));
  const onSphere = () => {
    const u = rand() * 2 - 1, a = rand() * Math.PI * 2, q = Math.sqrt(1 - u * u);
    return new THREE.Vector3(q * Math.cos(a), u, q * Math.sin(a)).multiplyScalar(r * (0.85 + rand() * 0.2));
  };
  const C = ['#c49a5e', '#a98450', '#d8b57a', '#8f6c42'];
  for (let k = 0; k < 18; k++) parts.push(beam(onSphere(), onSphere(), 0.065, C[k % 4]));
  const g = merge(parts);
  g.computeVertexNormals();
  return g;
}

export function palmGeometry(rand, { h = 2.5 } = {}) {
  const parts = [];
  const lean = [(rand() - 0.5) * 0.35, (rand() - 0.5) * 0.35];
  const at = (t) => [lean[0] * t * t, lean[1] * t * t];
  const segs = 6;
  for (let k = 0; k < segs; k++) {
    const t0 = k / segs, t1 = (k + 1) / segs;
    const [x0, z0] = at(t0), [x1, z1] = at(t1);
    const a = new THREE.Vector3(x0, t0 * h, z0), b = new THREE.Vector3(x1, t1 * h, z1);
    const len = a.distanceTo(b);
    const c = new THREE.CylinderGeometry(0.075 - k * 0.004, 0.085 - k * 0.004, len, 6);
    c.translate(0, len / 2, 0);
    c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize()));
    c.translate(a.x, a.y, a.z);
    parts.push(paint(c, k % 2 ? '#8e7055' : '#7c6049'));
  }
  const [tx, tz] = at(1);
  const skirt = new THREE.ConeGeometry(0.17, 0.42, 7);
  skirt.rotateX(Math.PI);
  skirt.translate(tx, h - 0.1, tz);
  parts.push(paint(skirt, '#a5834f'));
  const n = 12;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rand() * 0.3;
    const len = 0.72 + rand() * 0.22;
    const f = new THREE.BoxGeometry(len, 0.035, 0.17);
    f.translate(len / 2, 0, 0);
    f.rotateZ(-0.25 - rand() * 0.45);
    f.rotateY(a);
    f.translate(tx, h + 0.1, tz);
    parts.push(paint(f, k % 3 === 0 ? '#5a8a42' : k % 3 === 1 ? '#6f9e4f' : '#81ad57'));
  }
  const g = merge(parts);
  g.computeVertexNormals();
  return g;
}

/**
 * Steel windmill water pump. head turns to face the wind, rotor spins around the head's x axis.
 * The rotor faces local -x of the head (upwind), the tail vane points +x (downwind).
 */
export function windmill({ h = 3.1, base = 1.0, top = 0.26, steel = '#a3a6ab' } = {}) {
  const g = new THREE.Group();
  const P = [];
  const corner = (y, sx, sz) => {
    const w = base + (top - base) * (y / h);
    return new THREE.Vector3((sx * w) / 2, y, (sz * w) / 2);
  };
  const C = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
  for (const [sx, sz] of C) P.push(beam(corner(0, sx, sz), corner(h, sx, sz), 0.09, steel));
  const lv = [0.04, 0.36, 0.64, 0.86].map((f) => f * h);
  for (let i = 0; i < lv.length; i++) {
    for (let k = 0; k < 4; k++) {
      const [ax, az] = C[k], [bx, bz] = C[(k + 1) % 4];
      P.push(beam(corner(lv[i], ax, az), corner(lv[i], bx, bz), 0.06, steel));
      if (i < lv.length - 1) {
        P.push(beam(corner(lv[i], ax, az), corner(lv[i + 1], bx, bz), 0.05, steel));
        P.push(beam(corner(lv[i], bx, bz), corner(lv[i + 1], ax, az), 0.05, steel));
      }
    }
  }
  P.push(box(top + 0.36, 0.06, top + 0.36, 0, h, 0, '#8d9096'));
  g.add(solid(P, { noise: 0.05 }));
  const head = new THREE.Group();
  head.position.y = h + 0.18;
  head.add(solid([
    box(0.36, 0.18, 0.18, 0, 0, 0, '#7d8288'),
    box(1.0, 0.07, 0.07, 0.62, 0.02, 0, '#7d8288'),
    box(0.52, 0.36, 0.025, 1.0, 0.08, 0, '#e9e2d2'),
    box(0.52, 0.08, 0.03, 1.0, 0.18, 0, '#c9473a'),
  ], { noise: 0.05 }));
  const rotor = new THREE.Group();
  rotor.position.x = -0.26;
  const blades = [];
  const nB = 16;
  for (let k = 0; k < nB; k++) {
    const b = new THREE.BoxGeometry(0.02, 0.44, 0.12);
    b.translate(0, 0.36, 0);
    b.rotateY(0.45);
    b.rotateX((k / nB) * Math.PI * 2);
    blades.push(paint(b, k % 4 === 0 ? '#c9473a' : '#c8ccd2'));
  }
  const hub = new THREE.CylinderGeometry(0.08, 0.08, 0.1, 8);
  hub.rotateZ(Math.PI / 2);
  blades.push(paint(hub, '#7d8288'));
  rotor.add(solid(blades, { noise: 0.04 }));
  head.add(rotor);
  g.add(head);
  return { group: g, head, rotor };
}

// ---------------------------------------------------------------- effects

/** Flat additive light pool in front of a vehicle (local +x), clipped to the block. */
export function headBeam({ from = 0.6, len = 2.4, w0 = 0.34, w1 = 1.1, y = 0.02, color = '#ffe4b0', edge = 8 } = {}) {
  const P = [], U = [];
  const ring = [[from, -w0 / 2, 0, -1], [from, w0 / 2, 0, 1], [from + len, w1 / 2, 1, 1], [from + len, -w1 / 2, 1, -1]];
  for (const i of [0, 1, 2, 0, 2, 3]) {
    P.push(ring[i][0], y, ring[i][1]);
    U.push(ring[i][2], ring[i][3]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('aUV', new THREE.Float32BufferAttribute(U, 2));
  const mat = fxMaterial({
    vertexShader: /* glsl */`
      attribute vec2 aUV;
      varying vec2 vUV;
      varying vec3 vW;
      void main() {
        vUV = aUV;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform float uOn;
      uniform float uEdge;
      uniform vec3 uColor;
      varying vec2 vUV;
      varying vec3 vW;
      void main() {
        if (abs(vW.x) > uEdge || abs(vW.z) > uEdge) discard;
        float a = 1.0 - vUV.x;
        a = a * a * (0.35 + 0.65 * smoothstep(0.0, 0.12, vUV.x));
        float side = 1.0 - smoothstep(0.45, 1.0, abs(vUV.y));
        float k = a * side * uOn;
        if (k < 0.02) discard;
        gl_FragColor = vec4(uColor * k, 1.0);
        gNormal = vec4(0.0);
      }`,
    uniforms: { uOn: { value: 0 }, uEdge: { value: edge }, uColor: { value: new THREE.Color(color) } },
    blending: THREE.AdditiveBlending,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.layers.set(2);
  return { mesh: m, mat };
}

/** CPU particle puffs (dust, exhaust, spray), drawn as square points, clipped to the block. */
export class Puffs {
  constructor(n = 240, edge = 8) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.alpha = new Float32Array(n);
    this.size = new Float32Array(n);
    this.age = new Float32Array(n).fill(99);
    this.life = new Float32Array(n).fill(1);
    this.a0 = new Float32Array(n);
    this.s0 = new Float32Array(n);
    this.g = new Float32Array(n);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    const dyn = (arr, k) => new THREE.BufferAttribute(arr, k).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', dyn(this.pos, 3));
    g.setAttribute('aColor', dyn(this.col, 3));
    g.setAttribute('aAlpha', dyn(this.alpha, 1));
    g.setAttribute('aSize', dyn(this.size, 1));
    this.geo = g;
    const mat = fxMaterial({
      vertexShader: /* glsl */`
        attribute vec3 aColor;
        attribute float aAlpha;
        attribute float aSize;
        varying vec3 vC;
        varying float vA;
        varying vec3 vW;
        void main() {
          vC = aColor; vA = aAlpha; vW = position;
          gl_PointSize = aSize;
          gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform float uEdge;
        varying vec3 vC;
        varying float vA;
        varying vec3 vW;
        void main() {
          if (vA < 0.04 || abs(vW.x) > uEdge || abs(vW.z) > uEdge) discard;
          gl_FragColor = vec4(vC, vA);
          gNormal = vec4(0.0);
        }`,
      uniforms: { uEdge: { value: edge } },
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
  }

  emit(x, y, z, vx, vy, vz, life, color, alpha = 0.8, size = 2, gravity = 0) {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.col.set([color.r, color.g, color.b], i * 3);
    this.age[i] = 0;
    this.life[i] = life;
    this.a0[i] = alpha;
    this.s0[i] = size;
    this.g[i] = gravity;
  }

  update(dt, wx = 0, wz = 0) {
    for (let i = 0; i < this.n; i++) {
      if (this.age[i] >= this.life[i]) {
        this.alpha[i] = 0;
        continue;
      }
      this.age[i] += dt;
      const t = this.age[i] / this.life[i];
      const drag = Math.exp(-dt * 1.6);
      this.vel[i * 3] = this.vel[i * 3] * drag + wx * dt * 0.8;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * (this.g[i] ? 0.99 : drag) - this.g[i] * dt;
      this.vel[i * 3 + 2] = this.vel[i * 3 + 2] * drag + wz * dt * 0.8;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = this.a0[i] * (1 - t) * Math.min(1, t * 8);
      this.size[i] = this.g[i] ? this.s0[i] : Math.round(this.s0[i] * (0.7 + t * 0.9));
    }
    for (const k of ['position', 'aColor', 'aAlpha', 'aSize']) this.geo.attributes[k].needsUpdate = true;
  }
}
