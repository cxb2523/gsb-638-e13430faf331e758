import * as THREE from 'three';
import * as K from './kit.js';
import { person, walker } from './kit-people.js';
import { bench, car } from './kit-city.js';
import { toon, setGlow } from '../engine/materials.js';
import * as F from './ferry-parts.js';

// Ferry: the island ferry crossing the harbour. City waterfront and a needle tower on the
// back-right edge, the island's beach, willows and dock on the back-left, open lake in front.
// The skyline lights up tower by tower at dusk. Actions: fireworks over the harbour, the ferry
// horn (the ferry departs), and a skyline light-up.

const SIZE = 16, HALF = 8, CELLS = 64, BASE = -2.0, STEP = 0.15, WATER = 0;
const CITY_Y = 0.6;
// city bands, back to front (z)
const LOT = -6.0, WALK = -5.75, ROAD = -5.0, TREES = -4.75, BOARD = -4.5, QUAY = -4.25;
const SLIP_X = 1.75;
const PIER = { x0: -5.15, x1: -2.15, z: 2.35, deck: 0.36, width: 0.7 };
const DOCK_CITY = new THREE.Vector3(SLIP_X, 0, QUAY + 1.8);
const DOCK_ISLAND = new THREE.Vector3(-2.55, 0, PIER.z + PIER.width / 2 + 0.62);
const BARGE = new THREE.Vector3(-3.3, 0, -2.5);
const DWELL = 7;

// footprint [x0, x1, z0, z1], height above the quay, style, extras
const TOWERS = [
  // back corner: warehouses, shops and a small condo
  [-8.0, -6.75, -8.0, -7.0, 1.3, 'brick', { crown: 'gable' }],
  [-8.0, -7.0, -7.0, -6.0, 0.8, 'stone', {}],
  [-6.5, -5.5, -8.0, -6.75, 2.0, 'condo', { crown: 'flat' }],
  [-6.75, -5.5, -6.75, -6.0, 0.9, 'brick', {}],
  [-5.25, -4.25, -7.75, -6.5, 2.9, 'stone', { crown: 'flat' }],
  // the downtown cluster
  [-4.0, -3.0, -7.5, -6.25, 3.9, 'teal', { crown: 'slant' }],
  [-3.0, -2.0, -8.0, -7.0, 4.9, 'black', { antenna: 0.7 }],
  [-2.75, -1.75, -6.75, -6.0, 1.3, 'brick', {}],
  [-1.75, -0.75, -7.5, -6.5, 5.5, 'pale', { crown: 'step' }],
  [-0.5, 0.75, -8.0, -7.0, 4.2, 'gold', {}],
  [0.0, 1.0, -6.75, -6.0, 1.9, 'condo', { crown: 'flat' }],
  [1.0, 2.0, -7.75, -6.75, 4.5, 'blue', { crown: 'slant' }],
  // past the needle
  [6.0, 7.25, -8.0, -7.0, 2.6, 'condo', { crown: 'flat' }],
  [6.25, 8.0, -6.75, -6.0, 0.9, 'brick', {}],
];
const NEEDLE = new THREE.Vector3(4.9, CITY_Y, -7.0);
const DOME = new THREE.Vector3(3.05, CITY_Y, -7.05);

const STYLES = {
  brick: { wall: '#a9583f', glass: '#2f3646', cap: '#e4d8c4', win: [0.25, 0.3], frac: [0.5, 0.52], lit: 0.72, warm: '#ffa24a', noise: 0.14 },
  stone: { wall: '#d9cdb7', glass: '#38435a', cap: '#b9ab94', win: [0.25, 0.3], frac: [0.5, 0.56], lit: 0.62, warm: '#ffb45e' },
  teal: { wall: '#2c5966', glass: '#7cc0cb', cap: '#21434f', win: [0.25, 0.25], frac: [0.78, 0.68], lit: 0.55, warm: '#ffcf87', crown: '#9fd3db', glassy: 0.28 },
  black: { wall: '#262a33', glass: '#4e5869', cap: '#1b1e25', win: [0.25, 0.36], frac: [0.6, 0.84], lit: 0.62, warm: '#ffc570' },
  pale: { wall: '#ebe7df', glass: '#8fb2cb', cap: '#cfc9be', win: [0.25, 0.3], frac: [0.42, 0.84], lit: 0.58, warm: '#ffd796', glassy: 0.12 },
  gold: { wall: '#9a7432', glass: '#e8bd5c', cap: '#73561f', win: [0.25, 0.42], frac: [0.8, 0.8], lit: 0.5, warm: '#ffc874', glassy: 0.22 },
  blue: { wall: '#365c86', glass: '#93c6ea', cap: '#28466a', win: [0.5, 0.3], frac: [0.88, 0.72], lit: 0.6, warm: '#d6e8ff', crown: '#b5dcf5', glassy: 0.3 },
  condo: { wall: '#e2ddd3', glass: '#5b7b96', cap: '#c3bcb0', win: [0.25, 0.3], frac: [0.7, 0.6], lit: 0.7, warm: '#ffa850' },
};

const KINDS = [
  { kind: 0, speed: 4.2, life: 2.0, trail: 0.22 },
  { kind: 1, speed: 4.4, life: 1.8, trail: 0.18 },
  { kind: 2, speed: 3.4, life: 3.1, trail: 0.7 },
  { kind: 3, speed: 4.6, life: 2.2, trail: 0.3 },
];
const COLORS = ['#ff3d5a', '#ffc23d', '#4dff8f', '#4d8bff', '#b46bff', '#fff1d6', '#4df0ff', '#ff6bd0', '#ff8a3d'];

export default {
  name: 'Ferry',
  view: { target: [0, 0.95, 0], size: 17.3, azimuth: 45, elevation: 30 },
  look: { levels: 13, dither: 0.6, saturation: 1.16, contrast: 1.08, bloom: 1.15, vignette: 0.26, highlight: 0.34, outline: 0.55 },
  env: { hour: 19.2, weather: 'clear' },
  audio: { water: 0.8, birds: 0.3, crickets: 0.35, foghorn: 1 },
  mirror: { y: WATER },
  sky: { moon: 1, milky: 0.12, moonPos: [0.15, 0.84] },
  wind: [0.85, 0.53],
  actionsLabel: 'Harbour',

  create({ env, audio }) {
    const root = new THREE.Group();
    const rand = K.rng(1867);
    const n = K.noise2(5);
    const V = (x, y, z) => new THREE.Vector3(x, y, z);

    // ------------------------------------------------------------ terrain
    const shoreX = (z) => -4.75 + 0.32 * Math.sin(z * 0.62 + 0.9) + 1.15 * K.smoothstep(4.2, 7.9, z);
    const tip = (z) => Math.max(0, -1.25 - z) ** 2 * 0.75;
    const islandD = (x, z) => shoreX(z) - x - tip(z) + (n(x * 0.8 + 3, z * 0.8) - 0.5) * 0.3;
    const PATH = [[-6.5, -2.2], [-6.2, -0.6], [-6.45, 1.0], [-6.1, 2.35], [-6.5, 4.0], [-6.0, 5.6], [-5.4, 7.6]];
    const segD = (px, pz, [ax, az], [bx, bz]) => {
      const dx = bx - ax, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(px - ax - dx * t, pz - az - dz * t);
    };
    const pathDist = (x, z) => {
      let d = segD(x, z, [-6.1, 2.35], [PIER.x0, PIER.z]);
      for (let i = 0; i < PATH.length - 1; i++) d = Math.min(d, segD(x, z, PATH[i], PATH[i + 1]));
      return d;
    };
    const height = (x, z) => {
      if (z < QUAY) return CITY_Y;
      const d = islandD(x, z);
      if (d < 0) return Math.max(-1.9, -0.1 + d * 0.8) + (n(x * 0.5 + 9, z * 0.5 - 4) - 0.5) * 0.25;
      if (d < 0.75) return 0.15 + d * 0.2;
      if (d < 1.3) return 0.45;
      return 0.6 + (n(x * 0.45 + 20, z * 0.45) > 0.62 ? 0.15 : 0);
    };
    const strata = (y, a, b) => (Math.floor(y / 0.45) % 2 ? a : b);
    const T = K.terrain({
      size: SIZE, cells: CELLS, step: STEP, base: BASE, height,
      top(x, z, h, c) {
        if (z < QUAY) {
          if (z < LOT) return c.set((Math.floor(x / 0.5) + Math.floor(z / 0.5)) % 2 ? '#b7b0a4' : '#beb7ab');
          if (z < WALK) return c.set('#d2cabb');
          if (z < ROAD) return c.set(z > ROAD - 0.25 ? '#585c66' : '#4c505a');
          if (z < TREES) return c.set('#6dab55');
          if (z < BOARD) return c.set(Math.floor(x / 0.25) % 2 ? '#cfc7b6' : '#c5bcaa');
          return c.set(Math.floor(x / 0.25) % 2 ? '#a77b50' : '#98704a');
        }
        if (h < -0.05) return c.set(h > -0.5 ? '#c7b585' : h > -1.2 ? '#8f8a6e' : '#5e6a68');
        if (h < 0.2) return c.set('#d9c28e');
        if (h < 0.35) return c.set('#ead6a3');
        if (pathDist(x, z) < 0.28) return c.set('#ddcca2');
        const t = n(x * 1.1 + 3, z * 1.1);
        return c.set(t > 0.64 ? '#86c463' : t < 0.36 ? '#5f9f4b' : '#72b556');
      },
      side(x, z, y, h, outer, c) {
        if (z < QUAY) {
          if (h - y < 0.11) return c.set('#e1dbcf');
          if (y > -0.05) return c.set('#a39d92');
          return c.set(strata(y, '#77736d', '#6a6761'));
        }
        if (h > 0.1) {
          if (h - y < 0.08 && h >= 0.45) return c.set('#5e9a48');
          if (y > -0.35) return c.set('#d8bf89');
          return c.set(strata(y, '#8a6a4b', '#7a5d42'));
        }
        return c.set(y > -1.3 ? strata(y, '#6c6a5c', '#63614f') : strata(y, '#555864', '#4b4e59'));
      },
    });
    root.add(T.mesh);
    const ground = T.heightAt;
    const isLand = (x, z) => z > QUAY && ground(x, z) > 0.2;
    const waterGroup = K.water({
      size: SIZE, level: WATER, heightAt: ground, base: BASE, edgeCells: CELLS,
      shallow: '#4ccdbd', deep: '#174b7d', foam: '#eef8f4', deepAt: 1.2, reflect: 0.35, wall: ['#3b9cc8', '#143a69'],
    });
    root.add(waterGroup);
    // seen from above, open water mirrors the upper sky rather than the horizon glow
    const skyRefl = { value: new THREE.Color() };
    const waterSurf = waterGroup.children[0];
    waterSurf.material.userData.nx.uniforms.uSkyRefl = skyRefl;
    const waterWalls = waterGroup.children[1];
    const shine = F.shimmer({ size: SIZE, heightAt: ground, level: WATER });
    root.add(shine.mesh);
    const nightShine = new THREE.Color('#9fb0ff');
    const dayShine = new THREE.Color('#f2fbff');

    const lamps = [];
    const glassWarm = K.glass('#ffd29a', 3.4, '#3a4256');

    // ------------------------------------------------------------ city
    const towerLamps = [];
    const glassTowers = [];
    const detail = [], lobbies = [], beacons = [];
    TOWERS.forEach(([x0, x1, z0, z1, h, style, extra], i) => {
      const s = STYLES[style];
      const lampU = { value: 0 };
      const tw = F.tower({ x0, x1, z0, z1, y0: CITY_Y, h, s, lampU, ...extra });
      root.add(tw.body);
      detail.push(...tw.parts);
      lobbies.push(tw.lobbyGeo);
      if (tw.beacon && h > 4) beacons.push(tw.beacon);
      // light-up order: lower blocks first, the tall towers after
      towerLamps.push({ u: lampU, cur: 0, th: 0.04 + 0.42 * K.smoothstep(0.8, 5.8, h) + rand() * 0.08, rank: 0, sx: (x0 + x1) / 2 - (z0 + z1) / 2, on: false });
      if (s.glassy) glassTowers.push({ mat: tw.mat, k: s.glassy });
    });
    [...towerLamps].sort((a, b) => a.sx - b.sx).forEach((t, i) => (t.rank = i));

    // needle tower
    const nd = F.needle({ h: 8.5 });
    nd.group.position.copy(NEEDLE);
    root.add(nd.group);
    detail.push(F.cyl(1.05, 1.1, 0.34, 6, NEEDLE.x, CITY_Y + 0.17, NEEDLE.z, '#9fa6ae'));
    lobbies.push(F.box(1.4, 0.26, 0.45, NEEDLE.x + 0.1, CITY_Y + 0.13, NEEDLE.z + 0.95, '#ffffff'));
    for (const b of nd.beacons) beacons.push(b.clone().add(NEEDLE));
    const podLight = new THREE.PointLight('#ff66cc', 0, 5.5, 2);
    podLight.position.copy(nd.pod).add(NEEDLE).add(V(0.9, -0.4, 0.9));
    root.add(podLight);

    // dome
    const dm = F.dome({ r: 0.92 });
    dm.mesh.position.copy(DOME);
    root.add(dm.mesh);
    const band = K.mesh(new THREE.CylinderGeometry(dm.windowBand.r, dm.windowBand.r, 0.09, 18, 1, true), K.glass('#ffe2b0', 3.2, '#59606d'), { cast: false });
    band.position.copy(DOME).add(V(0, dm.windowBand.y, 0));
    root.add(band);

    // terminal pavilion by the slip, with a green roof
    detail.push(F.box(1.5, 0.06, 0.42, SLIP_X - 0.1, CITY_Y + 0.03, -4.78, '#8f949e'));
    lobbies.push(F.box(1.4, 0.4, 0.34, SLIP_X - 0.1, CITY_Y + 0.26, -4.78, '#ffffff'));
    detail.push(F.box(1.48, 0.06, 0.4, SLIP_X - 0.1, CITY_Y + 0.49, -4.78, '#e8e4dc'));
    for (const dx of [-1.05, 0.85]) for (const dz of [-4.98, -4.4]) detail.push(F.box(0.07, 0.58, 0.07, SLIP_X + dx, CITY_Y + 0.29, dz, '#e8e4dc'));
    {
      const roofG = new THREE.BoxGeometry(2.3, 0.07, 0.8);
      roofG.rotateX(-0.12);
      roofG.translate(SLIP_X - 0.1, CITY_Y + 0.64, -4.69);
      detail.push(K.paint(roofG, '#3f7d58'));
      const fascia = new THREE.BoxGeometry(2.32, 0.08, 0.06);
      fascia.translate(SLIP_X - 0.1, CITY_Y + 0.6, -4.28);
      detail.push(K.paint(fascia, '#eeeae2'));
    }
    // slip: finger piers and a gangway
    for (const s of [-1, 1]) {
      detail.push(F.box(0.26, 0.9, 1.25, SLIP_X + s * 0.8, 0.0, QUAY + 0.6, '#aaa49a'));
      detail.push(F.box(0.08, 0.14, 1.2, SLIP_X + s * 0.66, 0.36, QUAY + 0.6, '#2b2f3a'));
    }
    detail.push(F.box(0.9, 0.07, 0.36, SLIP_X, 0.45, QUAY + 0.17, '#4a4f5b'));
    // bollards along the quay
    for (let x = -7.6; x < 7.8; x += 0.9) if (Math.abs(x - SLIP_X) > 1.0) detail.push(F.cyl(0.05, 0.06, 0.14, 6, x, CITY_Y + 0.07, QUAY - 0.08, '#2c3038'));

    // promenade trees
    const treeGeo = K.bushGeometry(rand, { r: 0.34, blobs: 3, leaf: '#4f9346', h: 0.42 });
    const treeXs = [-7.4, -6.1, -4.8, -3.5, -2.2, -0.9, 3.6, 4.9, 6.2, 7.5];
    const streetTrees = new THREE.InstancedMesh(treeGeo, toon('#ffffff', { vertexColors: true, ramp: 'foliage', wind: 0.05, noise: 0.18, noiseScale: 4 }), treeXs.length);
    streetTrees.castShadow = streetTrees.receiveShadow = true;
    const dummy = new THREE.Object3D();
    treeXs.forEach((x, i) => {
      dummy.position.set(x, CITY_Y, (ROAD + TREES) / 2);
      dummy.rotation.set(0, rand() * 6, 0);
      dummy.scale.setScalar(0.9 + rand() * 0.25);
      dummy.updateMatrix();
      streetTrees.setMatrixAt(i, dummy.matrix);
    });
    root.add(streetTrees);
    // benches facing the water
    for (const x of [-5.4, -2.9, 4.3, 7.0]) {
      const b = bench('#7a5a3c');
      b.position.set(x, CITY_Y, BOARD - 0.12);
      root.add(b);
    }
    // street lamps
    for (const [x, z, light] of [[-6.7, QUAY - 0.14, false], [-3.9, QUAY - 0.14, true], [-1.0, QUAY - 0.14, false], [3.1, QUAY - 0.14, true], [6.1, QUAY - 0.14, false]]) {
      const lp = K.lampPost({ h: 0.95 });
      lp.group.position.set(x, CITY_Y, z);
      root.add(lp.group);
      if (light) lamps.push(K.lampLight(root, lp.light.clone().add(lp.group.position), { power: 2.2, distance: 3.6 }));
    }

    // traffic on the waterfront road, trimmed at the block edges
    const edgeClip = [new THREE.Plane(new THREE.Vector3(1, 0, 0), HALF - 0.02), new THREE.Plane(new THREE.Vector3(-1, 0, 0), HALF - 0.02)];
    const cars = [
      { g: car({ color: '#e2b33c', kind: 'taxi' }), lane: -5.2, dir: 1, speed: 1.5, off: 0 },
      { g: car({ color: '#c94a3d' }), lane: -5.55, dir: -1, speed: 1.3, off: 7 },
      { g: car({ color: '#e8e4dc', kind: 'van' }), lane: -5.2, dir: 1, speed: 1.2, off: 10.5 },
    ];
    // headlights and tail lights big enough to read at this scale
    const headM = toon('#d8d8cf', { emissive: '#fff2c8', emissiveIntensity: 6, lamp: true, noise: 0, snow: 0 });
    const tailM = toon('#8a2a26', { emissive: '#ff3b30', emissiveIntensity: 5, lamp: true, noise: 0, snow: 0 });
    for (const c of cars) {
      const L = c.g.children[0].geometry.parameters.width;
      const hg = [], tg = [];
      for (const sz of [-0.13, 0.13]) {
        hg.push(F.box(0.05, 0.07, 0.1, L / 2 + 0.01, 0.2, sz, '#ffffff'));
        tg.push(F.box(0.05, 0.07, 0.1, -L / 2 - 0.01, 0.2, sz, '#ffffff'));
      }
      c.g.add(K.mesh(K.merge(hg), headM, { cast: false }), K.mesh(K.merge(tg), tailM, { cast: false }));
      c.g.traverse((o) => {
        if (!o.material) return;
        o.material.clippingPlanes = edgeClip;
        o.material.clipShadows = true;
      });
      c.g.rotation.y = c.dir > 0 ? 0 : Math.PI;
      root.add(c.g);
    }

    // merged city detail, lobbies, beacons
    root.add(F.lump(detail, { noise: 0.08 }));
    root.add(K.mesh(K.merge(lobbies), glassWarm, { cast: false }));
    const beaconMat = toon('#4a1a17', { emissive: '#ff2a1c', emissiveIntensity: 7, noise: 0, snow: 0 });
    root.add(K.mesh(K.merge(beacons.map((b) => F.box(0.1, 0.1, 0.1, b.x, b.y, b.z, '#ffffff'))), beaconMat, { cast: false }));

    // ------------------------------------------------------------ island
    // willows on the shore, leafy trees inland
    const willowGeos = [0, 1].map((i) => K.merge([F.willowGeometry(rand, { h: 1.05 + i * 0.25, r: 0.72 + i * 0.1 })]));
    const leafGeos = [0, 1].map((i) => K.bushGeometry(rand, { r: 0.5 + i * 0.1, blobs: 4, leaf: i ? '#3f8040' : '#4c9246', h: 0.7 + i * 0.15 }));
    const foliage = toon('#ffffff', { vertexColors: true, ramp: 'foliage', wind: 0.045, noise: 0.18, noiseScale: 4 });
    const plant = (geos, spots) => {
      const per = geos.map(() => []);
      spots.forEach(([x, z, s], i) => per[i % geos.length].push([x, z, s]));
      geos.forEach((g, k) => {
        if (!per[k].length) return;
        const m = new THREE.InstancedMesh(g, foliage, per[k].length);
        m.castShadow = m.receiveShadow = true;
        per[k].forEach(([x, z, s], i) => {
          dummy.position.set(x, ground(x, z), z);
          dummy.rotation.set(0, rand() * 6.28, 0);
          dummy.scale.setScalar(s);
          dummy.updateMatrix();
          m.setMatrixAt(i, dummy.matrix);
        });
        root.add(m);
      });
    };
    plant(willowGeos, [[-5.55, -1.55, 1.0], [-5.35, 0.15, 0.9], [-5.5, 3.75, 1.05], [-5.1, 5.15, 0.85], [-7.35, -2.5, 0.9]]);
    plant(leafGeos, [[-7.45, -0.9, 1.0], [-7.55, 0.65, 1.1], [-7.25, 2.0, 0.95], [-7.5, 3.2, 1.05], [-7.3, 4.6, 0.9], [-7.55, 6.0, 1.0], [-6.85, 7.3, 0.85], [-7.6, 7.55, 0.95], [-6.9, -1.95, 0.8]]);
    root.add(K.grass(rand, 900, (r) => {
      const x = -8 + r() * 5.5, z = -3 + r() * 11;
      const h = ground(x, z);
      if (h < 0.44 || !isLand(x, z) || pathDist(x, z) < 0.35) return null;
      return [x, h, z];
    }));
    root.add(K.flowers(rand, 70, (r) => {
      const x = -8 + r() * 4, z = -2.5 + r() * 10;
      const h = ground(x, z);
      if (h < 0.55 || pathDist(x, z) < 0.4) return null;
      return [x, h, z];
    }));
    // island pier (the ferry docks alongside)
    root.add(K.pier({ x0: PIER.x0, x1: PIER.x1, z: PIER.z, deck: PIER.deck, width: PIER.width, bottom: -1.9 }));
    // picnic tables, beach umbrellas and towels
    const isle = [];
    const tables = [[-6.95, -0.35, 0.3], [-6.8, 1.05, -0.2], [-7.05, 5.1, 0.5]];
    for (const [x, z, r] of tables) isle.push(F.picnicTable(x, ground(x, z), z, r));
    for (const [x, z, c] of [[-4.55, 6.3, '#e2533f'], [-4.2, 7.3, '#3f7fd0']]) {
      const y = ground(x, z);
      isle.push(F.cyl(0.02, 0.02, 0.7, 4, x, y + 0.35, z, '#e8e4dc'));
      const cone = F.facet(new THREE.ConeGeometry(0.42, 0.2, 8));
      cone.translate(x, y + 0.72, z);
      F.paintFaces(cone, (ctr) => (Math.floor((Math.atan2(ctr.z - z, ctr.x - x) + 3.2) / 0.785) % 2 ? c : '#f4f1e8'));
      isle.push(cone);
    }
    for (const [x, z, c, r] of [[-4.9, 6.0, '#f2c14e', 0.3], [-4.6, 6.9, '#e46a8a', -0.2], [-5.15, 7.45, '#5fb3c9', 0.1]]) {
      const g = new THREE.BoxGeometry(0.42, 0.02, 0.2);
      g.rotateY(r);
      g.translate(x, ground(x, z) + 0.01, z);
      isle.push(K.paint(g, c));
    }
    // still people: picnickers, beach-goers, folks waiting on the pier
    const P = (opts, x, z, ry, y) => isle.push(F.figure(rand, opts, x, y ?? ground(x, z), z, ry));
    P({ pose: 'sit' }, -6.95, -0.06, -Math.PI / 2 + 0.3, ground(-6.95, -0.35));
    P({ pose: 'sit' }, -6.95, -0.64, Math.PI / 2 + 0.3, ground(-6.95, -0.35));
    P({ pose: 'sit', coat: '#e2b33c' }, -6.8, 1.34, -Math.PI / 2 - 0.2, ground(-6.8, 1.05));
    P({ pose: 'sit', coat: '#d8d2c4' }, -7.05, 5.38, -Math.PI / 2 + 0.5, ground(-7.05, 5.1));
    P({ coat: '#c94a3d' }, -4.75, 6.55, 0.4);
    P({ coat: '#2f4a7a', hat: '#f2efe8' }, -4.45, 6.7, 2.6);
    P({ coat: '#3f6e4f' }, -4.0, 2.35, 0.0, PIER.deck + 0.04);
    P({ coat: '#6b4a8a' }, -3.7, 2.2, 0.3, PIER.deck + 0.04);
    P({ coat: '#b8673a' }, 0.9, -4.7, 1.6, CITY_Y);
    P({ coat: '#2a2e3a' }, 2.75, -4.65, 1.4, CITY_Y);
    root.add(F.lump(isle, { noise: 0.05, snow: 0.7 }));
    // string lights over the picnic tables
    {
      const posts = [[-6.95, -1.25], [-5.9, -0.5], [-7.1, 1.45], [-5.95, 1.7]];
      const poleG = [], bulbG = [];
      const top = (x, z) => ground(x, z) + 1.12;
      for (const [x, z] of posts) poleG.push(F.box(0.07, 1.14, 0.07, x, ground(x, z) + 0.57, z, '#3a3f4a'));
      for (const [a, b] of [[0, 1], [0, 2], [1, 3], [2, 3]]) {
        const [ax, az] = posts[a], [bx, bz] = posts[b];
        const n = Math.max(4, Math.round(Math.hypot(bx - ax, bz - az) / 0.24));
        for (let k = 1; k < n; k++) {
          const t = k / n;
          const y = top(ax, az) * (1 - t) + top(bx, bz) * t - Math.sin(Math.PI * t) * 0.22;
          bulbG.push(F.box(0.07, 0.07, 0.07, ax + (bx - ax) * t, y, az + (bz - az) * t, '#ffffff'));
        }
      }
      root.add(F.lump(poleG, { noise: 0.04 }));
      root.add(K.mesh(K.merge(bulbG), toon('#e9e1cc', { emissive: '#ffc977', emissiveIntensity: 5.5, lamp: true, noise: 0, snow: 0.4 }), { cast: false }));
    }
    // island lamps
    for (const [x, z] of [[-5.25, 1.85], [-6.4, -1.3]]) {
      const lp = K.lampPost({ h: 0.9 });
      lp.group.position.set(x, ground(x, z), z);
      root.add(lp.group);
      lamps.push(K.lampLight(root, lp.light.clone().add(lp.group.position), { power: 2.2, distance: 3.6 }));
    }

    // walkers (with umbrella twins for the rain)
    const walkers = [];
    const addWalker = (opts, pts, wopts) => {
      for (const umb of [null, opts.umbrella]) {
        const p = person(rand, { ...opts, umbrella: umb });
        root.add(p);
        walkers.push({ w: walker(p, pts, wopts), p, umb: !!umb });
      }
    };
    const islandH = (x, z) => ground(x, z);
    addWalker({ coat: '#c94a3d', umbrella: '#2f4a7a' }, PATH.slice(0, 6), { speed: 0.42, mode: 'pingpong', heightAt: islandH, dwell: [{ at: 0, time: 2 }] });
    addWalker({ coat: '#e2b33c', umbrella: '#e2533f' }, [[-5.3, 7.4], [-4.3, 5.9], [-4.6, 4.6]], { speed: 0.3, mode: 'pingpong', heightAt: islandH, offset: 4 });
    addWalker({ coat: '#2f4a7a', umbrella: '#ffd23d' }, [[-7.4, -4.62], [0.2, -4.62]], { speed: 0.45, mode: 'pingpong', y: CITY_Y, offset: 3 });
    addWalker({ coat: '#3f6e4f', umbrella: '#c94a3d' }, [[7.6, -4.4], [3.2, -4.4]], { speed: 0.38, mode: 'pingpong', y: CITY_Y, offset: 9 });

    // ------------------------------------------------------------ the ferry
    const ferry = F.ferryBoat(rand);
    ferry.group.rotation.order = 'YXZ';
    root.add(ferry.group);
    const ferryLight = K.lampLight(ferry.group, V(0.3, 2.1, 0.9), { power: 3.0, distance: 5.2 });
    lamps.push(ferryLight);
    const route = new THREE.CubicBezierCurve3(DOCK_CITY.clone(), DOCK_CITY.clone().add(V(0, 0, 3.4)), DOCK_ISLAND.clone().add(V(3.6, 0, 0)), DOCK_ISLAND.clone());
    const RL = route.getLength();
    const fer = { phase: 'sail', from: 0, s: RL * 0.4, v: 0.9, timer: 0, since: 10, horn: 0 };
    const wake = F.wakeTrail();
    root.add(wake.mesh);
    const puff = F.steam();
    root.add(puff.points);
    const churn = F.spray();
    root.add(churn.points);
    let churnAcc = 0;
    const tmpV = new THREE.Vector3();

    // ------------------------------------------------------------ boats, buoys, gulls
    const sails = [
      { g: F.sailboat(rand, { stripe: '#d0453a' }), c: [4.6, 3.6], r: [1.5, 0.75], w: 0.11, ph: 0.5 },
      { g: F.sailboat(rand, { stripe: '#2f5d9a', sail: '#f4ecdc' }), c: [1.3, 6.1], r: [1.4, 0.55], w: -0.09, ph: 2.0 },
      { g: F.sailboat(rand, { stripe: '#e2b33c' }), c: [6.0, -0.6], r: [0.9, 1.1], w: 0.08, ph: 4.0 },
    ];
    for (const s of sails) {
      s.g.rotation.order = 'YXZ';
      root.add(s.g);
    }
    const buoys = [];
    for (const [u, side, color, light] of [[0.3, 1, '#c8433a', '#ff3b30'], [0.3, -1, '#2f8a55', '#36e07a'], [0.68, 1, '#c8433a', '#ff3b30'], [0.68, -1, '#2f8a55', '#36e07a']]) {
      const p = route.getPointAt(u), t = route.getTangentAt(u);
      const b = F.buoy(color, light, side > 0);
      b.group.position.set(p.x - t.z * side * 1.35, 0, p.z + t.x * side * 1.35);
      root.add(b.group);
      buoys.push({ ...b, ph: rand() * 6 });
    }
    // fireworks barge
    const barge = [F.box(1.2, 0.12, 0.62, BARGE.x, 0.02, BARGE.z, '#363a44'), F.box(1.22, 0.06, 0.64, BARGE.x, 0.11, BARGE.z, '#e07a2e')];
    for (let k = 0; k < 4; k++) barge.push(F.box(0.16, 0.16, 0.34, BARGE.x - 0.36 + k * 0.24, 0.22, BARGE.z - 0.05, '#4d525e'));
    barge.push(F.box(0.22, 0.2, 0.22, BARGE.x + 0.45, 0.24, BARGE.z + 0.16, '#d9d4c9'));
    root.add(F.lump(barge, { noise: 0.05 }));

    const gulls = [];
    for (let i = 0; i < 5; i++) {
      const g = F.gull();
      g.scale.setScalar(1.25);
      g.rotation.order = 'YXZ';
      g.traverse((o) => o.layers.set(1));
      root.add(g);
      gulls.push({ g, c: [-1.5 + rand() * 4, -1 + rand() * 4], r: 1.2 + rand() * 1.6, y: 2.4 + rand() * 1.8, w: (0.35 + rand() * 0.3) * (rand() < 0.5 ? -1 : 1), ph: rand() * 6.28 });
    }

    // ------------------------------------------------------------ fireworks
    const fw = F.fireworks();
    root.add(fw.group);
    const flashes = [0, 1].map(() => {
      const l = new THREE.PointLight('#ffffff', 0, 16, 1.6);
      root.add(l);
      return { l, t: -99, peak: 0 };
    });
    const show = { queue: [], events: [], last: -99 };
    const pickColor = () => new THREE.Color(COLORS[Math.floor(rand() * COLORS.length)]);
    function queueShow(t0) {
      const shells = [];
      for (let i = 0; i < 9; i++) shells.push(t0 + 0.25 + i * 0.72 + rand() * 0.3);
      const fin = t0 + 0.25 + 9 * 0.72 + 0.5;
      for (let i = 0; i < 4; i++) shells.push(fin + i * 0.12);
      for (const at of shells) {
        const roll = rand();
        const k = KINDS[roll < 0.36 ? 0 : roll < 0.5 ? 1 : roll < 0.7 ? 2 : 3];
        const cA = pickColor();
        const cB = rand() < 0.5 ? cA.clone() : pickColor();
        if (k.kind === 2) { cA.set('#ffcf6a'); cB.set('#ff9a3a'); }
        // over the back of the harbour, left of the towers, where the sky is dark
        const center = V(BARGE.x + (rand() - 0.45) * 3.6, 3.8 + rand() * 1.9, BARGE.z + (rand() - 0.4) * 1.6);
        show.queue.push({ launch: at, rise: 0.95 + (center.y - 3.7) * 0.12, center, ...k, colA: cA, colB: cB, axis: V(rand() - 0.5, 1.2, rand() - 0.5).normalize() });
      }
      show.queue.sort((a, b) => a.launch - b.launch);
    }

    // ------------------------------------------------------------ skyline sequence
    const cityState = { seq: -1, lastHour: env.hour, needle: 0, first: true, lamps: 0, chord: false };
    const needleRank = TOWERS.length;

    // every lamp material follows the harbour light level (dusk, night, storms, and fog)
    const harbourU = { value: 0 };
    root.traverse((o) => {
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) if (m.defines && 'NX_LAMP' in m.defines && m.userData.nx) m.userData.nx.uniforms.uLamps = harbourU;
    });

    const lampGoal0 = (e) => e.lampsOverride ?? K.smoothstep(0.3, 0.6, e.night + e.cur.clouds * 0.22 + e.cur.storm * 0.2 + e.cur.fog * 0.15);

    const info = {
      size: SIZE, top: 2.4, bottom: BASE,
      surfaceAt: (x, z) => Math.max(ground(x, z), WATER),
      isLand,
    };

    let gullTimer = 2;
    const skyTint = new THREE.Color();
    const tmpC = new THREE.Color();
    const WHITE = new THREE.Color('#ffffff');

    return {
      root,
      info,
      debug: { fer, cityState, show },
      actions: [
        {
          id: 'fireworks', label: 'Fireworks', icon: F.ICONS.fireworks,
          run(e) { queueShow(e.time); },
          active: () => show.queue.length > 0 || env.time - show.last < 2.5,
        },
        {
          id: 'horn', label: 'Horn', icon: F.ICONS.horn,
          run(e, audio) {
            audio.play('horn', { pitch: 0.6 });
            fer.horn = 2.3;
            if (fer.phase === 'dock') fer.timer = Math.min(fer.timer, 1.0);
          },
          active: () => fer.horn > 0,
        },
        {
          id: 'skyline', label: 'Skyline', icon: F.ICONS.skyline,
          run(e) {
            cityState.seq = 0;
            cityState.chord = false;
            for (const tl of towerLamps) tl.on = false;
            if (e.lamps < 0.5 && !e.tween) e.goToHour(19.9, 4);
          },
          active: () => cityState.seq >= 0,
        },
      ],

      update(t, dt, e) {
        const fogLights = K.smoothstep(0.12, 0.4, e.cur.fog) * 0.9;
        // our own lamp level: eases like the engine's, but snaps when the hour jumps (sliders, review sheets)
        const jumped = (Math.abs(e.hour - cityState.lastHour) > 0.5 && !e.tween) || cityState.first;
        cityState.lastHour = e.hour;
        const lampGoal = lampGoal0(e);
        if (jumped) cityState.lamps = lampGoal;
        else cityState.lamps += (lampGoal - cityState.lamps) * (1 - Math.exp(-dt * 2.2));
        const lampsV = cityState.lamps;
        harbourU.value = Math.max(lampsV, fogLights);
        for (const l of lamps) {
          const fl = 1 + Math.sin(t * 9 + l.userData.phase) * 0.04 + Math.sin(t * 23 + l.userData.phase * 3) * 0.03;
          l.intensity = l.userData.power * harbourU.value * fl;
        }
        const snap = jumped;
        cityState.first = false;

        // ---- skyline: towers light up one after another, window by window
        const seqOn = cityState.seq >= 0;
        if (seqOn) cityState.seq += dt;
        const sq = cityState.seq;
        for (const tl of towerLamps) {
          let target = Math.max(K.smoothstep(tl.th, tl.th + 0.3, lampsV), fogLights * 0.55);
          if (seqOn) {
            const st = sq - 1.0 - tl.rank * 0.3;
            target = sq < 0.7 ? 0 : K.smoothstep(0, 1.6, st);
            if (st > 0 && !tl.on) { tl.on = true; audio.play('tick'); }
          }
          if (snap) tl.cur = target;
          else tl.cur += Math.max(-dt * (seqOn ? 3 : 0.6), Math.min(dt * (seqOn ? 0.9 : 0.3), target - tl.cur));
          tl.u.value = tl.cur;
        }
        let nTarget = Math.max(K.smoothstep(0.35, 0.62, lampsV), fogLights * 0.75);
        if (seqOn) {
          const st = sq - 1.2 - needleRank * 0.3;
          nTarget = sq < 0.7 ? 0 : K.smoothstep(0, 1.4, st);
          if (st > 0 && !cityState.chord) {
            cityState.chord = true;
            audio.play('chord', { notes: [55, 62, 67, 71, 74], dur: 4.5, gain: 0.035 });
          }
          if (st > 4) cityState.seq = -1;
        }
        if (snap) cityState.needle = nTarget;
        else cityState.needle += Math.max(-dt * 2, Math.min(dt * 0.45, nTarget - cityState.needle));
        const nOn = cityState.needle;
        const hue = (t * 0.03) % 1;
        const col = tmpC.setHSL(hue, 0.85, 0.58);
        nd.stripMat.uniforms.uOn.value = K.smoothstep(0.0, 0.25, nOn);
        nd.stripMat.uniforms.uFill.value = Math.min(1, nOn * 1.5);
        nd.stripMat.uniforms.uHue.value = hue;
        nd.ringMat.emissive.setHSL((hue + 0.08) % 1, 0.8, 0.6);
        nd.ringMat.emissiveIntensity = 5.2 * K.smoothstep(0.55, 1.0, nOn);
        podLight.color.copy(col);
        podLight.intensity = 3.2 * nOn;
        const blink = (t % 2.2) < 0.55 ? 1 : 0.08;
        setGlow(beaconMat, blink * Math.max(K.smoothstep(0.3, 0.7, nOn), 0.15 * K.smoothstep(0.3, 0.8, harbourU.value)));
        // glass towers pick up the sky's colour
        skyTint.copy(e.post.skyBottom).lerp(e.post.skyTop, 0.25);
        for (const g of glassTowers) g.mat.emissive.copy(skyTint).multiplyScalar(g.k * (0.25 + 0.75 * (1 - e.daylight * 0.75)) * (1 - e.night * 0.7));

        skyRefl.value.copy(e.post.skyTop).lerp(e.post.skyBottom, 0.2).multiplyScalar(1.15);
        if (waterWalls) waterWalls.material.emissive.setRGB(0.02, 0.09, 0.16).multiplyScalar(1 - e.daylight);
        waterSurf.material.emissive.setRGB(0.012, 0.05, 0.11).multiplyScalar(1 - e.daylight * 0.85);
        {
          // shine: white by day, the horizon glow at dusk, cool moonlight at night
          const W0 = e.cur;
          const dusk = K.smoothstep(16.8, 18.6, e.hour) * (1 - K.smoothstep(19.6, 20.6, e.hour)) + K.smoothstep(5.2, 6.0, e.hour) * (1 - K.smoothstep(7.2, 8.4, e.hour));
          const c = shine.mat.uniforms.uColor.value;
          c.copy(dayShine).multiplyScalar(0.55).lerp(tmpC.copy(nightShine).multiplyScalar(0.32), e.night);
          c.lerp(tmpC.copy(e.post.skyBottom).multiplyScalar(1.1), dusk * 0.85);
          shine.mat.uniforms.uAmount.value = (1 - W0.clouds * 0.55) * (1 - W0.rain * 0.8) * (1 - W0.fog * 1.6) * (1 - W0.snow * 0.4) * (1 - e.daylight * (1 - dusk) * 0.5);
        }

        // ---- ferry
        const W = e.cur;
        if (fer.phase === 'dock') {
          fer.timer -= dt;
          fer.v = 0;
          if (fer.timer <= 0) {
            fer.phase = 'sail';
            fer.s = 0;
            fer.since = 0;
          }
        } else {
          fer.since += dt;
          const remaining = RL - fer.s;
          const accel = K.smoothstep(0, 3.4, fer.since);
          const brake = Math.min(1, Math.sqrt(Math.max(remaining, 0) / 2.6));
          fer.v = 1.05 * Math.max(0.03, Math.min(accel, brake));
          fer.s = Math.min(RL, fer.s + fer.v * dt);
          if (RL - fer.s < 0.004) {
            fer.phase = 'dock';
            fer.from = 1 - fer.from;
            fer.s = 0;
            fer.timer = DWELL;
            fer.v = 0;
          }
        }
        const u = fer.phase === 'dock' ? (fer.from === 0 ? 0 : 1) : fer.from === 0 ? fer.s / RL : 1 - fer.s / RL;
        const p = route.getPointAt(Math.min(1, Math.max(0, u)));
        const tan = route.getTangentAt(Math.min(1, Math.max(0, u)));
        const heading = Math.atan2(-tan.z, tan.x);
        const sgn = fer.from === 0 ? 1 : -1;
        const wv = 1 + W.wind * 1.5;
        ferry.group.position.set(p.x, -0.03 + Math.sin(t * 1.25) * 0.022 * wv, p.z);
        ferry.group.rotation.y = heading + Math.sin(t * 0.37) * 0.012;
        ferry.group.rotation.x = Math.sin(t * 0.9) * 0.014 * wv;
        ferry.group.rotation.z = Math.sin(t * 0.7 + 1) * 0.008 * wv + sgn * fer.v * 0.012;
        ferry.group.updateMatrixWorld();
        // flags fly downwind, plus the breeze from moving
        const awx = e.windDir.x * (0.5 + W.wind) - tan.x * sgn * fer.v * 0.9;
        const awz = e.windDir.y * (0.5 + W.wind) - tan.z * sgn * fer.v * 0.9;
        const flagA = Math.atan2(-awz, awx) - ferry.group.rotation.y;
        ferry.flags.forEach((f, i) => {
          f.rotation.y = flagA + Math.sin(t * 7 + i * 2) * 0.16;
          f.scale.x = 0.9 + 0.1 * Math.sin(t * 9 + i);
        });
        // wake from the trailing end
        const stern = ferry.group.localToWorld(tmpV.copy(ferry.ends[sgn > 0 ? 1 : 0]));
        const dl = Math.hypot(tan.x, tan.z) || 1;
        wake.mat.uniforms.uColor.value.setRGB(0.93, 0.97, 0.96).multiplyScalar(0.55 + 0.45 * e.daylight);
        wake.update(t, dt, fer.phase === 'sail' ? { x: stern.x, z: stern.z, dx: (tan.x / dl) * sgn, dz: (tan.z / dl) * sgn, s: Math.min(1, fer.v / 0.9) } : null);
        // bow wave and churn along the hull
        churn.mat.uniforms.uColor.value.setRGB(0.95, 0.98, 0.97).multiplyScalar(0.55 + 0.45 * e.daylight);
        if (fer.phase === 'sail' && fer.v > 0.15) {
          churnAcc += dt * fer.v * 34;
          const fx = (tan.x / dl) * sgn, fz = (tan.z / dl) * sgn;
          while (churnAcc >= 1) {
            churnAcc -= 1;
            const side = Math.random() < 0.5 ? -1 : 1;
            const bow = Math.random() < 0.55;
            const lx = bow ? sgn * (1.55 + Math.random() * 0.15) : (Math.random() - 0.5) * 2.8;
            const lz = side * (bow ? 0.25 + Math.random() * 0.25 : 0.6);
            const wp = ferry.group.localToWorld(tmpV.set(lx, 0, lz));
            const out = (bow ? 0.75 : 0.35) * (0.6 + Math.random() * 0.6) * fer.v;
            // outward from the hull, the near side relative to travel
            churn.emit(wp.x, wp.z, -fz * side * out * sgn - fx * 0.15, fx * side * out * sgn - fz * 0.15, t);
          }
        }
        // horn steam
        if (fer.horn > 0) {
          fer.horn -= dt;
          if (fer.horn > 0.4) for (let k = 0; k < 3; k++) puff.emit(ferry.group.localToWorld(tmpV.copy(ferry.whistle)), t - k * dt * 0.33);
        }
        puff.mat.uniforms.uColor.value.setRGB(1, 0.97, 0.92).multiplyScalar(0.62 + 0.38 * e.daylight);

        // ---- traffic
        for (const c of cars) {
          const span = SIZE + 2;
          const x = ((((t * c.speed + c.off) % span) + span) % span) - span / 2;
          c.g.position.set(c.dir * x, CITY_Y, c.lane);
          c.g.visible = Math.abs(x) < HALF + 0.55;
        }

        // ---- sailboats, buoys
        for (const s of sails) {
          const a = t * s.w + s.ph;
          const x = s.c[0] + Math.cos(a) * s.r[0], z = s.c[1] + Math.sin(a) * s.r[1];
          const dx = -Math.sin(a) * s.r[0] * Math.sign(s.w), dz = Math.cos(a) * s.r[1] * Math.sign(s.w);
          s.g.position.set(x, -0.02 + Math.sin(t * 1.3 + s.ph) * 0.03 * wv, z);
          s.g.rotation.y = Math.atan2(-dz, dx);
          s.g.rotation.x = (0.1 + W.wind * 0.18) * Math.sign(s.w) + Math.sin(t * 1.1 + s.ph) * 0.03;
          s.g.rotation.z = Math.sin(t * 0.8 + s.ph) * 0.03;
        }
        for (const b of buoys) {
          b.group.position.y = -0.06 + Math.sin(t * 1.6 + b.ph) * 0.035 * wv;
          b.group.rotation.z = Math.sin(t * 1.2 + b.ph) * 0.08 * wv;
          b.group.rotation.x = Math.cos(t * 1.0 + b.ph) * 0.06 * wv;
          setGlow(b.mat, ((t + b.ph) % 2.6) < 0.45 ? 1 : 0.04);
        }

        // ---- gulls by day
        const gullsOn = e.daylight > 0.35 && W.rain < 0.6 && W.snow < 0.6;
        for (const gl of gulls) {
          gl.g.visible = gullsOn;
          if (!gullsOn) continue;
          const a = t * gl.w + gl.ph;
          gl.g.position.set(gl.c[0] + Math.cos(a) * gl.r, gl.y + Math.sin(t * 0.6 + gl.ph) * 0.25, gl.c[1] + Math.sin(a) * gl.r);
          gl.g.rotation.y = Math.atan2(-Math.cos(a) * gl.w, -Math.sin(a) * gl.w);
          gl.g.rotation.x = -Math.sign(gl.w) * 0.3;
          const flap = Math.sin(t * 0.7 + gl.ph * 3) > -0.2 ? Math.sin(t * 9 + gl.ph) * 0.65 : 0.12;
          gl.g.userData.wings[0].rotation.x = -flap;
          gl.g.userData.wings[1].rotation.x = Math.PI + flap;
        }

        // ---- people (umbrella twins swap in the rain)
        const wetOut = W.rain > 0.3;
        for (const wk of walkers) {
          wk.p.visible = wk.umb === wetOut;
          if (wk.p.visible) wk.w.update(t);
        }

        // ---- fireworks
        while (show.queue.length && show.queue[0].launch <= t) {
          const sh = show.queue.shift();
          const at = sh.launch + sh.rise;
          fw.fire({ at, center: sh.center, from: V(BARGE.x - 0.36 + Math.floor(rand() * 4) * 0.24, 0.3, BARGE.z), rise: sh.rise, kind: sh.kind, speed: sh.speed * (0.9 + rand() * 0.2), life: sh.life, trail: sh.trail, colA: sh.colA, colB: sh.colB, axis: sh.axis });
          show.events.push({ at, center: sh.center, color: sh.colA, launched: false, boomed: false, launch: sh.launch });
        }
        for (const ev of show.events) {
          if (!ev.launched && t >= ev.launch) {
            ev.launched = true;
            audio.play('whoosh', { dur: 0.8, gain: 0.18 });
          }
          if (!ev.boomed && t >= ev.at) {
            ev.boomed = true;
            show.last = t;
            audio.play('boom', { power: 0.55 + rand() * 0.4, delay: 0.12 });
            const fl = flashes[0].t < flashes[1].t ? flashes[0] : flashes[1];
            fl.t = t;
            fl.peak = 12;
            fl.l.position.copy(ev.center);
            fl.l.color.copy(ev.color).lerp(WHITE, 0.25);
          }
        }
        show.events = show.events.filter((ev) => !ev.boomed || t - ev.at < 0.1);
        for (const fl of flashes) {
          const a = t - fl.t;
          fl.l.intensity = a >= 0 && a < 2 ? fl.peak * Math.exp(-a * 4) : 0;
        }

        // ---- sound
        const A = audio;
        if (A) {
          A.setLoop('hum', K.smoothstep(0.3, 0.9, e.night) * 0.9);
          A.setLoop('traffic', e.daylight * 0.25);
          gullTimer -= dt;
          if (gullTimer <= 0) {
            if (gullsOn && rand() < 0.7) A.play('gull');
            gullTimer = 3 + rand() * 5;
          }
          if (fer.phase === 'sail' && fer.since < dt * 1.5 && fer.horn <= 0) A.play('horn', { pitch: 0.62, dur: 0.7, gain: 0.5 });
        }
      },
    };
  },
};
