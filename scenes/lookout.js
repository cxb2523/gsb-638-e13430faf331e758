import * as THREE from 'three';
import * as K from './kit.js';
import { toon, setGlow } from '../engine/materials.js';
import { person, walker } from './kit-people.js';
import * as P from './lookout-parts.js';

// Lookout: a fire lookout on a granite summit above a sea of clouds. No diorama block here,
// the summit rises out of a rolling cloud sea that hides everything below.
// Actions: Clouds (the sea surges up around the summit and rolls back), Lantern (cab light).

const { toUV, toXZ, ease } = P;
const WIND = [-0.8, 0.42]; // blows to the left of the default view, so the flag streams clear of the tower
const PAD = [0.3, -0.7]; // tower pad (u, v)
const STEP = 0.3;
const PAD_H = 6.0;
// behind the summit the cloud sea falls away, which keeps the horizon low in the orthographic view
const V0 = -7, KC = 0.45;
const deckY = (v) => (v < V0 ? -KC * (V0 - v) : 0);
const TRAIL = [[5.6, 7.2], [4.7, 4.9], [5.3, 2.9], [3.8, 1.9], [2.6, 0.95], [1.95, -0.15]];
const RAIL = [[6.3, 6.9], [5.4, 4.85], [6.0, 2.7], [4.15, 2.5], [3.05, 1.55], [2.5, 0.5]];
const TIDE_H = 3.3, TIDE_LEN = 12.5;
const GREY_RAIN = new THREE.Color('#a9b0c2'), GREY_STORM = new THREE.Color('#646b7c');
const SUN_GOLD = new THREE.Color('#ffc46a');
const SKY_VIOLET = new THREE.Color('#3a2580'), SKY_GOLD = new THREE.Color('#ffc277'), SKY_NIGHT = new THREE.Color('#2b1f5c');

function segInfo(px, pz, [ax, az], [bx, bz]) {
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (L * L)));
  return [Math.hypot(px - ax - dx * t, pz - az - dz * t), t * L, L];
}
const TRAIL_S = [0];
for (let i = 0; i < TRAIL.length - 1; i++) TRAIL_S.push(TRAIL_S[i] + Math.hypot(TRAIL[i + 1][0] - TRAIL[i][0], TRAIL[i + 1][1] - TRAIL[i][1]));
const TRAIL_LEN = TRAIL_S[TRAIL_S.length - 1];
/** [distance to the trail, distance along it] */
const trailAt = (u, v) => {
  let best = [Infinity, 0];
  for (let i = 0; i < TRAIL.length - 1; i++) {
    const [d, s] = segInfo(u, v, TRAIL[i], TRAIL[i + 1]);
    if (d < best[0]) best = [d, TRAIL_S[i] + s];
  }
  return best;
};
const trailDist = (u, v) => trailAt(u, v)[0];

const ICON_CLOUDS = [
  '....#....',
  '...###...',
  '..#.#.#..',
  '....#....',
  '.##...##.',
  '####.####',
  '#########',
  '.........',
  '#.##.##.#',
];
const ICON_LANTERN = [
  '...###...',
  '..#...#..',
  '.#######.',
  '.#.....#.',
  '.#..#..#.',
  '.#.###.#.',
  '.#.....#.',
  '.#######.',
  '...###...',
];

export default {
  name: 'Lookout',
  view: { target: [0.3, 4.2, 0.3], size: 15.2, azimuth: 45, elevation: 30 },
  look: { levels: 16, exposure: 1.1, saturation: 1.24, contrast: 1.08, bloom: 1.1, vignette: 0.26, outline: 0.42, highlight: 0.34, dither: 0.5 },
  env: { hour: 18.4, weather: 'clear' },
  audio: { water: 0, birds: 0.3, crickets: 0.35, foghorn: 0 },
  sky: { moon: 1, milky: 1, moonPos: [0.17, 0.8] },
  wind: WIND,
  actionsLabel: 'Lookout',

  create({ env, audio }) {
    const root = new THREE.Group();
    const rand = K.rng(1931);
    const n1 = K.noise2(5), n2 = K.noise2(9), n3 = K.noise2(17), n4 = K.noise2(23);

    // ------------------------------------------------------------ summit shape
    // the summit is a stack of irregular granite blocks: broad ledges, banded cliffs between them
    const BLOCKS = [
      // centre u, v, radius, top, outline seed
      [0.3, -0.7, 2.75, 6.0, 1],
      [0.9, 0.15, 4.4, 4.5, 2],
      [-0.7, 0.8, 5.9, 2.95, 3],
      [0.5, 0.4, 7.0, 1.35, 4],
      [-4.9, 0.6, 2.3, 3.9, 5], // left knob with the tor
      [4.6, -3.3, 1.75, 5.4, 6], // pinnacle behind the right shoulder
      [6.4, -0.6, 3.3, 2.5, 7], // right ridge
      [-7.3, -1.3, 3.1, 1.9, 8], // left ridge
      [9.6, -2.6, 2.4, 1.2, 9],
    ].map(([cu, cv, r, top, seed]) => {
      const pr = K.rng(seed * 13);
      return { cu, cv, r, top, ph: [pr() * 6.3, pr() * 6.3, pr() * 6.3], amp: [0.12 + pr() * 0.08, 0.07 + pr() * 0.05, 0.05] };
    });
    const raw = (u, v) => {
      let h = -3;
      for (const b of BLOCKS) {
        const du = u - b.cu, dv = v - b.cv;
        const a = Math.atan2(dv, du);
        const R = b.r * (1 + b.amp[0] * Math.sin(3 * a + b.ph[0]) + b.amp[1] * Math.sin(5 * a + b.ph[1]) + b.amp[2] * Math.sin(11 * a + b.ph[2]));
        const d = Math.hypot(du, dv);
        if (d > R) continue;
        // ledges tip slightly toward the camera and crumble near their rims
        let t = b.top - 0.12 * (v - b.cv) + (n2(u * 0.55 + b.cu, v * 0.55) - 0.5) * 0.55;
        const rim = K.smoothstep(R - 0.75, R, d);
        t -= rim * (n4(u * 0.8 + b.cv, v * 0.8) > 0.55 ? 0.6 : 0.0);
        h = Math.max(h, t);
      }
      return h;
    };
    const shaped = (u, v) => {
      let h = Math.min(raw(u, v), PAD_H - 0.3);
      const d = Math.hypot(u - PAD[0], v - PAD[1]);
      h += (PAD_H - h) * (1 - K.smoothstep(2.3, 2.9, d));
      // the trail is cut into the slope as a ramp, so it climbs in even steps
      const [td, ts] = trailAt(u, v);
      if (td < 1.0) {
        const th = -0.5 + (PAD_H + 0.5) * Math.pow(ts / TRAIL_LEN, 0.95);
        h += (th - h) * (1 - K.smoothstep(0.42, 0.95, td));
      }
      return h;
    };
    const slope = (u, v) => {
      const e = 0.42;
      return Math.max(Math.abs(shaped(u + e, v) - shaped(u - e, v)), Math.abs(shaped(u, v + e) - shaped(u, v - e))) / (2 * e);
    };
    const classify = (u, v, h) => {
      if (Math.hypot(u - PAD[0], v - PAD[1]) < 2.35) return 'pad';
      if (trailDist(u, v) < 0.45 && h > -0.2) return 'trail';
      const sl = slope(u, v);
      const shade = K.smoothstep(1.5, -3.5, u - PAD[0]) + K.smoothstep(0, -3, v - PAD[1]) * 0.6;
      const sn = n3(u * 0.38, v * 0.38) + (n2(u * 0.9, v * 0.9) - 0.5) * 0.12;
      if (h > 1.2 && sl < 1.6 && sn > 0.7 - 0.18 * shade - 0.03 * (h / 6)) return 'snow';
      if (sl < 0.9 && h < 5.6 && h > -0.1 && n1(u * 0.35 + 3, v * 0.35) > 0.2) return 'grass';
      return 'rock';
    };
    const G = {
      snow: ['#f0f2f9', '#e6e9f4'], grass: ['#bfa257', '#ab8f4a', '#cdb168', '#998d4f'],
      rock: ['#a39db3', '#958fa8', '#aa9fb0'], pad: ['#b4adbe', '#a69fb3', '#bdb3bb'], trail: ['#dcc7a0', '#d0b98f'],
    };
    const pick = (list, k) => list[Math.min(list.length - 1, Math.floor(k * list.length))];
    const T = P.stepTerrain({
      size: 30, cells: 72, step: STEP, base: -3, band: 0.6, lip: 0.1,
      // tops lean a little toward the sunset side so ledges catch the low golden-hour sun
      topNormal: [0.242, 0.97, 0],
      cut: (x, z) => deckY(toUV(x, z)[1]) - 0.6,
      height: (x, z) => shaped(...toUV(x, z)),
      top(x, z, h, c) {
        const [u, v] = toUV(x, z);
        c.set(pick(G[classify(u, v, h)], n4(u * 0.7, v * 0.7)));
      },
      side(x, z, y, h, below, c) {
        const [u, v] = toUV(x, z);
        if (below < 0.11) {
          const kind = classify(u, v, h);
          if (kind === 'grass') return c.set('#9b7f3c');
          if (kind === 'snow') return c.set('#dde1ee');
          if (kind === 'trail') return c.set('#bba47b');
          return c.set('#b3adc2');
        }
        const band = Math.floor(y / 0.6);
        const k = Math.abs((Math.sin(band * 12.9898 + 4.1) * 43758.5453) % 1);
        if (n2(u * 0.8 + band * 3.1, v * 0.8) > 0.74) return c.set('#a08f9c');
        return c.set(k < 0.34 ? '#857e9c' : k < 0.67 ? '#918aa8' : '#7a7392');
      },
    });
    root.add(T.mesh);
    const ground = T.heightAt;
    const groundUV = (u, v) => ground(...toXZ(u, v));
    const [PX, PZ] = toXZ(...PAD);

    // ------------------------------------------------------------ cloud sea
    // a soft wrap-around ramp, so cloud shadows stay luminous instead of going grey-brown
    const cloudRamp = P.rampTexture([84, 112, 190, 226, 248, 255]);
    const cloudMat = toon('#ffffff', { noise: 0.04, noiseScale: 2, snow: 0, wet: 0 });
    const farCloudMat = toon('#ffffff', { noise: 0.03, snow: 0, wet: 0 });
    cloudMat.gradientMap = farCloudMat.gradientMap = cloudRamp;
    // skirts: billows that wrap the foot of the summit so it rises out of the clouds, not off them
    const skirt = [];
    {
      const sr = K.rng(77);
      for (let i = 0; i < 2600 && skirt.length < 150; i++) {
        const u = PAD[0] + (sr() - 0.5) * 24, v = PAD[1] + (sr() - 0.5) * 18;
        const h = ground(...toXZ(u, v));
        if (h < 0.3 || h > 2.0) continue;
        // only near an edge where the rock drops into the sea
        let edge = false;
        for (const [eu, ev] of [[0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]]) if (ground(...toXZ(u + eu, v + ev)) < 0.2) edge = true;
        if (!edge) continue;
        skirt.push({ u, v, y: h * 0.55 + sr() * 0.25, s: 0.8 + sr() * 0.8, sy: 0.55 + sr() * 0.2, ph: sr() * 100, f: 0.3 + sr() * 0.3, rot: sr() * 6.3, sp: 0, c: sr() });
      }
    }
    // foreground heaps at the bottom corners frame the shot and add a near layer
    {
      const hr = K.rng(404);
      for (const [cu, cv, n] of [[-12.6, 8.2, 5], [-9.4, 10.2, 3], [12.4, 7.6, 5], [9.0, 10.4, 3]]) {
        for (let i = 0; i < n; i++) skirt.push({ u: cu + (hr() - 0.5) * 3.2, v: cv + (hr() - 0.5) * 1.6, y: 0.5 + hr() * 0.7, s: 1.7 + hr() * 1.1, sy: 0.62 + hr() * 0.12, ph: hr() * 100, f: 0.25 + hr() * 0.2, rot: hr() * 6.3, sp: 0, c: hr() });
      }
    }
    // v1 runs well past the 16:9 frame so taller square and portrait frames never see the deck's near edge
    const sea = P.cloudSea({ rand, deckY, u0: -25, u1: 25, v0: -27, v1: 23, spacing: 1.7, vFar: -9, material: cloudMat, farMaterial: farCloudMat, extra: skirt });
    root.add(sea.group);

    // light bounced off the cloud sea: a soft violet fill from below-left that keeps shaded cliffs readable
    const fill = new THREE.DirectionalLight('#b8a2ff', 0);
    fill.position.set(-0.35, -0.3, 1).normalize().multiplyScalar(30);
    root.add(fill);
    const fillTint = new THREE.Color('#c9b6ff');

    // wisps: small puffs that stream over the summit while the sea surges
    const wispGeo = P.blobGeometry(11, 1);
    const wispN = 34;
    const wisps = new THREE.InstancedMesh(wispGeo, cloudMat, wispN);
    wisps.castShadow = false;
    wisps.receiveShadow = true;
    wisps.frustumCulled = false;
    const wispData = [];
    {
      const wr = K.rng(5150);
      for (let i = 0; i < wispN; i++) wispData.push({ v: PAD[1] + (wr() - 0.4) * 8, y: wr() * 3, s: 0.42 + wr() * 0.4, d: wr() * 3.6, sp: 1.5 + wr() * 1.1, ph: wr() * 10, u0: 8 + wr() * 4 });
    }
    root.add(wisps);
    const wispDummy = new THREE.Object3D();

    // ------------------------------------------------------------ distant peaks
    const peaks = [];
    const PEAKS = [
      // u, v, haze, snowline, [[dx, dz, r, h], ...]
      [-13.2, -9.5, 0.2, 2.2, [[0, 0, 2.6, 4.0], [2.0, 0.8, 1.9, 2.9], [-1.8, -0.6, 1.6, 2.3]]],
      [12.2, -11.5, 0.22, 2.6, [[0, 0, 2.4, 5.6], [-2.0, 0.5, 1.8, 3.3], [1.6, -1.0, 1.6, 2.6]]],
      [-7.0, -19, 0.5, 1.6, [[0, 0, 2.0, 3.0], [1.8, 0.4, 1.5, 2.2]]],
      [6.5, -21, 0.52, 2.0, [[0, 0, 2.4, 4.0], [-1.7, 0.3, 1.6, 2.6], [1.5, 0.6, 1.3, 2.0]]],
      [18.5, -17, 0.48, 1.6, [[0, 0, 2.0, 3.0]]],
      [-19.5, -15, 0.44, 1.8, [[0, 0, 2.2, 3.4], [1.6, 0.4, 1.4, 2.2]]],
    ];
    PEAKS.forEach(([u, v, haze, snowY, subs], i) => {
      const pr = K.rng(101 + i * 37);
      const geo = P.massifGeometry(pr, subs, { snowY, bottom: -3.5 });
      const mat = toon('#ffffff', { vertexColors: true, noise: 0.08, noiseScale: 3 });
      const m = K.mesh(geo, mat, { cast: haze < 0.3, receive: true });
      const [x, z] = toXZ(u, v);
      m.position.set(x, deckY(v) + 0.3, z);
      m.rotation.y = pr() * Math.PI;
      root.add(m);
      peaks.push({ mat, haze });
    });

    // ------------------------------------------------------------ rocks: tors, spires, boulders
    const graniteMat = toon('#ffffff', { vertexColors: true, noise: 0.22, noiseScale: 4 });
    const placeRock = (geo, u, v, ry = rand() * Math.PI, y = null) => {
      const [x, z] = toXZ(u, v);
      const m = K.mesh(geo, graniteMat);
      m.position.set(x, y ?? groundUV(u, v) - 0.05, z);
      m.rotation.y = ry;
      root.add(m);
      return m;
    };
    // left knob: a stacked granite tor
    {
      const [u, v] = [-4.7, 0.9];
      const y0 = groundUV(u, v) - 0.05;
      placeRock(P.graniteGeometry(rand, { w: 1.1, h: 0.7, d: 0.95, color: '#857f97' }), u, v, 0.3, y0);
      placeRock(P.graniteGeometry(rand, { w: 0.8, h: 0.6, d: 0.75, color: '#918aa1' }), u + 0.1, v - 0.05, 0.9, y0 + 0.62);
      placeRock(P.graniteGeometry(rand, { w: 0.5, h: 0.42, d: 0.5, color: '#7b7590' }), u - 0.05, v, 0.2, y0 + 1.15);
    }
    // ridge spires and summit blocks
    for (const [u, v, h, r] of [[-1.9, -2.7, 1.7, 0.42], [-2.7, -2.0, 1.15, 0.36], [-3.4, -1.5, 0.75, 0.3], [3.1, -2.7, 1.35, 0.38], [4.6, -3.4, 1.25, 0.4], [5.3, -4.0, 0.9, 0.32], [7.0, -1.3, 1.0, 0.34], [7.7, -0.7, 0.65, 0.28], [-6.4, 2.0, 0.8, 0.3], [-8.0, -0.8, 0.9, 0.32]]) {
      placeRock(P.spireGeometry(rand, { h, r, color: pick(['#8a83a0', '#968fac', '#7d7694'], rand()) }), u, v);
    }
    for (let i = 0; i < 22; i++) {
      const u = PAD[0] + (rand() - 0.5) * 15, v = PAD[1] + (rand() - 0.5) * 11;
      const h = groundUV(u, v);
      if (h < 0.4 || trailDist(u, v) < 0.7 || Math.hypot(u - PAD[0], v - PAD[1]) < 2.6) continue;
      const s = 0.22 + rand() * 0.3;
      placeRock(P.graniteGeometry(rand, { w: s * 1.4, h: s, d: s * 1.2, color: pick(['#8a849b', '#7d7790', '#968c9c'], rand()) }), u, v);
    }

    // ------------------------------------------------------------ the lookout
    const tw = P.lookoutTower();
    tw.group.position.set(PX, PAD_H, PZ);
    root.add(tw.group);
    const fl = P.flag({});
    fl.mesh.position.copy(tw.flagAt).add(tw.group.position);
    const windAng = Math.atan2(-WIND[1], WIND[0]);
    fl.mesh.rotation.y = windAng;
    root.add(fl.mesh);
    const lanternLight = new THREE.PointLight('#ffb35c', 0, 7.5, 1.6);
    lanternLight.position.copy(tw.lantern).add(tw.group.position);
    root.add(lanternLight);
    // stove smoke from the cab's chimney: small toon puffs (engine fx particles vanish against open sky)
    const smokeAt = tw.smokeAt.clone().add(tw.group.position);
    const smokeMat = toon('#e9e5f1', { noise: 0, snow: 0, wet: 0 });
    smokeMat.gradientMap = P.rampTexture([110, 130, 175, 220, 245, 255]);
    const SMOKE_N = 5, SMOKE_LIFE = 5.0;
    const smoke = new THREE.InstancedMesh(P.blobGeometry(21, 1), smokeMat, SMOKE_N);
    smoke.castShadow = false;
    smoke.frustumCulled = false;
    root.add(smoke);
    const smokeDummy = new THREE.Object3D();
    const porchLight = new THREE.PointLight('#ffb35c', 0, 4.2, 1.6);
    porchLight.position.set(PX + 1.6, PAD_H + 2.0, PZ + 0.8);
    root.add(porchLight);

    // ------------------------------------------------------------ props: outhouse, supplies
    {
      const propMat = toon('#ffffff', { vertexColors: true, noise: 0.12, noiseScale: 6 });
      const [ox, oz] = toXZ(6.7, -0.4);
      const oh = K.mesh(P.outhouse(), propMat);
      oh.position.set(ox, ground(ox, oz), oz);
      oh.rotation.y = 0.3;
      root.add(oh);
      for (const [u, v, s, c] of [[-0.6, 0.75, 0.3, '#a8794c'], [-0.3, 1.0, 0.24, '#9a6c44'], [-0.95, 1.05, 0.22, '#b48553']]) {
        const [x, z] = toXZ(u, v);
        const cr = K.crate(s, c);
        cr.position.set(x, ground(x, z) + s / 2, z);
        cr.rotation.y = u * 2;
        root.add(cr);
      }
      const [bx, bz] = toXZ(-1.2, 0.45);
      const br = K.barrel(0.16, 0.4, '#5b3d7c');
      br.position.set(bx, ground(bx, bz), bz);
      root.add(br);
    }

    // ------------------------------------------------------------ trail, railing, trail lights
    const toXZpts = (list) => list.map(([u, v]) => toXZ(u, v));
    const rail = P.railing(toXZpts(RAIL), ground, { color: '#c4b293', spacing: 0.55 });
    root.add(K.mesh(rail.geometry, toon('#ffffff', { vertexColors: true, noise: 0.1 })));
    // solar trail lights, wired to the lantern: they blink on one by one down the trail
    const trailLamps = [];
    const lampPicks = [5, 9, 13, 17].filter((i) => i < rail.posts.length);
    for (const i of lampPicks) {
      const [x, y, z] = rail.posts[i];
      const mat = K.glass('#9fdcff', 5, '#4a5068');
      const cap = K.mesh(new THREE.BoxGeometry(0.13, 0.12, 0.13), mat, { cast: false });
      cap.position.set(x, y + 0.5, z);
      root.add(cap);
      const light = trailLamps.length < 3 ? K.lampLight(root, new THREE.Vector3(x, y + 0.75, z), { color: '#8fd0ff', power: 1.5, distance: 2.8 }) : null;
      trailLamps.push({ mat, light, on: 1, level: 1 });
    }

    // ------------------------------------------------------------ krummholz and snags
    const leanDir = [WIND[0] / Math.hypot(...WIND), WIND[1] / Math.hypot(...WIND)];
    const kGeos = [0, 1, 2].map((i) => P.krummholzGeometry(rand, { h: 1.05 + i * 0.32, lean: leanDir }));
    const kMat = toon('#ffffff', { vertexColors: true, ramp: 'foliage', wind: 0.03, noise: 0.16, noiseScale: 5 });
    const trees = [];
    for (let i = 0; i < 1500 && trees.length < 11; i++) {
      const u = PAD[0] + (rand() - 0.5) * 17, v = PAD[1] + (rand() - 0.2) * 11;
      const [x, z] = toXZ(u, v);
      const h = ground(x, z);
      if (h < 1.5 || h > 5.2 || slope(u, v) > 0.45 || classify(u, v, h) !== 'grass') continue;
      if (trailDist(u, v) < 0.8 || Math.hypot(u - PAD[0], v - PAD[1]) < 3.0) continue;
      if (trees.some(([tu, tv]) => Math.hypot(tu - u, tv - v) < 1.5)) continue;
      trees.push([u, v]);
      const t = K.mesh(kGeos[Math.floor(rand() * 3)], kMat);
      t.position.set(x, h - 0.02, z);
      t.scale.setScalar(0.85 + rand() * 0.3);
      root.add(t);
    }
    const snagMat = toon('#ffffff', { vertexColors: true, noise: 0.1, snow: 0.6 });
    for (const [u, v] of [[-5.2, 3.1], [4.1, 0.2]]) {
      const [x, z] = toXZ(u, v);
      const s = K.mesh(P.snagGeometry(rand, { h: 1.0 + rand() * 0.4 }), snagMat);
      s.position.set(x, groundUV(u, v), z);
      s.rotation.y = rand() * Math.PI;
      root.add(s);
    }

    // ------------------------------------------------------------ grass and alpine flowers
    const place = (kinds) => (r) => {
      const u = PAD[0] + (r() - 0.5) * 18, v = PAD[1] + (r() - 0.5) * 14;
      const [x, z] = toXZ(u, v);
      const h = ground(x, z);
      if (h < 1.2 || slope(u, v) > 0.7 || !kinds.includes(classify(u, v, h))) return null;
      return [x, h, z];
    };
    const grassMesh = K.grass(rand, 900, place(['grass']), ['#c9a955', '#b39445', '#d8bd6c', '#9d9150']);
    const flowerMesh = K.flowers(rand, 140, place(['grass']), ['#b48cff', '#8f5cf0', '#ffd45c', '#f4f1ea']);
    root.add(grassMesh, flowerMesh);
    // tufts under the surging clouds are hidden, so they never poke through the cloud tops as specks
    const tufts = [grassMesh, flowerMesh].map((m) => {
      const list = [];
      const mt = new THREE.Matrix4();
      for (let i = 0; i < m.count; i++) {
        m.getMatrixAt(i, mt);
        const x = mt.elements[12], y = mt.elements[13], z = mt.elements[14];
        const [u, v] = toUV(x, z);
        list.push({ m: mt.clone(), u, v, y, hid: false });
      }
      return { mesh: m, list };
    });
    const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
    let tuftsHidden = 0;

    // ------------------------------------------------------------ hiker with a headlamp
    const hiker = person(rand, { coat: '#7b3df0', pants: '#3a3346', hat: '#f2bf4a', scale: 0.85 });
    const lamp = K.mesh(new THREE.BoxGeometry(0.06, 0.06, 0.08), K.glass('#e6f4ff', 7, '#3a3f55'), { cast: false });
    lamp.position.set(0.07, 0.53, 0);
    hiker.add(lamp);
    root.add(hiker);
    const hikerPath = toXZpts(TRAIL.slice(1));
    const hikeWalk = walker(hiker, hikerPath, { speed: 0.3, mode: 'pingpong', heightAt: ground, dwell: [{ at: 0, time: 3 }], offset: 6 });

    // ------------------------------------------------------------ eagle
    const bird = P.eagle();
    root.add(bird);

    // ------------------------------------------------------------ state for actions
    const tide = { t0: -999 };
    const tideEnv = (s) => {
      if (s <= 0 || s >= TIDE_LEN) return 0;
      if (s < 3.4) return ease(s / 3.4);
      if (s < 7.4) return 1;
      return 1 - ease((s - 7.4) / (TIDE_LEN - 7.4));
    };
    const lantern = { on: true, level: 1, flare: 0, tOn: -99 };
    let eagleTimer = 6;
    let fxReady = false;
    let now = 0;
    let tideNow = 0;

    const info = {
      size: 22,
      top: T.max,
      bottom: -3,
      surfaceAt(x, z) {
        const h = ground(x, z);
        const [, v] = toUV(x, z);
        const deck = deckY(v) + 0.75 + tideNow * TIDE_H;
        if (h > deck) return h;
        // splash points are laid out once when the weather attaches: hide those over the clouds
        return fxReady ? deck : deck - 4;
      },
      isLand: (x, z) => ground(x, z) > 0.9,
    };

    return {
      root,
      info,
      // review hooks for the console (e.g. world.debug.tide.t0 = env.time starts a surge in __pixel.sheet)
      debug: { raw, shaped, ground, classify, toUV, toXZ, get tide() { return tide; }, get lantern() { return lantern; } },
      actions: [
        {
          id: 'clouds', label: 'Clouds', icon: ICON_CLOUDS,
          run(e, a) {
            if (now - tide.t0 < TIDE_LEN * 0.8) return;
            tide.t0 = now;
            a.play('whoosh', { dur: 3.6, gain: 1.1 });
            a.play('rumble', { dur: 5, gain: 0.35 });
          },
          active: () => now - tide.t0 < TIDE_LEN,
        },
        {
          id: 'lantern', label: 'Lantern', icon: ICON_LANTERN,
          run(e, a) {
            lantern.on = !lantern.on;
            if (lantern.on) {
              lantern.flare = 1;
              lantern.tOn = now;
              a.play('spark');
              a.play('chord', { notes: [62, 66, 69, 74], gain: 0.025, dur: 2.6 });
            } else a.play('tick');
          },
          active: () => lantern.on,
        },
      ],
      update(t, dt, env) {
        fxReady = true;
        now = t;
        const W = env.cur;
        const tideS = t - tide.t0;
        tideNow = tideEnv(tideS);
        const gust = tideNow * 0.5;
        const wind = Math.min(1.2, W.wind + gust);

        // cloud sea: slow drift with the wind, a surge that rolls in from the right
        const drift = -t * (0.07 + W.wind * 0.12);
        sea.update(t, {
          drift,
          lift: (b, u, v) => {
            const delay = (16 - u) * 0.075;
            const e = tideEnv(tideS - Math.max(0, delay));
            if (e <= 0) return [0, 0];
            const near = Math.exp(-((u - PAD[0]) ** 2 + (v - PAD[1]) ** 2 * 1.3) / 30);
            const far = v < V0 ? 0.35 : 1;
            const churn = Math.sin(t * 1.3 + b.ph) * 0.18 * e;
            return [e * far * (0.9 + TIDE_H * 1.15 * near) * (0.85 + 0.15 * Math.sin(b.ph)) + churn, e * (0.1 + 0.18 * near), e * 0.5 * near];
          },
        });
        wispData.forEach((w, i) => {
          const k = tideS - 1.2 - w.d;
          const life = 7.5;
          const on = k > 0 && k < life ? Math.sin((Math.PI * k) / life) : 0;
          const u = w.u0 - k * w.sp;
          const [x, z] = toXZ(u, w.v);
          // puffs ride over the rock, lifting as they cross the ridge
          const gy = Math.max(ground(x, z), 1.2 + TIDE_H * 0.7);
          wispDummy.position.set(x, gy + 0.45 + w.y * 0.25 + Math.sin(k * 1.4 + w.ph) * 0.15, z);
          const sc = Math.max(0.001, on * w.s * (1.0 + 0.2 * Math.sin(k * 2 + w.ph)));
          wispDummy.scale.set(sc * 1.7, sc * 0.95, sc * 1.25);
          wispDummy.rotation.set(0, windAng, 0);
          wispDummy.updateMatrix();
          wisps.setMatrixAt(i, wispDummy.matrix);
        });
        wisps.instanceMatrix.needsUpdate = true;
        // hide tufts below the surge's cloud tops (cheap: only while a surge is running)
        if ((tideS > 0 && tideS < TIDE_LEN + 3) || tuftsHidden > 0) {
          tuftsHidden = 0;
          for (const T of tufts) {
            let changed = false;
            for (let i = 0; i < T.list.length; i++) {
              const g = T.list[i];
              const e = tideEnv(tideS - Math.max(0, (16 - g.u) * 0.075));
              const near = Math.exp(-((g.u - PAD[0]) ** 2 + (g.v - PAD[1]) ** 2 * 1.3) / 30);
              const top = 0.55 + e * (0.9 + TIDE_H * 1.15 * near) * 0.8;
              const hide = e > 0 && g.y < top;
              if (hide !== g.hid) {
                g.hid = hide;
                T.mesh.setMatrixAt(i, hide ? ZERO : g.m);
                changed = true;
              }
              if (hide) tuftsHidden++;
            }
            if (changed) T.mesh.instanceMatrix.needsUpdate = true;
          }
        }
        // cloud colour follows the weather, like the engine's own clouds
        const grey = Math.min(1, W.rain * 0.75 + W.snow * 0.2);
        cloudMat.color.setRGB(1, 1, 1).lerp(GREY_RAIN, grey).lerp(GREY_STORM, W.storm * 0.75);
        // clouds scatter skylight: lift their shaded sides with the sky colour
        cloudMat.emissive.copy(env.hemi.color).multiplyScalar(0.2 * env.hemi.intensity);
        fill.color.copy(env.hemi.color).lerp(fillTint, 0.35).lerp(env.key.color, 0.2);
        fill.intensity = (0.5 * env.hemi.intensity + 0.25 * env.key.intensity) * (1 - 0.5 * W.storm);
        const hr = env.hour;
        const golden = K.smoothstep(0, 1, Math.max(0, 1 - Math.abs(hr - 18.6) / 1.9) + Math.max(0, 1 - Math.abs(hr - 6.4) / 1.4));
        const clearSky = (1 - W.clouds * 0.85) * (1 - W.fog);
        env.post.skyTop.lerp(SKY_VIOLET, 0.32 * golden * clearSky + 0.3 * env.night * clearSky);
        // the low sun breaks through stronger and warmer above the cloud sea
        if (env.k.sunI > 0.02) {
          env.key.intensity *= 1 + 0.35 * golden;
          env.key.color.lerp(SUN_GOLD, 0.3 * golden);
        }
        env.post.skyBottom.lerp(SKY_GOLD, 0.34 * golden * clearSky).lerp(SKY_NIGHT, 0.45 * env.night * clearSky);
        // haze on far things: fade toward the sky colour behind them
        const hazeC = env.post.skyBottom.clone().lerp(env.post.skyTop, 0.5);
        farCloudMat.color.copy(cloudMat.color).multiplyScalar(0.72);
        farCloudMat.emissive.copy(hazeC).multiplyScalar(0.3).add(cloudMat.emissive);
        for (const p of peaks) {
          p.mat.color.setScalar(1 - p.haze);
          p.mat.emissive.copy(hazeC).multiplyScalar(p.haze);
        }

        // lantern: flare on ignition, gentle flicker, brighter after dark
        lantern.level += ((lantern.on ? 1 : 0) - lantern.level) * (1 - Math.exp(-dt * (lantern.on ? 5 : 9)));
        lantern.flare = Math.max(0, lantern.flare - dt * 1.4);
        const flick = 1 + Math.sin(t * 11) * 0.03 + Math.sin(t * 27.3) * 0.025 + (lantern.flare > 0.6 ? Math.sin(t * 60) * 0.25 : 0);
        const dark = 0.35 + 0.65 * env.lamps;
        const glow = lantern.level * dark * flick * (1 + lantern.flare * 0.6);
        setGlow(tw.glassMat, glow);
        lanternLight.intensity = 4.6 * glow;
        porchLight.intensity = 2.2 * glow * (0.2 + 0.8 * env.lamps);
        trailLamps.forEach((L, i) => {
          // top lamp first, then on down the trail
          const want = lantern.on && now - lantern.tOn > 0.55 + (trailLamps.length - 1 - i) * 0.32 ? 1 : 0;
          if (want && !L.on && env.lamps > 0.3) audio.play('tick');
          L.on = want;
          L.level += (want - L.level) * (1 - Math.exp(-dt * (want ? 16 : 10)));
          setGlow(L.mat, L.level);
          if (L.light) {
            const fl = 1 + Math.sin(t * 9 + i * 2.1) * 0.04;
            L.light.intensity = L.light.userData.power * env.lamps * fl * L.level;
          }
        });

        // beacon blinks, a slow double pulse
        const ph = t % 2.6;
        const blink = ph < 0.12 || (ph > 0.3 && ph < 0.42) ? 1 : 0.08;
        setGlow(tw.ledMat, blink * (0.25 + 0.75 * env.lamps));

        // chimney puffs rise, swell and drift downwind
        for (let i = 0; i < SMOKE_N; i++) {
          const k = ((t / SMOKE_LIFE + i / SMOKE_N) % 1 + 1) % 1;
          const drift = k * k * (0.4 + 1.4 * wind);
          smokeDummy.position.set(smokeAt.x + leanDir[0] * drift, smokeAt.y + 0.05 + k * 2.3, smokeAt.z + leanDir[1] * drift);
          const sc = (0.08 + 0.19 * k) * Math.min(1, (1 - k) * 4) * (1 - 0.3 * W.rain);
          smokeDummy.scale.setScalar(Math.max(0.001, sc));
          smokeDummy.updateMatrix();
          smoke.setMatrixAt(i, smokeDummy.matrix);
        }
        smoke.instanceMatrix.needsUpdate = true;
        // flag, anemometer, vane
        fl.update(t, wind);
        tw.rotor.rotation.y -= dt * (1.5 + 14 * wind);
        tw.vane.rotation.y = windAng + Math.PI + Math.sin(t * 1.7) * 0.12 * (0.3 + wind);

        // hiker
        hikeWalk.update(t);
        hiker.visible = W.storm < 0.5;

        // eagle circling the summit by day
        const ba = t * 0.16;
        const br = 6.4 + Math.sin(t * 0.07) * 0.8;
        bird.position.set(PX + Math.cos(ba) * br, PAD_H + 1.4 + Math.sin(t * 0.21) * 0.5, PZ + Math.sin(ba) * br);
        bird.rotation.set(0, -ba - Math.PI / 2, 0);
        bird.rotateX(-0.32);
        const flap = (t % 11) < 1.3 ? Math.sin(t * 13) * 0.6 : 0.12;
        bird.userData.wings[0].rotation.x = -flap;
        bird.userData.wings[1].rotation.x = flap;
        bird.visible = env.daylight > 0.35 && W.rain < 0.3 && W.snow < 0.5;

        // sound: wind howl, the odd eagle cry by day
        audio.setLoop('howl', Math.min(1, 0.45 + 0.6 * W.wind + tideNow * 0.35));
        eagleTimer -= dt;
        if (eagleTimer <= 0) {
          if (bird.visible && Math.random() < 0.7) audio.play('eagle');
          eagleTimer = 14 + Math.random() * 18;
        }
      },
    };
  },
};
