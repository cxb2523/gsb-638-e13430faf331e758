import * as THREE from 'three';
import * as K from './kit.js';
import { person, walker } from './kit-people.js';
import { building, car, neon, neonFlicker, hydrant, bench, bin } from './kit-city.js';
import { toon, fxMaterial, setGlow, shared } from '../engine/materials.js';

// Streetcar corner: a Toronto main-street intersection on a wet night. A red streetcar on the
// overhead wire, traffic that obeys the lights, neon over the shops, and a cutaway subway
// station under the street with trains passing through.

const SIZE = 16, HALF = 8, CELLS = 32, BASE = -3.2;
const ROAD = 0.3, WALK = 0.45, GRASS = 0.5;
const A = { z0: 1.0, z1: 3.5 }; // main street, runs along x (streetcar line)
const B = { x0: -1.0, x1: 1.5 }; // cross street, runs along z
const LANE = { east: 2.875, west: 1.625, south: -0.375, north: 0.875 };
const WIRE_Y = ROAD + 2.15;
const TUN = { x0: -7.5, x1: 7.5, y0: -2.65, y1: -1.0, z0: 6.6, track: 6.98, plat: 7.32 };

const inA = (x, z) => z > A.z0 && z < A.z1;
const inB = (x) => x > B.x0 && x < B.x1;
const isRoad = (x, z) => inA(x, z) || inB(x);
const isPark = (x, z) => x < -2.5 && z > 5.0;
const isPlaza = (x, z) => x > 3.0 && z > 5.0;

const ICONS = {
  streetcar: ['....#....', '...#.....', '..#......', '#########', '#.#.#.#.#', '#########', '#########', '.#.....#.', '.........'],
  subway: ['.#######.', '#.......#', '#.##.##.#', '#.##.##.#', '#.......#', '#.#...#.#', '#########', '.#.....#.', '#.......#'],
  neon: ['.#######.', '#.......#', '#.#####.#', '#.#...#.#', '#.#####.#', '#.......#', '.#######.', '....#....', '...###...'],
};

// ---------------------------------------------------------------- vehicles

function clipTo(obj, planes) {
  obj.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) if (m) { m.clippingPlanes = planes; m.clipShadows = true; }
  });
}

/** Two-section red streetcar facing +x, wheels at y = 0. Pantograph reaches the wire. */
function streetcar() {
  const g = new THREE.Group();
  const L = 3.6, W = 0.64, H = 0.66, lift = 0.1;
  const red = toon('#cf2b2b', { noise: 0.06 });
  const dark = toon('#23262f', { noise: 0.04 });
  const roofM = toon('#aeb2bb', { noise: 0.08 });
  const cream = toon('#efe9dc', { noise: 0.04 });
  const glassM = K.glass('#fff0c8', 3.2, '#283041');
  for (const s of [-1, 1]) {
    const body = K.mesh(new THREE.BoxGeometry(L / 2 - 0.07, H, W), red);
    body.position.set((s * L) / 4, lift + H / 2, 0);
    g.add(body);
  }
  const bellows = K.mesh(new THREE.BoxGeometry(0.14, H * 0.88, W * 0.9), dark);
  bellows.position.set(0, lift + H / 2, 0);
  const skirt = K.mesh(new THREE.BoxGeometry(L * 0.97, 0.11, W * 1.02), dark);
  skirt.position.set(0, lift + 0.05, 0);
  const band = K.mesh(new THREE.BoxGeometry(L * 0.9, 0.22, W + 0.02), glassM, { cast: false });
  band.position.set(0, lift + H * 0.64, 0);
  const stripe = K.mesh(new THREE.BoxGeometry(L * 0.97, 0.05, W + 0.016), cream);
  stripe.position.set(0, lift + H * 0.44, 0);
  g.add(bellows, skirt, band, stripe);
  for (let x = -L / 2 + 0.36; x < L / 2 - 0.2; x += 0.42) {
    const m = K.mesh(new THREE.BoxGeometry(0.05, 0.23, W + 0.03), dark);
    m.position.set(x, lift + H * 0.64, 0);
    g.add(m);
  }
  // cab ends: dark windscreen, destination glow, lamps
  const sign = toon('#3a2a10', { emissive: '#ffb340', emissiveIntensity: 3.2, noise: 0 });
  for (const s of [1, -1]) {
    const screen = K.mesh(new THREE.BoxGeometry(0.04, 0.26, W * 0.78), glassM, { cast: false });
    screen.position.set(s * (L / 2 - 0.01), lift + H * 0.64, 0);
    const dest = K.mesh(new THREE.BoxGeometry(0.04, 0.07, W * 0.5), sign, { cast: false });
    dest.position.set(s * (L / 2 - 0.005), lift + H * 0.93, 0);
    g.add(screen, dest);
  }
  const head = K.glass('#fff4d0', 6, '#d8d4c8');
  const tail = K.glass('#ff3b30', 4, '#7a2420');
  for (const z of [0.2, -0.2]) {
    const hl = K.mesh(new THREE.BoxGeometry(0.03, 0.05, 0.08), head, { cast: false });
    hl.position.set(L / 2 + 0.01, lift + 0.2, z);
    const tl = K.mesh(new THREE.BoxGeometry(0.03, 0.05, 0.08), tail, { cast: false });
    tl.position.set(-L / 2 - 0.01, lift + 0.2, z);
    g.add(hl, tl);
  }
  const roof = K.mesh(new THREE.BoxGeometry(L * 0.88, 0.06, W * 0.82), roofM);
  roof.position.y = lift + H + 0.03;
  g.add(roof);
  for (const x of [-1.1, 0.6]) {
    const box = K.mesh(new THREE.BoxGeometry(0.5, 0.1, W * 0.5), roofM);
    box.position.set(x, lift + H + 0.1, 0);
    g.add(box);
  }
  // pantograph: a folded arm up to the contact wire
  const top = WIRE_Y - ROAD;
  const arm = (a, b) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const m = K.mesh(new THREE.BoxGeometry(len, 0.05, 0.05), dark, { cast: true });
    m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0);
    m.rotation.z = Math.atan2(b[1] - a[1], b[0] - a[0]);
    g.add(m);
  };
  const base = [-0.15, lift + H + 0.07], knee = [0.35, (lift + H + top) / 2 + 0.05], tip = [0.0, top - 0.03];
  arm(base, knee);
  arm(knee, tip);
  const shoe = K.mesh(new THREE.BoxGeometry(0.08, 0.04, 0.5), dark);
  shoe.position.set(tip[0], tip[1], 0);
  g.add(shoe);
  return { group: g, length: L, contact: new THREE.Vector3(tip[0], top, 0) };
}

/** Silver subway train facing +x, several cars, windows always lit. */
function subwayTrain(cars = 4) {
  const g = new THREE.Group();
  const carL = 1.9, W = 0.55, H = 0.62;
  const silver = toon('#c6cad2', { noise: 0.05 });
  const red = toon('#c8322c', { noise: 0.03 });
  const dark = toon('#2a2d36', { noise: 0.02 });
  const lit = toon('#2a3142', { emissive: '#dfe9ff', emissiveIntensity: 1.9, noise: 0 });
  const total = cars * carL + (cars - 1) * 0.08;
  for (let i = 0; i < cars; i++) {
    const cx = -total / 2 + carL / 2 + i * (carL + 0.08);
    const body = K.mesh(new THREE.BoxGeometry(carL, H, W), silver);
    body.position.set(cx, 0.1 + H / 2, 0);
    const win = K.mesh(new THREE.BoxGeometry(carL * 0.86, 0.2, W + 0.02), lit, { cast: false });
    win.position.set(cx, 0.1 + H * 0.63, 0);
    const str = K.mesh(new THREE.BoxGeometry(carL, 0.06, W + 0.015), red);
    str.position.set(cx, 0.1 + H * 0.36, 0);
    g.add(body, win, str);
    for (const dx of [-0.5, 0.5]) {
      const door = K.mesh(new THREE.BoxGeometry(0.04, H * 0.82, W + 0.03), dark);
      door.position.set(cx + dx, 0.1 + H * 0.45, 0);
      g.add(door);
    }
  }
  const head = toon('#ddd', { emissive: '#fff6dc', emissiveIntensity: 6, noise: 0 });
  for (const z of [0.16, -0.16]) {
    const hl = K.mesh(new THREE.BoxGeometry(0.03, 0.06, 0.08), head, { cast: false });
    hl.position.set(total / 2 + 0.01, 0.28, z);
    g.add(hl);
  }
  return { group: g, length: total };
}

/** Sparks where the pantograph meets the wire. */
function sparkSystem() {
  const N = 28;
  const pos = new Float32Array(N * 3), life = new Float32Array(N);
  const vel = Array.from({ length: N }, () => new THREE.Vector3());
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aLife', new THREE.BufferAttribute(life, 1));
  const mat = fxMaterial({
    vertexShader: /* glsl */`
      attribute float aLife;
      varying float vL;
      void main() { vL = aLife; gl_PointSize = aLife > 0.85 ? 2.0 : 1.0; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      varying float vL;
      uniform float uDaylight;
      void main() { if (vL <= 0.01) discard; gl_FragColor = vec4(vec3(0.75, 0.85, 1.0) * (5.5 - 3.5 * uDaylight) * vL, 1.0); gNormal = vec4(0.0); }`,
    uniforms: { uDaylight: shared.uDaylight },
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return {
    points: pts,
    burst(at) {
      for (let i = 0; i < N; i++) {
        pos.set([at.x, at.y, at.z], i * 3);
        vel[i].set((Math.random() - 0.5) * 2.2, Math.random() * 1.2 - 0.6, (Math.random() - 0.5) * 2.2);
        life[i] = 0.6 + Math.random() * 0.4;
      }
    },
    update(dt) {
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) continue;
        vel[i].y -= 6 * dt;
        pos[i * 3] += vel[i].x * dt;
        pos[i * 3 + 1] += vel[i].y * dt;
        pos[i * 3 + 2] += vel[i].z * dt;
        life[i] = Math.max(0, life[i] - dt * 2.6);
      }
      g.attributes.position.needsUpdate = true;
      g.attributes.aLife.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------- street furniture

function signalHead(face) {
  // face: 'x' (lenses face +x) or 'z' (lenses face +z)
  const g = new THREE.Group();
  const dark = toon('#262a33', { noise: 0.04 });
  const pole = K.mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.55, 6), dark);
  pole.position.y = 0.78;
  const head = K.mesh(new THREE.BoxGeometry(0.13, 0.4, 0.13), dark);
  head.position.y = 1.7;
  g.add(pole, head);
  const mats = ['#ff3b30', '#ffb21f', '#36e07a'].map((c) => toon('#14161b', { emissive: c, emissiveIntensity: 5.5, noise: 0, snow: 0 }));
  mats.forEach((m, i) => {
    const lens = K.mesh(new THREE.BoxGeometry(0.04, 0.085, 0.085), m, { cast: false });
    lens.position.set(0.075, 1.83 - i * 0.125, 0);
    g.add(lens);
  });
  if (face === 'z') g.rotation.y = -Math.PI / 2;
  return { group: g, set(state) { mats.forEach((m, i) => setGlow(m, i === state ? 1 : 0.05)); } };
}

function waterTank() {
  const g = new THREE.Group();
  const wood = toon('#8b6a4b', { noise: 0.25, noiseScale: 7 });
  const tank = K.mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.72, 10), wood);
  tank.position.y = 0.66;
  const roofGeo = new THREE.ConeGeometry(0.47, 0.32, 10).toNonIndexed();
  roofGeo.computeVertexNormals();
  const roof = K.mesh(roofGeo, toon('#5b4636', { noise: 0.1 }));
  roof.position.y = 1.18;
  const iron = toon('#2b2d33');
  for (const y of [0.45, 0.85]) {
    const hoop = K.mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.04, 10, 1, true), iron);
    hoop.position.y = y;
    g.add(hoop);
  }
  for (const [x, z] of [[0.28, 0.28], [-0.28, 0.28], [0.28, -0.28], [-0.28, -0.28]]) {
    const leg = K.mesh(new THREE.BoxGeometry(0.05, 0.32, 0.05), iron);
    leg.position.set(x, 0.16, z);
    g.add(leg);
  }
  g.add(tank, roof);
  return g;
}

function fireEscape(x0, x1, z, y0, floors, floorH) {
  const parts = [];
  const iron = '#24262c';
  for (let k = 0; k < floors; k++) {
    const y = y0 + k * floorH;
    const deck = new THREE.BoxGeometry(x1 - x0, 0.04, 0.34);
    deck.translate((x0 + x1) / 2, y, z + 0.17);
    const rail = new THREE.BoxGeometry(x1 - x0, 0.03, 0.03);
    rail.translate((x0 + x1) / 2, y + 0.28, z + 0.33);
    parts.push(K.paint(deck, iron), K.paint(rail, iron));
    for (let px = x0; px <= x1 + 1e-3; px += (x1 - x0) / 3) {
      const post = new THREE.BoxGeometry(0.03, 0.28, 0.03);
      post.translate(px, y + 0.14, z + 0.33);
      parts.push(K.paint(post, iron));
    }
    if (k < floors - 1) {
      const len = Math.hypot((x1 - x0) * 0.7, floorH);
      const stair = new THREE.BoxGeometry(len, 0.04, 0.16);
      stair.rotateZ(Math.atan2(floorH, (x1 - x0) * 0.7) * (k % 2 ? 1 : -1));
      stair.translate((x0 + x1) / 2, y + floorH / 2, z + 0.16);
      parts.push(K.paint(stair, iron));
    }
  }
  return K.mesh(K.merge(parts), toon('#ffffff', { vertexColors: true, noise: 0.05, snow: 1 }));
}

function hotDogCart() {
  const g = new THREE.Group();
  const steel = toon('#c9ccd2', { noise: 0.05 });
  const body = K.mesh(new THREE.BoxGeometry(0.72, 0.34, 0.4), steel);
  body.position.y = 0.32;
  const wheel = new THREE.CylinderGeometry(0.11, 0.11, 0.05, 10);
  wheel.rotateX(Math.PI / 2);
  for (const z of [0.22, -0.22]) {
    const w = K.mesh(wheel, toon('#22242a'));
    w.position.set(0.18, 0.12, z);
    g.add(w);
  }
  const pole = K.mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 4), toon('#2a2a2a'));
  pole.position.set(-0.1, 0.85, 0);
  const um = new THREE.ConeGeometry(0.62, 0.22, 10, 1).toNonIndexed();
  const p = um.attributes.position;
  const cols = new Float32Array(p.count * 3);
  const ca = new THREE.Color('#f2c14e'), cb = new THREE.Color('#2f6fb3');
  for (let i = 0; i < p.count; i += 3) {
    const a = Math.atan2(p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2), p.getX(i) + p.getX(i + 1) + p.getX(i + 2));
    const c = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 10) % 2 ? ca : cb;
    for (let k = 0; k < 3; k++) cols.set([c.r, c.g, c.b], (i + k) * 3);
  }
  um.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  um.computeVertexNormals();
  const umbrella = K.mesh(um, toon('#ffffff', { vertexColors: true, noise: 0.04 }));
  umbrella.position.set(-0.1, 1.28, 0);
  const lamp = K.mesh(new THREE.BoxGeometry(0.1, 0.08, 0.1), K.glass('#ffd27a', 5), { cast: false });
  lamp.position.set(0.1, 0.55, 0.16);
  g.add(body, pole, umbrella, lamp);
  return g;
}

function shelter() {
  const g = new THREE.Group();
  const frame = toon('#30343d', { noise: 0.05 });
  const roof = K.mesh(new THREE.BoxGeometry(1.5, 0.06, 0.55), frame);
  roof.position.y = 0.95;
  g.add(roof);
  for (const x of [-0.72, 0.72]) for (const z of [-0.24, 0.24]) {
    const post = K.mesh(new THREE.BoxGeometry(0.04, 0.95, 0.04), frame);
    post.position.set(x, 0.475, z);
    g.add(post);
  }
  const back = K.mesh(new THREE.BoxGeometry(1.4, 0.7, 0.03), toon('#9fc3d6', { transparent: true, opacity: 0.35, noise: 0, snow: 0 }), { cast: false });
  back.position.set(0, 0.5, -0.24);
  // a backlit poster panel at the end: an abstract violet composition
  const ad = K.mesh(new THREE.BoxGeometry(0.04, 0.62, 0.42), toon('#2a1f4a', { emissive: '#8f63ff', emissiveIntensity: 2.6, noise: 0 }), { cast: false });
  ad.position.set(0.72, 0.5, 0);
  const adMark = K.mesh(new THREE.BoxGeometry(0.045, 0.2, 0.2), toon('#edeff2', { emissive: '#edeff2', emissiveIntensity: 2.2, noise: 0 }), { cast: false });
  adMark.position.set(0.72, 0.58, 0.04);
  g.add(back, ad, adMark);
  return g;
}

// neon shapes, drawn in a local (u, v) plane, about 0.6 units across
const circle = (cx, cy, r, n = 8) => Array.from({ length: n + 1 }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * r, cy + Math.sin((i / n) * Math.PI * 2) * r]);
const SHAPES = {
  cup: [
    [[-0.2, 0.22], [-0.2, -0.06], [-0.13, -0.16], [0.13, -0.16], [0.2, -0.06], [0.2, 0.22]],
    [[0.2, 0.15], [0.3, 0.13], [0.3, 0.0], [0.2, -0.02]],
    [[-0.06, 0.3], [-0.01, 0.36], [-0.06, 0.43], [-0.01, 0.5]],
    [[0.07, 0.3], [0.12, 0.36], [0.07, 0.43]],
  ],
  martini: [
    [[-0.26, 0.3], [0.26, 0.3], [0, 0.02], [-0.26, 0.3]],
    [[0, 0.02], [0, -0.22]],
    [[-0.14, -0.23], [0.14, -0.23]],
    circle(0.08, 0.2, 0.05, 6),
  ],
  pizza: [
    [[-0.27, 0.24], [0.27, 0.24], [0.0, -0.3], [-0.27, 0.24]],
    [[-0.3, 0.3], [0.0, 0.36], [0.3, 0.3]],
    circle(-0.07, 0.1, 0.05, 6),
    circle(0.08, 0.04, 0.045, 6),
  ],
  star: [Array.from({ length: 11 }, (_, i) => { const a = Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? 0.12 : 0.3; return [Math.cos(a) * r, Math.sin(a) * r]; })],
};

function neonSign(shape, color, face, at) {
  const g = new THREE.Group();
  let mat = null;
  for (const stroke of SHAPES[shape]) {
    const pts = stroke.map(([u, v]) => (face === '+z' ? [u, v, 0] : [0, v, -u]));
    const n = neon(pts, { color, radius: 0.04, power: 7 });
    if (!mat) mat = n.material;
    else { n.material.dispose(); n.mesh.material = mat; }
    g.add(n.mesh);
  }
  const mats = [mat];
  // dark backing board so the tubes read even by day
  const board = K.mesh(new THREE.BoxGeometry(face === '+z' ? 0.78 : 0.04, 0.8, face === '+z' ? 0.04 : 0.78), toon('#1e2028', { noise: 0.05 }), { cast: false });
  board.position.set(face === '+z' ? 0 : -0.04, 0.05, face === '+z' ? -0.04 : 0);
  g.add(board);
  g.position.copy(at);
  K.mergeGroup(g);
  return { group: g, mats };
}

// ---------------------------------------------------------------- scene

export default {
  name: 'Streetcar',
  view: { target: [0.4, 1.0, 0.6], size: 18.2, azimuth: 45, elevation: 30 },
  look: { pixelSize: 4, levels: 14, saturation: 1.18, contrast: 1.08, bloom: 1.25, bloomThreshold: 2.2, vignette: 0.24 },
  env: { hour: 21.5, weather: 'rain' },
  audio: { water: 0, birds: 0.35, crickets: 0, foghorn: 0 },
  mirror: { y: ROAD + 0.004 },
  sky: { moon: 0.9, milky: 0.15, moonPos: [0.84, 0.82] },
  actionsLabel: 'Street',

  create({ audio }) {
    const root = new THREE.Group();
    const rand = K.rng(7);
    const n = K.noise2(5);
    const blockClip = [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), HALF), new THREE.Plane(new THREE.Vector3(-1, 0, 0), HALF),
      new THREE.Plane(new THREE.Vector3(0, 0, 1), HALF), new THREE.Plane(new THREE.Vector3(0, 0, -1), HALF),
    ];
    const tunnelClip = [new THREE.Plane(new THREE.Vector3(1, 0, 0), -TUN.x0), new THREE.Plane(new THREE.Vector3(-1, 0, 0), TUN.x1)];

    // ---- ground
    const T = K.terrain({
      size: SIZE, cells: CELLS, step: 0.05, base: BASE, lip: 0.12,
      height: (x, z) => (isRoad(x, z) ? ROAD : isPark(x, z) ? GRASS : WALK),
      cutouts: [{ face: '+z', from: TUN.x0, to: TUN.x1, y0: TUN.y0, y1: TUN.y1 }],
      top(x, z, h, c) {
        if (h <= ROAD + 1e-3) return c.set('#33363e');
        if (isPark(x, z)) return c.set(Math.abs(z - 6.5) < 0.3 && x < -3.2 ? '#a99a80' : n(x * 0.9, z * 0.9) > 0.55 ? '#6aa956' : '#5c9a4b');
        const curb = isRoad(x + 0.5, z) || isRoad(x - 0.5, z) || isRoad(x, z + 0.5) || isRoad(x, z - 0.5);
        if (curb) return c.set('#cfc9bd');
        const chk = (Math.floor(x * 2) + Math.floor(z * 2)) & 1;
        if (isPlaza(x, z)) return c.set(chk ? '#b2a58f' : '#a4977e');
        return c.set(chk ? '#bdb8ad' : '#b3ada1');
      },
      side(x, z, y, h, outer, c) {
        if (!outer) return c.set('#c4beb2');
        const d = h - y;
        if (d < 0.13) return c.set(h <= ROAD + 1e-3 ? '#2b2e35' : isPark(x, z) ? '#4f8a40' : '#c4beb2');
        if (y > -0.45) return c.set('#6b6158');
        if (y > -1.3) return c.set(Math.floor(y / 0.6) % 2 ? '#7d5a40' : '#71523a');
        return c.set(Math.floor(y / 0.6) % 2 ? '#62646e' : '#585a64');
      },
    });
    root.add(T.mesh);

    // utility pipes in the cross-section on the right face
    for (const [z, y, r, col] of [[-5.5, -0.78, 0.22, '#3d6fa8'], [-4.6, -0.62, 0.12, '#3f8a5a'], [5.8, -0.85, 0.18, '#9a9da6']]) {
      const pipe = K.mesh(new THREE.CylinderGeometry(r, r, 0.12, 12), toon(col, { noise: 0.08 }));
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(HALF + 0.03, y, z);
      root.add(pipe);
      const hole = K.mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.13, 12), toon('#15171c', { noise: 0 }));
      hole.rotation.z = Math.PI / 2;
      hole.position.set(HALF + 0.04, y, z);
      root.add(hole);
    }

    // ---- wet road surfaces with markings (these reflect)
    {
      const P = [], C = [];
      const col = new THREE.Color();
      const q = 0.125, y = ROAD + 0.004;
      const color = (x, z) => {
        const onA = inA(x, z);
        if (onA && ((x > -1.9 && x < -1.1) || (x > 1.6 && x < 2.4)) && Math.floor(z * 4) % 2 === 0) return col.set('#e2dfd6');
        if (!onA && inB(x) && ((z > 0.1 && z < 0.9) || (z > 3.6 && z < 4.4)) && Math.floor(x * 4) % 2 === 0) return col.set('#e2dfd6');
        if (onA && z > 2.25 && x > -2.25 && x < -2.0) return col.set('#e2dfd6');
        if (onA && z < 2.25 && x > 2.5 && x < 2.75) return col.set('#e2dfd6');
        if (!onA && x < 0.25 && z > -0.25 && z < 0.0) return col.set('#e2dfd6');
        if (!onA && x > 0.25 && z > 4.5 && z < 4.75) return col.set('#e2dfd6');
        if (onA && (Math.abs(z - LANE.east) < 0.34 || Math.abs(z - LANE.west) < 0.34)) return col.set('#4a4b53');
        if (!onA && Math.abs(x - 0.25) < 0.07) return col.set('#d3a936');
        return col.set('#373a42');
      };
      const add = (x0, x1, z0, z1) => {
        for (let x = x0; x < x1 - 1e-6; x += q)
          for (let z = z0; z < z1 - 1e-6; z += q) {
            color(x + q / 2, z + q / 2);
            for (const [vx, vz] of [[x, z], [x, z + q], [x + q, z + q], [x, z], [x + q, z + q], [x + q, z]]) {
              P.push(vx, y, vz);
              C.push(col.r, col.g, col.b);
            }
          }
      };
      add(-HALF, HALF, A.z0, A.z1);
      add(B.x0, B.x1, -HALF, A.z0);
      add(B.x0, B.x1, A.z1, HALF);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
      g.computeVertexNormals();
      const road = K.mesh(g, toon('#ffffff', { vertexColors: true, noise: 0.18, noiseScale: 6, mirror: true, reflect: 0.04, reflectWet: 0.55, puddles: 0.75 }), { cast: false });
      root.add(road);
    }

    // rails
    {
      const parts = [];
      for (const lz of [LANE.east, LANE.west])
        for (const s of [-0.21, 0.21]) {
          const r = new THREE.BoxGeometry(SIZE, 0.03, 0.05);
          r.translate(0, ROAD + 0.02, lz + s);
          parts.push(K.paint(r, '#8d9098'));
        }
      root.add(K.mesh(K.merge(parts), toon('#ffffff', { vertexColors: true, noise: 0.05, snow: 0.3 }), { cast: false }));
    }

    // ---- buildings (shop windows glow, upper windows light up one by one)
    const lightsPos = [];
    const neonMats = [];
    const B1 = building({ w: 2.88, d: 2.88, h: 3.35, color: '#a2483a', trim: '#e7dcc6', floorH: 0.8, winW: 0.48, shop: { faces: ['+x', '+z'], height: 0.9, glow: '#ffd38a', awning: '#2f6e5b' }, rand });
    B1.place(-4.0, WALK, -2.05);
    const B2 = building({ w: 2.4, d: 2.88, h: 2.6, color: '#c08a3e', trim: '#f0e6d2', floorH: 0.8, winW: 0.48, shop: { faces: ['+z'], height: 0.9, glow: '#ffc27a', awning: '#7a2f3a' }, rand });
    B2.place(-6.7, WALK, -2.05);
    const B3 = building({ w: 5.28, d: 4.32, h: 4.4, color: '#a8988a', trim: '#e6dccd', floorH: 0.8, winW: 0.48, lit: 0.62, rand });
    B3.place(-5.31, WALK, -5.8);
    const B4 = building({ w: 2.4, d: 2.4, h: 2.65, color: '#3f5f7a', trim: '#e9e2d2', floorH: 0.8, winW: 0.48, shop: { faces: ['+z'], height: 0.9, glow: '#ffe3a8', awning: '#b8402f' }, rand });
    B4.place(4.3, WALK, -1.8);
    const B5 = building({ w: 2.4, d: 2.88, h: 3.25, color: '#b5653f', trim: '#efe3cf', floorH: 0.8, winW: 0.48, shop: { faces: ['+z'], height: 0.9, glow: '#ff9fd0', awning: '#2a2d3a' }, rand });
    B5.place(6.75, WALK, -2.05);
    const B6 = building({ w: 4.8, d: 4.32, h: 4.05, color: '#7a3f35', trim: '#d8c8b0', floorH: 0.8, winW: 0.48, lit: 0.66, rand });
    B6.place(5.55, WALK, -5.8);
    for (const b of [B1, B2, B3, B4, B5, B6]) {
      K.mergeGroup(b.group);
      root.add(b.group);
      for (const l of b.lights) lightsPos.push(l.clone().add(b.group.position));
    }
    {
      // rooftop billboard: an abstract violet poster, backlit at night
      const bb = new THREE.Group();
      const steel = toon('#2b2e36', { noise: 0.05 });
      for (const x of [-0.9, 0.9]) {
        const leg = K.mesh(new THREE.BoxGeometry(0.07, 0.7, 0.07), steel);
        leg.position.set(x, 0.35, 0);
        bb.add(leg);
      }
      const frame = K.mesh(new THREE.BoxGeometry(2.3, 1.05, 0.08), steel);
      frame.position.set(0, 1.15, -0.02);
      const art = K.mesh(new THREE.BoxGeometry(2.16, 0.92, 0.04), toon('#3a2470', { emissive: '#6e2bf0', emissiveIntensity: 1.6, noise: 0.05 }), { cast: false });
      art.position.set(0, 1.15, 0.03);
      const disc = K.mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 16), toon('#b08cff', { emissive: '#b08cff', emissiveIntensity: 2.6, noise: 0 }), { cast: false });
      disc.rotation.x = Math.PI / 2;
      disc.position.set(-0.45, 1.18, 0.06);
      const bar = K.mesh(new THREE.BoxGeometry(0.8, 0.09, 0.03), toon('#edeff2', { emissive: '#edeff2', emissiveIntensity: 2.2, noise: 0 }), { cast: false });
      bar.position.set(0.42, 1.28, 0.06);
      const bar2 = K.mesh(new THREE.BoxGeometry(0.55, 0.09, 0.03), toon('#edeff2', { emissive: '#edeff2', emissiveIntensity: 2.2, noise: 0 }), { cast: false });
      bar2.position.set(0.3, 1.08, 0.06);
      bb.add(frame, art, disc, bar, bar2);
      bb.position.set(-5.0, WALK + 4.4 + 0.2, -4.35);
      root.add(bb);
    }
    const tank = waterTank();
    tank.position.set(6.6, WALK + 4.05 + 0.2, -6.6);
    root.add(tank);
    root.add(fireEscape(3.6, 4.9, -3.64, WALK + 1.7, 3, 0.8));

    // neon over the shops
    const signDefs = [
      [B1, 1, 'star', '#c8ff4a'], [B1, 0, 'pizza', '#ffb02e'], [B2, 0, 'cup', '#3be8ff'], [B4, 0, 'pizza', '#ff6a3d'], [B5, 0, 'martini', '#ff3dbb'],
    ];
    for (const [b, i, shape, color] of signDefs) {
      const s = b.signs[i];
      if (!s) continue;
      const at = s.pos.clone().add(b.group.position);
      at.y += 0.42;
      if (s.face === '+z') at.z += 0.08;
      else at.x += 0.08;
      const sign = neonSign(shape, color, s.face, at);
      root.add(sign.group);
      neonMats.push(sign.mats);
    }

    // ---- point lights (8 max): shop glow spills onto the wet sidewalk
    const lights = [];
    for (const p of lightsPos.slice(0, 5)) lights.push(K.lampLight(root, p, { color: '#ffc98a', power: 2.5, distance: 3.8 }));

    // streetlights and trolley poles
    const poleM = toon('#2f4a3f', { noise: 0.05 });
    const lampHead = K.glass('#ffd9a0', 6, '#d6d2c6');
    const poleXs = [-6.6, -3.4, 4.6, 7.4];
    const wirePts = [];
    const poles = new THREE.Group();
    root.add(poles);
    for (const px of poleXs) {
      for (const [pz, dir] of [[0.62, 1], [3.88, -1]]) {
        const pole = K.mesh(new THREE.CylinderGeometry(0.045, 0.06, 2.75, 6), poleM);
        pole.position.set(px, WALK + 1.375, pz);
        poles.add(pole);
        // lamp arm out over the road
        const arm = K.mesh(new THREE.BoxGeometry(0.05, 0.05, 0.62), poleM);
        arm.position.set(px, WALK + 2.45, pz + dir * 0.31);
        const head = K.mesh(new THREE.BoxGeometry(0.2, 0.08, 0.14), lampHead, { cast: false });
        head.position.set(px, WALK + 2.4, pz + dir * 0.6);
        poles.add(arm, head);
      }
      // span wire between the poles, hangers down to both contact wires
      wirePts.push([px, WALK + 2.62, 0.62], [px, WALK + 2.55, 3.88]);
      for (const lz of [LANE.east, LANE.west]) wirePts.push([px, WALK + 2.58, lz], [px, WIRE_Y, lz]);
    }
    for (const lz of [LANE.east, LANE.west]) wirePts.push([-HALF, WIRE_Y, lz], [HALF, WIRE_Y, lz]);
    K.mergeGroup(poles);
    {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(wirePts.flat(), 3));
      const m = fxMaterial({
        vertexShader: 'void main() { gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'void main() { gl_FragColor = vec4(0.07, 0.08, 0.1, 0.9); gNormal = vec4(0.0); }',
      });
      const wires = new THREE.LineSegments(g, m);
      wires.frustumCulled = false;
      root.add(wires);
    }
    lights.push(K.lampLight(root, new THREE.Vector3(-3.4, WALK + 2.2, 1.25), { color: '#ffd59a', power: 5.5, distance: 6.5 }));
    lights.push(K.lampLight(root, new THREE.Vector3(4.6, WALK + 2.2, 3.25), { color: '#ffd59a', power: 5.5, distance: 6.5 }));

    // traffic signals: one facing each visible approach
    const sigA = signalHead('x');
    sigA.group.position.set(1.75, WALK, 0.72);
    const sigB = signalHead('z');
    sigB.group.position.set(1.75, WALK, 3.78);
    root.add(sigA.group, sigB.group);
    const CYCLE = 16;
    const lightState = (t, road) => {
      const c = ((((t / CYCLE) + (road === 'B' ? 0.5 : 0)) % 1) + 1) % 1;
      return c < 0.42 ? 2 : c < 0.5 ? 1 : 0; // 2 green, 1 amber, 0 red
    };

    // stop pole, shelter, small things
    const stopPole = K.mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 5), toon('#c9ccd3'));
    stopPole.position.set(4.6, WALK + 0.65, 0.35);
    const stopFlag = K.mesh(new THREE.BoxGeometry(0.04, 0.28, 0.22), toon('#d23a32', { noise: 0.04 }));
    stopFlag.position.set(4.62, WALK + 1.18, 0.35);
    root.add(stopPole, stopFlag);
    const sh = K.mergeGroup(shelter());
    sh.position.set(5.9, WALK, 0.0);
    root.add(sh);
    const h1 = hydrant();
    h1.position.set(-2.75, WALK, 0.75);
    const h2 = hydrant('#e0b33a');
    h2.position.set(2.75, WALK, 4.7);
    const bn1 = bin();
    bn1.position.set(-1.45, WALK, -0.25);
    const bn2 = bin('#2f4f7a');
    bn2.position.set(2.15, WALK, 4.05);
    root.add(h1, h2, bn1, bn2);
    for (const [x, z, c] of [[-1.75, -0.3, '#c43a32'], [-1.45, 4.75, '#2f6fb3'], [2.3, -0.3, '#e0b33a']]) {
      const box = K.mesh(K.paint(new THREE.BoxGeometry(0.18, 0.32, 0.16), c), toon('#ffffff', { vertexColors: true, noise: 0.06 }));
      box.position.set(x, WALK + 0.16, z);
      root.add(box);
    }

    // parkette: trees, bench, fence, flowers; plaza: food cart and a big tree
    const treeGeo = [0, 1, 2].map(() => K.bushGeometry(rand, { r: 0.62, blobs: 4, h: 0.95, leaf: '#4f8a43' }));
    const treeMat = toon('#ffffff', { vertexColors: true, ramp: 'foliage', wind: 0.05, noise: 0.18, noiseScale: 4 });
    for (const [x, z, s] of [[-6.6, 6.4, 1.1], [-4.4, 7.2, 0.95], [-7.3, 7.5, 0.8], [6.9, 7.0, 1.15], [-6.9, 0.25, 0.75], [7.3, 4.4, 0.7]]) {
      const t = K.mesh(treeGeo[Math.floor(rand() * 3)], treeMat);
      t.position.set(x, T.heightAt(x, z), z);
      t.scale.setScalar(s);
      t.rotation.y = rand() * 6;
      root.add(t);
    }
    const parkBench = bench();
    parkBench.position.set(-5.4, GRASS, 5.55);
    root.add(parkBench);
    root.add(K.fence([[-7.8, 5.15], [-2.7, 5.15]], () => GRASS, { color: '#2b2f37', spacing: 0.5 }));
    root.add(K.flowers(rand, 60, (r) => {
      const x = -7.6 + r() * 4.6, z = 5.4 + r() * 2.4;
      if (Math.abs(z - 6.5) < 0.4) return null;
      return [x, GRASS, z];
    }, ['#ff8fb1', '#ffd85c', '#f4f1ea', '#b58cff']));
    const lp = K.lampPost({ h: 1.3 });
    lp.group.position.set(-3.1, GRASS, 6.1);
    root.add(lp.group);
    const cart = K.mergeGroup(hotDogCart());
    cart.position.set(4.6, WALK, 6.1);
    cart.rotation.y = -0.4;
    root.add(cart);

    // steam from a manhole and a grate
    root.add(K.smoke(new THREE.Vector3(-4.6, ROAD, 2.25), { count: 40, color: '#e9edf3' }));
    root.add(K.smoke(new THREE.Vector3(3.6, WALK, 4.6), { count: 26, color: '#e2e6ec' }));
    for (const [x, z] of [[-4.6, 2.25]]) {
      const lid = K.mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.02, 10), toon('#24262c', { noise: 0.2, noiseScale: 9 }), { cast: false });
      lid.position.set(x, ROAD + 0.012, z);
      root.add(lid);
    }

    // ---- people
    const people = [];
    const walkers = [];
    const addWalker = (pts, opts, look) => {
      const p = person(rand, look);
      root.add(p);
      people.push(p);
      walkers.push(walker(p, pts, { y: WALK, mode: 'pingpong', ...opts }));
      return p;
    };
    addWalker([[-7.6, 0.1], [-2.8, 0.1]], { speed: 0.42, offset: 3 }, { umbrella: '#e8473c' });
    addWalker([[3.3, 0.55], [7.7, 0.55]], { speed: 0.36, offset: 11 }, { umbrella: '#2f2f38', coat: '#c9a227' });
    addWalker([[-7.7, 4.35], [-1.3, 4.35]], { speed: 0.5, offset: 5 }, { umbrella: '#f2c14e' });
    addWalker([[2.35, -7.6], [2.35, 0.3]], { speed: 0.4, offset: 2 }, { umbrella: '#3a7bd5' });
    addWalker([[-1.8, -7.6], [-1.8, 0.2]], { speed: 0.46, offset: 9 }, { umbrella: '#b04ad0', coat: '#2f4a7a' });
    addWalker([[1.9, 4.3], [7.6, 4.3]], { speed: 0.38, offset: 1 }, { umbrella: '#3f9a6a' });
    const standing = [];
    for (const [x, z, ry, look] of [[4.05, 0.55, -Math.PI / 2, { umbrella: '#ff7a3d' }], [5.15, 0.25, -Math.PI / 2, { umbrella: '#e8e2d4', coat: '#3f6e4f' }], [4.0, 6.6, 0.9, { coat: '#f2f0ea' }], [5.1, 6.3, Math.PI * 0.9, { umbrella: '#2f6fb3' }]]) {
      const p = person(rand, look);
      p.position.set(x, WALK, z);
      p.rotation.y = ry;
      root.add(p);
      people.push(p);
      standing.push(p);
    }
    // umbrellas only open in the rain
    const umbrellaParts = people.map((p) => p.children.filter((c) => c.geometry && (c.geometry.type === 'ConeGeometry' || c.geometry.type === 'CylinderGeometry') && c.position.y > 0.55));

    // ---- streetcars
    const sparks = sparkSystem();
    root.add(sparks.points);
    const vehicles = [];
    const makeVehicle = (obj, { axis, dir, lane, len, cruise, kind = 'car', road, stop }) => {
      K.mergeGroup(obj);
      clipTo(obj, blockClip);
      root.add(obj);
      const v = { obj, axis, dir, lane, len, cruise, kind, road, stop, s: 0, speed: 0, active: false, wait: 0, dwell: 0, served: false, timer: 0 };
      obj.visible = false;
      vehicles.push(v);
      return v;
    };
    const spawn = (v) => {
      v.active = true;
      v.obj.visible = true;
      v.s = -v.dir * (HALF + 0.3);
      v.speed = v.cruise;
      v.served = false;
      v.dwell = 0;
    };
    const tram1 = streetcar();
    const tramW = makeVehicle(tram1.group, { axis: 'x', dir: -1, lane: LANE.west, len: tram1.length, cruise: 1.35, kind: 'tram', road: 'A', stop: 2.75 });
    tramW.contact = tram1.contact;
    const tram2 = streetcar();
    const tramE = makeVehicle(tram2.group, { axis: 'x', dir: 1, lane: LANE.east, len: tram2.length, cruise: 1.35, kind: 'tram', road: 'A', stop: -2.25 });
    tramE.contact = tram2.contact;
    const carDefs = [
      [{ color: '#f2c14e', kind: 'taxi' }, { axis: 'z', dir: 1, lane: LANE.south, road: 'B', stop: -0.25 }],
      [{ color: '#3f6fb0' }, { axis: 'z', dir: -1, lane: LANE.north, road: 'B', stop: 4.75 }],
      [{ color: '#d8d2c4', kind: 'van' }, { axis: 'z', dir: 1, lane: LANE.south, road: 'B', stop: -0.25 }],
      [{ color: '#8c2f39' }, { axis: 'x', dir: 1, lane: LANE.east, road: 'A', stop: -2.25 }],
      [{ color: '#2a2e3a' }, { axis: 'x', dir: -1, lane: LANE.west, road: 'A', stop: 2.75 }],
    ];
    const cars = carDefs.map(([look, o]) => makeVehicle(car(look), { ...o, len: look.kind === 'van' ? 1.0 : 0.92, cruise: 1.9 + rand() * 0.5 }));
    cars.forEach((c, i) => (c.timer = 1 + i * 3.1));
    tramW.timer = 0.5;
    tramE.timer = 14;

    const place = (v) => {
      const centre = v.s - (v.dir * v.len) / 2;
      if (v.axis === 'x') v.obj.position.set(centre, ROAD, v.lane);
      else v.obj.position.set(v.lane, ROAD, centre);
      v.obj.rotation.y = v.axis === 'x' ? (v.dir > 0 ? 0 : Math.PI) : v.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    };
    const stepVehicle = (v, dt, t) => {
      if (!v.active) {
        v.timer -= dt;
        if (v.timer <= 0) {
          // only enter when the lane mouth is clear
          const clear = vehicles.every((o) => o === v || !o.active || o.lane !== v.lane || o.axis !== v.axis || Math.abs(o.s - o.dir * o.len - -v.dir * HALF) > 1.5);
          if (clear) spawn(v);
          else v.timer = 0.5;
        }
        return;
      }
      const toStop = (v.stop - v.s) * v.dir;
      let target = v.cruise;
      const st = lightState(t, v.road);
      if (toStop > -0.05 && toStop < 2.2 && st !== 2 && !(st === 1 && toStop < 0.4)) target = toStop < 0.15 ? 0 : Math.min(target, toStop * 1.2);
      if (v.kind === 'tram' && !v.served && toStop > -0.05 && toStop < 2.2) {
        target = Math.min(target, Math.max(0, toStop) * 1.2);
        if (toStop < 0.15) {
          v.dwell += dt;
          target = 0;
          if (v.dwell > 3.2) {
            v.served = true;
            audio.play('bell');
          }
        }
      }
      // keep a gap to whatever is ahead in the lane
      for (const o of vehicles) {
        if (o === v || !o.active || o.lane !== v.lane || o.axis !== v.axis || o.dir !== v.dir) continue;
        const gap = (o.s - o.dir * o.len - v.s) * v.dir;
        if (gap > 0 && gap < 1.6) target = Math.min(target, Math.max(0, (gap - 0.4) * 1.5));
      }
      v.speed += (target - v.speed) * (1 - Math.exp(-dt * (target < v.speed ? 3.5 : 1.2)));
      v.s += v.speed * dt * v.dir;
      place(v);
      if ((v.s - v.dir * v.len) * v.dir > HALF + 0.3) {
        v.active = false;
        v.obj.visible = false;
        v.timer = v.kind === 'tram' ? 16 + rand() * 8 : 2 + rand() * 6;
      }
    };

    // ---- subway station under the street, seen through the cutaway
    const tunnel = new THREE.Group();
    root.add(tunnel);
    {
      const span = TUN.x1 - TUN.x0, depth = HALF - TUN.z0, midX = (TUN.x0 + TUN.x1) / 2;
      // back wall: tile, a coloured band, a dark dado
      // the station is lit from inside, so it reads at any time of day
      const selfLit = (c, k = 0.55, o = {}) => toon(c, { emissive: c, emissiveIntensity: k, noise: 0.22, noiseScale: 9, snow: 0, wet: 0, ...o });
      const band = (y0, y1, c, k) => {
        const b = K.mesh(new THREE.BoxGeometry(span, y1 - y0, 0.06), selfLit(c, k), { cast: false });
        b.position.set(midX, (y0 + y1) / 2, TUN.z0);
        tunnel.add(b);
      };
      // the cut only shows the lower wall, so the colour band sits low
      band(TUN.y0, TUN.y0 + 0.16, '#4a4f5a', 0.35);
      band(TUN.y0 + 0.16, TUN.y0 + 0.3, '#2f9a93', 0.65);
      band(TUN.y0 + 0.3, TUN.y1, '#e9e1cf', 0.55);
      const floor = K.mesh(new THREE.BoxGeometry(span, 0.06, depth), selfLit('#34373e', 0.25), { cast: false });
      floor.position.set(midX, TUN.y0 - 0.03, TUN.z0 + depth / 2);
      tunnel.add(floor);
      for (const x of [TUN.x0, TUN.x1]) {
        const end = K.mesh(new THREE.BoxGeometry(0.06, TUN.y1 - TUN.y0, depth), toon('#0c0d10', { noise: 0, snow: 0 }), { cast: false });
        end.position.set(x, (TUN.y0 + TUN.y1) / 2, TUN.z0 + depth / 2);
        tunnel.add(end);
      }
      // platform with a yellow edge
      const platW = HALF - TUN.plat;
      const platform = K.mesh(new THREE.BoxGeometry(span, 0.4, platW), selfLit('#9a958c', 0.45), { cast: false });
      platform.position.set(midX, TUN.y0 + 0.2, TUN.plat + platW / 2);
      const edge = K.mesh(new THREE.BoxGeometry(span, 0.02, 0.09), selfLit('#e8c13a', 0.8), { cast: false });
      edge.position.set(midX, TUN.y0 + 0.41, TUN.plat + 0.05);
      tunnel.add(platform, edge);
      // rails and sleepers
      const tp = [];
      for (const s of [-0.22, 0.22]) {
        const r = new THREE.BoxGeometry(span, 0.03, 0.04);
        r.translate(midX, TUN.y0 + 0.06, TUN.track + s);
        tp.push(K.paint(r, '#9a9da5'));
      }
      for (let x = TUN.x0 + 0.1; x < TUN.x1; x += 0.25) {
        const sl = new THREE.BoxGeometry(0.08, 0.03, 0.62);
        sl.translate(x, TUN.y0 + 0.02, TUN.track);
        tp.push(K.paint(sl, '#4a3a2e'));
      }
      tunnel.add(K.mesh(K.merge(tp), toon('#ffffff', { vertexColors: true, noise: 0.05, snow: 0, wet: 0 }), { cast: false }));
      // pilasters and ceiling lights
      const lampM = toon('#dfe8ff', { emissive: '#eef4ff', emissiveIntensity: 4.5, noise: 0, snow: 0 });
      for (let x = -6; x <= 6.01; x += 2) {
        const pil = K.mesh(new THREE.BoxGeometry(0.2, TUN.y1 - TUN.y0, 0.08), selfLit('#d7cdb9', 0.45), { cast: false });
        pil.position.set(x, (TUN.y0 + TUN.y1) / 2, TUN.z0 + 0.04);
        const lamp = K.mesh(new THREE.BoxGeometry(0.42, 0.05, 0.06), lampM, { cast: false });
        lamp.position.set(x + 1, TUN.y0 + 0.62, TUN.z0 + 0.06);
        tunnel.add(pil, lamp);
      }
      for (const [x, look, pose] of [[-3.0, { coat: '#6b4a8a' }, 'sit'], [-1.2, { coat: '#c94a3d' }, 'stand'], [0.9, { coat: '#3f6e4f' }, 'stand'], [2.6, { coat: '#e2b33c' }, 'stand'], [4.9, { coat: '#2f4a7a' }, 'stand']]) {
        const p = person(rand, { ...look, pose });
        p.position.set(x, TUN.y0 + 0.4, TUN.plat + 0.42);
        p.rotation.y = Math.PI / 2;
        tunnel.add(p);
      }
      const b1 = bench('#5a5f6a');
      b1.rotation.y = Math.PI;
      b1.position.set(-3.0, TUN.y0 + 0.4, TUN.plat + 0.48);
      tunnel.add(b1);
    }
    K.mergeGroup(tunnel);
    lights.push(K.lampLight(root, new THREE.Vector3(0, TUN.y0 + 1.0, TUN.plat), { color: '#dfe8ff', power: 2.2, distance: 6 }));
    lights[lights.length - 1].userData.always = true;
    const train = subwayTrain(4);
    K.mergeGroup(train.group);
    clipTo(train.group, tunnelClip);
    root.add(train.group);
    const metro = { s: TUN.x0 - 1, speed: 0, active: false, timer: 6, dwell: 0, served: false };
    const sendTrain = () => {
      if (metro.active) return;
      metro.active = true;
      metro.s = TUN.x0 - 0.2;
      metro.speed = 2.6;
      metro.dwell = 0;
      metro.served = false;
      train.group.visible = true;
      audio.play('rumble', { dur: 6, gain: 0.8 });
    };
    train.group.visible = false;

    // ---- neon state
    let neonOn = true;
    let neonBoot = 0;

    const info = {
      size: SIZE, top: 4.8, bottom: BASE,
      surfaceAt: (x, z) => T.heightAt(x, z),
      isLand: (x, z) => isPark(x, z),
      weather: { top: 10, bottom: ROAD, snowScale: 1.0, splash: true },
    };
    let sparkTimer = 2;

    return {
      root,
      info,
      actions: [
        {
          id: 'streetcar', label: 'Streetcar', icon: ICONS.streetcar,
          run: () => {
            const v = !tramW.active ? tramW : !tramE.active ? tramE : null;
            if (v) { v.timer = 0; audio.play('bell'); }
          },
          active: () => tramW.active || tramE.active,
        },
        { id: 'subway', label: 'Subway', icon: ICONS.subway, run: sendTrain, active: () => metro.active },
        {
          id: 'neon', label: 'Neon', icon: ICONS.neon,
          run: () => { neonOn = !neonOn; if (neonOn) neonBoot = 1.4; },
          active: () => neonOn,
        },
      ],
      update(t, dt, env) {
        const rainy = env.cur.rain > 0.2;
        umbrellaParts.forEach((parts, i) => {
          parts.forEach((m) => (m.visible = rainy));
          const p = people[i];
          if (p.userData.umbrella !== undefined && parts.length) {
            p.userData.umbrella = rainy;
            if (!rainy) p.userData.parts.armR.rotation.z = 0;
            else p.userData.parts.armR.rotation.z = 1.1;
          }
        });
        for (const w of walkers) w.update(t);
        K.updateLamps(lights.filter((l) => !l.userData.always), env);
        for (const l of lights) if (l.userData.always) l.intensity = l.userData.power;

        // signals and traffic
        sigA.set(lightState(t, 'A'));
        sigB.set(lightState(t, 'B'));
        for (const v of vehicles) stepVehicle(v, dt, t);

        // pantograph sparks, more in the wet
        sparkTimer -= dt;
        if (sparkTimer <= 0) {
          const live = [tramW, tramE].filter((v) => v.active && v.speed > 0.3 && Math.abs(v.obj.position.x) < HALF - 0.5);
          if (live.length) {
            const v = live[Math.floor(Math.random() * live.length)];
            const at = v.contact.clone().applyMatrix4(v.obj.matrixWorld);
            sparks.burst(at);
            audio.play('spark');
          }
          sparkTimer = (rainy ? 0.6 : 1.6) + Math.random() * (rainy ? 1.6 : 3.5);
        }
        sparks.update(dt);

        // subway: arrives, waits at the platform, leaves
        if (!metro.active) {
          metro.timer -= dt;
          if (metro.timer <= 0) { sendTrain(); metro.timer = 26 + Math.random() * 10; }
        } else {
          const stopAt = train.length / 2 + 0.2;
          const toStop = stopAt - metro.s;
          let target = 2.6;
          if (!metro.served) {
            target = Math.min(target, Math.max(0, toStop) * 1.1);
            if (toStop < 0.05) { metro.dwell += dt; if (metro.dwell > 3.5) { metro.served = true; audio.play('rumble', { dur: 5, gain: 0.7 }); } }
          }
          metro.speed += (target - metro.speed) * (1 - Math.exp(-dt * (target < metro.speed ? 2.5 : 0.8)));
          metro.s += metro.speed * dt;
          train.group.position.set(metro.s - train.length / 2, TUN.y0 + 0.03, TUN.track);
          if (metro.s - train.length > TUN.x1 + 0.2) { metro.active = false; train.group.visible = false; }
        }

        // neon: on with the lamps, a stutter now and then, a boot-up flicker when switched on
        neonBoot = Math.max(0, neonBoot - dt);
        neonMats.forEach((mats, i) => {
          let v = neonOn ? 1 : 0;
          if (neonOn) v = neonBoot > 0 ? (Math.sin(t * 40 + i * 3) > 0.2 - neonBoot * 0.4 ? 1 : 0.1) : neonFlicker(mats[0], t, i * 1.7, 0.6);
          for (const m of mats) setGlow(m, v);
        });

        audio.setLoop('traffic', 0.55);
        audio.setLoop('hum', 0.25 + env.night * 0.3);
        audio.setLoop('buzz', neonOn ? env.lamps * 0.35 : 0);
      },
    };
  },
};
