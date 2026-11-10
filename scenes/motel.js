import * as THREE from 'three';
import * as K from './kit.js';
import * as M from './motel-parts.js';
import { toon, setGlow } from '../engine/materials.js';
import { car as cityCar } from './kit-city.js';

// Motel: a roadside desert motel on a floating block of sand and red rock. An L of rooms around a
// glowing pool, a tall neon sign by a two-lane highway, a striped mesa and a spire behind, a windmill
// pump, saguaros and tumbleweeds. Actions: Neon (the sign buzzes on, stutter by stutter) and Truck
// (a big rig rolls through with its lights, horn and dust).

const SIZE = 16, HALF = 8, CELLS = 48, STEP = 0.3, BASE = -2.4;
const G = 0.3, Y0 = 0.32;                       // ground, and the wet-able surfaces (road, drive, pool)
const ROAD = [5.7, 7.6];
const LANES = [{ x: 6.175, dir: 1 }, { x: 7.125, dir: -1 }];
const WALL_H = 1.12, DEPTH = 1.5, CANOPY = 0.55;
const XA = -1.6, ZB = -3.9, A_ROOMS = 7, B_ROOMS = 6;
const ZA_END = ZB + A_ROOMS, XB_END = XA + B_ROOMS;
const OFFICE = { x: -2.3, z: 4.1, w: 2.0, d: 1.9, h: 1.5 };
const SIGN = [5.05, 0.1];
const POOL = { x0: 4 / 3, x1: 11 / 3, z0: -4 / 3, z1: 2 / 3 };     // on the terrain grid (cells of 1/3)
const DECK = { x0: 0.8, x1: 4.35, z0: -2.0, z1: 1.5 };
const DRIVE = [
  { x0: -1.05, x1: ROAD[0], z0: -3.35, z1: -2.0 },
  { x0: -1.05, x1: 0.8, z0: -2.0, z1: 5.1 },
  { x0: 0.8, x1: ROAD[0], z0: 2.2, z1: 3.5 },
];
const MILL = [-6.3, 4.5];
const TANK = [-5.35, 5.25];
const SPIRE = [-6.9, 1.75];
const WIND = [1, 0.18];
const TW_LANE = [6.35, 7.35];
const FIRE = [1.4, 5.8];                   // tumbleweed corridor (z), kept clear of props

const BANDS = [-2.05, -1.72, -1.42, -1.12, -0.85, -0.52, -0.22, 0.04, 0.62, 0.92, 1.22, 1.52, 1.8, 2.1, 2.38, 2.66, 2.96, 3.24, 3.48];
const BAND_COLORS = ['#4a2932', '#5c2f35', '#7b3b32', '#96462f', '#c27a4b', '#a9512f', '#c0663a', '#d98d55', '#dfa26a', '#c8743f', '#b45935', '#e0a067', '#bb5a34', '#a04630', '#c96f42', '#e3a86d', '#b6553a', '#c46a40', '#d99a62', '#8e3b2b'];
const bandAt = (y) => {
  let i = 0;
  while (i < BANDS.length && y > BANDS[i]) i++;
  return i;
};

const inRect = (x, z, r, pad = 0) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad;
const onDrive = (x, z, pad = 0) => DRIVE.some((r) => inRect(x, z, r, pad));
const ICON_NEON = ['.........', '.########', '.########', '.###.....', '.###.....', '#####....', '.###.....', '..#......', '.........'];
const ICON_TRUCK = ['.........', '#####....', '#####.##.', '#####.#.#', '#####.###', '#########', '.##...##.', '.##...##.', '.........'];
const gauss = (x, c, w) => Math.exp(-((x - c) ** 2) / (2 * w * w));

export default {
  name: 'Motel',
  view: { target: [-0.55, 0.15, -0.55], size: 17.2, azimuth: 45, elevation: 30 },
  look: { levels: 13, dither: 0.6, outline: 0.55, highlight: 0.32, bloom: 1.2, bloomThreshold: 2.3, exposure: 1.05, contrast: 1.08, saturation: 1.2, vignette: 0.28 },
  env: { hour: 19.6, weather: 'clear' },
  audio: { water: 0, birds: 0.35, crickets: 1, foghorn: 0 },
  mirror: { y: Y0 },
  sky: { moon: 1, milky: 1, moonPos: [0.86, 0.82] },
  wind: WIND,
  actionsLabel: 'Motel',

  create({ audio }) {
    const root = new THREE.Group();
    const rand = K.rng(1957);
    const n1 = K.noise2(7), n2 = K.noise2(19), n3 = K.noise2(31);
    const clipPlanes = [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), HALF),
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), HALF),
      new THREE.Plane(new THREE.Vector3(0, 0, 1), HALF),
      new THREE.Plane(new THREE.Vector3(0, 0, -1), HALF),
    ];
    const clip = (obj) => obj.traverse((o) => {
      if (!o.material || o.material.isShaderMaterial) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        m.clippingPlanes = clipPlanes;
        m.clipShadows = true;
      }
    });

    // ------------------------------------------------------------ terrain
    const inRoad = (x) => x > ROAD[0] - 0.05 && x < ROAD[1] + 0.05;
    // the massif: a few overlapping buttes of different heights with wobbly, eroded outlines
    const BUTTES = [
      { c: [-6.5, -5.4], r: [1.75, 2.5], h: 3.6, k: 0 },
      { c: [-5.1, -2.85], r: [1.35, 1.45], h: 3.0, k: 1 },
      { c: [-7.0, -1.25], r: [1.05, 1.45], h: 2.4, k: 2 },
    ];
    const butteDist = (x, z, B) => {
      const dx = (x - B.c[0]) / B.r[0], dz = (z - B.c[1]) / B.r[1];
      const a = Math.atan2(dz, dx);
      const wob = (n1(Math.cos(a) * 1.2 + B.k * 5, Math.sin(a) * 1.2 + B.k * 3) - 0.5) * 0.55;
      return (1 + wob - Math.pow(Math.abs(dx) ** 3.5 + Math.abs(dz) ** 3.5, 1 / 3.5)) * Math.min(B.r[0], B.r[1]);
    };
    const flat = (x, z) => x > -3.5 && z > -6.2;
    const height = (x, z) => {
      if (inRect(x, z, POOL)) return G - 0.9;
      if (flat(x, z)) return G;
      if (z > TW_LANE[0] - 0.3 && z < TW_LANE[1] + 0.3) return G;
      if (Math.hypot(x - MILL[0], z - MILL[1]) < 1.0 || Math.hypot(x - TANK[0], z - TANK[1]) < 0.9) return G;
      let h = G;
      if (x < -3.5 && z > -0.8 && n3(x * 0.5 + 9, z * 0.5 + 2) > 0.6) h += 0.3;
      for (const B of BUTTES) {
        const d = butteDist(x, z, B);
        if (d > 0) h = Math.max(h, B.h);
        else if (d > -0.42) h = Math.max(h, 1.2);
        else if (d > -0.85) h = Math.max(h, 0.9);
        else if (d > -1.3) h = Math.max(h, 0.6);
      }
      const sd = Math.hypot(x - SPIRE[0], z - SPIRE[1]) + (n2(x * 3, z * 3) - 0.5) * 0.2;
      if (sd < 0.42) h = Math.max(h, 2.4);
      else if (sd < 0.8) h = Math.max(h, 1.2);
      else if (sd < 1.15) h = Math.max(h, 0.6);
      return h;
    };
    const SAND = ['#e2b07a', '#dba56e', '#e8bd88', '#d6996a'];
    const T = M.strataTerrain({
      size: SIZE, cells: CELLS, step: STEP, base: BASE, height, bands: BANDS,
      top(x, z, h, c) {
        if (inRect(x, z, POOL)) return c.set('#5bc7cf');
        const t = n1(x * 1.1 + 3, z * 1.1);
        if (h >= 3.2) return c.set(t > 0.62 ? '#b8664a' : t < 0.35 ? '#93452f' : '#a5553b');
        if (h >= 2.6) return c.set(t > 0.55 ? '#a85a3e' : '#9a4a33');
        if (h >= 1.1) return c.set(t > 0.55 ? '#c47b52' : '#b4683f');
        if (h > G + 0.35) return c.set(t > 0.5 ? '#cf8c5a' : '#c27f50');
        if (h > G + 0.05) return c.set(t > 0.5 ? '#ddb07a' : '#d6a46f');
        if (inRoad(x)) return c.set('#6a5a4e');
        const u = n2(x * 0.7, z * 0.7 + 4);
        if (flat(x, z) && x < ROAD[0] && z > -5.8 && z < 6.0) return c.set(t > 0.6 ? '#dcbc94' : t < 0.38 ? '#cfae86' : '#d6b68e');
        return c.set(u > 0.68 ? SAND[3] : t > 0.62 ? SAND[2] : t < 0.36 ? SAND[1] : SAND[0]);
      },
      side(x, z, y, h, outer, c, face) {
        if (!outer && inRect(x, z, POOL, 0.4) && y < G) return c.set(y > G - 0.25 ? '#eaf6f2' : '#62c8d0');
        if (outer && inRoad(x) && (face === '+z' || face === '-z') && y > G - 0.36) return c.set(y > G - 0.09 ? '#38363c' : '#8a7c6c');
        if (!outer && h <= G + 0.31) return c.set(h - y < 0.09 ? '#e0b07a' : '#cf9762');
        if (h - y < 0.09) return c.set(h >= 2.6 ? '#9b4a34' : h >= 1.1 ? '#b8703f' : '#d9a46c');
        c.set(BAND_COLORS[bandAt(y)]);
        const k = n3(x * 2.3 + y * 5.1, z * 2.3) - 0.5;
        return c.offsetHSL(0, 0, k * 0.035);
      },
    });
    root.add(T.mesh);
    const ground = T.heightAt;

    // ------------------------------------------------------------ road, drive, pool deck
    const rects = [];
    rects.push([ROAD[0], ROAD[1], -HALF, HALF, '#37353b']);
    rects.push([ROAD[0] + 0.06, ROAD[0] + 0.14, -HALF, HALF, '#e8e1d2', 0.003]);
    rects.push([ROAD[1] - 0.14, ROAD[1] - 0.06, -HALF, HALF, '#e8e1d2', 0.003]);
    for (let z = -HALF + 0.15; z < HALF; z += 1.2) rects.push([6.61, 6.69, z, Math.min(HALF, z + 0.6), '#efc75a', 0.003]);
    const DRV = '#4f4849';
    const drv = [];
    for (const r of DRIVE) drv.push([r.x0, r.x1, r.z0, r.z1, DRV]);
    for (let k = 0; k < 6; k++) {
      const z = DECK.z0 + 0.04 + k * 1.15;
      drv.push([-0.98, 0.3, z, z + 0.08, '#ddd6c8', 0.003]);
    }
    const roadMat = toon('#ffffff', { vertexColors: true, mirror: true, reflect: 0, reflectWet: 0.7, puddles: 0.3, noise: 0.14, noiseScale: 7, snow: 0 });
    root.add(K.mesh(M.flatRects(rects, Y0), roadMat, { cast: false }));
    const driveMat = toon('#ffffff', { vertexColors: true, mirror: true, reflect: 0, reflectWet: 0.6, puddles: 0.55, noise: 0.14, noiseScale: 7, snow: 1 });
    root.add(K.mesh(M.flatRects(drv, Y0), driveMat, { cast: false }));

    const deck = [];
    const DY = G + 0.025;
    const slab = (x0, x1, z0, z1, hh, c, y = DY) => deck.push(M.box(x1 - x0, hh, z1 - z0, (x0 + x1) / 2, y, (z0 + z1) / 2, c));
    slab(DECK.x0, DECK.x1, DECK.z0, POOL.z0, 0.05, '#e6dccb');
    slab(DECK.x0, DECK.x1, POOL.z1, DECK.z1, 0.05, '#e6dccb');
    slab(DECK.x0, POOL.x0, POOL.z0, POOL.z1, 0.05, '#e6dccb');
    slab(POOL.x1, DECK.x1, POOL.z0, POOL.z1, 0.05, '#e6dccb');
    const CY = G + 0.07;
    slab(POOL.x0 - 0.1, POOL.x1 + 0.1, POOL.z0 - 0.1, POOL.z0, 0.04, '#f6f2e8', CY);
    slab(POOL.x0 - 0.1, POOL.x1 + 0.1, POOL.z1, POOL.z1 + 0.1, 0.04, '#f6f2e8', CY);
    slab(POOL.x0 - 0.1, POOL.x0, POOL.z0, POOL.z1, 0.04, '#f6f2e8', CY);
    slab(POOL.x1, POOL.x1 + 0.1, POOL.z0, POOL.z1, 0.04, '#f6f2e8', CY);
    // low deck wall with a gap toward the rooms
    const WALL = '#efe3cc';
    slab(DECK.x0, DECK.x1, DECK.z1 - 0.08, DECK.z1, 0.22, WALL, G + 0.11);
    slab(DECK.x1 - 0.08, DECK.x1, DECK.z0, DECK.z1, 0.22, WALL, G + 0.11);
    slab(DECK.x0, DECK.x0 + 0.08, DECK.z0, -0.9, 0.22, WALL, G + 0.11);
    // diving board, ladder, loungers, a table
    deck.push(M.box(0.16, 0.12, 0.2, POOL.x1 + 0.3, G + 0.1, -0.33, '#c8c2b6'));
    deck.push(M.box(0.72, 0.04, 0.18, POOL.x1 - 0.04, G + 0.18, -0.33, '#f4f1ea'));
    deck.push(M.box(0.07, 0.32, 0.07, POOL.x0 + 0.35, G + 0.2, POOL.z0 - 0.04, '#d9dde2'));
    deck.push(M.box(0.07, 0.32, 0.07, POOL.x0 + 0.55, G + 0.2, POOL.z0 - 0.04, '#d9dde2'));
    for (const x of [1.55, 2.25, 2.95]) {
      deck.push(M.box(0.24, 0.05, 0.48, x, G + 0.13, 1.08, '#f6f1e6'));
      deck.push(M.box(0.24, 0.05, 0.22, x, G + 0.21, 0.8, ['#f08a6c', '#3fb5a8', '#e9b04a'][Math.round((x - 1.55) / 0.7)], [0.55, 0, 0]));
    }
    deck.push(M.cyl(0.2, 0.2, 0.04, 3.85, G + 0.32, -1.45, '#f6f1e6', 10));
    deck.push(M.cyl(0.04, 0.04, 0.28, 3.85, G + 0.18, -1.45, '#c9c2b4', 6));
    root.add(M.solid(deck, { noise: 0.08, noiseScale: 6 }));
    // parasol over the table
    {
      const P = [M.cyl(0.03, 0.03, 0.95, 3.85, G + 0.5, -1.45, '#e8e4dc', 6)];
      const cone = new THREE.ConeGeometry(0.6, 0.22, 8, 1).toNonIndexed();
      const pos = cone.attributes.position;
      const cols = new Float32Array(pos.count * 3);
      const ca = new THREE.Color('#ef6a50'), cb = new THREE.Color('#f6efe0');
      for (let i = 0; i < pos.count; i += 3) {
        const a = Math.atan2(pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2), pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2));
        const cc = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 8 + 0.5) % 2 ? ca : cb;
        for (let k = 0; k < 3; k++) cols.set([cc.r, cc.g, cc.b], (i + k) * 3);
      }
      cone.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      cone.translate(3.85, G + 1.02, -1.45);
      P.push(cone);
      root.add(M.solid(P, { noise: 0.05 }, { facet: true }));
    }
    // pool water
    {
      const xs = [POOL.x0, POOL.x0 + 0.16, POOL.x1 - 0.16, POOL.x1], zs = [POOL.z0, POOL.z0 + 0.16, POOL.z1 - 0.16, POOL.z1];
      const P = [], D = [], I = [];
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        P.push(xs[i], Y0, zs[j]);
        D.push(i > 0 && i < 3 && j > 0 && j < 3 ? 0.95 : 0.04);
      }
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const a = i * 4 + j, b = a + 1, c = a + 4, d = c + 1;
        I.push(a, b, d, a, d, c);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute('aDepth', new THREE.Float32BufferAttribute(D, 1));
      g.setIndex(I);
      g.computeVertexNormals();
      const water = K.mesh(g, toon('#ffffff', { water: true, transparent: true, shallow: '#6fe8de', deep: '#1aa6c9', foam: '#d4fbf6', deepAt: 0.9, mirror: true, reflect: 0.16, emissive: '#1cd2cc', emissiveIntensity: 2.4, lamp: true, noise: 0, snow: 0, wet: 0 }), { cast: false });
      water.renderOrder = 1;
      root.add(water);
    }

    // ------------------------------------------------------------ motel
    const wingA = M.motelWing({ rooms: A_ROOMS, blank: [A_ROOMS - 1], coolers: [1, 4] });
    wingA.group.rotation.y = Math.PI / 2;
    wingA.group.position.set(XA - DEPTH / 2, G, (ZB + ZA_END) / 2);
    const wingB = M.motelWing({ rooms: B_ROOMS, skipPosts: [0], coolers: [2, 5], doors: ['#e9b04a', '#2aa39b', '#e7684c'] });
    wingB.group.position.set((XA + XB_END) / 2, G + 0.006, ZB - DEPTH / 2);
    const corner = M.motelBlock({});
    corner.position.set(XA - DEPTH / 2, G + 0.003, ZB - DEPTH / 2);
    root.add(wingA.group, wingB.group, corner);
    const off = M.office({ w: OFFICE.w, d: OFFICE.d, h: OFFICE.h });
    off.group.position.set(OFFICE.x, G, OFFICE.z);
    root.add(off.group);
    const vend = M.vending();
    vend.position.set(XA + 0.3, G + 0.07, ZB + 0.35);
    vend.rotation.y = Math.PI / 4;
    const ice = M.iceMachine();
    ice.position.set(XA + 0.28, G + 0.07, ZB + 1.0);
    ice.rotation.y = Math.PI / 2;
    root.add(vend, ice);

    // rooms light up one by one at dusk: warm, a few TVs, a couple vacant
    const rooms = [...wingA.windows, ...wingB.windows].map((w) => {
      const r = rand();
      const kind = r < 0.2 ? 'tv' : r < 0.34 ? 'dark' : 'warm';
      if (kind === 'tv') w.mat.emissive.set('#86a8ff');
      else w.mat.emissive.set(['#ffb45e', '#ffc277', '#ff9f5a'][Math.floor(rand() * 3)]);
      return { mat: w.mat, kind, onAt: 0.12 + rand() * 0.75, g: 0, ph: rand() * 50 };
    });

    // ------------------------------------------------------------ sign
    const sign = M.neonSign();
    sign.group.position.set(SIGN[0], G, SIGN[1]);
    sign.group.rotation.y = Math.PI / 4;
    root.add(sign.group);
    const SP = sign.parts;

    // ------------------------------------------------------------ parked cars, trailer, lot light
    const park = (v, x, z, ry, y = Y0) => {
      v.group.position.set(x, y, z);
      v.group.rotation.y = ry;
      root.add(v.group);
      return v;
    };
    park(M.vintageCar({ body: '#3fb5a8', roof: '#f3ead6' }), -0.42, DECK.z0 + 0.62, Math.PI);
    park(M.vintageCar({ body: '#e8a33d', roof: '#f6efe2' }), -0.42, DECK.z0 + 2.92, Math.PI);
    park(M.pickup({ body: '#a8452f' }), 3.65, 4.6, 0, G);
    const trailer = park(M.airstream({}), 1.8, 4.6, 0, G);
    {
      const P = [M.box(0.1, 2.3, 0.1, 0.95, G + 1.15, -1.85, '#3a3f4a'), M.box(0.5, 0.06, 0.1, 1.15, G + 2.28, -1.85, '#3a3f4a'), M.box(0.26, 0.1, 0.24, 1.36, G + 2.22, -1.85, '#3a3f4a')];
      root.add(M.solid(P, { noise: 0.05 }));
      const head = K.mesh(new THREE.BoxGeometry(0.22, 0.05, 0.2), K.glass('#ffd08a', 6, '#c9c2b0'), { cast: false });
      head.position.set(1.36, G + 2.15, -1.85);
      root.add(head);
    }
    // picnic table and bench by the office
    root.add(M.solid([
      M.box(0.7, 0.05, 0.36, 0.1, G + 0.26, 5.7, '#a3734a'),
      M.box(0.7, 0.04, 0.12, 0.1, G + 0.15, 5.42, '#a3734a'),
      M.box(0.7, 0.04, 0.12, 0.1, G + 0.15, 5.98, '#a3734a'),
      M.box(0.06, 0.26, 0.5, -0.18, G + 0.13, 5.7, '#7d5638'),
      M.box(0.06, 0.26, 0.5, 0.38, G + 0.13, 5.7, '#7d5638'),
      M.box(0.12, 0.04, 0.52, -1.1, G + 0.2, 3.95, '#7d5638'),
      M.box(0.04, 0.12, 0.52, -1.18, G + 0.28, 3.95, '#7d5638'),
      M.cyl(0.09, 0.08, 0.26, -1.1, G + 0.2, 4.55, '#3f7f86', 8),
    ], { noise: 0.1 }));

    // camp by the trailer: striped awning, string lights, a fire ring
    const bulbs = [];
    {
      const P = [];
      for (let k = 0; k < 5; k++) P.push(M.box(0.2, 0.025, 0.48, 1.2 + k * 0.2, G + 0.8, 5.15, k % 2 ? '#f4ecda' : '#e7684c', [0.28, 0, 0]));
      for (const x of [1.12, 2.08]) P.push(M.box(0.07, 0.72, 0.07, x, G + 0.36, 5.37, '#cfd3d8'));
      P.push(M.box(0.07, 1.05, 0.07, -0.45, G + 0.52, 5.25, '#6b4a33'));
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        P.push(M.box(0.1, 0.07, 0.1, FIRE[0] + Math.cos(a) * 0.21, G + 0.035, FIRE[1] + Math.sin(a) * 0.21, k % 2 ? '#8d8a86' : '#a29d96', [0, a, 0]));
      }
      P.push(M.box(0.36, 0.06, 0.07, FIRE[0], G + 0.05, FIRE[1], '#5d3b26', [0, 0.6, 0]));
      P.push(M.box(0.36, 0.06, 0.07, FIRE[0], G + 0.08, FIRE[1], '#6e4730', [0, -0.7, 0]));
      root.add(M.solid(P, { noise: 0.1 }));
      const A = new THREE.Vector3(1.1, G + 0.74, 5.4), B = new THREE.Vector3(-0.45, G + 1.02, 5.25);
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        const p = A.clone().lerp(B, t);
        p.y -= 0.2 * 4 * t * (1 - t);
        bulbs.push(p);
      }
      for (let k = 1; k <= 4; k++) bulbs.push(new THREE.Vector3(1.1 + k * 0.245, G + 0.71 - Math.sin((k / 4) * Math.PI) * 0.04, 5.41));
      const parts = bulbs.map((p) => { const b = new THREE.BoxGeometry(0.075, 0.075, 0.075); b.translate(p.x, p.y, p.z); return K.paint(b, '#ffffff'); });
      root.add(K.mesh(K.merge(parts), K.glass('#ffd58c', 5.5, '#e8dcc0'), { cast: false }));
    }
    const flameMat = M.lightMat('#ff7a2a', '#ff7a22', 5.0, 0), flameCore = M.lightMat('#ffd060', '#ffd25a', 6.0, 0);
    const flames = new THREE.Group();
    flames.position.set(FIRE[0], G + 0.06, FIRE[1]);
    {
      const outer = [], inner = [];
      for (const [x, z, s] of [[0.0, 0.0, 1], [0.07, 0.04, 0.75], [-0.06, 0.05, 0.7]]) {
        const c = new THREE.ConeGeometry(0.085 * s, 0.3 * s, 5);
        c.translate(x, 0.15 * s, z);
        outer.push(c);
      }
      const ci = new THREE.ConeGeometry(0.05, 0.18, 5);
      ci.translate(0, 0.09, 0.03);
      inner.push(ci);
      flames.add(K.mesh(K.merge(outer.map((g) => K.paint(g, '#ffffff'))), flameMat, { cast: false }));
      flames.add(K.mesh(K.merge(inner.map((g) => K.paint(g, '#ffffff'))), flameCore, { cast: false }));
    }
    root.add(flames);
    const fireSmoke = K.smoke(new THREE.Vector3(FIRE[0], G + 0.38, FIRE[1]), { count: 26, color: '#cfc8c0' });
    root.add(fireSmoke);
    let fireK = 0;

    // ------------------------------------------------------------ desert dressing
    const cactusMat = toon('#ffffff', { vertexColors: true, noise: 0.2, noiseScale: 9, snow: 1 });
    const saguaros = [
      [-7.2, 2.7, 1.9, 2], [-4.2, 3.4, 1.35, 1], [-7.4, 5.3, 1.5, 2], [-4.6, 1.2, 1.1, 0],
      [4.6, 7.8, 1.15, 1], [-1.4, 7.78, 1.0, 1], [3.45, 5.95, 0.95, 1], [5.15, 1.75, 0.9, 1],
      [-1.0, -7.1, 1.7, 2], [1.7, -6.8, 1.25, 1], [4.6, -7.2, 1.85, 2], [-2.8, -7.3, 1.2, 0], [-3.9, -6.9, 1.4, 2],
    ];
    for (const [x, z, h, arms] of saguaros) {
      const m = K.mesh(M.saguaroGeometry(rand, { h, arms }), cactusMat);
      m.position.set(x, ground(x, z), z);
      m.rotation.y = rand() * Math.PI;
      root.add(m);
    }
    const building = (x, z, pad) =>
      (x > XA - DEPTH - pad && x < XA + CANOPY + pad && z > ZB - DEPTH - pad && z < ZA_END + pad) ||
      (x > XA - pad && x < XB_END + pad && z > ZB - DEPTH - pad && z < ZB + CANOPY + pad) ||
      (Math.abs(x - OFFICE.x) < OFFICE.w / 2 + 0.45 + pad && Math.abs(z - OFFICE.z) < OFFICE.d / 2 + 0.45 + pad);
    const clearOf = (x, z, pad = 0) =>
      !onDrive(x, z, pad) && !inRect(x, z, DECK, pad) && !(x > ROAD[0] - 0.35) && !building(x, z, pad) &&
      !(z > TW_LANE[0] - 0.25 && z < TW_LANE[1] + 0.25) &&
      Math.hypot(x - MILL[0], z - MILL[1]) > 0.9 && Math.hypot(x - TANK[0], z - TANK[1]) > 0.8 &&
      Math.hypot(x - SIGN[0], z - SIGN[1]) > 0.75 && !(x > -0.7 && x < 4.6 && z > 4.1 && z < 6.15) &&
      !saguaros.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < 0.55);
    const shrubMat = toon('#ffffff', { vertexColors: true, ramp: 'foliage', wind: 0.05, noise: 0.22, noiseScale: 6 });
    const shrubGeos = [0, 1, 2].map((i) => K.bushGeometry(rand, { r: 0.2 + i * 0.05, blobs: 3, leaf: ['#8f9a5c', '#a4a368', '#7c8c55'][i] }));
    for (let tries = 0, b = 0; tries < 700 && b < 30; tries++) {
      const x = (rand() - 0.5) * SIZE * 0.96, z = (rand() - 0.5) * SIZE * 0.96;
      if (!clearOf(x, z, 0.2) || ground(x, z) > 2.0) continue;
      const m = K.mesh(shrubGeos[b % 3], shrubMat);
      m.position.set(x, ground(x, z), z);
      m.scale.setScalar(0.75 + rand() * 0.5);
      root.add(m);
      b++;
    }
    // agaves and barrel cacti merged into one mesh
    {
      const P = [];
      for (let tries = 0, b = 0; tries < 500 && b < 22; tries++) {
        const x = (rand() - 0.5) * SIZE * 0.94, z = (rand() - 0.5) * SIZE * 0.94;
        if (!clearOf(x, z, 0.15) || ground(x, z) > 2.5) continue;
        const y = ground(x, z);
        if (b % 2) {
          for (let k = 0; k < 7; k++) {
            const c = new THREE.ConeGeometry(0.045, 0.34, 4);
            c.translate(0, 0.17, 0);
            c.rotateZ(0.5 + (k % 2) * 0.25);
            c.rotateY((k / 7) * Math.PI * 2);
            c.translate(x, y, z);
            P.push(K.paint(c, k % 2 ? '#7da48f' : '#6c9480'));
          }
        } else {
          const s = new THREE.SphereGeometry(0.13, 7, 5);
          s.scale(1, 1.15, 1);
          s.translate(x, y + 0.12, z);
          P.push(K.paint(s, '#5f9150'));
          P.push(M.box(0.07, 0.05, 0.07, x, y + 0.27, z, '#e6c24a'));
        }
        b++;
      }
      root.add(M.solid(P, { noise: 0.15, noiseScale: 9, snow: 1 }, { facet: true }));
    }
    const tufts = K.grass(rand, 220, (r) => {
      const x = (r() - 0.5) * SIZE * 0.98, z = (r() - 0.5) * SIZE * 0.98;
      if (!clearOf(x, z, 0.1) || ground(x, z) > 2.5) return null;
      return [x, ground(x, z), z];
    }, ['#dcc896', '#cdb582', '#c9c08c', '#e6d4a2']);
    tufts.material = toon('#ffffff', { wind: 1.1, noise: 0, snow: 0.2, ramp: 'flat' });
    root.add(tufts);
    const rockMat = toon('#ffffff', { vertexColors: true, noise: 0.25, noiseScale: 5 });
    for (let tries = 0, b = 0; tries < 500 && b < 16; tries++) {
      const x = (rand() - 0.5) * SIZE * 0.94, z = (rand() - 0.5) * SIZE * 0.94;
      if (!clearOf(x, z, 0.3)) continue;
      const s = 0.2 + rand() * 0.26;
      const m = K.mesh(K.rockGeometry(rand, s, ['#a5553b', '#b8694a', '#8f4632'][b % 3]), rockMat);
      m.position.set(x, ground(x, z) - s * 0.2, z);
      m.rotation.y = rand() * Math.PI;
      root.add(m);
      b++;
    }
    // palms at the pool corners
    const palmMat = toon('#ffffff', { vertexColors: true, ramp: 'foliage', wind: 0.035, noise: 0.15, noiseScale: 6 });
    for (const [x, z, h] of [[1.05, 1.22, 2.7], [4.1, 1.25, 2.3], [2.45, -1.72, 1.95]]) {
      const m = K.mesh(M.palmGeometry(rand, { h }), palmMat);
      m.position.set(x, G + 0.05, z);
      root.add(m);
    }
    // windmill and stock tank
    const mill = M.windmill({});
    mill.group.position.set(MILL[0], G, MILL[1]);
    root.add(mill.group);
    mill.head.rotation.y = Math.atan2(-WIND[1], WIND[0]);
    {
      const P = [M.cyl(0.5, 0.5, 0.3, 0, 0.15, 0, '#9aa1a8', 14), M.cyl(0.46, 0.46, 0.02, 0, 0.27, 0, '#3f7f86', 14), M.box(0.06, 0.4, 0.06, -0.62, 0.2, -0.2, '#7d8288')];
      const tank = M.solid(P, { noise: 0.06 }, { facet: true });
      tank.position.set(TANK[0], G, TANK[1]);
      root.add(tank);
    }

    // ------------------------------------------------------------ lights (8 point lights max)
    const lights = [];
    const lamp = (pos, opts) => lights.push(K.lampLight(root, pos, opts));
    lamp(new THREE.Vector3(XA + 0.35, G + 0.8, -1.4), { power: 2.2, distance: 4.2 });
    lamp(new THREE.Vector3(XA + 0.35, G + 0.8, 1.8), { power: 2.2, distance: 4.2 });
    lamp(new THREE.Vector3(2.4, G + 0.8, ZB + 0.35), { power: 2.2, distance: 4.4 });
    lamp(off.light.clone().add(off.group.position), { color: '#ffc77a', power: 2.6, distance: 4.2 });
    lamp(new THREE.Vector3((POOL.x0 + POOL.x1) / 2, Y0 + 0.35, (POOL.z0 + POOL.z1) / 2), { color: '#3ff0e4', power: 3.0, distance: 4.0 });
    const fireLight = new THREE.PointLight('#ff9440', 0, 3.6, 2);
    fireLight.position.set(FIRE[0], G + 0.5, FIRE[1]);
    root.add(fireLight);
    const signLight = new THREE.PointLight('#ff4fa3', 0, 8.5, 2);
    signLight.position.set(0, 1.05, 1.9).applyEuler(sign.group.rotation).add(sign.group.position);
    root.add(signLight);
    const truckLight = new THREE.PointLight('#ffe2b0', 0, 5.5, 2);
    root.add(truckLight);
    // scene sky light: a warm afterglow around sunset and sunrise, a cool fill at night
    const afterglow = new THREE.DirectionalLight('#ff9466', 0);
    afterglow.position.set(9, 6.5, -9.5);
    const nightFill = new THREE.HemisphereLight('#7c84c4', '#4a2c44', 0);
    root.add(afterglow, afterglow.target, nightFill);
    const DUSK_C = new THREE.Color('#ffb052'), DAWN_C = new THREE.Color('#ffb48a');

    // ------------------------------------------------------------ particles
    const puffs = new M.Puffs(320);
    root.add(puffs.points);
    const DUST = new THREE.Color('#d8b88a'), DUST_N = new THREE.Color('#6b5a5c'), SPRAY = new THREE.Color('#c9d3e2'), SNOWC = new THREE.Color('#f2f5fa'), SMOKE = new THREE.Color('#3a3a40');
    const dustColor = (env) => {
      if (env.cur.snow > 0.3 || env.snowCover > 0.4) return SNOWC;
      if (env.wet > 0.4) return SPRAY;
      return env.daylight > 0.5 ? DUST : DUST_N;
    };

    // ------------------------------------------------------------ traffic
    const vehicle = (v, kind = 'car') => {
      const group = v.group || v;
      const front = v.front ?? 0.52, back = v.back ?? 0.52;
      const beam = M.headBeam(kind === 'truck' ? { from: front - 0.05, len: 3.4, w0: 0.5, w1: 1.6 } : { from: front - 0.05, len: 2.2, w0: 0.32, w1: 1.0 });
      group.add(beam.mesh);
      clip(group);
      group.visible = false;
      root.add(group);
      return { obj: group, front, back, beam, kind, active: false, s: 0, speed: 0, target: 0, lane: null, passed: false };
    };
    const fleet = [
      vehicle(cityCar({ color: '#6d8fb3', kind: 'sedan' })),
      vehicle(cityCar({ color: '#e2d6bd', kind: 'sedan' })),
      vehicle(cityCar({ color: '#f0eee8', kind: 'van' })),
      vehicle(M.pickup({ body: '#5d7f9a' })),
      vehicle(M.vintageCar({ body: '#e05a6d', roof: '#f6efe2' })),
      vehicle(cityCar({ color: '#2f3a4a', kind: 'sedan' })),
    ];
    const rig = M.semiTruck({});
    const truck = vehicle(rig, 'truck');
    truck.pending = false;
    const laneTimers = [1.5, 4.5];
    const place = (v) => {
      v.obj.position.set(v.lane.x, Y0, v.lane.dir * v.s);
      v.obj.rotation.y = v.lane.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    };
    const spawn = (v, lane, speed) => {
      Object.assign(v, { active: true, lane, s: -HALF - v.front - 0.05, speed, target: speed, passed: false, honk: false, roar: false, kicked: false });
      v.obj.visible = true;
      place(v);
    };
    const laneClear = (lane, room) => ![...fleet, truck].some((v) => v.active && v.lane === lane && v.s - v.back < -HALF + room);
    const callTruck = () => {
      if (!truck.active) truck.pending = true;
    };

    // ------------------------------------------------------------ tumbleweeds
    const tumbleMat = toon('#ffffff', { vertexColors: true, noise: 0.3, noiseScale: 11, snow: 0.7 });
    const weeds = [0, 1, 2].map(() => {
      const m = K.mesh(M.tumbleweedGeometry(rand, 0.34), tumbleMat);
      clip(m);
      m.visible = false;
      root.add(m);
      return { m, active: false, x: 0, z: 0, y: G, dx: 1, dz: 0, d: 0, r: 0.34, speed: 1, ph: 0 };
    });
    let weedTimer = 3;
    const launchWeed = (x, z, dx, dz, speed) => {
      const w = weeds.find((q) => !q.active);
      if (!w) return;
      const l = Math.hypot(dx, dz);
      Object.assign(w, { active: true, x, z, dx: dx / l, dz: dz / l, d: 0, speed, ph: rand() * 6, y: ground(x, z) + w.r });
      w.m.visible = true;
    };

    // ------------------------------------------------------------ neon controller
    // each part starts dark and toggles at these times (s) after the switch is thrown
    const IGNITE = {
      starCore: [0.1, 0.15, 0.27, 0.3, 0.42],
      starLong: [0.5, 0.55, 0.62],
      starShort: [0.7, 0.74, 0.84],
      arrow: [1.0, 1.07, 1.16, 1.2, 1.32],
      border: [1.5, 1.55, 1.6],
      bars0: [1.78], bars1: [1.98, 2.02, 2.08], bars2: [2.22],
      bulbs: [2.4],
      go: [2.66, 2.7, 2.8],
      face: [1.5, 1.55, 1.6, 1.66, 1.74], lowerFace: [2.66, 2.7, 2.8], arrowBody: [1.0, 1.07, 1.16, 1.2, 1.32],
    };
    const DONE = 2.95;
    const neonState = { on: false, t: 99, glitch: 0, sparks: new Set(), lit: 0 };
    const parts = {
      starCore: SP.starCore, starLong: SP.starLong, starShort: SP.starShort, arrow: SP.arrow, border: SP.border,
      bars0: [SP.bars[0]], bars1: [SP.bars[1]], bars2: [SP.bars[2]], bulbs: SP.bulbs, go: SP.go, stop: SP.stop,
      face: SP.face, lowerFace: SP.lowerFace, arrowBody: SP.arrowBody,
    };
    const PART_POS = {
      starCore: [[0, 5.62]], starLong: [[0, 6.3], [0.7, 5.62], [-0.7, 5.62]], starShort: [[0.32, 5.94], [-0.32, 5.3]],
      arrow: [[1.3, 4.36], [-0.2, 4.36], [-1.42, 3.4], [-1.42, 2.3]], border: [[-0.98, 3.3], [0.98, 3.3], [0, 3.88]],
      bars0: [[0, 3.6]], bars1: [[0, 3.3]], bars2: [[0, 3.0]], bulbs: [[0.4, 4.36], [-1.42, 3.0]], go: [[0, 2.2]],
    };
    const SPARK = new THREE.Color(4.2, 3.1, 1.5);
    const sparkAt = (name, n = 7) => {
      audio.play('spark');
      const list = PART_POS[name] || PART_POS.border;
      const [lx, ly] = list[Math.floor(rand() * list.length)];
      const p = sign.group.localToWorld(new THREE.Vector3(lx, ly, 0.15));
      for (let k = 0; k < n; k++) puffs.emit(p.x, p.y, p.z, (rand() - 0.5) * 1.4, 0.3 + rand() * 1.1, (rand() - 0.5) * 1.4, 0.35 + rand() * 0.45, SPARK, 1, 1, 7);
    };
    const toggleNeon = () => {
      neonState.on = !neonState.on;
      neonState.t = 0;
      neonState.sparks.clear();
      audio.play('tick');
      if (!neonState.on) sparkAt('border', 10);
    };
    const partOn = (name, te) => {
      const list = IGNITE[name];
      if (!list) return 0;
      let k = 0;
      while (k < list.length && te >= list[k]) k++;
      if (k % 2 === 1 && !neonState.sparks.has(name + k)) {
        neonState.sparks.add(name + k);
        sparkAt(name);
      }
      return k % 2;
    };
    let coyoteTimer = 12;

    const info = {
      size: SIZE, top: Math.max(T.max, G + sign.top), bottom: BASE,
      surfaceAt: (x, z) => {
        const R = G + WALL_H + 0.09;
        if (x > XA - DEPTH - 0.05 && x < XA + CANOPY && z > ZB - DEPTH && z < ZA_END + 0.05) return R;
        if (x > XA && x < XB_END + 0.05 && z > ZB - DEPTH - 0.05 && z < ZB + CANOPY) return R;
        if (Math.abs(x - OFFICE.x) < 1.25 && Math.abs(z - OFFICE.z) < 1.2) return G + OFFICE.h + 0.32;
        if (onDrive(x, z) || inRoad(x) || inRect(x, z, POOL)) return Y0;
        if (inRect(x, z, DECK)) return G + 0.05;
        return ground(x, z);
      },
      isLand: (x, z) => x > -1.5 && x < 5.4 && z > -3.6 && z < 4.2,
    };

    const world = {
      root,
      info,
      debug: { weeds, truck, neonState, launchWeed },
      actions: [
        { id: 'neon', label: 'Neon', icon: ICON_NEON, run: () => toggleNeon(), active: () => neonState.on },
        { id: 'truck', label: 'Truck', icon: ICON_TRUCK, run: () => callTruck(), active: () => truck.active || truck.pending },
      ],
      update(t, dt, env) {
        const W = env.cur;
        K.updateLamps(lights, env);
        const lampsK = env.lamps;

        // sky light
        const h = env.hour;
        const dusk = gauss(h, 19.3, 0.6), dawn = gauss(h, 6.2, 0.5);
        afterglow.intensity = (dusk * 1.25 + dawn * 0.7) * (1 - 0.75 * W.clouds) * (1 - 0.5 * W.fog);
        afterglow.color.copy(dusk > dawn ? DUSK_C : DAWN_C);
        nightFill.intensity = (THREE.MathUtils.smoothstep(env.night, 0.55, 1) * 0.5 + dusk * 0.28) * (1 + 0.5 * W.clouds);

        // rooms
        for (const r of rooms) {
          const want = r.kind !== 'dark' && lampsK > r.onAt ? 1 : 0;
          r.g += (want - r.g) * (1 - Math.exp(-dt * 9));
          let v = r.g;
          if (r.kind === 'tv') v *= 0.55 + 0.3 * Math.sin(t * 7.3 + r.ph) * Math.sin(t * 2.1 + r.ph * 2) + 0.15 * Math.sin(t * 23 + r.ph);
          setGlow(r.mat, v);
        }
        setGlow(off.glass, Math.min(1, lampsK * 1.4));
        setGlow(off.trim, lampsK);
        setGlow(trailer.window, lampsK > 0.55 ? 1 : 0);
        const burning = lampsK > 0.35 && W.rain < 0.3 && W.snow < 0.3 ? 1 : 0;
        fireK += (burning - fireK) * (1 - Math.exp(-dt * 1.2));
        const fl = 0.75 + 0.15 * Math.sin(t * 13.1) + 0.1 * Math.sin(t * 29.7 + 1.3);
        setGlow(flameMat, fireK * fl);
        setGlow(flameCore, fireK * (0.8 + 0.2 * Math.sin(t * 21.3)));
        flames.visible = fireK > 0.03;
        flames.scale.set(1, 0.4 + 0.6 * fireK * (0.85 + 0.25 * Math.sin(t * 17.3) * Math.sin(t * 5.1)), 1);
        flames.rotation.y = t * 0.7;
        fireSmoke.material.uniforms.uOn.value = Math.max(fireK, 0.25 * (1 - burning) * (W.rain > 0.3 ? 1 : 0));
        fireLight.intensity = 2.6 * fireK * fl;
        audio.setLoop('fire', fireK * 0.45);

        // neon sign
        neonState.t += dt;
        const te = neonState.t;
        const dayK = 0.16 + 0.84 * lampsK;
        if (W.storm > 0.5 && env.flash > 0.6 && neonState.glitch <= 0) {
          neonState.glitch = 0.4;
          if (neonState.on) sparkAt(['arrow', 'border', 'bars1'][Math.floor(rand() * 3)], 9);
        }
        neonState.glitch = Math.max(0, neonState.glitch - dt);
        const glitch = neonState.glitch > 0;
        let sum = 0, cnt = 0;
        const flash = te > DONE && te < DONE + 0.8 ? 1 + 0.7 * Math.exp(-(te - DONE) * 5) : 1;
        for (const [name, mats] of Object.entries(parts)) {
          let v;
          if (neonState.on) {
            if (name === 'stop') v = 0;
            else if (te < DONE + 0.2 && IGNITE[name]) v = partOn(name, te);
            else v = 1;
            if (te > DONE) {
              if (name === 'starLong') v *= 0.78 + 0.22 * Math.sin(t * 3.1);
              if (name === 'starShort') v *= 0.78 - 0.22 * Math.sin(t * 3.1) + (Math.sin(t * 0.9) > 0.97 ? -0.6 : 0);
              if (name === 'arrow' || name === 'border') {
                const k = Math.sin(t * 0.7 + (name === 'arrow' ? 1.3 : 4.1)) * Math.sin(t * 1.9 + 2.2);
                if (k > 0.9) v *= Math.sin(t * 60) > 0 ? 1 : 0.15;
              }
              if (name.startsWith('bars')) {
                const c = (t % 7) / 7, i = +name[4];
                if (c > 0.55 && c < 0.75) v *= c < 0.55 + (i + 1) * 0.06 ? 1 : 0.05;
                else if (c > 0.8 && c < 0.85) v *= 0.05;
              }
              v *= flash;
            }
            if (name === 'bulbs') {
              const lit = te < DONE + 0.4 ? Math.min(1, Math.max(0, (te - 2.4) / 0.5)) : 1;
              const step = Math.floor(t * 6);
              mats.forEach((m, k) => setGlow(m, (((k - step) % 3) + 3) % 3 !== 0 ? lit * dayK * (glitch && rand() < 0.5 ? 0.1 : 1) : lit * dayK * 0.12));
              sum += lit;
              cnt++;
              continue;
            }
          } else {
            const die = Math.max(0, 1 - te / 0.55);
            v = te < 0.6 ? die * (Math.sin(t * 47 + name.length * 3) > 0 ? 1 : 0.1) : 0;
          }
          if (glitch && v > 0) v *= rand() < 0.45 ? 0.08 : 1;
          v *= dayK;
          for (const m of mats) setGlow(m, v);
          if (name !== 'stop' && name !== 'go') {
            sum += v / dayK;
            cnt++;
          }
        }
        neonState.lit = cnt ? sum / cnt : 0;
        signLight.intensity = 7.0 * neonState.lit * lampsK;
        audio.setLoop('buzz', neonState.on ? 0.3 + 0.7 * Math.min(1, neonState.lit) : Math.max(0, 1 - te / 0.5) * 0.6);

        // traffic
        const all = [...fleet, truck];
        if (truck.pending && laneClear(LANES[0], 6.5)) {
          truck.pending = false;
          spawn(truck, LANES[0], 3.0);
          audio.play('rumble', { dur: 6.5, gain: 0.9 });
        }
        for (let i = 0; i < 2; i++) {
          laneTimers[i] -= dt;
          if (laneTimers[i] > 0) continue;
          laneTimers[i] = 3.5 + rand() * 6;
          if ((i === 0 && (truck.active || truck.pending)) || !laneClear(LANES[i], 3)) continue;
          const idle = fleet.filter((v) => !v.active);
          if (idle.length) spawn(idle[Math.floor(rand() * idle.length)], LANES[i], 2.2 + rand() * 0.9);
        }
        for (const lane of LANES) {
          const list = all.filter((v) => v.active && v.lane === lane).sort((a, b) => b.s - a.s);
          list.forEach((v, k) => {
            v.speed += (v.target - v.speed) * (1 - Math.exp(-dt * 1.5));
            if (k > 0) {
              const ahead = list[k - 1];
              const gap = ahead.s - ahead.back - (v.s + v.front);
              if (gap < 0.9) v.speed = Math.min(v.speed, ahead.speed * Math.max(0, gap / 0.9));
            }
            v.s += v.speed * dt;
            place(v);
            v.beam.mat.uniforms.uOn.value = lampsK * (v.kind === 'truck' ? 1.0 : 0.75);
            if (v.kind !== 'truck' && !v.passed && v.s > -1) {
              v.passed = true;
              audio.play('whoosh', { dur: 1.7, gain: 0.22 });
            }
            if (v.s - v.back > HALF + 0.05) {
              v.active = false;
              v.obj.visible = false;
            }
          });
        }
        // the rig: horn as it nears the motel, a roar as it passes, dust and exhaust, the sign shivers
        const tk = truck;
        if (tk.active) {
          const z = tk.s;
          if (!tk.honk && z > -4.8) {
            tk.honk = true;
            audio.play('horn', { pitch: 1.85, dur: 0.45, gain: 0.8 });
            audio.play('horn', { pitch: 1.85, dur: 0.9, gain: 0.8, delay: 0.62 });
          }
          if (!tk.roar && z > -1.2) {
            tk.roar = true;
            audio.play('whoosh', { dur: 2.6, gain: 1.3 });
          }
          if (!tk.kicked && z > 1.0) {
            tk.kicked = true;
            launchWeed(5.4, 2.4, 0.12, 1, 2.6);
          }
          if (Math.abs(z - SIGN[1]) < 1.6 && neonState.glitch <= 0) neonState.glitch = 0.18;
          const dc = dustColor(env);
          const back = z - tk.back;
          for (let k = 0; k < 3; k++) {
            const side = k % 2 ? 1 : -1;
            puffs.emit(tk.lane.x + side * (0.25 + rand() * 0.18), Y0 + 0.08, back + rand() * 0.4, side * 0.25 + (rand() - 0.5) * 0.3, 0.25 + rand() * 0.35, -0.6 - rand() * 0.6, 1.4 + rand() * 0.8, dc, env.wet > 0.4 ? 0.55 : 0.7, 2 + Math.floor(rand() * 2));
          }
          if (rand() < 0.5) for (const s of [-1, 1]) puffs.emit(tk.lane.x + s * rig.stack.side, Y0 + rig.stack.y, z + rig.stack.x, (rand() - 0.5) * 0.1, 0.6 + rand() * 0.3, -0.5, 1.1 + rand() * 0.6, SMOKE, 0.55, 2);
          truckLight.position.set(tk.lane.x, Y0 + 0.6, z + 2.3);
          truckLight.intensity = 5.5 * lampsK;
          setGlow(rig.mats.head, 0.35 + 0.65 * lampsK);
          setGlow(rig.mats.amber, 0.2 + 0.8 * lampsK);
          setGlow(rig.mats.red, 0.25 + 0.75 * lampsK);
        } else truckLight.intensity = 0;
        puffs.update(dt, env.windDir.x * W.wind, env.windDir.y * W.wind);

        // tumbleweeds
        weedTimer -= dt * (0.6 + W.wind * 1.4) * (W.snow > 0.3 ? 0.4 : 1);
        if (weedTimer <= 0) {
          weedTimer = 7 + rand() * 9;
          launchWeed(-HALF - 0.4, TW_LANE[0] + 0.15 + rand() * (TW_LANE[1] - TW_LANE[0] - 0.3), 1, (rand() - 0.5) * 0.06, 0.9 + rand() * 0.4);
        }
        for (const w of weeds) {
          if (!w.active) continue;
          const sp = w.speed * (0.7 + W.wind * 1.1);
          w.x += w.dx * sp * dt;
          w.z += w.dz * sp * dt;
          w.d += sp * dt;
          const hop = Math.abs(Math.sin(w.d * 1.7 + w.ph)) * (0.18 + W.wind * 0.25);
          const gy = Math.max(ground(w.x, w.z), inRoad(w.x) || onDrive(w.x, w.z) ? Y0 : 0) + w.r * 0.9;
          w.y += (gy - w.y) * (1 - Math.exp(-dt * 10));
          w.m.position.set(w.x, w.y + hop, w.z);
          w.m.rotation.set((w.dz * w.d) / w.r, 0, (-w.dx * w.d) / w.r);
          if (Math.abs(w.x) > HALF + 0.6 || Math.abs(w.z) > HALF + 0.6) {
            w.active = false;
            w.m.visible = false;
          }
        }

        tufts.visible = env.snowCover < 0.35;

        // windmill spins with the wind
        mill.rotor.rotation.x += dt * (0.9 + W.wind * 6.5);
        mill.head.rotation.y = Math.atan2(-WIND[1], WIND[0]) + Math.sin(t * 0.4) * 0.06 * (0.3 + W.wind);

        // ambience: cicadas by day, coyotes at night, desert wind in storms
        const clearish = (1 - W.rain) * (1 - W.snow) * (1 - W.storm);
        audio.setLoop('cicadas', Math.pow(env.daylight, 2) * clearish * 0.9);
        audio.setLoop('howl', Math.min(1, W.storm * 0.55 + Math.max(0, W.wind - 0.45) * 0.6));
        coyoteTimer -= dt;
        if (coyoteTimer <= 0) {
          coyoteTimer = 16 + rand() * 22;
          if (env.night > 0.7 && W.rain < 0.2) audio.play('coyote');
        }
      },
    };
    return world;
  },
};
