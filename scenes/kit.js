import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, fxMaterial, shared } from '../engine/materials.js';

// ---------------------------------------------------------------- helpers

export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function noise2(seed = 0) {
  const hash = (x, z) => {
    let h = (Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  return (x, z) => {
    const xi = Math.floor(x), zi = Math.floor(z);
    const xf = x - xi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

export const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Give a geometry one vertex colour. */
export function paint(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Non-indexed copy with only position, normal and colour (what merge needs). */
export function clean(g) {
  const x = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(x.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') x.deleteAttribute(k);
  return x;
}

export function merge(list) {
  return mergeGeometries(list.map(clean), false);
}

/** Move vertices by a hash of their position, so shared corners stay joined. */
export function jitter(geo, amount, seed = 1) {
  const p = geo.attributes.position;
  const n = noise2(seed);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = x * 12.9898 + y * 78.233 + z * 37.719;
    p.setXYZ(i, x + (n(k, 1.3) - 0.5) * amount, y + (n(k, 7.1) - 0.5) * amount, z + (n(k, 3.7) - 0.5) * amount);
  }
  return geo;
}

export function mesh(geo, mat, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

/** A point light that the scene dims with env.lamps. */
export function lampLight(parent, pos, { color = '#ffbe6b', power = 2.6, distance = 4.5 } = {}) {
  const l = new THREE.PointLight(color, 0, distance, 2);
  l.position.copy(pos);
  l.userData.power = power;
  l.userData.phase = Math.random() * 10;
  parent.add(l);
  return l;
}

export function updateLamps(lights, env) {
  for (const l of lights) {
    const flicker = 1 + Math.sin(env.time * 9 + l.userData.phase) * 0.04 + Math.sin(env.time * 23 + l.userData.phase * 3) * 0.03;
    l.intensity = l.userData.power * env.lamps * flicker;
  }
}

// ---------------------------------------------------------------- terrain

/**
 * Stepped diorama terrain on a square block. Heights snap to `step`, every cell is a little
 * column, and the outside walls show strata. Colours come from top() and side().
 *   top(x, z, h, color) and side(x, z, y, h, outer, color) write into `color`.
 */
export function terrain({ size = 16, cells = 40, height, step = 0.3, base = -3, top, side, lip = 0.1, cutouts = [] }) {
  // cutouts: [{ face: '+x' | '-x' | '+z' | '-z', from, to, y0, y1 }] leave holes in the outer walls (cutaway views)
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
        [1, 0, (lo, hi) => [[x1, lo, z0], [x1, hi, z0], [x1, hi, z1], [x1, lo, z1]], [1, 0, 0]],
        [-1, 0, (lo, hi) => [[x0, lo, z1], [x0, hi, z1], [x0, hi, z0], [x0, lo, z0]], [-1, 0, 0]],
        [0, 1, (lo, hi) => [[x1, lo, z1], [x1, hi, z1], [x0, hi, z1], [x0, lo, z1]], [0, 0, 1]],
        [0, -1, (lo, hi) => [[x0, lo, z0], [x0, hi, z0], [x1, hi, z0], [x1, lo, z0]], [0, 0, -1]],
      ];
      for (const [di, dj, verts, n] of sides) {
        const hn = hAt(i + di, j + dj);
        const outer = hn === null;
        const lo = outer ? base : hn;
        if (lo >= h - 1e-4) continue;
        const cuts = [lo];
        if (outer) for (let y = Math.ceil(lo / 0.6) * 0.6; y < h - lip - 1e-4; y += 0.6) if (y > lo + 1e-4) cuts.push(y);
        if (h - lip > lo + 1e-4) cuts.push(h - lip);
        cuts.push(h);
        const faceName = di === 1 ? '+x' : di === -1 ? '-x' : dj === 1 ? '+z' : '-z';
        const along = di !== 0 ? zc : xc;
        const holes = outer ? cutouts.filter((c) => c.face === faceName && along > c.from && along < c.to) : [];
        for (const hole of holes) for (const y of [hole.y0, hole.y1]) if (y > lo && y < h) cuts.push(y);
        cuts.sort((p, q) => p - q);
        for (let k = 0; k < cuts.length - 1; k++) {
          const a = cuts[k], b = cuts[k + 1];
          if (b - a < 1e-4) continue;
          if (holes.some((hole) => (a + b) / 2 > hole.y0 && (a + b) / 2 < hole.y1)) continue;
          side(xc, zc, (a + b) / 2, h, outer, col);
          const [p0, p1, p2, p3] = verts(a, b);
          quad(p0, p1, p2, p3, n);
        }
      }
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  const m = mesh(g, toon('#ffffff', { vertexColors: true, noise: 0.16, noiseScale: 2.6 }));
  const heightAt = (x, z) => {
    const i = Math.min(cells - 1, Math.max(0, Math.floor((x + half) / cs)));
    const j = Math.min(cells - 1, Math.max(0, Math.floor((z + half) / cs)));
    return H[i * cells + j];
  };
  let max = -Infinity;
  for (const v of H) max = Math.max(max, v);
  return { mesh: m, heightAt, max, base, size, cells, cs };
}

// ---------------------------------------------------------------- water

/** Water surface over the whole block, coloured by depth, with foam, ripples and glints. */
export function water({ size, level = 0, heightAt, segments = 64, edgeCells = 40, base = -3, shallow, deep, foam, deepAt = 1.1, wall = ['#4aa6d6', '#1d4c86'], reflect = 0.32 }) {
  const half = size / 2, n = segments;
  const P = [], D = [], I = [];
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= n; j++) {
      const x = -half + (size * i) / n, z = -half + (size * j) / n;
      P.push(x, level, z);
      D.push(level - heightAt(Math.min(half - 1e-3, Math.max(-half + 1e-3, x)), Math.min(half - 1e-3, Math.max(-half + 1e-3, z))));
    }
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const a = i * (n + 1) + j, b = a + 1, c = a + n + 1, d = c + 1;
      I.push(a, b, d, a, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('aDepth', new THREE.Float32BufferAttribute(D, 1));
  g.setIndex(I);
  g.computeVertexNormals();
  const surface = mesh(g, toon('#ffffff', { water: true, transparent: true, shallow, deep, foam, deepAt, noise: 0, snow: 0, wet: 0, mirror: reflect > 0, reflect }), { cast: false, receive: true });
  surface.renderOrder = 1;

  // glassy side walls on the block edges wherever the seabed is below the water line
  const WP = [], WN = [], WC = [];
  const cTop = new THREE.Color(wall[0]), cBot = new THREE.Color(wall[1]);
  const steps = edgeCells, cs = size / steps;
  const edge = (x0, z0, x1, z1, nrm) => {
    const xm = (x0 + x1) / 2, zm = (z0 + z1) / 2;
    const inset = 0.02;
    const h = heightAt(xm - nrm[0] * inset, zm - nrm[2] * inset);
    if (h >= level - 1e-3) return;
    const ox = nrm[0] * 0.004, oz = nrm[2] * 0.004;
    const k = Math.min(1, (level - h) / (level - base));
    const cb = cTop.clone().lerp(cBot, k);
    const v = [[x0 + ox, h, z0 + oz, cb], [x0 + ox, level, z0 + oz, cTop], [x1 + ox, level, z1 + oz, cTop], [x1 + ox, h, z1 + oz, cb]];
    for (const idx of [0, 1, 2, 0, 2, 3]) {
      WP.push(v[idx][0], v[idx][1], v[idx][2]);
      WN.push(nrm[0], nrm[1], nrm[2]);
      WC.push(v[idx][3].r, v[idx][3].g, v[idx][3].b);
    }
  };
  for (let s = 0; s < steps; s++) {
    const a = -half + s * cs, b = a + cs;
    edge(half, a, half, b, [1, 0, 0]);
    edge(-half, b, -half, a, [-1, 0, 0]);
    edge(b, half, a, half, [0, 0, 1]);
    edge(a, -half, b, -half, [0, 0, -1]);
  }
  const group = new THREE.Group();
  group.add(surface);
  if (WP.length) {
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(WP, 3));
    wg.setAttribute('normal', new THREE.Float32BufferAttribute(WN, 3));
    wg.setAttribute('color', new THREE.Float32BufferAttribute(WC, 3));
    const walls = mesh(wg, toon('#ffffff', { vertexColors: true, transparent: true, opacity: 0.82, noise: 0.05, snow: 0, wet: 0 }), { cast: false, receive: false });
    walls.renderOrder = 2;
    group.add(walls);
  }
  return group;
}

// ---------------------------------------------------------------- vegetation

export function pineGeometry(rand, { h = 2.2, w = 0.8, tiers = 3, leaf = '#2f6a46', leaf2 = '#3d8150', trunk = '#6a4630' } = {}) {
  const parts = [];
  const t = new THREE.CylinderGeometry(w * 0.09, w * 0.12, h * 0.34, 6);
  t.translate(0, h * 0.17, 0);
  parts.push(paint(t, trunk));
  for (let k = 0; k < tiers; k++) {
    const f = tiers === 1 ? 0 : k / (tiers - 1);
    const r = w * (1.0 - f * 0.5);
    const ch = h * (0.5 - f * 0.08);
    const c = new THREE.ConeGeometry(r, ch, 7, 1);
    c.rotateY(rand() * Math.PI);
    c.translate(0, h * 0.24 + f * h * 0.42 + ch / 2, 0);
    parts.push(paint(c, k % 2 ? leaf2 : leaf));
  }
  const g = merge(parts);
  g.computeVertexNormals(); // non-indexed, so this gives faceted normals
  return g;
}

export function bushGeometry(rand, { r = 0.5, blobs = 3, leaf = '#4d8f45', trunk = '#6a4630', h = 0 } = {}) {
  const parts = [];
  if (h > 0) {
    const t = new THREE.CylinderGeometry(r * 0.12, r * 0.18, h, 6);
    t.translate(0, h / 2, 0);
    parts.push(paint(t, trunk));
  }
  for (let i = 0; i < blobs; i++) {
    const br = r * (0.6 + rand() * 0.45);
    const b = new THREE.IcosahedronGeometry(br, 1);
    jitter(b, br * 0.18, Math.floor(rand() * 1000));
    const a = (i / blobs) * Math.PI * 2 + rand();
    b.translate(Math.cos(a) * r * 0.45, h + br * 0.75 + rand() * r * 0.35, Math.sin(a) * r * 0.45);
    parts.push(paint(b, leaf));
  }
  return merge(parts);
}

export function rockGeometry(rand, s = 0.5, color = '#8d909b') {
  const g = new THREE.IcosahedronGeometry(s, 0);
  jitter(g, s * 0.45, Math.floor(rand() * 1000));
  g.scale(1, 0.62 + rand() * 0.35, 1);
  g.computeVertexNormals();
  return paint(g, color);
}

/** Instanced tufts of grass. place(rand) returns [x, y, z] or null to skip. */
export function grass(rand, count, place, colors = ['#78bb5b', '#68a94f', '#8bc865', '#5c9a47']) {
  const blades = [];
  for (let k = 0; k < 3; k++) {
    const c = new THREE.ConeGeometry(0.035, 0.26 + k * 0.04, 3, 1);
    c.translate(0, (0.26 + k * 0.04) / 2, 0);
    c.rotateZ((k - 1) * 0.35);
    c.rotateY(k * 2.1);
    blades.push(c);
  }
  const geo = merge(blades);
  const m = new THREE.InstancedMesh(geo, toon('#ffffff', { wind: 1.1, noise: 0, snow: 0.5, ramp: 'foliage' }), count);
  m.castShadow = false;
  m.receiveShadow = true;
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let n = 0;
  for (let tries = 0; tries < count * 4 && n < count; tries++) {
    const p = place(rand);
    if (!p) continue;
    dummy.position.set(p[0], p[1], p[2]);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.scale.setScalar(0.7 + rand() * 0.7);
    dummy.updateMatrix();
    m.setMatrixAt(n, dummy.matrix);
    m.setColorAt(n, color.set(colors[Math.floor(rand() * colors.length)]));
    n++;
  }
  m.count = n;
  return m;
}

/** Instanced little flower heads. */
export function flowers(rand, count, place, colors = ['#f4f1ea', '#ffd85c', '#ff8fb1', '#b58cff']) {
  const geo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
  geo.translate(0, 0.14, 0);
  const m = new THREE.InstancedMesh(geo, toon('#ffffff', { wind: 0.8, noise: 0, snow: 0.3 }), count);
  m.castShadow = false;
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let n = 0;
  for (let tries = 0; tries < count * 4 && n < count; tries++) {
    const p = place(rand);
    if (!p) continue;
    dummy.position.set(p[0], p[1], p[2]);
    dummy.updateMatrix();
    m.setMatrixAt(n, dummy.matrix);
    m.setColorAt(n, color.set(colors[Math.floor(rand() * colors.length)]));
    n++;
  }
  m.count = n;
  return m;
}

// ---------------------------------------------------------------- buildings and props

/** Lamp-glass material: dark by day, glowing once env.lamps comes up. */
export function glass(glow = '#ffc36b', power = 5, day = '#2a3247') {
  return toon(day, { emissive: glow, emissiveIntensity: power, lamp: true, noise: 0, snow: 0, wet: 0 });
}

/** Small gabled cottage. Front door on +x. Returns { group, smoke, lights: [Vector3] } in local space. */
export function cottage({ w = 2.0, d = 1.6, h = 1.05, wall = '#efe5d2', roof = '#b8483a', trim = '#5e3f2b', stone = '#8b8d96', glow = '#ffc36b' } = {}) {
  const g = new THREE.Group();
  const wallM = toon(wall, { noise: 0.1 });
  const roofM = toon(roof, { noise: 0.16, noiseScale: 4 });
  const trimM = toon(trim, { noise: 0.1 });
  const stoneM = toon(stone, { noise: 0.25, noiseScale: 5 });
  const glassM = glass(glow);

  const base = mesh(new THREE.BoxGeometry(w + 0.14, 0.16, d + 0.14), stoneM);
  base.position.y = 0.08;
  const body = mesh(new THREE.BoxGeometry(w, h, d), wallM);
  body.position.y = h / 2 + 0.08;
  g.add(base, body);

  const top = h + 0.08, pitch = 0.62, over = 0.2;
  const rh = (d / 2) * Math.tan(pitch);
  const slabLen = (d / 2 + over) / Math.cos(pitch);
  for (const s of [-1, 1]) {
    const slab = mesh(new THREE.BoxGeometry(w + over * 2, 0.1, slabLen), roofM);
    slab.rotation.x = s * pitch;
    const mid = (d / 2 + over) / 2;
    slab.position.set(0, top + rh - mid * Math.tan(pitch) + 0.05, s * mid);
    g.add(slab);
  }
  // gable ends
  const gp = [], gn = [];
  const hx = w / 2, hz = d / 2, yb = top, yt = top + rh;
  gp.push(hx, yb, hz, hx, yb, -hz, hx, yt, 0, -hx, yb, -hz, -hx, yb, hz, -hx, yt, 0);
  gn.push(1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0);
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
  gg.setAttribute('normal', new THREE.Float32BufferAttribute(gn, 3));
  g.add(mesh(gg, wallM));

  // door on +x, windows on +x and +z
  const door = mesh(new THREE.BoxGeometry(0.06, 0.62, 0.34), trimM);
  door.position.set(w / 2 + 0.02, 0.39, d * 0.18);
  g.add(door);
  const win = (x, y, z, rotY) => {
    const frame = mesh(new THREE.BoxGeometry(0.36, 0.36, 0.05), trimM);
    const pane = mesh(new THREE.BoxGeometry(0.26, 0.26, 0.06), glassM, { cast: false });
    frame.position.set(x, y, z);
    pane.position.set(x, y, z);
    frame.rotation.y = pane.rotation.y = rotY;
    g.add(frame, pane);
  };
  win(w / 2 + 0.02, 0.62, -d * 0.2, Math.PI / 2);
  win(-w * 0.22, 0.62, d / 2 + 0.02, 0);
  win(w * 0.22, 0.62, d / 2 + 0.02, 0);
  const lights = [new THREE.Vector3(w / 2 + 0.5, 0.7, -d * 0.2), new THREE.Vector3(0, 0.6, d / 2 + 0.55)];

  // chimney
  const chim = mesh(new THREE.BoxGeometry(0.26, 0.7, 0.26), stoneM);
  chim.position.set(-w * 0.28, top + rh * 0.65, -d * 0.2);
  g.add(chim);
  const smoke = new THREE.Vector3(-w * 0.28, top + rh * 0.65 + 0.4, -d * 0.2);

  // porch lamp by the door
  const lampBox = mesh(new THREE.BoxGeometry(0.1, 0.12, 0.1), glassM, { cast: false });
  lampBox.position.set(w / 2 + 0.08, 0.8, d * 0.18 + 0.3);
  g.add(lampBox);
  lights.push(new THREE.Vector3(w / 2 + 0.35, 0.85, d * 0.18 + 0.3));
  return { group: g, smoke, lights };
}

/** Striped lighthouse with a lantern room and a rotating beam (visible at night). */
export function lighthouse({ h = 3.4, r = 0.5, red = '#c8433a', white = '#f2efe8', glow = '#ffe08a' } = {}) {
  const g = new THREE.Group();
  const tower = new THREE.CylinderGeometry(r * 0.72, r, h, 12, 8).toNonIndexed();
  tower.translate(0, h / 2, 0);
  const pos = tower.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const cr = new THREE.Color(red), cw = new THREE.Color(white);
  for (let i = 0; i < pos.count; i += 3) {
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const c = Math.floor((y / h) * 4) % 2 ? cr : cw;
    for (let k = 0; k < 3; k++) cols.set([c.r, c.g, c.b], (i + k) * 3);
  }
  tower.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.add(mesh(tower, toon('#ffffff', { vertexColors: true, noise: 0.08 })));
  const dark = toon('#2c3140', { noise: 0.05 });
  const gallery = mesh(new THREE.CylinderGeometry(r * 0.98, r * 0.98, 0.1, 12), dark);
  gallery.position.y = h + 0.05;
  const rail = mesh(new THREE.CylinderGeometry(r * 0.96, r * 0.96, 0.16, 12, 1, true), dark);
  rail.position.y = h + 0.18;
  const lantern = mesh(new THREE.CylinderGeometry(r * 0.48, r * 0.48, 0.44, 8), glass(glow, 8, '#59627a'), { cast: false });
  lantern.position.y = h + 0.32;
  const capGeo = new THREE.ConeGeometry(r * 0.7, 0.42, 8).toNonIndexed();
  capGeo.computeVertexNormals();
  const cap = mesh(capGeo, toon(red, { noise: 0.08 }));
  cap.position.y = h + 0.75;
  g.add(gallery, rail, lantern, cap);

  // beam: two open cones from the lamp, additive, faded along their length
  const L = 6.5;
  const parts = [];
  for (const s of [1, -1]) {
    const c = new THREE.ConeGeometry(0.62, L, 18, 1, true);
    c.translate(0, -L / 2, 0);
    c.rotateZ((s * Math.PI) / 2);
    parts.push(c);
  }
  const beamGeo = mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); return p; }), false);
  const beamMat = fxMaterial({
    vertexShader: /* glsl */`
      uniform float uLen;
      varying float vD;
      void main() { vD = abs(position.x) / uLen; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uOn;
      uniform vec3 uColor;
      varying float vD;
      void main() { gl_FragColor = vec4(uColor * 2.0, uOn * (1.0 - vD) * (1.0 - vD) * 0.3); gNormal = vec4(0.0); }`,
    uniforms: { uLen: { value: L }, uOn: { value: 0 }, uColor: { value: new THREE.Color(glow) } },
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.y = h + 0.32;
  beam.frustumCulled = false;
  g.add(beam);
  return { group: g, beam, lamp: new THREE.Vector3(0, h + 0.32, 0) };
}

/** Wooden pier running along +x from (x0, z) to (x1, z). */
export function pier({ x0, x1, z, deck = 0.42, width = 0.95, bottom = -1.4 }) {
  const parts = [];
  const plank = 0.2;
  const woods = ['#a77c52', '#9a7049', '#b0865a'];
  for (let x = x0, i = 0; x < x1 - 1e-3; x += plank, i++) {
    const b = new THREE.BoxGeometry(plank * 0.92, 0.07, width);
    b.translate(x + plank / 2, deck, z);
    parts.push(paint(b, woods[i % 3]));
  }
  for (let x = x0 + 0.1; x <= x1; x += 0.9) {
    for (const s of [-1, 1]) {
      const p = new THREE.CylinderGeometry(0.06, 0.07, deck - bottom + 0.15, 6);
      p.translate(x, (deck + bottom) / 2 + 0.07, z + s * (width / 2 - 0.05));
      parts.push(paint(p, '#6b4a33'));
    }
  }
  return mesh(merge(parts), toon('#ffffff', { vertexColors: true, noise: 0.12, noiseScale: 5 }));
}

/** Little rowboat; bow along +x. */
export function boat({ hull = '#c94a3d', rim = '#efe6d6', inside = '#8a6040' } = {}) {
  const g = new THREE.BoxGeometry(1.5, 0.34, 0.62, 6, 2, 2).toNonIndexed();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = Math.abs(x) / 0.75;
    z *= 1 - smoothstep(0.35, 1.0, t) * 0.85;
    if (y < 0) z *= 0.7;
    y += smoothstep(0.5, 1.0, t) * 0.06;
    p.setXYZ(i, x, y + 0.17, z);
  }
  g.computeVertexNormals();
  const cols = new Float32Array(p.count * 3);
  const ch = new THREE.Color(hull), cr = new THREE.Color(rim), ci = new THREE.Color(inside);
  for (let i = 0; i < p.count; i += 3) {
    const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const ny = g.attributes.normal.getY(i);
    const c = ny > 0.7 ? ci : y > 0.27 ? cr : ch;
    for (let k = 0; k < 3; k++) cols.set([c.r, c.g, c.b], (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const group = new THREE.Group();
  group.add(mesh(g, toon('#ffffff', { vertexColors: true, noise: 0.08 })));
  const seat = mesh(new THREE.BoxGeometry(0.12, 0.05, 0.5), toon('#9a7049'));
  seat.position.set(0.05, 0.3, 0);
  group.add(seat);
  return group;
}

export function lampPost({ h = 1.15, post = '#2c3140', glow = '#ffc36b' } = {}) {
  const g = new THREE.Group();
  const pole = mesh(new THREE.CylinderGeometry(0.035, 0.05, h, 6), toon(post, { noise: 0.05 }));
  pole.position.y = h / 2;
  const head = mesh(new THREE.BoxGeometry(0.14, 0.16, 0.14), glass(glow, 6), { cast: false });
  head.position.y = h + 0.06;
  const hat = mesh(new THREE.ConeGeometry(0.13, 0.1, 4), toon(post));
  hat.position.y = h + 0.19;
  hat.rotation.y = Math.PI / 4;
  g.add(pole, head, hat);
  return { group: g, light: new THREE.Vector3(0, h + 0.06, 0) };
}

/** Post-and-rail fence along a polyline of [x, z] points; heightAt sets the ground. */
export function fence(points, heightAt, { color = '#8a6a4a', spacing = 0.55 } = {}) {
  const parts = [];
  const posts = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i], [bx, bz] = points[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / spacing));
    for (let k = 0; k <= n; k++) {
      if (i > 0 && k === 0) continue;
      const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
      posts.push([x, heightAt(x, z), z]);
    }
  }
  for (const [x, y, z] of posts) {
    const p = new THREE.BoxGeometry(0.07, 0.42, 0.07);
    p.translate(x, y + 0.21, z);
    parts.push(paint(p, color));
  }
  for (let i = 0; i < posts.length - 1; i++) {
    const [ax, ay, az] = posts[i], [bx, by, bz] = posts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    for (const hy of [0.17, 0.33]) {
      const r = new THREE.BoxGeometry(len, 0.065, 0.05);
      r.rotateY(-Math.atan2(bz - az, bx - ax));
      r.translate((ax + bx) / 2, (ay + by) / 2 + hy, (az + bz) / 2);
      parts.push(paint(r, color));
    }
  }
  return mesh(merge(parts), toon('#ffffff', { vertexColors: true, noise: 0.1 }));
}

export function crate(s = 0.32, color = '#a8794c') {
  return mesh(paint(new THREE.BoxGeometry(s, s, s), color), toon('#ffffff', { vertexColors: true, noise: 0.2, noiseScale: 6 }));
}

export function barrel(r = 0.15, h = 0.36, color = '#8a5a38') {
  const g = new THREE.CylinderGeometry(r, r, h, 8);
  g.translate(0, h / 2, 0);
  return mesh(paint(g, color), toon('#ffffff', { vertexColors: true, noise: 0.15 }));
}

// ---------------------------------------------------------------- effects

/** Chimney smoke: puffs rise and lean with the wind, dimmer at night. */
export function smoke(origin, { count = 34, color = '#d2d5dc' } = {}) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const seed = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) seed.set([i / count, Math.random()], i * 2);
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 2));
  const mat = fxMaterial({
    vertexShader: /* glsl */`
      uniform float uTime;
      uniform vec3 uWind;
      uniform float uWindStrength;
      uniform vec3 uOrigin;
      attribute vec2 aSeed;
      varying float vA;
      void main() {
        float t = fract(uTime / 4.5 + aSeed.x);
        vec3 p = uOrigin;
        p.y += t * 2.3;
        p.xz += uWind.xz * (0.3 + uWindStrength) * t * 1.8;
        p.x += sin(t * 6.0 + aSeed.y * 20.0) * 0.12 * t;
        vA = (1.0 - t) * smoothstep(0.0, 0.08, t);
        gl_PointSize = t < 0.3 ? 1.0 : (t < 0.65 ? 2.0 : 3.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      uniform float uDaylight;
      uniform float uOn;
      varying float vA;
      void main() {
        if (vA * uOn < 0.05) discard;
        gl_FragColor = vec4(uColor * (0.22 + 0.78 * uDaylight), vA * uOn * 0.8);
        gNormal = vec4(0.0);
      }`,
    uniforms: { uTime: shared.uTime, uWind: shared.uWind, uWindStrength: shared.uWindStrength, uDaylight: shared.uDaylight, uOrigin: { value: origin.clone() }, uColor: { value: new THREE.Color(color) }, uOn: { value: 1 } },
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return pts;
}

/**
 * Merge every mesh inside a group into one mesh per material (transforms baked in), so a building,
 * a vehicle or a static cluster costs a few draw calls instead of dozens. Skips InstancedMesh and
 * anything with userData.keep (parts you still animate on their own). Returns the group.
 */
export function mergeGroup(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const byMat = new Map();
  const remove = [];
  group.traverse((o) => {
    if (o === group || !o.isMesh || o.isInstancedMesh || Array.isArray(o.material)) return;
    for (let p = o; p && p !== group; p = p.parent) if (p.userData.keep) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (!byMat.has(o.material)) byMat.set(o.material, { geos: [], cast: false, receive: false });
    const e = byMat.get(o.material);
    e.geos.push(g);
    e.cast ||= o.castShadow;
    e.receive ||= o.receiveShadow;
    remove.push(o);
  });
  for (const o of remove) o.parent.remove(o);
  for (const [m, e] of byMat) {
    const wantColor = !!m.vertexColors;
    const geos = e.geos.map((g) => {
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && !(wantColor && k === 'color')) g.deleteAttribute(k);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (wantColor && !g.attributes.color) {
        const c = new Float32Array(g.attributes.position.count * 3).fill(1);
        g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      }
      return g;
    });
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, m);
    mesh.castShadow = e.cast;
    mesh.receiveShadow = e.receive;
    group.add(mesh);
  }
  return group;
}

export function disposeTree(obj) {
  obj.traverse((o) => {
    o.geometry?.dispose?.();
    const m = o.material;
    if (Array.isArray(m)) m.forEach((x) => x.dispose());
    else m?.dispose?.();
  });
}
