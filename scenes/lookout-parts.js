import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as K from './kit.js';
import { toon } from '../engine/materials.js';

// Building blocks for the Lookout scene: stepped summit rock, the fire lookout tower,
// the rolling cloud sea, distant peaks, krummholz, flag, railing and a soaring eagle.

export const S2 = Math.SQRT1_2;
// u runs to the right of the default view, v runs toward the camera
export const toUV = (x, z) => [(x - z) * S2, (x + z) * S2];
export const toXZ = (u, v) => [(u + v) * S2, (v - u) * S2];
export const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export function box(w, h, d, x, y, z, color, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return K.paint(g, color);
}

const UP = new THREE.Vector3(0, 1, 0);
/** Square beam between two points. */
export function beam(a, b, t, color, t2 = t) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const d = B.clone().sub(A);
  const len = d.length();
  const g = new THREE.BoxGeometry(t, len, t2);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, d.normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(A.add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return K.paint(g, color);
}

// ---------------------------------------------------------------- summit rock

/**
 * Stepped terrain like kit.terrain, but with an open footprint: cells below `cut` are left out
 * (they sit under the cloud sea), and every wall gets rock bands, not only the outer ones.
 * side(x, z, y, h, below, color) where below = distance from the cell top.
 */
export function stepTerrain({ size, cells, step, height, cut, base, lip = 0.1, band = 0.6, top, side, topNormal = [0, 1, 0] }) {
  const cs = size / cells, half = size / 2;
  const H = new Float32Array(cells * cells);
  for (let i = 0; i < cells; i++)
    for (let j = 0; j < cells; j++) {
      const x = -half + (i + 0.5) * cs, z = -half + (j + 0.5) * cs;
      H[i * cells + j] = Math.round(height(x, z) / step) * step;
    }
  const CUT = new Float32Array(cells * cells);
  for (let i = 0; i < cells; i++)
    for (let j = 0; j < cells; j++) CUT[i * cells + j] = typeof cut === 'function' ? cut(-half + (i + 0.5) * cs, -half + (j + 0.5) * cs) : cut;
  const live = (i, j) => i >= 0 && j >= 0 && i < cells && j < cells && H[i * cells + j] >= CUT[i * cells + j];
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
      if (!live(i, j)) continue;
      const h = H[i * cells + j];
      const x0 = -half + i * cs, x1 = x0 + cs, z0 = -half + j * cs, z1 = z0 + cs;
      const xc = x0 + cs / 2, zc = z0 + cs / 2;
      top(xc, zc, h, col);
      quad([x0, h, z0], [x0, h, z1], [x1, h, z1], [x1, h, z0], topNormal);
      const sides = [
        [1, 0, (lo, hi) => [[x1, lo, z0], [x1, hi, z0], [x1, hi, z1], [x1, lo, z1]], [1, 0, 0]],
        [-1, 0, (lo, hi) => [[x0, lo, z1], [x0, hi, z1], [x0, hi, z0], [x0, lo, z0]], [-1, 0, 0]],
        [0, 1, (lo, hi) => [[x1, lo, z1], [x1, hi, z1], [x0, hi, z1], [x0, lo, z1]], [0, 0, 1]],
        [0, -1, (lo, hi) => [[x0, lo, z0], [x0, hi, z0], [x1, hi, z0], [x1, lo, z0]], [0, 0, -1]],
      ];
      for (const [di, dj, verts, n] of sides) {
        const lo = live(i + di, j + dj) ? H[(i + di) * cells + j + dj] : base;
        if (lo >= h - 1e-4) continue;
        const cuts = [lo];
        for (let y = Math.ceil((lo + 1e-4) / band) * band; y < h - lip - 1e-4; y += band) cuts.push(y);
        if (h - lip > lo + 1e-4) cuts.push(h - lip);
        cuts.push(h);
        cuts.sort((p, q) => p - q);
        for (let k = 0; k < cuts.length - 1; k++) {
          const a = cuts[k], b = cuts[k + 1];
          if (b - a < 1e-4) continue;
          side(xc + n[0] * cs * 0.5, zc + n[2] * cs * 0.5, (a + b) / 2, h, h - (a + b) / 2, col);
          const [p0, p1, p2, p3] = verts(a, b);
          quad(p0, p1, p2, p3, n);
        }
      }
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  const m = K.mesh(g, toon('#ffffff', { vertexColors: true, noise: 0.2, noiseScale: 3.2 }));
  const heightAt = (x, z) => {
    const i = Math.min(cells - 1, Math.max(0, Math.floor((x + half) / cs)));
    const j = Math.min(cells - 1, Math.max(0, Math.floor((z + half) / cs)));
    return H[i * cells + j];
  };
  let max = -Infinity;
  for (const v of H) max = Math.max(max, v);
  return { mesh: m, heightAt, max, cs };
}

/** Faceted granite boulder or tor block. */
export function graniteGeometry(rand, { w = 0.6, h = 0.5, d = 0.6, color = '#8a849b', jit = 0.12 } = {}) {
  const g = new THREE.BoxGeometry(w, h, d, 2, 2, 2);
  K.jitter(g, Math.min(w, h, d) * jit * 2, Math.floor(rand() * 1000));
  const p = g.attributes.position;
  // round the corners a touch
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (w / 2), y = p.getY(i) / (h / 2), z = p.getZ(i) / (d / 2);
    const k = 1 - 0.1 * Math.max(0, Math.abs(x) + Math.abs(y) + Math.abs(z) - 2);
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k + h / 2, p.getZ(i) * k);
  }
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  return K.paint(ng, color);
}

/** Jagged rock spire (gendarme). */
export function spireGeometry(rand, { h = 1.4, r = 0.35, color = '#7d7690', sides = 5 } = {}) {
  const g = new THREE.CylinderGeometry(r * 0.35, r, h, sides, 3);
  g.translate(0, h / 2, 0);
  K.jitter(g, r * 0.35, Math.floor(rand() * 1000));
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  return K.paint(ng, color);
}

// ---------------------------------------------------------------- clouds

/** Puffy cloud blob: a lumpy sphere with a flattened underside, smooth normals. */
export function blobGeometry(seed = 1, detail = 2) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  K.jitter(g, 0.14, seed);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setY(i, p.getY(i) * 0.4);
  g.deleteAttribute('uv');
  return g;
}

// ---------------------------------------------------------------- distant peaks

/**
 * Faceted snow-capped mountain rising from below the cloud sea. Ridges run from the summit down,
 * snow above a ragged snowline. Base at y = 0 is the cloud line; the skirt runs down to `bottom`.
 */
export function peakGeometry(rand, { r = 4, h = 6, seg = 10, rings = 5, snowY = 3, bottom = -4, rock = ['#605b7d', '#6c6689', '#57526f'], snowC = ['#f3f3fa', '#dfe3f0'], at = [0, 0], lean = [0, 0] } = {}) {
  const ridge = Array.from({ length: seg }, () => 0.45 + rand() * 0.9);
  const rings3 = [];
  for (let k = 0; k <= rings; k++) {
    const t = k / rings;
    const ring = [];
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2 + (rand() - 0.5) * 0.3;
      const rr = k === 0 ? r * 1.3 : r * Math.pow(1 - t, 1.5) * ridge[s] * (0.7 + rand() * 0.6);
      const y = k === 0 ? bottom : h * Math.pow(t, 0.8) + (rand() - 0.5) * 0.5 * (1 - t);
      ring.push(new THREE.Vector3(at[0] + Math.cos(a) * rr + lean[0] * t, y, at[1] + Math.sin(a) * rr + lean[1] * t));
    }
    rings3.push(ring);
  }
  const top = new THREE.Vector3(at[0] + lean[0], h + 0.15, at[1] + lean[1]);
  const P = [], C = [];
  const cR = rock.map((c) => new THREE.Color(c)), cS = snowC.map((c) => new THREE.Color(c));
  const line = Array.from({ length: seg }, () => snowY + (rand() - 0.5) * 0.9);
  const tri = (a, b, c, s, k) => {
    const lo = Math.min(a.y, b.y, c.y), cy = (a.y + b.y + c.y) / 3;
    const rib = ridge[s] > 1.0 && cy < h * 0.9 && cy < line[s] + 1.4;
    const gully = ridge[s] < 0.75 && cy > line[s] - 1.1;
    const isSnow = !rib && (cy > line[s] || gully || (lo > line[s] - 0.4 && rand() < 0.5));
    const col = isSnow ? cS[(s + k) % cS.length] : cR[(s * 7 + k * 3) % cR.length];
    for (const v of [a, b, c]) {
      P.push(v.x, v.y, v.z);
      C.push(col.r, col.g, col.b);
    }
  };
  for (let k = 0; k < rings; k++) {
    const A = rings3[k], B = rings3[k + 1];
    for (let s = 0; s < seg; s++) {
      const s2 = (s + 1) % seg;
      if (k === rings - 1) tri(A[s], top, A[s2], s, k);
      else {
        tri(A[s], B[s], A[s2], s, k);
        tri(A[s2], B[s], B[s2], s, k);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.computeVertexNormals();
  return g;
}

/** A small range: several peaks merged, one shared snowline. subs: [[dx, dz, r, h], ...] */
export function massifGeometry(rand, subs, { snowY, bottom = -4, rock, snowC } = {}) {
  const parts = subs.map(([dx, dz, r, h]) => peakGeometry(rand, { r, h, seg: 7 + Math.floor(rand() * 5), rings: 6, snowY, bottom, rock, snowC, at: [dx, dz], lean: [(rand() - 0.5) * r * 0.4, (rand() - 0.5) * r * 0.4] }));
  return mergeGeometries(parts, false);
}

/** Toon light ramp texture (values 0..255 from N.L = -1 to 1). */
export function rampTexture(values) {
  const data = new Uint8Array(values.length * 4);
  values.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  const t = new THREE.DataTexture(data, values.length, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- vegetation

/** Wind-flagged krummholz pine: a bent trunk, flat tiers streaming to leeward, bare on the windward side. */
export function krummholzGeometry(rand, { h = 1.4, lean = [1, 0], leaf = ['#2b5546', '#376651', '#24483c', '#3f7357'], trunk = '#5e463a' } = {}) {
  const [lx, lz] = lean;
  const parts = [];
  const bend = (f) => [lx * h * 0.32 * f * f, h * f, lz * h * 0.32 * f * f];
  for (let i = 0; i < 4; i++) parts.push(beam(bend(i / 4), bend((i + 1) / 4), 0.13 - i * 0.018, trunk));
  const tiers = [[0.3, 0.46, 0.3], [0.52, 0.4, 0.4], [0.72, 0.32, 0.46], [0.9, 0.22, 0.42]];
  tiers.forEach(([f, r, off], i) => {
    const [tx, ty, tz] = bend(f);
    const rr = r * (0.9 + rand() * 0.2) * Math.min(1.3, h);
    const c = new THREE.ConeGeometry(rr, rr * 0.75, 7, 1);
    K.jitter(c, rr * 0.12, Math.floor(rand() * 1000));
    c.scale(1.5, 1, 0.9);
    c.rotateY(-Math.atan2(lz, lx));
    c.translate(tx + lx * rr * off * 1.6, ty + rr * 0.1, tz + lz * rr * off * 1.6);
    const nc = c.toNonIndexed();
    nc.computeVertexNormals();
    parts.push(K.paint(nc, leaf[i % leaf.length]));
  });
  return K.merge(parts);
}

/** Bleached dead snag with a couple of stubby branches. */
export function snagGeometry(rand, { h = 1.2, color = '#b9b1bf' } = {}) {
  const parts = [beam([0, 0, 0], [0.06, h, 0.03], 0.12, color)];
  for (let i = 0; i < 3; i++) {
    const y = h * (0.45 + i * 0.17);
    const a = rand() * Math.PI * 2, l = 0.28 - i * 0.05;
    parts.push(beam([0.02, y, 0.01], [Math.cos(a) * l, y + 0.14, Math.sin(a) * l], 0.07, color));
  }
  return K.merge(parts);
}

// ---------------------------------------------------------------- railing

/** Post-and-rail railing along [x, z] points; heightAt gives the ground. Returns { geometry, posts }. */
export function railing(points, heightAt, { color = '#6b4a39', spacing = 0.5, h = 0.44, t = 0.08 } = {}) {
  const parts = [];
  const posts = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i], [bx, bz] = points[i + 1];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / spacing));
    for (let k = 0; k <= n; k++) {
      if (i > 0 && k === 0) continue;
      const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
      posts.push([x, heightAt(x, z), z]);
    }
  }
  for (const [x, y, z] of posts) parts.push(box(t, h, t, x, y + h / 2, z, color));
  for (let i = 0; i < posts.length - 1; i++) {
    const [ax, ay, az] = posts[i], [bx, by, bz] = posts[i + 1];
    parts.push(beam([ax, ay + h - 0.03, az], [bx, by + h - 0.03, bz], 0.07, color));
    parts.push(beam([ax, ay + h * 0.45, az], [bx, by + h * 0.45, bz], 0.06, color));
  }
  return { geometry: K.merge(parts), posts };
}

// ---------------------------------------------------------------- flag

/** Waving flag: three horizontal stripes, deformed every frame. Hangs from x = 0 along +x. */
export function flag({ w = 1.08, h = 0.62, colors = ['#7b3df0', '#f2bf4a', '#7b3df0'], segW = 9 } = {}) {
  const strips = [];
  const hs = [0.4, 0.2, 0.4];
  let y0 = 0;
  hs.forEach((f, i) => {
    const sh = h * f;
    const g = new THREE.PlaneGeometry(w, sh, segW, i === 1 ? 1 : 2);
    g.translate(w / 2, y0 - sh / 2, 0);
    g.deleteAttribute('uv');
    K.paint(g, colors[i]);
    strips.push(g);
    y0 -= sh;
  });
  const geo = mergeGeometries(strips, false);
  const pos = geo.attributes.position;
  const rest = Float32Array.from(pos.array);
  const mat = toon('#ffffff', { vertexColors: true, side: THREE.DoubleSide, noise: 0.04, snow: 0.25, wet: 0.6 });
  const mesh = K.mesh(geo, mat, { cast: true, receive: false });
  return {
    mesh,
    update(t, wind) {
      const calm = 1 - Math.min(1, wind * 1.5);
      const amp = 0.05 + 0.13 * wind;
      const speed = 4 + 10 * wind;
      for (let i = 0; i < pos.count; i++) {
        const x0 = rest[i * 3], y0 = rest[i * 3 + 1];
        const k = x0 / w;
        const z = Math.sin(x0 * 6.5 - t * speed) * amp * k + Math.sin(x0 * 12 - t * speed * 1.6 + y0 * 5) * amp * 0.3 * k;
        const sag = calm * 0.42 * k * k;
        pos.setXYZ(i, x0 * (1 - calm * 0.3 * k), y0 - sag + Math.sin(t * speed * 0.5 + x0 * 3) * 0.02 * k, z);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
    },
  };
}

// ---------------------------------------------------------------- the fire lookout

/**
 * Fire lookout on four tapered timber legs with X bracing, a zig-zag stair on the +x side,
 * a wraparound catwalk and a cab glazed all round under a hip roof. Origin at the base, y up.
 */
export function lookoutTower() {
  const group = new THREE.Group();
  const W = [], R = [], M = [];
  const C = {
    leg: '#7a5640', brace: '#9a7150', deck: '#c08d58', deck2: '#a3784c', foot: '#a8a3b4',
    wall: '#efd9a6', wall2: '#d9bb84', frame: '#fbf1da', trim: '#3d2f4b', door: '#7a4f3a',
    roof: '#6c4a98', roof2: '#553a7c', rail: '#8a6248', step: '#c8975e', metal: '#3a3346',
  };
  const TH = 2.6, LB = 0.95, LT = 0.72;
  const legW = (y) => LB + (LT - LB) * (y / TH);

  // footings and legs
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    W.push(box(0.34, 0.2, 0.34, sx * LB, 0.06, sz * LB, C.foot));
    W.push(beam([sx * LB, 0, sz * LB], [sx * LT, TH, sz * LT], 0.15, C.leg));
  }
  // girts and X braces on all four faces
  const lv = [0.16, 0.95, 1.78, TH - 0.08];
  const face = (y, sgn, axis, a, b) => (axis === 'x' ? [a, y, sgn * b] : [sgn * b, y, a]);
  for (let k = 0; k < lv.length; k++) {
    const y = lv[k], w = legW(y);
    for (const sgn of [-1, 1]) for (const axis of ['x', 'z']) {
      W.push(beam(face(y, sgn, axis, -w, w), face(y, sgn, axis, w, w), 0.085, C.brace));
      // braces on the far faces are darker, so the lattice reads front to back instead of as a tangle
      if (k < lv.length - 1) {
        const y2 = lv[k + 1], w2 = legW(y2);
        const bc = sgn > 0 ? C.brace : '#4e3a33';
        W.push(beam(face(y, sgn, axis, -w, w), face(y2, sgn, axis, w2, w2), 0.075, bc));
        W.push(beam(face(y, sgn, axis, w, w), face(y2, sgn, axis, -w2, w2), 0.075, bc));
      }
    }
  }

  // catwalk: deck, joists, knee braces
  const DY = TH + 0.08; // deck top
  const DE = 1.24; // deck half width
  W.push(box(DE * 2, 0.1, DE * 2, 0, DY - 0.05, 0, C.deck));
  for (const z of [-0.9, 0, 0.9]) W.push(box(DE * 2 - 0.04, 0.1, 0.09, 0, DY - 0.14, z, C.deck2));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) W.push(beam([sx * legW(2.1), 2.1, sz * legW(2.1)], [sx * (DE - 0.08), DY - 0.12, sz * (DE - 0.08)], 0.08, C.brace));

  // catwalk railing, with a gap on +x where the stair arrives
  const RH = 0.5, gap = [0.56, 1.02];
  const postsAt = [-1.24, -0.83, -0.41, 0, 0.41, 0.83, 1.24];
  for (const s of postsAt) {
    W.push(box(0.075, RH, 0.075, -DE + 0.02, DY + RH / 2, s, C.rail));
    W.push(box(0.075, RH, 0.075, s, DY + RH / 2, -DE + 0.02, C.rail));
    W.push(box(0.075, RH, 0.075, s, DY + RH / 2, DE - 0.02, C.rail));
    if (s < gap[0] || s > gap[1]) W.push(box(0.075, RH, 0.075, DE - 0.02, DY + RH / 2, s, C.rail));
  }
  W.push(box(0.075, RH, 0.075, DE - 0.02, DY + RH / 2, gap[0], C.rail), box(0.075, RH, 0.075, DE - 0.02, DY + RH / 2, gap[1], C.rail));
  for (const y of [DY + RH - 0.035, DY + 0.24]) {
    const t = y > DY + 0.3 ? 0.075 : 0.06;
    W.push(beam([-DE + 0.02, y, -DE], [-DE + 0.02, y, DE], t, C.rail));
    W.push(beam([-DE, y, -DE + 0.02], [DE, y, -DE + 0.02], t, C.rail));
    W.push(beam([-DE, y, DE - 0.02], [DE, y, DE - 0.02], t, C.rail));
    W.push(beam([DE - 0.02, y, -DE], [DE - 0.02, y, gap[0]], t, C.rail));
    W.push(beam([DE - 0.02, y, gap[1]], [DE - 0.02, y, DE], t, C.rail));
  }

  // zig-zag stair outside the +x face: three flights, landings at the ends
  const SX0 = 1.28, SX1 = 1.7, SXC = (SX0 + SX1) / 2, SW = SX1 - SX0;
  const ZN = 0.58, ZS = -0.58, ZE = 1.0;
  const flights = [[ZS, 0, ZN, DY / 3], [ZN, DY / 3, ZS, (2 * DY) / 3], [ZS, (2 * DY) / 3, ZN, DY]];
  for (const [za, ya, zb, yb] of flights) {
    for (const x of [SX0 + 0.04, SX1 - 0.04]) W.push(beam([x, ya - 0.05, za], [x, yb - 0.05, zb], 0.075, C.leg));
    const n = 5;
    for (let s = 1; s < n; s++) {
      const f = s / n;
      W.push(box(SW - 0.04, 0.05, 0.19, SXC, ya + (yb - ya) * f - 0.02, za + (zb - za) * f, C.step));
    }
    W.push(beam([SX1 - 0.03, ya + 0.46, za], [SX1 - 0.03, yb + 0.46, zb], 0.065, C.rail));
  }
  for (const [zc, y] of [[(ZN + ZE) / 2, DY / 3], [-(ZN + ZE) / 2, (2 * DY) / 3], [(ZN + ZE) / 2, DY]]) {
    W.push(box(SW, 0.08, ZE - ZN + 0.02, SXC, y - 0.04, zc, C.deck));
    const zo = Math.sign(zc) * ZE;
    W.push(beam([SX1 - 0.03, y, zo], [SX1 - 0.03, y + 0.5, zo], 0.07, C.rail));
    W.push(beam([SX1 - 0.03, y + 0.47, Math.sign(zc) * ZN], [SX1 - 0.03, y + 0.47, zo], 0.065, C.rail));
    W.push(beam([SX0, y + 0.47, zo - Math.sign(zc) * 0.01], [SX1, y + 0.47, zo - Math.sign(zc) * 0.01], 0.065, C.rail));
  }
  // stair posts to the ground
  for (const x of [SX0 + 0.04, SX1 - 0.04]) {
    W.push(beam([x, 0, ZE - 0.04], [x, DY - 0.05, ZE - 0.04], 0.08, C.leg));
    W.push(beam([x, 0, -ZE + 0.04], [x, (2 * DY) / 3 - 0.05, -ZE + 0.04], 0.08, C.leg));
    W.push(box(0.2, 0.14, 0.2, x, 0.05, ZE - 0.04, C.foot), box(0.2, 0.14, 0.2, x, 0.05, -ZE + 0.04, C.foot));
  }

  // cab: wall skirt, glazing band with frames, header
  const CB = 0.8; // cab half width
  const Y0 = DY, Y1 = DY + 0.42, Y2 = Y1 + 0.56, Y3 = Y2 + 0.12;
  W.push(box(CB * 2, Y1 - Y0, CB * 2, 0, (Y0 + Y1) / 2, 0, C.wall));
  for (const s of [-1, 1]) { // board lines on the skirt
    W.push(box(CB * 2 + 0.02, 0.05, 0.05, 0, Y0 + 0.2, s * CB, C.wall2));
    W.push(box(0.05, 0.05, CB * 2 + 0.02, s * CB, Y0 + 0.2, 0, C.wall2));
  }
  W.push(box(CB * 2 + 0.12, 0.07, CB * 2 + 0.12, 0, Y1 + 0.02, 0, C.frame));
  W.push(box(CB * 2 + 0.04, Y3 - Y2, CB * 2 + 0.04, 0, (Y2 + Y3) / 2, 0, C.wall));
  for (const f of [-1, -0.5, 0, 0.5, 1]) {
    const p = f * CB;
    for (const s of [-1, 1]) {
      W.push(box(0.075, Y2 - Y1, 0.075, p, (Y1 + Y2) / 2, s * (CB + 0.015), C.frame));
      W.push(box(0.075, Y2 - Y1, 0.075, s * (CB + 0.015), (Y1 + Y2) / 2, p, C.frame));
    }
  }
  // door on the +x face by the stair head
  W.push(box(0.06, Y2 - Y0 - 0.06, 0.42, CB + 0.03, (Y0 + Y2 - 0.06) / 2, 0.42, C.door));
  W.push(box(0.07, 0.08, 0.5, CB + 0.04, Y2 - 0.04, 0.42, C.frame));
  const glass = new THREE.BoxGeometry(CB * 2 - 0.02, Y2 - Y1 - 0.02, CB * 2 - 0.02);
  glass.translate(0, (Y1 + Y2) / 2, 0);

  // hip roof with hips and fascia
  const RE = 1.1, RY = Y3, RA = RY + 0.62;
  const roof = new THREE.ConeGeometry(RE * Math.SQRT2, RA - RY, 4, 1).toNonIndexed();
  roof.rotateY(Math.PI / 4);
  roof.translate(0, (RY + RA) / 2, 0);
  roof.computeVertexNormals();
  R.push(K.paint(roof, C.roof));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) R.push(beam([sx * RE, RY + 0.01, sz * RE], [0, RA + 0.01, 0], 0.075, C.roof2));
  for (const s of [-1, 1]) {
    R.push(box(RE * 2 + 0.06, 0.09, 0.09, 0, RY - 0.02, s * RE, C.trim));
    R.push(box(0.09, 0.09, RE * 2 + 0.06, s * RE, RY - 0.02, 0, C.trim));
  }

  // flagpole doubling as lightning rod, and the weather mast on the catwalk corner
  // stovepipe on the back slope of the roof
  const SPX = 0.3, SPZ = -0.56;
  const roofY = RY + (RA - RY) * (1 - Math.max(Math.abs(SPX), Math.abs(SPZ)) / RE);
  M.push(beam([SPX, roofY - 0.1, SPZ], [SPX, roofY + 0.55, SPZ], 0.1, '#2f2a3a'));
  M.push(box(0.16, 0.07, 0.16, SPX, roofY + 0.56, SPZ, '#2f2a3a'));
  const FP = RA + 1.15;
  M.push(beam([0, RA - 0.05, 0], [0, FP, 0], 0.075, C.metal));
  M.push(box(0.12, 0.12, 0.12, 0, FP + 0.04, 0, '#d9b45a'));
  const MX = DE - 0.07, MZ = -DE + 0.07, MT = RA + 0.55;
  M.push(beam([MX, DY, MZ], [MX, MT, MZ], 0.075, C.metal));
  M.push(beam([MX - 0.32, DY + 0.5, MZ], [MX, DY + 1.0, MZ], 0.06, C.metal));
  // solar panel on the mast
  const panel = new THREE.BoxGeometry(0.42, 0.05, 0.3);
  panel.rotateZ(-0.6);
  panel.translate(MX + 0.18, DY + 1.05, MZ);
  M.push(K.paint(panel, '#2d3566'));

  const woodMat = toon('#ffffff', { vertexColors: true, noise: 0.12, noiseScale: 6, snow: 0.9 });
  const roofMat = toon('#ffffff', { vertexColors: true, noise: 0.1, noiseScale: 5 });
  const metalMat = toon('#ffffff', { vertexColors: true, noise: 0.04, snow: 0.3 });
  group.add(K.mesh(K.merge(W), woodMat), K.mesh(K.merge(R), roofMat), K.mesh(K.merge(M), metalMat));

  // glazing: dark violet glass by day, lantern-lit at night (glow set by the scene)
  const glassMat = toon('#55537e', { emissive: '#ffad48', emissiveIntensity: 6.5, ramp: 'flat', noise: 0, snow: 0, wet: 0, glow: 0 });
  group.add(K.mesh(glass, glassMat, { cast: false }));

  // anemometer rotor and weather vane on the mast
  const rotor = new THREE.Group();
  const rParts = [box(0.1, 0.1, 0.1, 0, 0, 0, C.metal)];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    rParts.push(beam([0, 0, 0], [Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3], 0.055, C.metal));
    rParts.push(box(0.13, 0.12, 0.13, Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32, '#e9e2cf', -a));
  }
  rotor.add(K.mesh(K.merge(rParts), metalMat, { cast: true, receive: false }));
  rotor.position.set(MX, MT - 0.22, MZ);
  const vane = new THREE.Group();
  const vParts = [beam([-0.36, 0, 0], [0.3, 0, 0], 0.06, C.metal), box(0.12, 0.12, 0.08, 0.32, 0, 0, '#d9b45a')];
  const fin = new THREE.BoxGeometry(0.2, 0.18, 0.04);
  fin.translate(-0.33, 0.04, 0);
  vParts.push(K.paint(fin, '#d9b45a'));
  vane.add(K.mesh(K.merge(vParts), metalMat, { cast: true, receive: false }));
  vane.position.set(MX, MT + 0.06, MZ);
  group.add(rotor, vane);

  // cool beacon on the mast
  const ledMat = toon('#33364a', { emissive: '#6fe3ff', emissiveIntensity: 7, noise: 0, snow: 0, wet: 0, glow: 0 });
  const led = K.mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), ledMat, { cast: false, receive: false });
  led.position.set(MX, MT - 0.45, MZ + 0.06);
  group.add(led);

  return {
    group, glassMat, ledMat, rotor, vane,
    lantern: new THREE.Vector3(0, (Y1 + Y2) / 2, 0),
    flagAt: new THREE.Vector3(0, FP - 0.06, 0),
    smokeAt: new THREE.Vector3(SPX, roofY + 0.62, SPZ),
    ledAt: led.position.clone(),
    stairFoot: new THREE.Vector3(SXC, 0, ZS - 0.2),
    deckY: DY, roofTop: RA, cab: CB,
  };
}

// ---------------------------------------------------------------- outhouse

/** The lookout's outhouse: a narrow plank hut with a lean-to roof. Door faces +x. */
export function outhouse() {
  const parts = [
    box(0.56, 0.84, 0.56, 0, 0.42, 0, '#a5774b'),
    box(0.05, 0.66, 0.34, 0.29, 0.36, 0, '#6e4a32'),
    box(0.06, 0.06, 0.06, 0.32, 0.38, 0.1, '#d9b45a'),
  ];
  for (const z of [-0.14, 0.14]) parts.push(box(0.58, 0.84, 0.03, 0, 0.42, z * 2, '#8e6440'));
  const roof = new THREE.BoxGeometry(0.74, 0.07, 0.74);
  roof.rotateZ(0.22);
  roof.translate(0.02, 0.9, 0);
  parts.push(K.paint(roof, '#6c4a98'));
  return K.merge(parts);
}

// ---------------------------------------------------------------- eagle

/** Little soaring raptor, wings as separate parts so they can flap. Faces +x. */
export function eagle() {
  const g = new THREE.Group();
  const mat = toon('#3b2f38', { noise: 0, snow: 0, wet: 0 });
  const head = toon('#efe7da', { noise: 0, snow: 0, wet: 0 });
  const body = K.mesh(new THREE.BoxGeometry(0.34, 0.09, 0.11), mat, { cast: true, receive: false });
  const hd = K.mesh(new THREE.BoxGeometry(0.1, 0.08, 0.08), head, { cast: false, receive: false });
  hd.position.set(0.2, 0.02, 0);
  const tail = K.mesh(new THREE.BoxGeometry(0.12, 0.03, 0.12), mat, { cast: false, receive: false });
  tail.position.set(-0.22, 0, 0);
  g.add(body, hd, tail);
  const wingGeo = new THREE.BoxGeometry(0.2, 0.035, 0.5);
  wingGeo.translate(0, 0, 0.25);
  const tipGeo = new THREE.BoxGeometry(0.15, 0.03, 0.22);
  tipGeo.translate(-0.02, 0, 0.11);
  const wings = [];
  for (const s of [1, -1]) {
    const w = new THREE.Group();
    w.add(K.mesh(wingGeo, mat, { cast: true, receive: false }));
    const tip = K.mesh(tipGeo, mat, { cast: false, receive: false });
    tip.position.set(-0.02, 0, 0.48);
    tip.rotation.x = 0.25;
    w.add(tip);
    w.scale.z = s;
    g.add(w);
    wings.push(w);
  }
  g.userData.wings = wings;
  return g;
}

// ---------------------------------------------------------------- cloud sea

/**
 * The cloud sea: instanced puffy blobs on a jittered grid in (u, v), over a white deck that hides
 * the gaps. Behind vFar the blobs go to a second mesh (its material gets haze from the scene).
 * update(t, { drift, lift(blob, u, v) -> [dy, grow] }) moves every blob.
 */
export function cloudSea({ rand, deckY, u0, u1, v0, v1, spacing = 1.3, vFar = -8, material, farMaterial, size = [1.2, 2.1], flat = [0.42, 0.56], puff = 0.5, extra = [] }) {
  const geo = blobGeometry(3);
  const near = [], far = [];
  let row = 0;
  for (let v = v0; v <= v1 + 1e-6; v += spacing * 0.8, row++)
    for (let u = u0 + (row % 2) * spacing * 0.5; u <= u1 + 1e-6; u += spacing) {
      const b = {
        u: u + (rand() - 0.5) * spacing * 0.7, v: v + (rand() - 0.5) * spacing * 0.5,
        y: rand() * 0.18, s: size[0] + rand() * (size[1] - size[0]), sy: flat[0] + rand() * (flat[1] - flat[0]),
        ph: rand() * 100, f: 0.3 + rand() * 0.35, rot: rand() * Math.PI * 2, sp: 0.85 + rand() * 0.3, c: rand(),
      };
      (b.v < vFar ? far : near).push(b);
      if (rand() < puff) {
        const t = { ...b, u: b.u + (rand() - 0.5) * 0.9, v: b.v + (rand() - 0.3) * 0.5, y: b.y + 0.32 + rand() * 0.22, s: b.s * (0.42 + rand() * 0.2), sy: 0.7, ph: rand() * 100, c: rand() };
        (t.v < vFar ? far : near).push(t);
      }
    }
  for (const b of extra) near.push({ ...b, skirt: true });
  const tints = ['#ffffff', '#f5f1fb', '#fdf8f0', '#eef0f9'].map((c) => new THREE.Color(c));
  const make = (list, mat) => {
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    m.castShadow = false;
    m.receiveShadow = true;
    m.frustumCulled = false;
    list.forEach((b, i) => m.setColorAt(i, tints[Math.floor(b.c * tints.length)]));
    return m;
  };
  const nearMesh = make(near, material);
  const farMesh = make(far, farMaterial);
  farMesh.geometry = blobGeometry(5, 1); // far puffs are small on screen

  // deck under the blobs so nothing shows through the gaps
  const P = [], I = [];
  const du = 3, dv = 1;
  const nu = Math.ceil((u1 - u0 + 8) / du), nv = Math.ceil((v1 - v0 + 4) / dv);
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      const u = u0 - 4 + i * du, v = v0 - 2 + j * dv;
      const [x, z] = toXZ(u, v);
      P.push(x, deckY(v) - 0.22, z);
    }
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      I.push(a, c, b, b, c, d);
    }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  dg.setIndex(I);
  dg.computeVertexNormals();
  const deck = new THREE.Mesh(dg, material);
  deck.receiveShadow = true;
  deck.frustumCulled = false;

  const group = new THREE.Group();
  group.add(nearMesh, farMesh, deck);
  const dummy = new THREE.Object3D();
  const span = u1 - u0;
  const place = (mesh, list, t, o) => {
    list.forEach((b, i) => {
      let u = b.u + o.drift * b.sp;
      if (!b.skirt) u = ((((u - u0) % span) + span) % span) + u0;
      const v = b.v;
      const [dy, grow, tall = 0] = o.lift ? o.lift(b, u, v) : [0, 0, 0];
      const [x, z] = toXZ(u, v);
      const breathe = 1 + 0.05 * Math.sin(t * 0.37 + b.ph);
      const s = b.s * breathe * (1 + grow);
      dummy.position.set(x, deckY(v) + b.y + Math.sin(t * b.f + b.ph) * 0.06 + dy, z);
      dummy.rotation.set(0, b.rot + Math.sin(t * 0.05 + b.ph) * 0.3, 0);
      dummy.scale.set(s, s * Math.min(1, b.sy * (1 + grow * 0.6) + tall), s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  return {
    group, near, far, nearMesh, farMesh, deck,
    update(t, o) {
      place(nearMesh, near, t, o);
      place(farMesh, far, t, o);
    },
  };
}
