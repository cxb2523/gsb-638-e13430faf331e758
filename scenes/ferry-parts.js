import * as THREE from 'three';
import { toon, fxMaterial, shared, setGlow } from '../engine/materials.js';
import * as K from './kit.js';
import { person } from './kit-people.js';

// Parts for the Ferry scene: skyline towers, the needle tower, the dome, the island ferry,
// sailboats, buoys, gulls, willows, picnic tables, and the effects (wake, horn steam, fireworks).

// ---------------------------------------------------------------- helpers

/** Merge every mesh under obj (own transform included) into one vertex-coloured geometry. */
export function bake(obj, skip = () => false) {
  obj.updateMatrixWorld(true);
  const parts = [];
  obj.traverse((o) => {
    if (!o.isMesh || skip(o)) return;
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    if (!g.attributes.color) K.paint(g, '#' + o.material.color.getHexString());
    parts.push(g);
  });
  return K.merge(parts);
}

/** Faceted copy (flat normals) for low-poly shading. */
export function facet(g) {
  const x = g.index ? g.toNonIndexed() : g;
  x.computeVertexNormals();
  return x;
}

export function box(w, h, d, x, y, z, color, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return K.paint(g, color);
}

export function cyl(rt, rb, h, seg, x, y, z, color, flat = true) {
  let g = new THREE.CylinderGeometry(rt, rb, h, seg);
  if (flat) g = facet(g);
  g.translate(x, y, z);
  return K.paint(g, color);
}

/** Paint faces of a non-indexed geometry with fn(centroid, normal) -> hex. */
export function paintFaces(g, fn) {
  const p = g.attributes.position, n = g.attributes.normal;
  const cols = new Float32Array(p.count * 3);
  const c = new THREE.Color(), ctr = new THREE.Vector3(), nm = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    ctr.set((p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3);
    nm.set(n.getX(i), n.getY(i), n.getZ(i));
    c.set(fn(ctr, nm));
    for (let k = 0; k < 3; k++) cols.set([c.r, c.g, c.b], (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

/** One vertex-coloured mesh from a list of painted geometries. */
export function lump(list, opts = {}) {
  return K.mesh(K.merge(list), toon('#ffffff', { vertexColors: true, noise: 0.06, noiseScale: 4, ...opts }));
}

/** Small person baked into a single geometry (for people who stand or sit still). */
export function figure(rand, opts, x, y, z, ry = 0) {
  const p = person(rand, opts);
  const holder = new THREE.Group();
  holder.add(p);
  holder.position.set(x, y, z);
  holder.rotation.y = ry;
  return bake(holder);
}

export function hsl(h, s, l) {
  return new THREE.Color().setHSL(((h % 1) + 1) % 1, s, l);
}

// ---------------------------------------------------------------- city

/**
 * Tower with a procedural window grid lined up to its own facades.
 * Footprint [x0, x1] x [z0, z1], standing on y0, h tall. Returns the window-wall mesh,
 * painted detail geometry (crowns, roof plant), lobby glass geometry and a beacon point.
 */
export function tower({ x0, x1, z0, z1, y0, h, s, lampU, crown = null, antenna = 0, lobby = 0.3 }) {
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const cap = 0.14;
  const winH = s.win[1];
  const rows = Math.max(1, Math.floor((h - lobby - cap - 0.06) / winH));
  const base = y0 + lobby + 0.05;
  const mat = toon(s.wall, {
    noise: s.noise ?? 0.05, noiseScale: 3,
    windows: { size: s.win, frac: s.frac, base, top: base + rows * winH, lit: s.lit, warm: s.warm, cool: s.cool, glass: s.glass, power: s.power ?? 3.4, offset: [x0, z0] },
  });
  mat.userData.nx.uniforms.uLamps = lampU;
  const bodyH = h - lobby;
  const body = K.mesh(new THREE.BoxGeometry(w, bodyH, d), mat);
  body.position.set(cx, y0 + lobby + bodyH / 2, cz);

  const parts = [];
  const top = y0 + h;
  // cap band
  parts.push(box(w + 0.06, cap, d + 0.06, cx, top - cap / 2 + 0.02, cz, s.cap));
  let roof = top + 0.02;
  if (crown === 'slant') {
    // glass crown sloping down toward -x
    const g = new THREE.BoxGeometry(w - 0.04, 0.9, d - 0.04, 1, 1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 0 && p.getX(i) < 0) p.setY(i, p.getY(i) - 0.8);
    const fg = facet(g);
    fg.translate(cx, roof + 0.45, cz);
    parts.push(K.paint(fg, s.crown || s.glass));
    roof += 0.12;
  } else if (crown === 'step') {
    parts.push(box(w * 0.72, 0.36, d * 0.72, cx, roof + 0.18, cz, s.cap));
    parts.push(box(w * 0.46, 0.3, d * 0.46, cx, roof + 0.51, cz, s.wall));
    roof += 0.66;
  } else if (crown === 'flat') {
    parts.push(box(w * 0.5, 0.28, d * 0.4, cx - w * 0.1, roof + 0.14, cz + d * 0.1, '#9aa0aa'));
    parts.push(box(0.22, 0.2, 0.22, cx + w * 0.28, roof + 0.1, cz - d * 0.25, '#b9bcc4'));
  } else if (crown === 'gable') {
    parts.push(box(w * 0.6, 0.22, d * 0.5, cx, roof + 0.11, cz, '#8f949e'));
  }
  let beacon = null;
  if (antenna > 0) {
    parts.push(cyl(0.045, 0.06, antenna, 5, cx + w * 0.18, roof + antenna / 2, cz - d * 0.18, '#8b8f99'));
    beacon = new THREE.Vector3(cx + w * 0.18, roof + antenna + 0.05, cz - d * 0.18);
  } else if (h > 4) {
    beacon = new THREE.Vector3(cx, roof + 0.06, cz);
  }
  const lobbyGeo = box(w - 0.08, lobby, d - 0.08, cx, y0 + lobby / 2, cz, '#ffffff');
  return { body, mat, parts, lobbyGeo, beacon, top: roof };
}

/**
 * Broadcast needle: a three-finned concrete shaft, a main pod with a glowing window ring,
 * an upper shaft and pod, and an antenna. LED strips run up the fin edges.
 * Returns { group, ringMat, strip (fx), pod (local Vector3), beacons [Vector3 local], height }.
 */
export function needle({ h = 9.2, concrete = '#d6cfc3', shade = '#bfb6a8' } = {}) {
  const group = new THREE.Group();
  const H0 = h * 0.62; // main pod
  const parts = [];
  const core = cyl(0.19, 0.34, H0, 6, 0, H0 / 2, 0, concrete);
  parts.push(core);
  const stripGeos = [];
  const fin = (ang) => {
    const g = new THREE.BoxGeometry(1, H0, 1, 1, 10, 1);
    g.translate(0.5, H0 / 2, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / H0;
      const reach = 0.98 + (0.3 - 0.98) * Math.pow(y, 0.62);
      const thick = 0.26 + (0.15 - 0.26) * y;
      p.setX(i, p.getX(i) * reach);
      p.setZ(i, p.getZ(i) * thick);
    }
    const fg = facet(g);
    fg.rotateY(ang);
    parts.push(K.paint(fg, concrete));
    // LED strip hugging the fin's outer edge
    const sg = new THREE.BoxGeometry(0.06, H0 - 0.5, 0.09, 1, 10, 1);
    sg.translate(0, (H0 - 0.5) / 2 + 0.45, 0);
    const sp = sg.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const y = sp.getY(i) / H0;
      const reach = 0.98 + (0.3 - 0.98) * Math.pow(y, 0.62);
      sp.setX(i, sp.getX(i) + reach + 0.025);
    }
    sg.rotateY(ang);
    sg.deleteAttribute('uv');
    stripGeos.push(sg);
  };
  // one fin faces the default camera, the other two spread left and right
  for (const a of [-Math.PI / 4, -Math.PI / 4 + (Math.PI * 2) / 3, -Math.PI / 4 + (Math.PI * 4) / 3]) fin(a);

  // main pod
  const skirt = facet(new THREE.CylinderGeometry(1.0, 0.3, 0.5, 14));
  skirt.translate(0, H0 - 0.25, 0);
  parts.push(K.paint(skirt, shade));
  parts.push(cyl(1.1, 1.1, 0.11, 16, 0, H0 + 0.26, 0, concrete));
  parts.push(cyl(0.96, 0.96, 0.16, 16, 0, H0 + 0.395, 0, '#59606d'));
  parts.push(cyl(1.0, 1.0, 0.08, 16, 0, H0 + 0.515, 0, concrete));
  const roofG = facet(new THREE.ConeGeometry(0.92, 0.3, 16));
  roofG.translate(0, H0 + 0.7, 0);
  parts.push(K.paint(roofG, shade));
  // upper shaft, upper pod, antenna
  const Hs = h * 0.79;
  parts.push(cyl(0.15, 0.2, Hs - H0 - 0.6, 6, 0, H0 + 0.6 + (Hs - H0 - 0.6) / 2, 0, concrete));
  parts.push(cyl(0.3, 0.24, 0.12, 10, 0, Hs + 0.02, 0, concrete));
  parts.push(cyl(0.28, 0.28, 0.08, 10, 0, Hs + 0.12, 0, '#59606d'));
  parts.push(cyl(0.22, 0.3, 0.1, 10, 0, Hs + 0.21, 0, shade));
  const antH = h - Hs - 0.26;
  parts.push(cyl(0.042, 0.085, antH * 0.55, 5, 0, Hs + 0.26 + antH * 0.275, 0, '#e8e4dc'));
  parts.push(cyl(0.035, 0.045, antH * 0.45, 5, 0, Hs + 0.26 + antH * 0.775, 0, '#c9473d'));
  group.add(lump(parts, { noise: 0.08, noiseScale: 3 }));

  // glowing window ring (colour set every frame)
  const ringMat = toon('#28303f', { emissive: '#ffffff', emissiveIntensity: 0, noise: 0, snow: 0, wet: 0 });
  const ring = K.mesh(new THREE.CylinderGeometry(1.04, 1.04, 0.16, 18), ringMat, { cast: false });
  ring.position.y = H0 + 0.12;
  group.add(ring);

  // LED strips: hue cycles slowly, a brighter band climbs the shaft
  const stripMat = fxMaterial({
    vertexShader: /* glsl */`
      varying float vY;
      void main() { vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform float uOn;
      uniform float uFill;
      uniform float uH;
      uniform float uHue;
      varying float vY;
      vec3 hsv(float h, float s, float v) {
        vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
        return v * mix(vec3(1.0), k, s);
      }
      void main() {
        float f = vY / uH;
        if (uOn < 0.02 || f > uFill) discard;
        vec3 c = hsv(fract(uHue - f * 0.22), 0.72, 1.0);
        float band = 0.7 + 0.3 * step(0.5, fract(f * 3.0 - uTime * 0.35));
        gl_FragColor = vec4(c * 3.2 * band, uOn);
        gNormal = vec4(0.0);
      }`,
    uniforms: { uTime: shared.uTime, uOn: { value: 0 }, uFill: { value: 1 }, uH: { value: H0 }, uHue: { value: 0 } },
  });
  const strip = new THREE.Mesh(K.merge(stripGeos), stripMat);
  strip.frustumCulled = false;
  group.add(strip);

  return {
    group, ringMat, strip, stripMat,
    pod: new THREE.Vector3(0, H0 + 0.2, 0),
    beacons: [new THREE.Vector3(0, h + 0.03, 0), new THREE.Vector3(0.3, Hs + 0.1, 0)],
    height: h,
  };
}

/** Low stadium dome on a drum. */
export function dome({ r = 1.0, color = '#e7e4dd', drum = '#b9b4ab' } = {}) {
  const parts = [];
  parts.push(cyl(r, r + 0.04, 0.5, 18, 0, 0.25, 0, drum));
  const sph = facet(new THREE.SphereGeometry(r * 0.99, 18, 5, 0, Math.PI * 2, 0, Math.PI / 2));
  sph.scale(1, 0.52, 1);
  sph.translate(0, 0.5, 0);
  paintFaces(sph, (c) => {
    const a = Math.atan2(c.z, c.x);
    const seg = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 4);
    return seg % 2 ? color : '#d6d2ca';
  });
  parts.push(sph);
  return { mesh: lump(parts, { noise: 0.05 }), windowBand: { r: r + 0.045, y: 0.33 } };
}

// ---------------------------------------------------------------- the ferry

/**
 * Double-ended island ferry. Long axis on local x, waterline at y = 0.
 * Returns { group, flags, whistle, ends, lights }.
 */
export function ferryBoat(rand) {
  const group = new THREE.Group();
  const L = 3.4, B = 1.16;
  const white = '#f4f2ec', green = '#2d6150', red = '#b34a3c', deckC = '#cfc9bc';
  const parts = [];

  // hull, rounded at both ends
  const hull = new THREE.BoxGeometry(L, 0.46, B, 16, 4, 6).toNonIndexed();
  const hp = hull.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i);
    let y = hp.getY(i) + 0.09, z = hp.getZ(i);
    const t = Math.abs(x) / (L / 2);
    z *= 1 - K.smoothstep(0.6, 1.0, t) * 0.55;
    if (y < 0.02) z *= 0.86;
    y += K.smoothstep(0.7, 1.0, t) * 0.05;
    hp.setXYZ(i, x, y, z);
  }
  hull.computeVertexNormals();
  paintFaces(hull, (c, n) => (n.y > 0.7 ? deckC : c.y > 0.17 ? white : c.y > 0.05 ? green : red));
  parts.push(hull);

  // lower cabin
  const cab = new THREE.BoxGeometry(2.72, 0.44, 0.98, 12, 1, 4).toNonIndexed();
  const cp = cab.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const t = Math.abs(cp.getX(i)) / 1.36;
    cp.setZ(i, cp.getZ(i) * (1 - K.smoothstep(0.7, 1.0, t) * 0.4));
  }
  cab.computeVertexNormals();
  cab.translate(0, 0.55, 0);
  parts.push(K.paint(cab, white));
  // upper deck, bulwark, benches
  parts.push(box(2.96, 0.06, 1.08, 0, 0.8, 0, '#d9d4c9'));
  for (const s of [-1, 1]) {
    parts.push(box(2.96, 0.13, 0.07, 0, 0.895, s * 0.505, white));
    parts.push(box(0.07, 0.13, 1.08, s * 1.445, 0.895, 0, white));
    parts.push(box(0.78, 0.07, 0.14, s * 0.86, 0.87, 0.24, '#8a5f3e'));
    parts.push(box(0.78, 0.07, 0.14, s * 0.86, 0.87, -0.24, '#8a5f3e'));
  }
  // wheelhouse
  parts.push(box(0.8, 0.3, 0.74, 0, 0.98, 0, white));
  parts.push(box(0.92, 0.06, 0.86, 0, 1.17, 0, green));
  parts.push(box(0.07, 0.44, 0.07, 0, 1.42, 0, '#2b2f3a'));
  parts.push(box(0.05, 0.1, 0.05, 0.07, 1.27, 0, '#c9a24a'));
  // flag poles
  for (const s of [-1, 1]) parts.push(box(0.07, 0.6, 0.07, s * 1.38, 1.1, 0, '#2b2f3a'));
  // life rings
  for (const s of [-1, 1]) for (const x of [-1.0, 1.0]) parts.push(box(0.12, 0.12, 0.03, x, 0.58, s * 0.5, '#f07a2a'));
  // passengers on the upper deck
  const pp = [[0.55, 0.35, 0], [0.75, -0.3, 0.3], [-0.6, 0.33, 2.9], [-0.95, -0.28, 3.4], [1.15, 0.05, -0.4]];
  for (const [x, z, r] of pp) parts.push(figure(rand, { scale: 0.82 }, x, 0.83, z, r));
  group.add(lump(parts, { noise: 0.04 }));

  // windows and lights
  const glassM = toon('#24324a', { emissive: '#ffcf8a', emissiveIntensity: 4.4, lamp: true, noise: 0, snow: 0, wet: 0 });
  const wins = [];
  for (const s of [-1, 1]) {
    for (let k = 0; k < 8; k++) wins.push(box(0.2, 0.15, 0.03, -1.05 + k * 0.3, 0.6, s * 0.495, '#ffffff'));
    wins.push(box(0.03, 0.15, 0.18, s * 1.37, 0.6, 0.16, '#ffffff'));
    wins.push(box(0.03, 0.15, 0.18, s * 1.37, 0.6, -0.16, '#ffffff'));
  }
  wins.push(box(0.82, 0.1, 0.76, 0, 1.04, 0, '#ffffff'));
  group.add(K.mesh(K.merge(wins), glassM, { cast: false }));
  const bulbM = toon('#e9e3d2', { emissive: '#ffd79a', emissiveIntensity: 5, lamp: true, noise: 0, snow: 0, wet: 0 });
  const bulbs = [];
  for (let k = 0; k < 9; k++) for (const s of [-1, 1]) bulbs.push(box(0.07, 0.07, 0.07, -1.3 + k * 0.325, 0.99, s * 0.505, '#ffffff'));
  bulbs.push(box(0.08, 0.08, 0.08, 0, 1.66, 0, '#ffffff'));
  group.add(K.mesh(K.merge(bulbs), bulbM, { cast: false }));
  const navR = toon('#5a2020', { emissive: '#ff3b30', emissiveIntensity: 5, lamp: true, noise: 0, snow: 0 });
  const navG = toon('#1f4a2a', { emissive: '#36e07a', emissiveIntensity: 5, lamp: true, noise: 0, snow: 0 });
  const nr = K.mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), navR, { cast: false });
  nr.position.set(0, 1.04, -0.41);
  const ng = K.mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), navG, { cast: false });
  ng.position.set(0, 1.04, 0.41);
  group.add(nr, ng);

  // flags: pivot on the pole, fly downwind
  const flags = [];
  for (const s of [-1, 1]) {
    const fg = new THREE.BoxGeometry(0.4, 0.24, 0.02, 3, 1, 1).toNonIndexed();
    fg.translate(0.2, 0, 0);
    fg.computeVertexNormals();
    paintFaces(fg, (c) => (c.x > 0.13 && c.x < 0.27 ? '#f4f2ec' : '#d23a33'));
    const f = K.mesh(fg, toon('#ffffff', { vertexColors: true, noise: 0, side: THREE.DoubleSide }), { cast: false });
    f.position.set(s * 1.38, 1.25, 0);
    group.add(f);
    flags.push(f);
  }
  return {
    group, flags, length: L, beam: B,
    whistle: new THREE.Vector3(0.07, 1.34, 0),
    ends: [new THREE.Vector3(L / 2, 0, 0), new THREE.Vector3(-L / 2, 0, 0)],
  };
}

// ---------------------------------------------------------------- boats, buoys, birds

export function sailboat(rand, { hull = '#f4f2ec', sail = '#fbf8f0', stripe = '#d0453a' } = {}) {
  const g = new THREE.Group();
  const parts = [];
  const hg = new THREE.BoxGeometry(1.0, 0.2, 0.36, 6, 1, 2).toNonIndexed();
  const p = hg.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    let z = p.getZ(i), y = p.getY(i) + 0.06;
    if (x > 0) z *= 1 - K.smoothstep(0.0, 0.5, x) * 0.92;
    if (y < 0) z *= 0.6;
    p.setXYZ(i, x, y + (x > 0.3 ? (x - 0.3) * 0.12 : 0), z);
  }
  hg.computeVertexNormals();
  paintFaces(hg, (c, n) => (n.y > 0.7 ? '#c9a77a' : c.y < 0.02 ? stripe : hull));
  parts.push(hg);
  parts.push(box(0.3, 0.1, 0.22, -0.12, 0.2, 0, hull));
  parts.push(box(0.07, 1.4, 0.07, 0.1, 0.86, 0, '#d9d6cf'));
  parts.push(box(0.5, 0.06, 0.06, -0.15, 0.3, 0, '#8a6a4a'));
  g.add(lump(parts, { noise: 0.04 }));
  // sails: main (mast to boom) and jib (mast to bow), with a coloured band on the main
  const sp = [], sc = [];
  const tri = (a, b, c, col) => {
    sp.push(...a, ...b, ...c);
    const cc = new THREE.Color(col);
    for (let k = 0; k < 3; k++) sc.push(cc.r, cc.g, cc.b);
  };
  tri([0.08, 0.33, 0], [0.08, 1.52, 0], [-0.4, 0.33, 0], sail);
  tri([0.08, 0.33, 0], [0.08, 0.5, 0], [-0.4, 0.33, 0], stripe);
  tri([0.13, 1.38, 0], [0.47, 0.22, 0], [0.13, 0.3, 0], sail);
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  sg.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
  sg.computeVertexNormals();
  const sails = K.mesh(sg, toon('#ffffff', { vertexColors: true, side: THREE.DoubleSide, noise: 0.03, snow: 0.3 }));
  sails.rotation.y = 0.22;
  g.add(sails);
  const light = K.mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), toon('#dcdcd0', { emissive: '#fff1cf', emissiveIntensity: 6, lamp: true, noise: 0, snow: 0 }), { cast: false });
  light.position.set(0.1, 1.6, 0);
  g.add(light);
  return g;
}

/** Channel buoy: red nun (cone top) or green can (flat top), light on top. */
export function buoy(color, lightColor, nun = true) {
  const g = new THREE.Group();
  const parts = [];
  parts.push(cyl(0.2, 0.17, 0.32, 8, 0, 0.06, 0, color));
  parts.push(cyl(0.205, 0.205, 0.05, 8, 0, 0.12, 0, '#ece8de'));
  if (nun) {
    const c = facet(new THREE.ConeGeometry(0.2, 0.18, 8));
    c.translate(0, 0.31, 0);
    parts.push(K.paint(c, color));
  } else parts.push(cyl(0.21, 0.21, 0.04, 8, 0, 0.24, 0, color));
  g.add(lump(parts, { noise: 0.05 }));
  const mat = toon(lightColor, { emissive: lightColor, emissiveIntensity: 7, lamp: true, noise: 0, snow: 0 });
  const light = K.mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), mat, { cast: false });
  light.position.y = nun ? 0.43 : 0.3;
  g.add(light);
  return { group: g, mat };
}

export function gull() {
  const g = new THREE.Group();
  const m = toon('#f4f4f0', { noise: 0, snow: 0 });
  const body = K.mesh(new THREE.BoxGeometry(0.22, 0.08, 0.08), m, { cast: false });
  const head = K.mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), m, { cast: false });
  head.position.set(0.12, 0.04, 0);
  const wingGeo = new THREE.BoxGeometry(0.12, 0.03, 0.3);
  wingGeo.translate(0, 0, 0.15);
  K.paint(wingGeo, '#f4f4f0');
  const tip = new THREE.BoxGeometry(0.12, 0.031, 0.08);
  tip.translate(0, 0, 0.27);
  K.paint(tip, '#3a3f4a');
  const wg = K.merge([wingGeo, tip]);
  const wm = toon('#ffffff', { vertexColors: true, noise: 0, snow: 0 });
  const wl = K.mesh(wg, wm, { cast: false });
  const wr = K.mesh(wg, wm, { cast: false });
  wr.rotation.x = Math.PI;
  wl.position.set(0, 0.03, 0.03);
  wr.position.set(0, 0.03, -0.03);
  g.add(body, head, wl, wr);
  g.userData.wings = [wl, wr];
  return g;
}

// ---------------------------------------------------------------- island

export function willowGeometry(rand, { h = 1.15, r = 0.78, leaf = '#a3c95b', leaf2 = '#8db84c', trunk = '#6a4a33' } = {}) {
  const parts = [];
  const t = new THREE.CylinderGeometry(0.08, 0.13, h, 6);
  t.translate(0, h / 2, 0);
  t.rotateZ(0.06);
  parts.push(K.paint(t, trunk));
  for (let i = 0; i < 4; i++) {
    const br = r * (0.48 + rand() * 0.2);
    const b = new THREE.IcosahedronGeometry(br, 1);
    K.jitter(b, br * 0.15, Math.floor(rand() * 999));
    b.scale(1, 0.62, 1);
    const a = (i / 4) * Math.PI * 2 + rand();
    b.translate(Math.cos(a) * r * 0.32, h + 0.2 + rand() * 0.18, Math.sin(a) * r * 0.32);
    parts.push(K.paint(b, leaf));
  }
  const n = 15;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * 0.3;
    const len = 0.55 + rand() * 0.45;
    const fr = new THREE.BoxGeometry(0.11, len, 0.11);
    const rr = r * (0.72 + rand() * 0.18);
    fr.translate(Math.cos(a) * rr, h + 0.15 - len / 2, Math.sin(a) * rr);
    parts.push(K.paint(fr, i % 2 ? leaf2 : leaf));
  }
  return K.merge(parts);
}

export function picnicTable(x, y, z, ry, wood = '#a8774a') {
  const g = new THREE.Group();
  const add = (w, h, d, px, py, pz, c) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: c }));
    m.position.set(px, py, pz);
    g.add(m);
  };
  add(0.62, 0.05, 0.34, 0, 0.3, 0, wood);
  for (const s of [-1, 1]) {
    add(0.62, 0.04, 0.12, 0, 0.17, s * 0.3, wood);
    add(0.06, 0.3, 0.07, s * 0.24, 0.15, 0, '#7a5638');
    add(0.06, 0.04, 0.68, s * 0.24, 0.12, 0, '#7a5638');
  }
  g.position.set(x, y, z);
  g.rotation.y = ry;
  return bake(g);
}

// ---------------------------------------------------------------- effects

/** Foamy wake: a ribbon laid along the ferry's recent track, spreading and breaking up as it ages. */
export function wakeTrail({ max = 72, every = 0.12, life = 8 } = {}) {
  const N = max;
  const pos = new Float32Array(N * 2 * 3);
  const age = new Float32Array(N * 2);
  const side = new Float32Array(N * 2);
  const str = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) { side[i * 2] = -1; side[i * 2 + 1] = 1; }
  const idx = [];
  for (let i = 0; i < N - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aAge', new THREE.BufferAttribute(age, 1));
  geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  geo.setAttribute('aStr', new THREE.BufferAttribute(str, 1));
  geo.setIndex(idx);
  geo.setDrawRange(0, 0);
  const mat = fxMaterial({
    vertexShader: /* glsl */`
      attribute float aAge;
      attribute float aSide;
      attribute float aStr;
      varying float vAge;
      varying float vSide;
      varying float vStr;
      varying vec3 vW;
      void main() {
        vAge = aAge; vSide = aSide; vStr = aStr;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform float uLife;
      uniform vec3 uColor;
      varying float vAge;
      varying float vSide;
      varying float vStr;
      varying vec3 vW;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        float a = abs(vSide);
        float k = clamp(vAge / uLife, 0.0, 1.0);
        float arm = smoothstep(0.55, 0.85, a) * (1.0 - smoothstep(0.92, 1.0, a));
        float wash = (1.0 - smoothstep(0.2, 0.7, a)) * (1.0 - smoothstep(0.02, 0.35, k));
        float foam = max(arm * (1.0 - k * 0.9) * 1.1, wash * 1.15) * vStr * smoothstep(0.0, 0.15, vAge + 0.04);
        float nz = n(vW.xz * 5.5 + vec2(uTime * 0.25, -uTime * 0.1)) * 0.65 + n(vW.xz * 13.0 - uTime * 0.3) * 0.35;
        if (nz > foam * 1.05) discard;
        gl_FragColor = vec4(uColor, 0.9 - k * 0.4);
        gNormal = vec4(0.0);
      }`,
    uniforms: { uTime: shared.uTime, uLife: { value: life }, uColor: { value: new THREE.Color('#eef7f6') } },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  mesh.layers.set(1);
  const samples = [];
  let acc = 0;
  const Y = 0.05;
  return {
    mesh, mat,
    clear() { samples.length = 0; geo.setDrawRange(0, 0); },
    /** head: { x, z, dx, dz, s } (stern point, travel direction, strength 0..1) or null */
    update(time, dt, head) {
      acc += dt;
      if (head && head.s > 0.02 && acc >= every) {
        samples.unshift({ ...head, t: time });
        acc = 0;
        if (samples.length > N - 1) samples.pop();
      }
      while (samples.length && time - samples[samples.length - 1].t > life) samples.pop();
      const list = head && head.s > 0.02 ? [{ ...head, t: time }, ...samples] : samples;
      for (let i = 0; i < list.length; i++) {
        const s = list[i], a = time - s.t;
        const w = 0.6 + a * 0.32;
        pos.set([s.x - s.dz * w, Y, s.z + s.dx * w, s.x + s.dz * w, Y, s.z - s.dx * w], i * 6);
        age[i * 2] = age[i * 2 + 1] = a;
        str[i * 2] = str[i * 2 + 1] = s.s;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aAge.needsUpdate = true;
      geo.attributes.aStr.needsUpdate = true;
      geo.setDrawRange(0, Math.max(0, list.length - 1) * 6);
    },
  };
}

/** Light dashes on open water, lined up with the screen like pixel-art water shine. */
export function shimmer({ size, heightAt, level = 0, segments = 64 }) {
  const half = size / 2, n = segments;
  const P = [], D = [], I = [];
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= n; j++) {
      const x = -half + (size * i) / n, z = -half + (size * j) / n;
      P.push(x, level + 0.04, z);
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
  const mat = fxMaterial({
    vertexShader: /* glsl */`
      attribute float aDepth;
      varying float vDepth;
      varying vec3 vW;
      void main() {
        vDepth = aDepth;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uAmount;
      varying float vDepth;
      varying vec3 vW;
      float hh(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      void main() {
        vec2 q = vec2(vW.x - vW.z, vW.x + vW.z) * 0.70710678;
        q.x += sin(q.y * 1.7 + uTime * 0.6) * 0.15;
        vec2 cs = vec2(0.62, 0.15);
        vec2 cell = floor(q / cs);
        vec2 f = fract(q / cs);
        float r = hh(cell);
        float life = fract(uTime * (0.22 + r * 0.3) + r * 9.0);
        float on = step(r, uAmount * 0.12) * step(0.15, life) * step(life, 0.75);
        float len = 0.25 + 0.55 * fract(r * 17.0);
        on *= step(abs(f.x - 0.5), len * 0.5) * step(abs(f.y - 0.5), 0.26);
        on *= smoothstep(0.3, 0.8, vDepth);
        if (on < 0.5) discard;
        gl_FragColor = vec4(uColor * (0.55 + 0.9 * fract(r * 31.0)), 1.0);
        gNormal = vec4(0.0);
      }`,
    uniforms: { uTime: shared.uTime, uColor: { value: new THREE.Color() }, uAmount: { value: 1 } },
    blending: THREE.AdditiveBlending,
  });
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 2;
  m.frustumCulled = false;
  m.layers.set(1);
  return { mesh: m, mat };
}

/** Spray and churn on the water surface: emit(pos, vx, vz) leaves a white fleck that drifts and fades. */
export function spray({ count = 260, life = 1.4 } = {}) {
  const pos = new Float32Array(count * 3);
  const vel = new Float32Array(count * 2);
  const birth = new Float32Array(count).fill(-99);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aVel', new THREE.BufferAttribute(vel, 2));
  geo.setAttribute('aBirth', new THREE.BufferAttribute(birth, 1));
  const mat = fxMaterial({
    vertexShader: /* glsl */`
      uniform float uTime;
      uniform float uLife;
      attribute vec2 aVel;
      attribute float aBirth;
      varying float vA;
      void main() {
        float a = uTime - aBirth;
        float k = a / uLife;
        vA = (a < 0.0 || k > 1.0) ? 0.0 : 1.0 - k;
        vec3 p = position + vec3(aVel.x, 0.0, aVel.y) * (a - a * a * 0.3);
        gl_PointSize = k < 0.35 ? 2.0 : 1.0;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      varying float vA;
      void main() {
        if (vA < 0.15) discard;
        gl_FragColor = vec4(uColor, min(1.0, vA * 1.3));
        gNormal = vec4(0.0);
      }`,
    uniforms: { uTime: shared.uTime, uLife: { value: life }, uColor: { value: new THREE.Color('#f2f8f7') } },
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 4;
  pts.layers.set(1);
  let next = 0;
  return {
    points: pts, mat,
    emit(x, z, vx, vz, time) {
      pos.set([x, 0.05, z], next * 3);
      vel.set([vx, vz], next * 2);
      birth[next] = time;
      next = (next + 1) % count;
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aVel.needsUpdate = true;
      geo.attributes.aBirth.needsUpdate = true;
    },
  };
}

/** Steam puffs from the ferry whistle: emit(pos) while the horn sounds. */
export function steam({ count = 160, life = 2.6 } = {}) {
  const pos = new Float32Array(count * 3);
  const birth = new Float32Array(count).fill(-99);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) seed[i] = Math.random();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aBirth', new THREE.BufferAttribute(birth, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = fxMaterial({
    vertexShader: /* glsl */`
      uniform float uTime;
      uniform float uLife;
      uniform vec3 uWind;
      attribute float aBirth;
      attribute float aSeed;
      varying float vA;
      void main() {
        float a = uTime - aBirth;
        float k = a / uLife;
        vA = (a < 0.0 || k > 1.0) ? 0.0 : (1.0 - k) * smoothstep(0.0, 0.05, a);
        vec3 p = position;
        p.y += a * 1.1 - a * a * 0.14;
        p.xz += uWind.xz * a * 0.5 + vec2(sin(aSeed * 40.0), cos(aSeed * 31.0)) * a * 0.26;
        gl_PointSize = k < 0.1 ? 2.0 : (k < 0.35 ? 3.0 : (k < 0.7 ? 4.0 : 5.0));
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      varying float vA;
      void main() {
        if (vA < 0.04) discard;
        gl_FragColor = vec4(uColor, vA * 0.8);
        gNormal = vec4(0.0);
      }`,
    uniforms: { uTime: shared.uTime, uWind: shared.uWind, uLife: { value: life }, uColor: { value: new THREE.Color('#f4f6fa') } },
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  let next = 0;
  return {
    points: pts, mat,
    emit(p, time) {
      pos.set([p.x + (Math.random() - 0.5) * 0.05, p.y, p.z + (Math.random() - 0.5) * 0.05], next * 3);
      birth[next] = time;
      next = (next + 1) % count;
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aBirth.needsUpdate = true;
    },
  };
}

/**
 * Fireworks: shells rise from a launch point and burst into HDR stars with gravity, drag and
 * fading trails. GPU-driven: each burst slot is a handful of uniforms.
 * kinds: 0 peony, 1 ring, 2 willow, 3 chrysanthemum with crackle.
 */
export function fireworks({ slots = 8, per = 170 } = {}) {
  const N = slots * per;
  const aSlot = new Float32Array(N), aDir = new Float32Array(N * 3), aRnd = new Float32Array(N * 4);
  for (let s = 0; s < slots; s++)
    for (let i = 0; i < per; i++) {
      const k = s * per + i;
      aSlot[k] = s;
      const t = (i + 0.5) / per, y = 1 - 2 * t, r = Math.sqrt(1 - y * y), phi = i * 2.39996 + s * 1.7;
      aDir.set([Math.cos(phi) * r, y, Math.sin(phi) * r], k * 3);
      aRnd.set([Math.random(), Math.random(), Math.random(), Math.random()], k * 4);
    }
  const v4 = () => Array.from({ length: slots }, () => new THREE.Vector4(0, -99, 0, -99));
  const v3 = () => Array.from({ length: slots }, () => new THREE.Vector3(1, 1, 1));
  const uniforms = {
    uTime: shared.uTime,
    uBurst: { value: v4() },
    uKind: { value: Array.from({ length: slots }, () => new THREE.Vector4(0, 4, 2, 0.2)) },
    uLaunch: { value: v4() },
    uColA: { value: v3() },
    uColB: { value: v3() },
    uAxis: { value: Array.from({ length: slots }, () => new THREE.Vector3(0, 1, 0)) },
    uGain: { value: 4.2 },
  };
  const HEAD = /* glsl */`
    #define SLOTS ${slots}
    uniform float uTime;
    uniform vec4 uBurst[SLOTS];
    uniform vec4 uKind[SLOTS];
    uniform vec4 uLaunch[SLOTS];
    uniform vec3 uColA[SLOTS];
    uniform vec3 uColB[SLOTS];
    uniform vec3 uAxis[SLOTS];
    attribute float aSlot;
    attribute float aEnd;
    varying vec3 vCol;
    varying float vA;
    vec3 flight(vec3 c, vec3 v0, float drag, float grav, float t) {
      vec3 vt = vec3(0.0, -grav / drag, 0.0);
      return c + vt * t + (v0 - vt) * (1.0 - exp(-drag * t)) / drag;
    }
    float h1(float x) { return fract(sin(x * 12.9898) * 43758.5453); }
  `;
  const starVert = (trail) => /* glsl */`
    ${HEAD}
    attribute vec3 aDir;
    attribute vec4 aRnd;
    void main() {
      int s = int(aSlot + 0.5);
      vec4 B = uBurst[s];
      vec4 Kd = uKind[s];
      float kind = Kd.x;
      float age = uTime - B.w;
      float life = Kd.z * (0.82 + 0.36 * aRnd.x);
      vA = 0.0;
      vCol = vec3(0.0);
      gl_PointSize = 1.0;
      if (age < 0.0 || age > life) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
      vec3 dir = aDir;
      float spd = Kd.y;
      bool willow = kind > 1.5 && kind < 2.5;
      if (kind > 0.5 && kind < 1.5) {
        vec3 n = normalize(uAxis[s]);
        dir = dir - n * dot(dir, n);
        dir = length(dir) < 0.05 ? vec3(1.0, 0.0, 0.0) : normalize(dir);
        spd *= 0.97 + 0.06 * aRnd.y;
      } else if (kind > 2.5) {
        spd *= 0.4 + 0.6 * aRnd.y;
      } else {
        spd *= 0.9 + 0.12 * aRnd.y;
      }
      float drag = willow ? 2.3 : 1.5;
      float grav = willow ? 1.2 : 1.8;
      float t = ${trail ? 'max(age - Kd.w * aEnd, 0.0)' : 'age'};
      vec3 p = flight(B.xyz, dir * spd, drag, grav, t);
      float k = age / life;
      float fade = (1.0 - k) * (1.0 - k * 0.5);
      vCol = mix(uColA[s], uColB[s], smoothstep(0.3, 0.85, k + (aRnd.w - 0.5) * 0.25));
      vCol = mix(vCol, vec3(1.0, 0.94, 0.82), (1.0 - smoothstep(0.1, 0.4, age)) * 0.6);
      float tw = 1.0;
      if (kind > 1.5) {
        float on = step(0.5, h1(floor(uTime * 20.0) + aRnd.z * 91.7));
        tw = mix(1.0, on * 1.7, smoothstep(0.5, 0.66, k));
      }
      float spread = length(p - B.xyz);
      vA = fade * tw * smoothstep(0.0, 0.2, age) * clamp(spread * spread / 2.2, 0.05, 1.0);
      ${trail ? 'vA *= (1.0 - aEnd) * 0.55;' : 'gl_PointSize = age < 0.4 ? 2.0 : 1.0;'}
      gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
    }`;
  const rocketVert = (trail) => /* glsl */`
    ${HEAD}
    void main() {
      int s = int(aSlot + 0.5);
      vec4 B = uBurst[s];
      vec4 Lc = uLaunch[s];
      float age = uTime - (B.w - Lc.w);
      vA = 0.0;
      vCol = vec3(1.0, 0.78, 0.45);
      gl_PointSize = 2.0;
      ${trail ? '' : `
      float fa = uTime - B.w;
      if (fa >= 0.0 && fa < 0.14) {
        vA = 1.0 - fa / 0.14;
        vCol = mix(uColA[s], vec3(1.0), 0.6) * 0.55;
        gl_PointSize = fa < 0.05 ? 4.0 : 2.0;
        gl_Position = projectionMatrix * viewMatrix * vec4(B.xyz, 1.0);
        return;
      }`}
      if (age < 0.0 || age > Lc.w) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
      float u = age / Lc.w;
      ${trail ? 'u = max(u - 0.3 * aEnd, 0.0);' : ''}
      float e = 1.0 - (1.0 - u) * (1.0 - u);
      vec3 p = mix(Lc.xyz, B.xyz, e);
      p.x += sin(u * 19.0 + float(s)) * 0.03;
      vA = ${trail ? '(1.0 - aEnd) * 0.7' : '1.0'};
      gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
    }`;
  // colour adds up; alpha is coverage (bright stars hide the sky behind them, faint trails let it through)
  const frag = /* glsl */`
    uniform float uGain;
    varying vec3 vCol;
    varying float vA;
    void main() {
      if (vA < 0.02) discard;
      vec3 c = vCol * uGain * vA;
      gl_FragColor = vec4(c, clamp(max(c.r, max(c.g, c.b)) * 0.45, 0.0, 1.0));
      gNormal = vec4(0.0);
    }`;
  // additive colour, alpha kept as the max coverage, so neither the sky composite nor the water's reflection lookup overshoots
  const mk = (vs) => {
    const m = fxMaterial({ vertexShader: vs, fragmentShader: frag, uniforms, blending: THREE.CustomBlending });
    m.blendEquation = THREE.AddEquation;
    m.blendSrc = THREE.OneFactor;
    m.blendDst = THREE.OneFactor;
    m.blendEquationAlpha = THREE.MaxEquation;
    m.blendSrcAlpha = THREE.OneFactor;
    m.blendDstAlpha = THREE.OneFactor;
    return m;
  };

  // stars: heads (points) and trails (segments)
  const headGeo = new THREE.BufferGeometry();
  headGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  headGeo.setAttribute('aSlot', new THREE.BufferAttribute(aSlot, 1));
  headGeo.setAttribute('aDir', new THREE.BufferAttribute(aDir, 3));
  headGeo.setAttribute('aRnd', new THREE.BufferAttribute(aRnd, 4));
  headGeo.setAttribute('aEnd', new THREE.BufferAttribute(new Float32Array(N), 1));
  const trailGeo = new THREE.BufferGeometry();
  const d2 = (src, n) => {
    const out = new Float32Array(src.length * 2);
    for (let i = 0; i < src.length / n; i++) for (let k = 0; k < 2; k++) out.set(src.subarray(i * n, i * n + n), (i * 2 + k) * n);
    return out;
  };
  trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3));
  trailGeo.setAttribute('aSlot', new THREE.BufferAttribute(d2(aSlot, 1), 1));
  trailGeo.setAttribute('aDir', new THREE.BufferAttribute(d2(aDir, 3), 3));
  trailGeo.setAttribute('aRnd', new THREE.BufferAttribute(d2(aRnd, 4), 4));
  const ends = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) ends[i * 2 + 1] = 1;
  trailGeo.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
  // rockets
  const rs = new Float32Array(slots), rs2 = new Float32Array(slots * 2), re2 = new Float32Array(slots * 2);
  for (let s = 0; s < slots; s++) { rs[s] = s; rs2[s * 2] = rs2[s * 2 + 1] = s; re2[s * 2 + 1] = 1; }
  const rHead = new THREE.BufferGeometry();
  rHead.setAttribute('position', new THREE.BufferAttribute(new Float32Array(slots * 3), 3));
  rHead.setAttribute('aSlot', new THREE.BufferAttribute(rs, 1));
  rHead.setAttribute('aEnd', new THREE.BufferAttribute(new Float32Array(slots), 1));
  const rTrail = new THREE.BufferGeometry();
  rTrail.setAttribute('position', new THREE.BufferAttribute(new Float32Array(slots * 6), 3));
  rTrail.setAttribute('aSlot', new THREE.BufferAttribute(rs2, 1));
  rTrail.setAttribute('aEnd', new THREE.BufferAttribute(re2, 1));

  const group = new THREE.Group();
  for (const o of [new THREE.Points(headGeo, mk(starVert(false))), new THREE.LineSegments(trailGeo, mk(starVert(true))), new THREE.Points(rHead, mk(rocketVert(false))), new THREE.LineSegments(rTrail, mk(rocketVert(true)))]) {
    o.frustumCulled = false;
    o.renderOrder = 5;
    group.add(o);
  }
  let next = 0;
  return {
    group, uniforms,
    /** schedule a shell: bursts at time `at` (launch earlier by `rise`) */
    fire({ at, center, from, rise = 1.1, kind = 0, speed = 4, life = 2, trail = 0.22, colA, colB, axis }) {
      const s = next;
      next = (next + 1) % slots;
      uniforms.uBurst.value[s].set(center.x, center.y, center.z, at);
      uniforms.uLaunch.value[s].set(from.x, from.y, from.z, rise);
      uniforms.uKind.value[s].set(kind, speed, life, trail);
      const cb = colB || colA;
      uniforms.uColA.value[s].set(colA.r, colA.g, colA.b);
      uniforms.uColB.value[s].set(cb.r, cb.g, cb.b);
      if (axis) uniforms.uAxis.value[s].copy(axis);
      return s;
    },
  };
}

// ---------------------------------------------------------------- icons (9x9)

export const ICONS = {
  fireworks: ['#...#...#', '.#..#..#.', '..#...#..', '.........', '###.#.###', '.........', '..#...#..', '.#..#..#.', '#...#...#'],
  horn: ['..##.....', '...##....', '....#....', '..###....', '.#######.', '.#.#.#.##', '#########', '.#######.', '.........'],
  skyline: ['......#..', '......#..', '.....###.', '.#....#..', '.#..#.#..', '##..#.#.#', '##.##.#.#', '#####.###', '#########'],
};
