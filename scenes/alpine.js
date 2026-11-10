import * as THREE from 'three';
import * as K from './kit.js';
import { toon, setGlow } from '../engine/materials.js';
import * as C from './campsite-parts.js';
import * as A from './alpine-parts.js';

// Alpine: a glacial valley in the Rockies. Banded limestone peaks with snowfields and a hanging glacier that
// spills a waterfall into a turquoise lake, spruce forest wrapped round their feet. On the right shore a log
// cabin with a dock, a cedar canoe and a campfire with two Muskoka chairs; on the left shore a grizzly wanders,
// sniffs, sits, scratches its back on a spruce and fishes the shallows below the falls.
// Scene buttons: Bear (rears up, roars, flushes the birds, pounces on a fish), Fire (the campfire flares),
// Alpenglow (the clock runs to sundown and the peaks glow pink while the valley falls into shade).

const SIZE = 16, HALF = 8, CELLS = 76, WATER = 0, BASE = -1.5;
const S2 = Math.SQRT1_2;
// u runs to the right of the default view, v runs toward the camera
const toUV = (x, z) => [(x - z) * S2, (x + z) * S2];
const toXZ = (u, v) => [(u + v) * S2, (v - u) * S2];
const yawUV = (du, dv) => Math.atan2(-(dv - du) * S2, (du + dv) * S2);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

// layout in (u, v)
const CABIN = [4.4, 0.3];
const FIRE = [4.25, 2.75];
const FACE = [-S2, S2]; // the cabin's gable and porch face world +z, so its walls draw clean 2:1 pixel lines
const DOCK = { at: [2.65, 0.0], len: 2.3 };
const FALLS = { u: -1.7, lip: -3.05, foot: -2.3 };
// a low crest ties the range together; the peaks rise well above it, with deep cols between them
const CREST = [[-11.4, 0.2, 1.1], [-9.0, -1.4, 2.0], [-7.2, -2.6, 2.8], [-5.8, -3.6, 2.7], [-4.4, -4.7, 3.4], [-2.7, -5.6, 3.1], [-1.0, -6.2, 3.8], [1.3, -6.6, 3.2], [3.8, -5.2, 3.6], [5.6, -3.9, 2.8], [7.4, -2.4, 2.6], [9.4, -1.0, 1.8], [11.4, 0.2, 1.0]];
const SPURS = [[[-1.0, -6.2, 5.6], [-3.3, -2.75, 1.7]], [[-1.0, -6.2, 5.6], [0.8, -2.85, 1.7]], [[3.8, -5.2, 4.6], [4.8, -2.1, 1.4]], [[-4.4, -4.7, 4.2], [-5.8, -1.4, 1.4]]];
const PEAKS = [
  // u, v, height, base radius, profile power, arete directions (radians in the u/v plane, +v = toward camera)
  { u: -1.0, v: -6.2, h: 7.7, r: 4.2, p: 1.75, ridges: [2.05, 1.1, -1.6, -2.7] },
  { u: 3.8, v: -5.2, h: 5.7, r: 2.6, p: 1.6, ridges: [1.0, -0.3, -2.5, 2.4], tower: true },
  { u: 4.5, v: -5.9, h: 6.3, r: 1.5, p: 1.5, ridges: [1.2, -0.6] },
  { u: -4.4, v: -4.7, h: 5.5, r: 3.1, p: 1.55, ridges: [1.6, -0.5, 3.0] },
  { u: 1.6, v: -9.0, h: 6.0, r: 3.0, p: 1.5, ridges: [0.5, 2.6, -1.5] },
  { u: -7.2, v: -2.6, h: 3.8, r: 2.6, p: 1.4, ridges: [1.4, -0.4] },
  { u: 7.4, v: -2.4, h: 3.6, r: 2.6, p: 1.4, ridges: [1.6, -0.3] },
];
const BEAR_SPOTS = {
  fish: { uv: [-2.75, -1.05], act: 'fish', face: [1, 0.22], next: ['look', 'wade', 'rock'] },
  wade: { uv: [-3.0, 0.45], act: 'drink', face: [1, 0.12], next: ['fish', 'drink', 'rock'] },
  look: { uv: [-3.65, -0.6], act: 'look', next: ['fish', 'tree', 'rock'] },
  rock: { uv: [-4.25, 0.55], act: 'sniff', next: ['meadow', 'fish', 'drink'] },
  meadow: { uv: [-5.0, 1.75], act: 'sit', next: ['rock', 'drink'] },
  drink: { uv: [-3.85, 1.85], act: 'drink', face: [1, 0.1], next: ['meadow', 'fish', 'wade'] },
  tree: { uv: [-4.7, -1.25], act: 'scratch', next: ['look', 'fish'] },
};
const ICONS = {
  bear: ['##.....##', '#########', '#########', '##.###.##', '#########', '###...###', '###.#.###', '.##...##.', '..#####..'],
  fire: ['....#....', '...##....', '...###.#.', '..#####..', '.##.####.', '.##..###.', '..##.##..', '#.#####.#', '.##...##.'],
  alpenglow: ['....#....', '...###...', '..#####..', '..##.##..', '.##...##.', '.#.....#.', '#.......#', '.........', '#########'],
};

export default {
  name: 'Alpine',
  view: { target: [0, 1.8, 0], size: 17.6, azimuth: 45, elevation: 30 },
  look: { levels: 14, dither: 0.45, outline: 0.55, highlight: 0.34, bloom: 1.1, bloomThreshold: 2.3, contrast: 1.08, saturation: 1.14, vignette: 0.22, texture: 1.1 },
  env: { hour: 16.9, weather: 'clear' },
  audio: { water: 0.4, birds: 1, crickets: 0.55, foghorn: 0 },
  mirror: { y: WATER },
  sky: { moon: 0.9, milky: 0.7, moonPos: [0.86, 0.84] },
  wind: [0.8, -0.6],
  actionsLabel: 'Valley',

  create({ env, audio }) {
    const root = new THREE.Group();
    const rand = K.rng(2207);
    const n1 = K.noise2(3), n2 = K.noise2(17), n3 = K.noise2(29), nC = K.noise2(41);

    // ------------------------------------------------------------ land
    const lakeField = (u, v) => {
      const wob = (n2(u * 0.6 + 3, v * 0.6) - 0.5) * 0.55 + (n3(u * 1.4, v * 1.4 + 9) - 0.5) * 0.2;
      const back = v - (-2.5 + 0.07 * u * u + 0.03 * u);
      const left = u - (-3.05 - 0.42 * Math.max(0, v - 0.3));
      const right = 2.45 + 0.42 * Math.max(0, v - 0.6) - u;
      return smin(smin(back, left, 1.1), right, 1.1) + wob;
    };
    const peakH = (u, v, P) => {
      const du = u - P.u, dv = v - P.v;
      const d = Math.hypot(du, dv);
      if (d > P.r * 1.25) return 0;
      const a = Math.atan2(dv, du);
      let k = 0;
      for (const r of P.ridges) {
        const da = Math.atan2(Math.sin(a - r), Math.cos(a - r));
        k = Math.max(k, Math.exp(-(da * da) / 0.14));
      }
      const R = P.r * (0.62 + 0.6 * k);
      if (P.tower) {
        const top = P.h - Math.max(0, d - P.r * 0.18) * 0.55;
        return Math.min(top, P.h * Math.pow(clamp((R - d) / (R * 0.42), 0, 1), 0.7));
      }
      return P.h * Math.pow(Math.max(0, 1 - d / R), P.p);
    };
    // a ridge segment: height falls off on both sides, steeper toward the valley (+v)
    const ridgeH = ([au, av, ah], [bu, bv, bh], u, v, front, backS) => {
      const du = bu - au, dv = bv - av;
      const t = clamp(((u - au) * du + (v - av) * dv) / (du * du + dv * dv), 0, 1);
      const pu = au + du * t, pv = av + dv * t;
      const d = Math.hypot(u - pu, v - pv);
      const side = (u - pu) * -dv + (v - pv) * du; // which side of the line
      return ah + (bh - ah) * t - d * (v > pv ? front : backS) * (1 + 0.15 * Math.sign(side) * 0);
    };
    const ridged = (u, v) => {
      const a = 1 - Math.abs(n1(u * 0.62, v * 0.62) * 2 - 1);
      const b = 1 - Math.abs(n2(u * 1.3 + 7, v * 1.3) * 2 - 1);
      return a * a * 0.6 + b * b * 0.4;
    };
    // irregular strata: the step height and phase drift across the range, so the ledges never line up
    const terrace = (h, u, v, k) => {
      const T = 0.44 + 0.2 * n3(u * 0.33 + 17, v * 0.33);
      const q = h / T + (n2(u * 0.4 + 31, v * 0.4) - 0.5) * 0.9, f = q - Math.floor(q);
      const s = K.smoothstep(0.32, 0.78, f);
      return h + (Math.floor(q) + s - q) * T * k;
    };
    // the glacier: a gently climbing ice sheet filling the cirque under the main peak
    const cirque = (u, v) => (1 - K.smoothstep(0.7, 1.35, Math.abs(u - FALLS.u) * (1 + 0.1 * Math.max(0, -(v - FALLS.lip))) + (n2(u * 1.6, v * 1.6) - 0.5) * 0.35)) * K.smoothstep(FALLS.lip + 0.25, FALLS.lip - 0.15, v) * (1 - K.smoothstep(-4.5, -5.1, v));
    const iceH = (u, v) => 2.95 + 0.62 * Math.max(0, -(v - FALLS.lip)) + 0.14 * (1 - ((u - FALLS.u) / 1.4) ** 2) - 0.05;
    const mountain = (u, v) => {
      let h = 0;
      for (let i = 0; i < CREST.length - 1; i++) h = Math.max(h, ridgeH(CREST[i], CREST[i + 1], u, v, 1.5, 1.0));
      for (const P of PEAKS) h = Math.max(h, peakH(u, v, P));
      const c = cirque(u, v);
      if (c > 0) h = h + (Math.min(h, iceH(u, v)) - h) * c;
      for (const [A1, B1] of SPURS) h = Math.max(h, ridgeH(A1, B1, u, v, 1.55, 1.55));
      const crag = (ridged(u, v) - 0.45) * 0.7 * K.smoothstep(0.8, 3.5, h) * (1 - c);
      h += crag;
      h = terrace(h, u, v, 0.5 * K.smoothstep(2.2, 3.4, h) * (1 - K.smoothstep(5.6, 6.6, h)) * (1 - c));
      return h;
    };
    const raw = (u, v) => {
      const d = -lakeField(u, v);
      if (d < 0) return Math.max(d > -0.8 ? -0.03 + d * 0.34 : -0.3 + (d + 0.8) * 0.6, -1.2);
      let h = 0.1 + 0.28 * K.smoothstep(0, 1.4, d) + 0.1 * Math.max(0, d - 1.4);
      h += (n3(u * 0.8 + 11, v * 0.8) - 0.5) * 0.22 * K.smoothstep(0.3, 1.5, d);
      h = Math.max(h, mountain(u, v) * K.smoothstep(0.1, 1.5, d));
      return h;
    };
    const padTo = (h, u, v, [pu, pv], r0, r1, target) => h + (target - h) * (1 - K.smoothstep(r0, r1, Math.hypot(u - pu, v - pv)));
    const heightUV = (u, v) => {
      let h = raw(u, v);
      // the cirque lip ends in a sheer wall straight into the lake: that's where the falls pour over
      const w = 1 - K.smoothstep(0.55, 1.15, Math.abs(u - FALLS.u));
      if (w > 0 && v < FALLS.foot + 0.05) {
        const wall = 2.95 * K.smoothstep(FALLS.foot, FALLS.lip + 0.05, v);
        h = Math.max(h, wall * w + h * (1 - w) * 0 + (n1(u * 2, v * 2) - 0.5) * 0.12 * w);
      }
      h = padTo(h, u, v, CABIN, 1.15, 1.75, 0.42);
      h = padTo(h, u, v, FIRE, 0.7, 1.1, 0.3);
      return h;
    };

    const crestV = (u) => {
      for (let i = 0; i < CREST.length - 1; i++) {
        const [au, av] = CREST[i], [bu, bv] = CREST[i + 1];
        if (u >= au && u <= bu) return av + (bv - av) * ((u - au) / (bu - au));
      }
      return 0;
    };
    const treeline = (u, v) => 2.4 + (n1(u * 0.45 + 5, v * 0.45) - 0.5) * 0.8;
    const snowline = (u, v) => 4.15 + (n2(u * 0.5 + 2, v * 0.5 + 8) - 0.5) * 1.0;
    const glacier = (u, v, y) => y > 2.75 && cirque(u, v) > 0.45 + (n3(u * 1.7, v * 1.7) - 0.5) * 0.4;
    const pathDist = (u, v) => {
      const ax = CABIN[0] + FACE[0] * 1.3, av = CABIN[1] + FACE[1] * 1.3;
      const bx = DOCK.at[0] + 0.2, bv = DOCK.at[1] + 0.05;
      const du = bx - ax, dv = bv - av;
      const t = clamp(((u - ax) * du + (v - av) * dv) / (du * du + dv * dv), 0, 1);
      return Math.hypot(u - ax - du * t, v - av - dv * t) + (nC(u * 3, v * 3) - 0.5) * 0.08;
    };
    const SNOW = ['#eef2f9', '#e2e8f2', '#f7f9fd'];
    const ICE = ['#e0eef3', '#d2e8ef', '#eaf4f7'];
    const ROCK = ['#8f8b98', '#7f7b8a', '#9c97a4', '#726e7e'];
    const ROCKW = ['#a29385', '#93857a', '#ab9c8c'];
    const SCREE = ['#aaa49a', '#9b958c', '#b8b2a8'];
    const TUNDRA = ['#9ca35d', '#8d9852', '#aeb06c', '#b39a52'];
    const FOREST = ['#3d5735', '#46613a', '#527043', '#5f5838'];
    const MEADOW = ['#7da457', '#6f974d', '#89ad5e', '#668c47'];
    const GRAVEL = ['#c4bba7', '#b4ac99', '#cfc7b4', '#a59d8c'];
    const BED = ['#d3c69f', '#c1b691', '#97a68e', '#71907f', '#577a77'];
    const pick = (list, k) => list[Math.min(list.length - 1, Math.floor(k * list.length))];

    const terrainMat = toon('#ffffff', { vertexColors: true, noise: 0.18, noiseScale: 2.8, snow: 0.84 });
    const alpen = A.mountainMaterial(terrainMat, { from: 2.3, to: 6.4, band: 0.34, strataFrom: 0.9, ledgeSnow: 3.5 });
    const T = A.facetTerrain({
      size: SIZE, cells: CELLS, base: BASE, material: terrainMat, band: 0.42, lip: 0.08,
      height: (x, z) => heightUV(...toUV(x, z)),
      top(x, y, z, nx, ny, nz, c) {
        const [u, v] = toUV(x, z);
        const r = nC(x * 6.1 + 0.5, z * 6.1 + 0.5);
        const tone = n3(x * 0.9 + 4, z * 0.9);
        if (y < WATER - 0.02) {
          const dd = -y;
          return c.set(dd < 0.12 ? BED[0] : dd < 0.3 ? BED[r < 0.5 ? 0 : 1] : dd < 0.55 ? BED[2] : dd < 0.85 ? BED[3] : BED[4]);
        }
        if (y < 0.2) return c.set(pick(GRAVEL, r));
        const sl = snowline(u, v);
        if (glacier(u, v, y) && ny > 0.35) {
          // neve on top, blue ice with crevasses lower down, a darker snout over the falls
          if (y < 3.08) return c.set(r < 0.5 ? '#7fb0c6' : '#92bfd2');
          const cr = ((v - FALLS.lip) * -2.4 + (n1(u * 3, v * 3) - 0.5) * 0.7) % 1;
          if (cr < 0.16 && y < 3.9) return c.set('#a3cddc');
          return c.set(y > 3.5 ? pick(SNOW, r) : pick(ICE, (r + tone) * 0.5));
        }
        if (y > 6.0 && ny > 0.06) return c.set(pick(SNOW, r));
        if (y > sl && ny > 0.5) return c.set(pick(SNOW, r));
        if (y > sl + 0.85 && ny > 0.2) return c.set(pick(SNOW, r));
        const tl = treeline(u, v);
        if (ny < 0.58 || y > tl + 0.9) {
          if (ny > 0.62 && y > tl + 0.9 && y < sl) return c.set(r < 0.55 ? pick(TUNDRA, tone) : pick(SCREE, r));
          const band = Math.floor((y + (n1(u * 2.2, v * 2.2) - 0.5) * 0.12) / 0.34);
          const k = Math.abs(Math.sin(band * 12.9898 + 4.1) * 43758.5453) % 1;
          return c.set(band % 3 === 0 ? pick(ROCKW, k) : pick(ROCK, k * 0.7 + r * 0.3));
        }
        if (y > tl) return c.set(r < 0.5 ? pick(SCREE, tone) : pick(TUNDRA, r));
        if (pathDist(u, v) < 0.2) return c.set(r < 0.5 ? '#b49a74' : '#a68d69');
        const meadow = Math.hypot(u - CABIN[0], v - CABIN[1]) < 2.4 || (u < -4.6 && u > -7.6 && v > -0.6 && v < 3.2);
        if (meadow && y < 1.2) return c.set(pick(MEADOW, r * 0.6 + tone * 0.4));
        if (ny < 0.75) return c.set(pick(SCREE, r));
        return c.set(pick(FOREST, r * 0.7 + tone * 0.3));
      },
      side(x, z, y, h, isLip, c) {
        const [u, v] = toUV(x, z);
        if (isLip) {
          if (h < WATER + 0.02) return c.set('#9d927a');
          if (h < 0.22) return c.set('#a9a08c');
          if (h > treeline(u, v) + 0.6) return c.set('#8a8693');
          return c.set('#4c6a3a');
        }
        if (y > h - 0.5 && h > 0.3) return c.set(h > 2.5 ? '#7c7887' : '#6f5a45');
        if (y > -0.5) return c.set(Math.floor(y / 0.42) % 2 ? '#8a7966' : '#7c6c5b');
        if (y > -1.0) return c.set(Math.floor(y / 0.42) % 2 ? '#757580' : '#6a6a76');
        return c.set(Math.floor(y / 0.42) % 2 ? '#5d5e6b' : '#545461');
      },
    });
    root.add(T.mesh);
    const ground = T.heightAt;
    const gUV = (u, v) => ground(...toXZ(u, v));
    const at = (u, v, dy = 0) => {
      const [x, z] = toXZ(u, v);
      return new THREE.Vector3(x, ground(x, z) + dy, z);
    };
    const inBlock = (u, v, m = 0.3) => {
      const [x, z] = toXZ(u, v);
      return Math.abs(x) < HALF - m && Math.abs(z) < HALF - m;
    };

    root.add(K.water({
      size: SIZE, level: WATER, heightAt: ground, base: BASE, edgeCells: CELLS,
      shallow: '#62dccb', deep: '#169cb3', foam: '#e8f8f4', deepAt: 1.05, reflect: 0.3, wall: ['#4cc8c4', '#13607c'],
    }));

    // ------------------------------------------------------------ waterfall
    const fallsPts = [];
    {
      // walk down the cliff face from the lip to the lake, hanging just in front of the rock
      const steps = 22;
      let prevV = FALLS.lip - 0.25;
      for (let k = 0; k <= steps; k++) {
        const y = 2.95 * (1 - k / steps) + 0.02;
        let v = prevV;
        while (v < FALLS.foot + 0.6 && gUV(FALLS.u, v) > y) v += 0.01;
        prevV = v;
        const [x, z] = toXZ(FALLS.u, v + 0.07);
        fallsPts.push(new THREE.Vector3(x, Math.max(y, WATER + 0.01), z));
      }
    }
    const falls = A.waterfall(fallsPts, { width: 0.36, face: new THREE.Vector3(S2, 0, S2) });
    root.add(falls.mesh);
    const fallsFoot = fallsPts[fallsPts.length - 1].clone();
    fallsFoot.y = WATER + 0.02;
    const fallSpray = A.spray(fallsFoot, { count: 120, spread: 0.45, rise: 0.55 });
    root.add(fallSpray.points);

    // ------------------------------------------------------------ forest
    // keep the ground clear around the subjects, and in front of them toward the camera
    const clearing = (u, v) =>
      (Math.abs(u - CABIN[0]) < 1.6 && v > CABIN[1] - 1.05 && v < CABIN[1] + 4.8) ||
      Math.hypot(u - FIRE[0], v - FIRE[1]) < 1.3 ||
      pathDist(u, v) < 0.5 ||
      (Math.abs(u - FALLS.u) < 0.8 && v > FALLS.lip - 0.5) ||
      (u > -5.7 && u < -2.3 && v > -1.75) ||
      Object.values(BEAR_SPOTS).some((s) => Math.hypot(u - s.uv[0], v - s.uv[1]) < 0.8);
    const tmpN = new THREE.Vector3();
    const spruceItems = [], firItems = [], larchItems = [];
    for (let gu = -11.2; gu <= 11.2; gu += 0.4)
      for (let gv = -11.2; gv <= 6.5; gv += 0.4) {
        const u = gu + (rand() - 0.5) * 0.34, v = gv + (rand() - 0.5) * 0.34;
        if (!inBlock(u, v, 0.25)) continue;
        if (v < crestV(u) + 0.3) continue;
        const [x, z] = toXZ(u, v);
        const h = ground(x, z);
        if (h < 0.24) continue;
        const tl = treeline(u, v);
        if (h > tl) continue;
        if (T.normalAt(x, z, tmpN).y < 0.62) continue;
        if (clearing(u, v)) continue;
        let dens = 1 - K.smoothstep(tl - 1.1, tl, h);
        const meadow = Math.hypot(u - CABIN[0], v - CABIN[1]) < 3.0 || (u < -4.4 && u > -7.8 && v > -0.9 && v < 3.4);
        if (meadow) dens *= 0.3;
        if (rand() > dens) continue;
        const s = (0.82 + rand() * 0.38) * (1 - 0.45 * K.smoothstep(0.4, 2.6, h));
        const item = { x, y: h - 0.02, z, ry: rand() * Math.PI * 2, s, c: 0.86 + rand() * 0.22 };
        const larch = h > tl - 1.0 && rand() < 0.22;
        (larch ? larchItems : rand() < 0.22 ? firItems : spruceItems).push(item);
      }
    const foliage = (wind) => toon('#ffffff', { vertexColors: true, ramp: 'foliage', wind, noise: 0.16, noiseScale: 4.5, snow: 0.74 });
    const spruceMat = foliage(0.028), larchMat = foliage(0.035);
    const instanced = (geos, mat, list) => {
      const out = [];
      const d = new THREE.Object3D();
      const col = new THREE.Color();
      geos.forEach((geo, gi) => {
        const items = list.filter((_, i) => i % geos.length === gi);
        if (!items.length) return;
        const m = new THREE.InstancedMesh(geo, mat, items.length);
        items.forEach((p, i) => {
          d.position.set(p.x, p.y, p.z);
          d.rotation.set(0, p.ry, 0);
          d.scale.setScalar(p.s);
          d.updateMatrix();
          m.setMatrixAt(i, d.matrix);
          m.setColorAt(i, col.setScalar(p.c));
        });
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
        out.push(m);
      });
      return out;
    };
    const spruceGeos = [0, 1, 2, 3].map((i) => C.spruceGeometry(K.rng(500 + i), { h: 1.9 + i * 0.22, w: 0.44 + (i % 2) * 0.06, tiers: 6 + (i % 2), leaf: '#1f3d33', leaf2: '#29493c', trunk: '#4a3a30' }));
    const firGeos = [0, 1].map((i) => C.spruceGeometry(K.rng(600 + i), { h: 2.2 + i * 0.3, w: 0.36, tiers: 7, leaf: '#2c5248', leaf2: '#36604f', trunk: '#4a3a30' }));
    const larchGeos = [0, 1].map((i) => C.spruceGeometry(K.rng(700 + i), { h: 1.7 + i * 0.25, w: 0.42, tiers: 5, leaf: '#cf9f3c', leaf2: '#e0b54c', trunk: '#5a4434' }));
    root.add(...instanced(spruceGeos, spruceMat, spruceItems), ...instanced(firGeos, spruceMat, firItems), ...instanced(larchGeos, larchMat, larchItems));

    // the bear's scratching spruce, placed by hand
    {
      const tu = BEAR_SPOTS.tree.uv[0] - 0.32, tv = BEAR_SPOTS.tree.uv[1] - 0.3;
      const p = at(tu, tv, -0.02);
      const t = K.mesh(spruceGeos[3], spruceMat);
      t.position.copy(p);
      t.scale.setScalar(1.05);
      root.add(t);
    }

    // ------------------------------------------------------------ rocks, grass, flowers
    const rockMat = toon('#ffffff', { vertexColors: true, noise: 0.22, noiseScale: 5 });
    const rocks = new THREE.Group();
    const boulder = (u, v, s, sink = 0.3) => {
      const p = at(u, v);
      const m = K.mesh(C.boulderGeometry(rand, s, { pink: false }), rockMat);
      m.position.set(p.x, Math.max(p.y, WATER - s * 0.6) - s * sink * 0.5, p.z);
      m.rotation.y = rand() * Math.PI;
      rocks.add(m);
    };
    boulder(-6.05, 0.2, 0.36);
    boulder(-4.25, 0.25, 0.26, 0.6);
    boulder(-3.95, -1.25, 0.3, 0.5);
    boulder(-2.6, -1.75, 0.34, 0.6);
    boulder(-7.2, 2.9, 0.3);
    boulder(3.55, 2.6, 0.28, 0.6);
    boulder(6.6, 2.2, 0.32);
    boulder(2.6, -1.5, 0.3, 0.5);
    boulder(-1.2, -2.25, 0.26, 0.6);
    K.mergeGroup(rocks);
    root.add(rocks);

    const meadowSpot = (r) => {
      const u = (r() - 0.5) * 22, v = (r() - 0.5) * 16 + 1;
      if (!inBlock(u, v, 0.2)) return null;
      const [x, z] = toXZ(u, v);
      const h = ground(x, z);
      if (h < 0.24 || h > 1.6 || pathDist(u, v) < 0.25) return null;
      if (Math.hypot(u - CABIN[0], v - CABIN[1]) < 1.15 || Math.hypot(u - FIRE[0], v - FIRE[1]) < 0.6) return null;
      if (T.normalAt(x, z, tmpN).y < 0.8) return null;
      return [x, h, z];
    };
    const nearBear = (u, v) => Object.values(BEAR_SPOTS).some((s) => Math.hypot(u - s.uv[0], v - s.uv[1]) < 0.75);
    root.add(A.tufts(rand, 900, (r) => {
      const p = meadowSpot(r);
      if (!p) return null;
      const [u, v] = toUV(p[0], p[2]);
      return nearBear(u, v) ? null : p;
    }, ['#7fae57', '#6c9a4a', '#8fbb63', '#5f8a42', '#9aa55a'], { h: 0.2 }));
    root.add(K.flowers(rand, 140, (r) => {
      const p = meadowSpot(r);
      if (!p) return null;
      const [u, v] = toUV(p[0], p[2]);
      return Math.hypot(u - CABIN[0], v - CABIN[1]) < 3.4 || (u < -4.5 && v > -0.5) ? p : null;
    }, ['#8a6fd1', '#e2533c', '#f1c84a', '#f2efe6', '#b58cff']));

    // ------------------------------------------------------------ cabin, dock, canoe, camp
    const lights = [];
    const cabinYaw = yawUV(...FACE);
    const cabin = A.logCabin({});
    const cabinPos = at(...CABIN);
    cabin.group.position.copy(cabinPos);
    cabin.group.rotation.y = cabinYaw;
    K.mergeGroup(cabin.group);
    root.add(cabin.group);
    const toWorld = (p) => p.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), cabinYaw).add(cabinPos);
    for (const p of cabin.lights) lights.push(K.lampLight(root, toWorld(p), { color: '#ffbe6b', power: 2.0, distance: 3.6 }));
    lights.push(K.lampLight(root, toWorld(cabin.lantern), { color: '#ffc77a', power: 1.6, distance: 2.6 }));
    const chimney = K.smoke(toWorld(cabin.smoke), { count: 34, color: '#d8dbe2' });
    root.add(chimney);

    const woodM = toon('#ffffff', { vertexColors: true, noise: 0.14, noiseScale: 6 });
    const camp = new THREE.Group();
    const side = [S2, S2]; // the cabin's long side that faces the camera (world +x)
    for (const [k, off] of [[0, -0.98], [1, -0.56]]) {
      const pile = K.mesh(C.woodpile(rand), woodM);
      pile.position.copy(at(CABIN[0] + side[0] * 0.98 + FACE[0] * off, CABIN[1] + side[1] * 0.98 + FACE[1] * off));
      pile.rotation.y = cabinYaw + (k ? 0.04 : -0.03);
      camp.add(pile);
    }
    const block = K.mesh(A.choppingBlock(), woodM);
    block.position.copy(at(CABIN[0] + side[0] * 1.45 + FACE[0] * -0.2, CABIN[1] + side[1] * 1.45 + FACE[1] * -0.2));
    block.rotation.y = 0.6;
    camp.add(block);
    // dock
    const dockYaw = yawUV(...FACE);
    const dock = K.mesh(A.dockGeometry({ len: DOCK.len, width: 0.62, deck: 0.2, bottom: -0.9 }), woodM);
    dock.position.copy(at(...DOCK.at));
    dock.position.y = 0;
    dock.rotation.y = dockYaw;
    camp.add(dock);
    // fire ring and chairs
    const fireP = at(...FIRE);
    const ring = K.mesh(C.fireRing(rand, { r: 0.36 }), toon('#ffffff', { vertexColors: true, noise: 0.15, noiseScale: 6, snow: 0.7 }));
    ring.position.copy(fireP);
    ring.userData.keep = true; // stays its own mesh so a click on it stokes the fire
    camp.add(ring);
    const chairM = toon('#ffffff', { vertexColors: true, noise: 0.06, snow: 0.8 });
    for (const [du, dv, color] of [[-0.52, -0.62, '#c8412f'], [0.56, -0.6, '#e2b23a']]) {
      const ch = K.mesh(A.muskokaChair(color), chairM);
      ch.position.copy(at(FIRE[0] + du, FIRE[1] + dv));
      ch.rotation.y = yawUV(-du, -dv);
      ch.scale.setScalar(1.15);
      camp.add(ch);
    }
    {
      const sitLog = K.mesh(C.logGeometry(rand, { len: 0.8, r: 0.1 }), woodM);
      sitLog.position.copy(at(FIRE[0] - 0.05, FIRE[1] + 0.7, 0.09));
      sitLog.rotation.y = yawUV(1, -0.15);
      camp.add(sitLog);
    }
    K.mergeGroup(camp);
    root.add(camp);
    // cedar canoe tied alongside the end of the dock
    const canoe = new THREE.Group();
    const canoeMesh = K.mesh(C.canoe({ L: 1.75, B: 0.44, D: 0.19, hull: '#cf8b3c', inner: '#b5743a', rim: '#4a3122', wood: '#dcae6e' }), toon('#ffffff', { vertexColors: true, noise: 0.06 }));
    canoe.add(canoeMesh);
    {
      const along = DOCK.len * 0.6;
      const cu = DOCK.at[0] + FACE[0] * along + S2 * 0.56, cv = DOCK.at[1] + FACE[1] * along + S2 * 0.56;
      const [x, z] = toXZ(cu, cv);
      canoe.position.set(x, WATER - 0.05, z);
      canoe.rotation.y = dockYaw + 0.06;
    }
    root.add(canoe);

    // the fire itself
    const flame = C.flame({ width: 0.9, height: 0.85 });
    flame.material.uniforms.uOrigin.value.copy(fireP).add(new THREE.Vector3(0, 0.05, 0));
    root.add(flame);
    const sparkFX = C.sparks(fireP.clone().add(new THREE.Vector3(0, 0.35, 0)));
    root.add(sparkFX);
    const coals = C.embers(fireP, rand, { r: 0.26 });
    root.add(coals);
    const fsmoke = C.fireSmoke(fireP.clone().add(new THREE.Vector3(0, 0.8, 0)));
    root.add(fsmoke);
    const fireLight = new THREE.PointLight('#ff8a3a', 0, 8.5, 2);
    fireLight.position.copy(fireP).add(new THREE.Vector3(0, 0.55, 0));
    root.add(fireLight);
    const coalLight = new THREE.PointLight('#ff6a24', 0, 2.2, 2);
    coalLight.position.copy(fireP).add(new THREE.Vector3(0, 0.18, 0));
    root.add(coalLight);

    // ------------------------------------------------------------ the bear
    const bear = A.bearRig({});
    const BEAR_SCALE = 1.45;
    bear.group.scale.setScalar(BEAR_SCALE);
    root.add(bear.group);
    const spots = {};
    for (const [k, s] of Object.entries(BEAR_SPOTS)) {
      const [x, z] = toXZ(...s.uv);
      spots[k] = { ...s, key: k, x, z };
    }
    const T0 = env.time;
    const Bz = {
      x: spots.fish.x, z: spots.fish.z, yaw: 0, spot: spots.fish, state: 'fish', t0: T0, dur: 13 + Math.random() * 4,
      target: null, nextSwipe: T0 + 2.5, swipeT: -100, lungeDir: null, faceYaw: null, caught: false, fx: 0,
    };
    const pose = bear.pose;
    const want = { walk: 0, rear: 0, sit: 0, crouch: 0, pitch: 0, yaw: 0, jaw: 0, paws: 0, swipe: 0, wiggle: 0 };
    const RATE = { walk: 6, rear: 5, sit: 3, crouch: 7, pitch: 6, yaw: 3, jaw: 12, paws: 6, swipe: 16, wiggle: 8 };
    // which way is open water from here (deepest ground within reach)
    const waterDir = (x, z) => {
      let best = 0, bh = Infinity;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const h = ground(x + Math.cos(a) * 0.7, z - Math.sin(a) * 0.7) + ground(x + Math.cos(a) * 1.2, z - Math.sin(a) * 1.2);
        if (h < bh) { bh = h; best = a; }
      }
      return best;
    };
    // the bear looks at the camera with a three-quarter turn
    const CAM_YAW = yawUV(0.45, 1);
    const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
    const startWalk = (to, t) => {
      Bz.state = 'walk';
      Bz.t0 = t;
      Bz.target = to;
    };
    const arrive = (t) => {
      const s = Bz.target;
      Bz.spot = s;
      Bz.state = s.act;
      Bz.t0 = t;
      Bz.faceYaw = null;
      Bz.caught = false;
      Bz.dur = { fish: 12 + Math.random() * 6, sniff: 3 + Math.random() * 1.5, sit: 6 + Math.random() * 4, scratch: 4.2, look: 2.6 + Math.random() * 1.5, drink: 3.2 + Math.random() }[s.act] || 3;
      Bz.nextSwipe = t + 2 + Math.random() * 2;
      if (s.act === 'sniff') A.sfx.sniff(audio, { delay: 0.2 });
    };
    const nextSpot = () => {
      const opts = Bz.spot.next;
      const pickK = Math.random() < 0.35 && Bz.spot.key !== 'fish' && opts.includes('fish') ? 'fish' : opts[Math.floor(Math.random() * opts.length)];
      return spots[pickK];
    };
    const birds = A.flock(16);
    root.add(birds.lines);
    const rip = C.ripples(8);
    root.add(rip.group);
    const spl = C.splash(46);
    root.add(spl.points);
    const nosePos = new THREE.Vector3();
    const noseWorld = () => {
      bear.group.updateMatrixWorld(true);
      return nosePos.set(0.36, -0.03, 0).applyMatrix4(bear.neck.matrixWorld);
    };
    let fishGlow = 0;
    function bearRoar(t) {
      if (Bz.state === 'roar' || Bz.state === 'pounce') return;
      Bz.state = 'roar';
      Bz.t0 = t;
      Bz.fx = 0;
      Bz.roarYaw = Bz.yaw + clamp(angDiff(CAM_YAW, Bz.yaw), -1.2, 1.2);
    }

    // ------------------------------------------------------------ lake life and air
    const sparkle = C.lakeSparkle({ size: SIZE });
    root.add(sparkle);
    const mist = C.mist({ size: SIZE });
    root.add(mist.group);
    const fishJump = K.mesh(A.fishGeometry(0.24), toon('#ffffff', { vertexColors: true, noise: 0 }));
    fishJump.visible = false;
    root.add(fishJump);
    const jump = { t0: -100, x: 0, z: 0, yaw: 0 };
    // cloud banks along the front of the range (bad weather), a low band over the forest (fog)
    const crestDir = (u) => {
      for (let i = 0; i < CREST.length - 1; i++) {
        const [au, av] = CREST[i], [bu, bv] = CREST[i + 1];
        if (u >= au && u <= bu) return yawUV(bu - au, bv - av);
      }
      return 0;
    };
    const clouds = A.mountainClouds([
      [-5.6, 1.15, 3.1, 1.15, 0.3, 'collar'], [-2.6, 1.0, 4.3, 1.2, 0.3, 'collar'], [1.0, 1.05, 4.0, 1.2, 0.45, 'collar'],
      [4.6, 1.0, 3.6, 1.2, 0.3, 'collar'], [7.8, 1.2, 2.6, 1.0, 0.55, 'collar'], [-8.4, 1.3, 2.2, 0.95, 0.6, 'collar'],
      [-0.6, 1.5, 5.6, 0.95, 0.88, 'collar'],
      [-5.0, 2.2, 1.5, 1.2, 0.25, 'fog'], [0.4, 1.0, 2.1, 1.25, 0.3, 'fog'], [5.6, 2.0, 1.6, 1.15, 0.25, 'fog'],
    ].map(([u, off, y, sc, th, kind], i) => {
      const [x, z] = toXZ(u, crestV(u) + off + (kind === 'fog' ? 1.2 : 0));
      return { x, y, z, s: sc, ry: crestDir(u), ph: i * 1.7, th, kind };
    }), rand);
    root.add(clouds.group);

    // fills: dusky rose after sundown, moon blue at night (the engine's moon key is low and blue)
    const nightFill = new THREE.DirectionalLight('#8ea4e6', 0);
    nightFill.position.set(6, 9, 10);
    root.add(nightFill);
    const fillNight = new THREE.Color('#8ea4e6'), fillDusk = new THREE.Color('#e0a0a6');
    const WHITE = new THREE.Color(1, 1, 1);
    const warm = new THREE.Color('#ffc09a');
    const mistColor = new THREE.Color();
    const rippleLight = new THREE.Color();
    const fallsLight = new THREE.Color();
    const nightBlue = new THREE.Color('#8fb0f0');
    const ALP = { gold: new THREE.Color('#ffb064'), pink: new THREE.Color('#ff7a7e'), violet: new THREE.Color('#cf78c0') };
    const alpCol = new THREE.Color();
    const birdNight = new THREE.Color(0.32, 0.35, 0.48);
    const cloudTint = new THREE.Color(), fogTint = new THREE.Color(), stormGrey = new THREE.Color('#9aa3b3');

    const fallsSound = A.noiseBed(audio, { type: 'bandpass', freq: 1100, q: 0.5 });
    const info = {
      size: SIZE, top: T.max, bottom: BASE,
      surfaceAt: (x, z) => Math.max(ground(x, z), WATER),
      // fireflies only over the meadow by the cabin
      isLand: (x, z) => {
        const [u, v] = toUV(x, z);
        return ground(x, z) > 0.25 && Math.hypot(u - CABIN[0], v - CABIN[1]) < 3.2;
      },
    };

    // ------------------------------------------------------------ state
    let stoke = 0, stokeAt = -100;
    let alpBoost = 0, alpAt = -100;
    let nextFish = T0 + 5, nextJump = T0 + 9, nextBugle = T0 + 40;
    const lastSky = [-1, -1];
    function doStoke(t) {
      stoke = 1;
      stokeAt = t;
      sparkFX.material.uniforms.uBurst.value = t;
      audio.play('whoosh', { dur: 1.3, gain: 0.55 });
      for (let i = 0; i < 6; i++) audio.play('spark', { delay: 0.05 + i * 0.16 + Math.random() * 0.1 });
    }
    function alpenglow(e, a) {
      alpAt = e.time;
      if (e.weather !== 'clear') e.setWeather('clear');
      const h = e.hour;
      if (!(h > 18.9 && h < 19.6)) e.goToHour(19.3, 9);
      a.play('chord', { notes: [52, 59, 64, 66, 71], dur: 7, gain: 0.03 });
      A.sfx.bugle(a, { delay: 2.2 });
    }

    return {
      root,
      info,
      actions: [
        { id: 'bear', label: 'Bear', icon: ICONS.bear, run: (e) => bearRoar(e.time), active: () => Bz.state === 'roar' || Bz.state === 'pounce' || Bz.state === 'eat' },
        { id: 'fire', label: 'Fire', icon: ICONS.fire, run: (e) => doStoke(e.time), active: () => stoke > 0.15 },
        { id: 'alpenglow', label: 'Alpenglow', icon: ICONS.alpenglow, run: (e, a) => alpenglow(e, a), active: () => alpen.uAlpen.value.r > 0.25 },
      ],
      onClick(raycaster, e) {
        const hits = raycaster.intersectObjects([bear.group, ring], true);
        if (!hits.length) return;
        let o = hits[0].object;
        while (o && o !== bear.group && o !== ring) o = o.parent;
        if (o === bear.group) bearRoar(e.time);
        else if (o === ring) doStoke(e.time);
      },
      dispose() {
        fallsSound.dispose();
      },
      debug: { heightUV, lakeField, mountain, gUV, toUV, toXZ, Bz, bear, spots },
      update(t, dt, e) {
        const W = e.cur;
        K.updateLamps(lights, e);

        // ---- fire
        stoke *= Math.exp(-dt / 3.4);
        const damp = 1 - 0.35 * W.rain - 0.15 * W.snow;
        const fl = 1 + 0.16 * Math.sin(t * 13.1) * Math.sin(t * 7.3 + 1.3) + 0.09 * Math.sin(t * 23.7 + 0.4) + 0.07 * (Math.random() - 0.5);
        const power = damp * (1 + 1.3 * stoke);
        const dark = 0.25 + 0.75 * Math.max(e.night, e.lamps * 0.8);
        const flare = Math.exp(-Math.max(0, t - stokeAt) * 5);
        fireLight.intensity = 7.0 * dark * power * fl * (1 + 1.4 * flare);
        coalLight.intensity = 2.2 * dark * (0.8 + 0.4 * stoke) * fl;
        const fu = flame.material.uniforms;
        fu.uH.value = (0.82 + 0.07 * Math.sin(t * 3.3)) * damp * (1 + 1.2 * stoke);
        fu.uW.value = 0.88 * (1 + 0.3 * stoke);
        fu.uBright.value = (0.55 + 0.45 * dark) * (0.85 + 0.15 * fl) + 0.25 * stoke;
        const su = sparkFX.material.uniforms;
        su.uRate.value = (0.28 + 0.72 * stoke) * damp;
        su.uLift.value = 1 + 0.9 * stoke;
        coals.material.uniforms.uHeat.value = 0.85 + 0.35 * stoke;
        const sm = fsmoke.material.uniforms;
        sm.uOn.value = (0.35 + 0.55 * e.daylight) * (1 + 0.4 * W.rain) + 0.35 * stoke;
        sm.uColor.value.setRGB(0.52, 0.53, 0.56).multiplyScalar(0.25 + 0.75 * e.daylight);
        sm.uGlow.value.setRGB(0.9, 0.4, 0.12).multiplyScalar((0.35 + 0.4 * stoke) * e.night);
        audio.setLoop('fire', clamp((0.32 + 0.62 * stoke) * (1 - 0.3 * W.rain), 0, 1));

        // ---- bear behaviour
        for (const k in want) want[k] = 0;
        const k = t - Bz.t0;
        let speed = 0;
        if (Bz.state === 'walk') {
          const dx = Bz.target.x - Bz.x, dz = Bz.target.z - Bz.z;
          const dist = Math.hypot(dx, dz);
          const goal = Math.atan2(-dz, dx);
          const d = angDiff(goal, Bz.yaw);
          Bz.yaw += clamp(d, -dt * 2.2, dt * 2.2);
          if (Math.abs(d) < 0.7) speed = Math.min(0.36, dist * 1.5 + 0.08);
          want.walk = 1;
          want.pitch = 0.18;
          if (dist < 0.06) arrive(t);
        } else if (Bz.state === 'fish') {
          const face = Bz.faceYaw ?? (Bz.faceYaw = Bz.spot.face ? yawUV(...Bz.spot.face) : waterDir(Bz.x, Bz.z));
          Bz.yaw += clamp(angDiff(face, Bz.yaw), -dt * 1.8, dt * 1.8);
          want.pitch = 0.62;
          want.yaw = Math.sin(t * 0.7) * 0.25;
          if (t > Bz.nextSwipe) {
            Bz.swipeT = t;
            Bz.nextSwipe = t + 3 + Math.random() * 3;
          }
          const sk = t - Bz.swipeT;
          if (sk >= 0 && sk < 0.7) {
            want.swipe = sk < 0.28 ? 1 : 0;
            want.crouch = 0.5;
            want.pitch = 0.9;
            if (sk > 0.3 && Bz.fx !== Bz.swipeT) {
              Bz.fx = Bz.swipeT;
              const p = noseWorld();
              spl.fire(new THREE.Vector3(p.x, WATER, p.z), t, 0.55);
              rip.ring(p.x, p.z, t, 0.9, 1.6);
              A.sfx.splash(audio, { gain: 0.5 });
              if (!Bz.caught && Math.random() < 0.2) { Bz.caught = true; Bz.state = 'eat'; Bz.t0 = t + 0.2; bear.fish.visible = true; fishGlow = 1; }
            }
          }
          if (k > Bz.dur && Bz.state === 'fish') { Bz.faceYaw = null; startWalk(nextSpot(), t); }
        } else if (Bz.state === 'sniff') {
          want.pitch = 0.85;
          want.yaw = Math.sin(t * 2.3) * 0.35;
          want.jaw = Math.max(0, Math.sin(t * 15)) * 0.12;
          if (k > Bz.dur) startWalk(nextSpot(), t);
        } else if (Bz.state === 'sit') {
          want.sit = 1;
          want.yaw = Math.sin(t * 0.45) * 0.7;
          want.pitch = -0.1 + Math.sin(t * 0.3) * 0.1;
          if (k > Bz.dur) startWalk(nextSpot(), t);
        } else if (Bz.state === 'drink') {
          const face = Bz.faceYaw ?? (Bz.faceYaw = Bz.spot.face ? yawUV(...Bz.spot.face) : waterDir(Bz.x, Bz.z));
          Bz.yaw += clamp(angDiff(face, Bz.yaw), -dt * 1.8, dt * 1.8);
          want.pitch = 1.05;
          want.crouch = 0.6;
          want.jaw = Math.max(0, Math.sin(t * 9)) * 0.25;
          if (k > Bz.dur) { Bz.faceYaw = null; startWalk(nextSpot(), t); }
        } else if (Bz.state === 'look') {
          Bz.yaw += clamp(angDiff(CAM_YAW, Bz.yaw), -dt * 1.5, dt * 1.5);
          want.pitch = -0.25;
          want.yaw = Math.sin(k * 1.2) * 0.25;
          if (k > Bz.dur) startWalk(nextSpot(), t);
        } else if (Bz.state === 'scratch') {
          // back to the trunk, up on the hind legs, shimmy
          const tr = BEAR_SPOTS.tree.uv;
          const [tx, tz] = toXZ(tr[0] - 0.32, tr[1] - 0.3);
          const away = Math.atan2(-(Bz.z - tz), Bz.x - tx);
          Bz.yaw += clamp(angDiff(away, Bz.yaw), -dt * 2, dt * 2);
          const up = K.smoothstep(0.3, 1.0, k) * (1 - K.smoothstep(Bz.dur - 0.7, Bz.dur, k));
          want.rear = 0.82 * up;
          want.wiggle = Math.sin(t * 9) * up;
          want.pitch = -0.2 * up;
          want.jaw = 0.25 * up;
          if (k > Bz.dur) startWalk(nextSpot(), t);
        } else if (Bz.state === 'roar') {
          // up on the hind legs facing the camera, roar, birds burst out of the trees, drop back down
          Bz.yaw += clamp(angDiff(Bz.roarYaw, Bz.yaw), -dt * 3, dt * 3);
          const up = K.smoothstep(0.05, 0.5, k) * (1 - K.smoothstep(2.05, 2.45, k));
          want.rear = up;
          want.paws = K.smoothstep(0.35, 0.7, k) * (1 - K.smoothstep(1.8, 2.2, k));
          want.jaw = K.smoothstep(0.45, 0.6, k) * (1 - K.smoothstep(1.85, 2.05, k));
          want.pitch = -0.35 * up;
          if (k > 0.42 && Bz.fx < 1) {
            Bz.fx = 1;
            bear.fish.visible = false;
            A.sfx.roar(audio, {});
            // the flock bursts out of the spruces behind the bear and wheels away across the lake
            const from = at(-4.6, -1.75, 1.3);
            const [ax, az] = toXZ(-0.75, -0.25), [bx, bz] = toXZ(0.85, 0.6);
            birds.launch(from, [new THREE.Vector3(ax, 1.25, az), new THREE.Vector3(bx, 0.55, bz)], t + 0.15);
            A.sfx.wings(audio, { delay: 0.2 });
          }
          if (k > 2.4 && Bz.fx < 2) {
            Bz.fx = 2;
            A.sfx.thump(audio, {});
            const p = noseWorld();
            if (ground(p.x, p.z) < WATER) {
              spl.fire(new THREE.Vector3(p.x, WATER, p.z), t, 0.8);
              rip.ring(p.x, p.z, t, 1.3, 2.0);
              A.sfx.splash(audio, { gain: 0.6, delay: 0.02 });
            }
          }
          if (k > 2.55) {
            Bz.t0 = t;
            Bz.fx = 0;
            Bz.state = 'pounce';
            // pounce sideways-on to the camera (the lake lies to the right of its shore), else toward open water
            const side = yawUV(1, 0.25);
            Bz.lungeDir = ground(Bz.x + Math.cos(side) * 0.6, Bz.z - Math.sin(side) * 0.6) < WATER - 0.02 ? side : waterDir(Bz.x, Bz.z);
            if (ground(Bz.x + Math.cos(Bz.lungeDir) * 0.75, Bz.z - Math.sin(Bz.lungeDir) * 0.75) > WATER - 0.02) {
              // too far from the water for a fish: a proud look at the camera instead
              Bz.state = 'look';
              Bz.dur = 2.4;
              Bz.spot = Bz.spot || spots.fish;
            }
          }
        } else if (Bz.state === 'pounce') {
          // turn to the water, crouch, lunge, nose under, come up with a fish
          Bz.yaw += clamp(angDiff(Bz.lungeDir, Bz.yaw), -dt * 4, dt * 4);
          want.crouch = k < 0.45 ? 0.8 : k < 1.2 ? 1 : 0.2;
          want.pitch = k < 0.45 ? 0.4 : k < 1.15 ? 1.15 : 0.1;
          want.jaw = k > 0.5 && k < 1.0 ? 0.7 : 0;
          want.swipe = k > 0.45 && k < 0.62 ? 1 : 0;
          if (k > 0.45 && k < 0.75) speed = 0.9;
          if (k > 0.62 && Bz.fx < 1) {
            Bz.fx = 1;
            const p = noseWorld();
            spl.fire(new THREE.Vector3(p.x, WATER, p.z), t, 1.15);
            rip.ring(p.x, p.z, t, 1.5, 2.2);
            rip.ring(p.x, p.z, t + 0.25, 0.9, 1.8);
            A.sfx.splash(audio, { gain: 1 });
          }
          if (k > 1.15 && !bear.fish.visible) {
            bear.fish.visible = true;
            fishGlow = 1;
            A.sfx.plop(audio, { gain: 0.6 });
          }
          if (k > 1.45) { Bz.state = 'eat'; Bz.t0 = t; }
        } else if (Bz.state === 'eat') {
          // proud head shake with the fish, then sit down in the shallows and eat it
          const shake = k > 0 && k < 1.1 ? Math.sin(k * 22) * 0.35 * (1 - k / 1.1) : 0;
          want.yaw = shake;
          const sat = K.smoothstep(1.1, 1.8, k);
          want.sit = sat;
          want.rear = 0.28 * sat;
          want.paws = 0.62 * sat;
          want.pitch = k < 1.1 ? -0.2 : 0.42 + Math.sin(k * 6) * 0.08;
          want.jaw = k > 1.8 ? Math.max(0, Math.sin(k * 7)) * 0.35 : 0;
          if (k > 5.5) bear.fish.visible = false;
          if (k > 6.6) startWalk(nextSpot(), t);
        }
        if (speed > 0) {
          Bz.x += Math.cos(Bz.yaw) * speed * dt;
          Bz.z -= Math.sin(Bz.yaw) * speed * dt;
        }
        for (const key in want) pose[key] += (want[key] - pose[key]) * (1 - Math.exp(-dt * RATE[key]));
        pose.phase += dt * speed * 15;
        pose.bob = Math.abs(Math.sin(pose.phase)) * 0.018 * pose.walk;
        bear.apply(pose, t);
        bear.group.position.set(Bz.x, Math.max(ground(Bz.x, Bz.z), -0.3), Bz.z);
        bear.group.rotation.y = Bz.yaw;
        if (bear.fish.visible) {
          bear.fish.rotation.z = Math.sin(t * 17) * 0.35;
          bear.fish.rotation.x = Math.sin(t * 11) * 0.25;
        }
        fishGlow = Math.max(0, fishGlow - dt * 1.6);
        setGlow(bear.fishMat, fishGlow * 3.2);
        setGlow(bear.eyeMat, K.smoothstep(0.55, 0.95, e.night) * (0.55 + 0.45 * Math.min(1, fireLight.intensity / 6)));
        birds.update(t, dt);
        birds.color.setRGB(0.15, 0.16, 0.2).lerp(birdNight, e.night);
        const rl = rippleLight.setRGB(0.85, 0.95, 0.95).multiplyScalar(0.3 + 0.7 * e.daylight);
        rip.update(t, rl);
        spl.color.copy(rl).multiplyScalar(1.1);

        // ---- lake: fish rising, a trout jumping now and then
        if (t > nextFish) {
          nextFish = t + 4 + Math.random() * 7;
          if (W.rain < 0.2 && W.wind < 0.6) {
            for (let i = 0; i < 8; i++) {
              const x = (Math.random() - 0.5) * SIZE * 0.8, z = (Math.random() - 0.5) * SIZE * 0.8;
              if (ground(x, z) < -0.5) { rip.ring(x, z, t, 0.7, 1.6); break; }
            }
          }
        }
        if (t > nextJump) {
          nextJump = t + 9 + Math.random() * 10;
          if (W.rain < 0.3 && e.daylight > 0.3) {
            for (let i = 0; i < 8; i++) {
              const u = -2.5 + Math.random() * 5, v = 1 + Math.random() * 5;
              const [x, z] = toXZ(u, v);
              if (ground(x, z) < -0.6) { Object.assign(jump, { t0: t, x, z, yaw: Math.random() * 6.28 }); break; }
            }
          }
        }
        {
          const jk = (t - jump.t0) / 0.75;
          fishJump.visible = jk >= 0 && jk <= 1;
          if (fishJump.visible) {
            const dx = Math.cos(jump.yaw) * 0.45, dz = -Math.sin(jump.yaw) * 0.45;
            fishJump.position.set(jump.x + dx * (jk - 0.5), WATER + Math.sin(jk * Math.PI) * 0.42, jump.z + dz * (jk - 0.5));
            fishJump.rotation.set(0, jump.yaw, (0.5 - jk) * 2.2);
            if (!jump.splashed && jk > 0.02) { jump.splashed = 1; rip.ring(jump.x - dx * 0.5, jump.z - dz * 0.5, t, 0.6, 1.4); A.sfx.plop(audio, { gain: 0.4 }); }
            if (jump.splashed === 1 && jk > 0.96) { jump.splashed = 2; rip.ring(jump.x + dx * 0.5, jump.z + dz * 0.5, t, 0.8, 1.6); spl.fire(new THREE.Vector3(jump.x + dx * 0.5, WATER, jump.z + dz * 0.5), t, 0.4); A.sfx.plop(audio, { gain: 0.5, delay: 0.02 }); }
          } else jump.splashed = 0;
        }

        // ---- canoe bob
        canoe.position.y = WATER - 0.05 + Math.sin(t * 1.3) * 0.025 * (1 + W.wind);
        canoe.rotation.z = Math.sin(t * 1.1) * 0.04 * (1 + W.wind);

        // ---- waterfall light and sound
        // by day it takes the light, by night it catches the moon: a cool glow against the warm cabin
        fallsLight.copy(nightBlue).lerp(WHITE, e.daylight).multiplyScalar((0.8 + 0.2 * e.daylight) * (1 + 0.55 * e.post.moon) * (1 - 0.35 * W.clouds * e.night));
        falls.uniforms.uLight.value.copy(fallsLight);
        fallSpray.uniforms.uColor.value.copy(fallsLight);
        falls.uniforms.uFlow.value = 1 + 0.3 * W.rain;
        fallsSound.set(0.16 + 0.06 * W.rain, dt);

        // ---- alpenglow: the peaks catch the last light after the valley falls into shade
        const hr = e.hour;
        const eve = K.smoothstep(18.55, 19.15, hr) * (1 - K.smoothstep(19.75, 20.4, hr));
        const morn = K.smoothstep(5.0, 5.6, hr) * (1 - K.smoothstep(6.3, 6.9, hr));
        alpBoost = Math.max(0, 1 - (t - alpAt) / 14);
        const glowAmt = Math.max(eve, morn * 0.8) * (1 - 0.85 * W.clouds) * (1 - W.fog) * (1 + 0.45 * alpBoost);
        const ph = hr > 12 ? K.smoothstep(18.6, 19.9, hr) : 1 - K.smoothstep(5.2, 6.6, hr);
        alpCol.copy(ALP.gold).lerp(ALP.pink, K.smoothstep(0, 0.5, ph)).lerp(ALP.violet, K.smoothstep(0.55, 1, ph));
        alpen.uAlpen.value.copy(alpCol).multiplyScalar(glowAmt * 1.5);

        // ---- weather in the mountains: clouds cling to the peaks
        // weather snapped instantly (scene load, review tools): snap the banks too instead of easing them
        const snapClouds = Math.abs(W.clouds - lastSky[0]) > 0.2 || Math.abs(W.fog - lastSky[1]) > 0.2;
        lastSky[0] = W.clouds;
        lastSky[1] = W.fog;
        clouds.update(t, dt, { collar: W.clouds * (1 - 0.6 * W.fog) - 0.1 * W.snow, fog: W.fog * 1.1 }, snapClouds);
        cloudTint.copy(WHITE).lerp(stormGrey, Math.min(1, W.rain * 0.55 + W.storm * 0.5)).lerp(fogTint.copy(e.post.fogColor).lerp(WHITE, 0.62), W.fog);
        clouds.material.color.copy(cloudTint).multiplyScalar(0.32 + 0.68 * e.daylight);

        // ---- lake sparkle, mist
        const ku = sparkle.material.uniforms;
        ku.uMoon.value = e.post.moon;
        ku.uStars.value = e.post.stars;
        ku.uMoonPos.value.copy(e.post.moonPos);
        ku.uAurora.value = e.post.aurora;
        const dawn = K.smoothstep(4.6, 5.8, hr) * (1 - K.smoothstep(7.8, 9.4, hr));
        const amount = clamp(Math.max(W.fog * 1.2, dawn * 0.7) * (1 - W.rain * 0.7) * (1 - W.storm), 0, 1);
        mistColor.copy(e.post.fogColor).lerp(WHITE, 0.35).lerp(warm, dawn * 0.3 * e.daylight).multiplyScalar(0.45 + 0.75 * e.daylight);
        mist.set(amount, mistColor);

        // ---- fill light and grade
        const duskF = Math.max(K.smoothstep(17.9, 19.0, hr) * (1 - K.smoothstep(20.2, 21.4, hr)), K.smoothstep(4.8, 5.6, hr) * (1 - K.smoothstep(6.8, 7.9, hr)));
        nightFill.intensity = Math.max(K.smoothstep(0.15, 0.9, e.night) * 0.5, duskF * 0.45) * (1 - 0.42 * W.clouds) * (1 - 0.5 * W.fog);
        nightFill.color.copy(fillDusk).lerp(fillNight, K.smoothstep(0.45, 0.95, e.night));
        e.post.tint.lerp(WHITE, 0.32 * e.night);

        // ---- the odd elk bugle at dusk, birds by day handled by the engine
        if (t > nextBugle) {
          nextBugle = t + 45 + Math.random() * 40;
          if (hr > 17.5 && hr < 21.5 && W.rain < 0.3) A.sfx.bugle(audio, { gain: 0.7 });
        }
      },
    };
  },
};
