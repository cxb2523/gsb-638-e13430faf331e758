import * as THREE from 'three';
import * as K from './kit.js';
import { person } from './kit-people.js';
import { toon, uni, shared } from '../engine/materials.js';
import * as C from './campsite-parts.js';

// Campsite: a backcountry site on a granite point of a Shield lake. Pink and grey rock with lichen,
// windswept white pines, spruce and birch, a tent glowing from inside, a campfire with someone sitting
// by it, a red canoe pulled up on the rock, a food pack hung in a pine, lily pads and a loon.
// Scene buttons: Stoke (the fire flares and throws sparks), Aurora (northern lights), Loon (it calls and dives).

const SIZE = 16, CELLS = 56, WATER = 0, BASE = -1.9, STEP = 0.2;
const S2 = Math.SQRT1_2;
// u runs to the right of the default view, v runs toward the camera
const toUV = (x, z) => [(x - z) * S2, (x + z) * S2];
const toXZ = (u, v) => [(u + v) * S2, (v - u) * S2];
const bump = (u, v, cu, cv, r) => Math.exp(-((u - cu) ** 2 + (v - cv) ** 2) / (r * r));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// layout in (u, v)
const FIRE = [0.6, -0.5];
const TENT = [-0.95, -2.5];
const SEAT = [-0.1, -1.18];
const SEAT2 = [1.5, -0.15];
const LOG = [1.32, -1.2];
const WOOD = [-0.95, 0.35];
const HERO = [1.85, -2.05];
const CANOE = [1.3, 1.2];
const PACKTREE = [-1.75, -3.8];
const LOON = [3.9, 3.0];
const LILY = [-3.9, -1.5];
const ISLAND = [5.9, 0.35];

function seg(pu, pv, au, av, bu, bv) {
  const du = bu - au, dv = bv - av;
  const t = clamp(((pu - au) * du + (pv - av) * dv) / (du * du + dv * dv), 0, 1);
  return [Math.hypot(pu - au - du * t, pv - av - dv * t), t];
}

const ICONS = {
  stoke: ['....#..#.', '...##....', '...###...', '..####...', '..##.##..', '.##..###.', '.##...##.', '..##.##..', '...###...'],
  aurora: ['##.....##', '#.##.##.#', '#.#.#.#.#', '..#.#.#..', '..#...#..', '.........', '......#..', '.....###.', '....#####'],
  loon: ['.........', '.....##..', '.....####', '.....#...', '..####...', '.#######.', '..######.', '.........', '##.##.##.'],
};

export default {
  name: 'Campsite',
  view: { target: [0, 0.55, 0], size: 16.2, azimuth: 45, elevation: 30 },
  look: { levels: 12, dither: 0.44, outline: 0.6, highlight: 0.38, bloom: 1.1, bloomThreshold: 2.3, contrast: 1.12, saturation: 1.2, vignette: 0.24, texture: 1.15 },
  env: { hour: 21.5, weather: 'clear' },
  audio: { water: 0.55, birds: 0.75, crickets: 1, foghorn: 0 },
  mirror: { y: 0 },
  sky: { moon: 0.85, milky: 1, moonPos: [0.72, 0.85] },
  wind: [S2, -S2],
  actionsLabel: 'Campsite',

  create({ env, audio }) {
    const root = new THREE.Group();
    const rand = K.rng(1917);
    const n = K.noise2(23);
    const nCell = K.noise2(5);

    // ------------------------------------------------------------ land
    const field = (u, v) => {
      const wob = (n(u * 0.45 + 20, v * 0.45 + 3) - 0.5) * 0.9 + (n(u * 1.25 + 4, v * 1.25) - 0.5) * 0.35;
      const back = -3.55 - v + 0.022 * u * u + 0.04 * u;
      const [dp, tp] = seg(u, v, 0.15, -3.6, 1.35, 1.55);
      const point = 1.85 - 0.7 * tp - dp;
      const head = 2.45 - Math.hypot(u + 8.4, v - 0.9);
      const isl = Math.max(1.05 - Math.hypot(u - ISLAND[0], v - ISLAND[1]), 0.45 - Math.hypot(u - 7.0, v + 0.35));
      const islet = 0.4 - Math.hypot(u - 4.3, v + 2.5);
      return Math.max(Math.max(back, point, head) + wob, isl + wob * 0.35, islet + wob * 0.2);
    };
    const padTo = (h, u, v, [pu, pv], r0, r1, target) => h + (target - h) * (1 - K.smoothstep(r0, r1, Math.hypot(u - pu, v - pv)));
    const height = (x, z) => {
      const [u, v] = toUV(x, z);
      const d = field(u, v);
      let h;
      if (d < 0) h = Math.max(-0.1 + d * 0.6, -1.5);
      else {
        h = 0.08 + Math.min(d, 1.0) * 0.5 + Math.max(d - 1.0, 0) * 0.1;
        h += (bump(u, v, -4.4, -5.6, 3.0) * 0.7 + bump(u, v, 2.6, -6.2, 2.0) * 0.45 + bump(u, v, -8.4, 0.2, 2.0) * 0.3) * K.smoothstep(0.2, 1.2, d);
        h -= K.smoothstep(-7.5, -10.5, v) * 0.35;
        h += (n(x * 0.75 + 3, z * 0.75) - 0.5) * 0.5 * K.smoothstep(0.15, 0.9, d);
      }
      h = padTo(h, u, v, TENT, 0.85, 1.2, 0.6);
      h = padTo(h, u, v, FIRE, 0.8, 1.2, 0.4);
      return h;
    };

    const forest = (u, v) => Math.max(
      K.smoothstep(-3.7, -4.7, v) * K.smoothstep(0.9, -0.1, u + 0.18 * (v + 4)),
      K.smoothstep(-7.3, -8.3, v),
      K.smoothstep(-5.6, -6.6, u) * K.smoothstep(-0.4, -1.4, v),
    );
    const campDist = (u, v) => Math.min(Math.hypot(u - TENT[0], v - TENT[1]) - 0.95, Math.hypot(u - FIRE[0], v - FIRE[1]) - 0.75, Math.hypot(u - (TENT[0] + FIRE[0]) / 2, v - (TENT[1] + FIRE[1]) / 2) - 0.45);

    const GRANITE_P = ['#d2a593', '#c8998a', '#dcb2a1'];
    const GRANITE_G = ['#b3adab', '#a6a09f', '#c0bab6'];
    const LICHEN = ['#c9bb62', '#d98f40', '#a6b88a', '#e2dbc8'];
    const T = K.terrain({
      size: SIZE, cells: CELLS, step: STEP, base: BASE, height, lip: 0.08,
      top(x, z, h, c) {
        const [u, v] = toUV(x, z);
        const r = nCell(x * 9.1 + 0.5, z * 9.1 + 0.5);
        const pinkness = n(x * 0.3 + 50, z * 0.3);
        const tone = n(x * 0.85 + 11, z * 0.85 + 4);
        if (h < WATER - 0.05) {
          if (h > -0.55) return c.set(pinkness > 0.5 ? '#b08a72' : '#9c8a7c');
          return c.set(h > -1.0 ? '#616050' : '#4e5046');
        }
        if (h < 0.25) return c.set(tone < 0.5 ? '#6a6262' : '#756c6a');
        if (campDist(u, v) < 0) return c.set(r < 0.3 ? '#93714f' : r < 0.65 ? '#a07c5a' : '#aa8763');
        const f = forest(u, v);
        const rock = n(x * 1.1 + 7, z * 1.1 + 2);
        if (f > 0.5 && rock < 0.64) return c.set(r < 0.22 ? '#80603f' : r < 0.55 ? '#58723c' : r < 0.82 ? '#4c6636' : '#668241');
        if (r > 0.9) return c.set(LICHEN[Math.floor(nCell(x * 3.7, z * 3.7) * 4) % 4]);
        if (r < 0.05 && h > 0.45) return c.set('#71904a');
        const pal = pinkness > 0.45 ? GRANITE_P : GRANITE_G;
        return c.set(pal[tone < 0.4 ? 0 : tone < 0.62 ? 1 : 2]);
      },
      side(x, z, y, h, outer, c) {
        const [u, v] = toUV(x, z);
        const pinkness = n(x * 0.3 + 50, z * 0.3);
        const lip = h - y < 0.09 && h > 0.3;
        if (lip && forest(u, v) > 0.5) return c.set('#506c38');
        if (!outer) {
          if (y < WATER) return c.set('#85746a');
          return c.set(pinkness > 0.45 ? (lip ? '#bf9586' : '#a3837a') : lip ? '#a49d9b' : '#8f8988');
        }
        if (lip) return c.set(pinkness > 0.45 ? '#bf9586' : '#a49d9b');
        if (y > -0.6) return c.set(pinkness > 0.45 ? '#a28176' : '#8f8786');
        if (y > -1.2) return c.set(Math.floor(y / 0.6) % 2 ? '#7f716e' : '#93796e');
        return c.set(Math.floor(y / 0.6) % 2 ? '#5f5a64' : '#6b656e');
      },
    });
    uni(T.mesh.material).uNoiseAmt.value = 0.2;
    uni(T.mesh.material).uNoiseScale.value = 3.4;
    root.add(T.mesh);
    const ground = T.heightAt;
    const gUV = (u, v) => ground(...toXZ(u, v));
    const isLand = (x, z) => ground(x, z) > WATER + 0.1;
    const at = (u, v, dy = 0) => {
      const [x, z] = toXZ(u, v);
      return new THREE.Vector3(x, ground(x, z) + dy, z);
    };
    // yaw that points an object's local +x along (du, dv)
    const yawUV = (du, dv) => {
      const x = (du + dv) * S2, z = (dv - du) * S2;
      return Math.atan2(-z, x);
    };

    root.add(K.water({
      size: SIZE, level: WATER, heightAt: ground, base: BASE, edgeCells: CELLS,
      shallow: '#5c978a', deep: '#173a5c', foam: '#d9e6e2', deepAt: 1.25, reflect: 0.42, wall: ['#3b7c84', '#112a46'],
    }));

    // ------------------------------------------------------------ vegetation
    const foliage = (wind) => toon('#ffffff', { vertexColors: true, ramp: 'foliage', wind, noise: 0.16, noiseScale: 4.5, snow: 0.9 });
    const pineMat = foliage(0.022);
    const spruceMat = foliage(0.03);
    const birchMat = foliage(0.045);
    const bushMat = toon('#ffffff', { vertexColors: true, ramp: 'foliage', wind: 0.08, noise: 0.12, noiseScale: 6, snow: 0.8 });
    const trees = [];
    const taken = (u, v, r) => trees.some((t) => Math.hypot(t.u - u, t.v - v) < r + t.r);
    const keepOut = (u, v, r) =>
      Math.hypot(u - TENT[0], v - TENT[1]) < 1.15 + r ||
      Math.hypot(u - FIRE[0], v - FIRE[1]) < 1.55 + r ||
      Math.hypot(u - CANOE[0], v - CANOE[1]) < 1.25 + r ||
      Math.hypot(u - WOOD[0], v - WOOD[1]) < 0.4 + r;
    const inBlock = (u, v, m = 0.4) => {
      const [x, z] = toXZ(u, v);
      return Math.abs(x) < SIZE / 2 - m && Math.abs(z) < SIZE / 2 - m;
    };

    // hero white pine on the point, swept out over the water
    const heroGeo = C.whitePineGeometry(K.rng(77), { h: 4.7, tiers: 6, reach: 1.25, pad: 1.1, lean: 0.16, bare: 0.3 });
    const hero = K.mesh(heroGeo, pineMat);
    hero.position.copy(at(...HERO));
    hero.rotation.y = Math.PI / 4;
    root.add(hero);
    trees.push({ u: HERO[0], v: HERO[1], r: 0.55 });

    // the pine with the food pack
    const packTree = K.mesh(C.whitePineGeometry(K.rng(31), { h: 4.3, tiers: 5, reach: 1.0, bare: 0.44 }), pineMat);
    packTree.position.copy(at(...PACKTREE));
    packTree.rotation.y = Math.PI / 4 + 0.3;
    root.add(packTree);
    trees.push({ u: PACKTREE[0], v: PACKTREE[1], r: 0.5 });

    const pinePlaces = [], sprucePlaces = [], birchPlaces = [];
    const addTree = (list, u, v, r, s, ry) => {
      const p = at(u, v);
      list.push({ x: p.x, y: p.y, z: p.z, ry, s });
      trees.push({ u, v, r });
    };
    // white pines along the shore and on the ridge, spaced so each silhouette reads
    for (const [u, v, s] of [[-0.6, -6.2, 0.92], [-4.7, -4.6, 1.02], [-7.8, -0.6, 0.9], [3.4, -5.6, 0.8], [ISLAND[0] - 0.1, ISLAND[1] - 0.1, 0.62]]) {
      if (gUV(u, v) > 0.15) addTree(pinePlaces, u, v, 0.6, s, Math.PI / 4 + (rand() - 0.5) * 0.4);
    }
    // birches by the bay and on the headland
    for (const [u, v] of [[-2.85, -3.55], [-3.7, -4.05], [-2.45, -4.45], [-6.9, 1.0], [-8.8, 1.8], [-6.6, 2.4], [-5.6, -3.4]]) {
      if (gUV(u, v) > 0.15) addTree(birchPlaces, u, v, 0.35, 0.85 + rand() * 0.3, rand() * Math.PI * 2);
    }
    // spruce along the back of the site
    for (let tries = 0; tries < 3000 && sprucePlaces.length < 30; tries++) {
      const u = (rand() - 0.5) * 22.6, v = (rand() - 0.5) * 22.6;
      if (!inBlock(u, v, 0.45)) continue;
      const h = gUV(u, v);
      if (h < 0.25) continue;
      const f = forest(u, v);
      if (f < 0.55 || rand() > f) continue;
      if (keepOut(u, v, 0.3) || taken(u, v, 0.36)) continue;
      addTree(sprucePlaces, u, v, 0.36, (0.78 + rand() * 0.4) * (1 - 0.22 * K.smoothstep(-6.5, -10, v)), rand() * Math.PI * 2);
    }
    // island and islet spruce
    addTree(sprucePlaces, ISLAND[0] + 0.45, ISLAND[1] + 0.25, 0.3, 0.7, 1.0);
    addTree(sprucePlaces, 4.3, -2.5, 0.3, 0.52, 2.0);
    for (const [u, v, sc] of [[4.6, -5.3, 0.72], [2.2, -6.9, 0.8], [5.6, -4.6, 0.6]]) if (gUV(u, v) > 0.2) addTree(sprucePlaces, u, v, 0.35, sc, rand() * 6);

    const instanced = (geos, mat, list) => {
      const out = [];
      geos.forEach((geo, gi) => {
        const items = list.filter((_, i) => i % geos.length === gi);
        if (!items.length) return;
        const m = new THREE.InstancedMesh(geo, mat, items.length);
        const d = new THREE.Object3D();
        items.forEach((p, i) => {
          d.position.set(p.x, p.y, p.z);
          d.rotation.set(0, p.ry, 0);
          d.scale.setScalar(p.s);
          d.updateMatrix();
          m.setMatrixAt(i, d.matrix);
        });
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
        out.push(m);
      });
      return out;
    };
    const pineGeos = [0, 1, 2].map((i) => C.whitePineGeometry(K.rng(100 + i), { h: 4.0 + i * 0.25, tiers: 5, reach: 0.95 }));
    const spruceGeos = [0, 1, 2, 3].map((i) => C.spruceGeometry(K.rng(200 + i), { h: 2.3 + i * 0.28, w: 0.5 + (i % 2) * 0.08, tiers: 6 + (i % 2), club: i === 1 }));
    const birchGeos = [0, 1, 2].map((i) => C.birchGeometry(K.rng(300 + i), { h: 2.5 + i * 0.2, trunks: 1 + i }));
    root.add(...instanced(pineGeos, pineMat, pinePlaces), ...instanced(spruceGeos, spruceMat, sprucePlaces), ...instanced(birchGeos, birchMat, birchPlaces));

    // blueberries on the open rock
    const berryPlaces = [];
    for (let tries = 0; tries < 1500 && berryPlaces.length < 44; tries++) {
      const u = (rand() - 0.5) * 22, v = (rand() - 0.5) * 22;
      if (!inBlock(u, v, 0.3)) continue;
      const h = gUV(u, v);
      if (h < 0.3 || keepOut(u, v, 0.1) || taken(u, v, 0.18)) continue;
      if (forest(u, v) > 0.7 && rand() < 0.75) continue;
      const p = at(u, v);
      berryPlaces.push({ x: p.x, y: p.y, z: p.z, ry: rand() * Math.PI * 2, s: 0.8 + rand() * 0.5 });
      trees.push({ u, v, r: 0.16 });
    }
    const berryGeos = [0, 1, 2, 3].map((i) => C.blueberryGeometry(K.rng(400 + i), { r: 0.22 + (i % 2) * 0.05, red: i === 3 }));
    root.add(...instanced(berryGeos, bushMat, berryPlaces));

    // grass in the cracks
    root.add(K.grass(rand, 900, (r) => {
      const u = (r() - 0.5) * 22, v = (r() - 0.5) * 22;
      if (!inBlock(u, v, 0.15)) return null;
      const h = gUV(u, v);
      if (h < 0.3 || campDist(u, v) < 0.1 || keepOut(u, v, -0.25)) return null;
      const f = forest(u, v);
      if (f < 0.5 && r() < 0.55) return null;
      const p = at(u, v);
      return [p.x, p.y, p.z];
    }, ['#7d9a49', '#6a8a3e', '#93a85a', '#5b7a39']));

    // boulders and a few rocks in the water
    const rockMat = toon('#ffffff', { vertexColors: true, noise: 0.22, noiseScale: 5 });
    const boulder = (u, v, s, pink, sink = 0.3) => {
      const p = at(u, v);
      const m = K.mesh(C.boulderGeometry(rand, s, { pink }), rockMat);
      m.position.set(p.x, Math.max(p.y, WATER - s * 0.5) - s * sink * 0.5, p.z);
      m.rotation.y = rand() * Math.PI;
      root.add(m);
      trees.push({ u, v, r: s * 0.8 });
    };
    boulder(-1.15, -0.65, 0.42, true);
    boulder(2.45, -0.35, 0.36, false);
    boulder(0.05, 1.05, 0.3, true);
    boulder(-3.0, -0.2, 0.4, false, 0.6);
    boulder(4.7, 1.3, 0.3, true, 0.6);
    boulder(2.3, 2.5, 0.26, false, 0.7);
    boulder(2.9, -4.4, 0.5, true);
    boulder(-3.3, -5.6, 0.45, false);
    boulder(4.9, -3.2, 0.34, true, 0.6);
    boulder(-6.2, 1.4, 0.36, true);

    // lily pads in the bay
    const lily = C.lilyPads(rand, 52, (r) => {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 1.5;
      const u = LILY[0] + Math.cos(a) * d * 0.9, v = LILY[1] + Math.sin(a) * d * 1.2;
      const h = gUV(u, v);
      if (h > -0.12 || h < -0.9 || !inBlock(u, v, 0.4)) return null;
      return toXZ(u, v);
    });
    root.add(lily.pads);
    if (lily.flowers) root.add(lily.flowers);

    // driftwood on the bay shore and a dead snag leaning out from the headland
    const drift = K.mesh(C.logGeometry(rand, { len: 1.1, r: 0.08, bark: '#a7a097', cut: '#c9c1b2' }), toon('#ffffff', { vertexColors: true, noise: 0.15 }));
    drift.position.copy(at(-2.05, -2.85, 0.07));
    drift.rotation.set(0, yawUV(1, 0.6), 0.06);
    root.add(drift);
    {
      const s = [];
      const base = new THREE.Vector3(0, 0, 0);
      const tip = new THREE.Vector3(0.55, 2.3, 0.0);
      s.push(C.limb(base, tip, 0.1, 0.04, '#8c8782', 5));
      for (const [f, dx, dy, dz] of [[0.45, -0.35, 0.25, 0.1], [0.62, 0.4, 0.2, -0.1], [0.8, -0.25, 0.3, 0.05]]) {
        const a = base.clone().lerp(tip, f);
        s.push(C.limb(a, a.clone().add(new THREE.Vector3(dx, dy, dz)), 0.035, 0.03, '#8c8782', 4));
      }
      const snag = K.mesh(K.merge(s), toon('#ffffff', { vertexColors: true, noise: 0.1 }));
      snag.position.copy(at(-6.3, 0.2));
      snag.rotation.y = yawUV(1, 0.15);
      root.add(snag);
    }

    // ------------------------------------------------------------ camp
    const lights = [];
    const tent = C.tent({ L: 1.5, W: 1.16, H: 0.8 });
    tent.group.position.copy(at(...TENT));
    const tentYaw = yawUV(0.12, 1);
    tent.group.rotation.y = tentYaw;
    root.add(tent.group);
    const tentLight = K.lampLight(root, tent.light.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), tentYaw).add(tent.group.position), { color: '#ffb35a', power: 1.7, distance: 3.6 });
    lights.push(tentLight);

    const fireP = at(...FIRE);
    const ring = K.mesh(C.fireRing(rand, { r: 0.4 }), toon('#ffffff', { vertexColors: true, noise: 0.15, noiseScale: 6, snow: 0.7 }));
    ring.position.copy(fireP);
    root.add(ring);
    const flame = C.flame({ width: 1.0, height: 0.95 });
    flame.material.uniforms.uOrigin.value.copy(fireP).add(new THREE.Vector3(0, 0.05, 0));
    root.add(flame);
    const sparkFX = C.sparks(fireP.clone().add(new THREE.Vector3(0, 0.4, 0)));
    root.add(sparkFX);
    const coals = C.embers(fireP, rand, { r: 0.28 });
    root.add(coals);
    const smoke = C.fireSmoke(fireP.clone().add(new THREE.Vector3(0, 0.85, 0)));
    root.add(smoke);
    const fireLight = new THREE.PointLight('#ff8a3a', 0, 9.5, 2);
    fireLight.position.copy(fireP).add(new THREE.Vector3(0, 0.55, 0));
    root.add(fireLight);
    // a low glow just above the coals so the ring stones and the ground catch the light
    const coalLight = new THREE.PointLight('#ff6a24', 0, 2.2, 2);
    coalLight.position.copy(fireP).add(new THREE.Vector3(0, 0.18, 0));
    root.add(coalLight);

    const seatP = at(...SEAT);
    const chair = C.campChair({ fabric: '#46744a' });
    chair.position.copy(seatP);
    chair.scale.setScalar(1.15);
    chair.rotation.y = yawUV(FIRE[0] - SEAT[0], FIRE[1] - SEAT[1]);
    root.add(chair);
    const chair2 = C.campChair({ fabric: '#2f6a8c' });
    chair2.position.copy(at(...SEAT2));
    chair2.scale.setScalar(1.15);
    chair2.rotation.y = yawUV(FIRE[0] - SEAT2[0], FIRE[1] - SEAT2[1]);
    root.add(chair2);
    const logM = toon('#ffffff', { vertexColors: true, noise: 0.14, noiseScale: 6 });
    const sitLog = K.mesh(C.logGeometry(rand, { len: 0.85, r: 0.12 }), logM);
    sitLog.position.copy(at(...LOG, 0.1));
    sitLog.rotation.y = yawUV(1, -1.1);
    root.add(sitLog);
    const pile = K.mesh(C.woodpile(rand), logM);
    pile.position.copy(at(...WOOD));
    pile.rotation.y = yawUV(0.3, 1);
    root.add(pile);
    const potM = K.mesh(C.pot(), toon('#ffffff', { vertexColors: true, noise: 0.05 }));
    potM.position.copy(at(FIRE[0] + 0.52, FIRE[1] + 0.12));
    root.add(potM);

    // the camper: sitting, hands out to the fire
    const camper = person(K.rng(9), { coat: '#2e4f7c', pants: '#3a3632', skin: '#e0ac85', hair: '#5a3a22', hat: '#c4473a', scale: 1.3, pose: 'sit' });
    const cp = camper.userData.parts;
    const pantsM = cp.legL.material;
    for (const s of [-1, 1]) {
      const shin = K.mesh(new THREE.BoxGeometry(0.075, 0.2, 0.075), pantsM);
      shin.position.set(0.21, 0.1, s * 0.045);
      camper.add(shin);
      const boot = K.mesh(new THREE.BoxGeometry(0.11, 0.05, 0.08), toon('#3b2a20'));
      boot.position.set(0.24, 0.025, s * 0.045);
      camper.add(boot);
    }
    const stick = K.mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05).translate(0, -0.25, 0), toon('#6b4a30'));
    stick.position.set(0, -0.19, 0);
    stick.rotation.z = 0.25;
    stick.visible = false;
    cp.armR.add(stick);
    const headBits = camper.children.filter((o) => o !== cp.body && o.position.y > 0.5);
    camper.position.copy(seatP).add(new THREE.Vector3(0, 0.0, 0));
    camper.rotation.y = chair.rotation.y;
    const seatYaw = camper.rotation.y;
    root.add(camper);

    // canoe pulled up on the rock, with paddles
    const canoeDir = [0.96, 0.28];
    const cyaw = yawUV(...canoeDir);
    const half = 1.05;
    const bowUV = [CANOE[0] - canoeDir[0] * half, CANOE[1] - canoeDir[1] * half];
    const sternUV = [CANOE[0] + canoeDir[0] * half, CANOE[1] + canoeDir[1] * half];
    const hb = Math.max(gUV(...bowUV), WATER), hs = Math.max(gUV(...sternUV), WATER), hc = Math.max(gUV(...CANOE), WATER);
    const canoeYaw = new THREE.Group();
    canoeYaw.position.copy(at(...CANOE));
    canoeYaw.position.y = Math.max(hc, (hb + hs) / 2) - 0.01;
    canoeYaw.rotation.y = cyaw;
    const canoePitch = new THREE.Group();
    canoePitch.rotation.z = clamp(Math.atan2(hs - hb, half * 2), -0.2, 0.2);
    canoePitch.rotation.x = 0.05;
    canoeYaw.add(canoePitch);
    const canoeMesh = K.mesh(C.canoe({ L: 2.15, B: 0.5, D: 0.22 }), toon('#ffffff', { vertexColors: true, noise: 0.06 }));
    canoePitch.add(canoeMesh);
    const paddleMat = toon('#ffffff', { vertexColors: true, noise: 0.08 });
    const p1 = K.mesh(C.paddleGeometry(), paddleMat);
    p1.position.set(-0.62, 0.22, 0.06);
    p1.rotation.set(0.1, 0.12, 0.02);
    canoePitch.add(p1);
    const p2 = K.mesh(C.paddleGeometry(), paddleMat);
    p2.position.set(-0.25, 0.06, -0.5);
    p2.rotation.set(0.0, -0.35, 0.04);
    canoePitch.add(p2);
    const pfd = K.mesh(new THREE.BoxGeometry(0.2, 0.08, 0.16), toon('#f0a23a', { noise: 0.05 }));
    pfd.position.set(0.56, 0.1, 0.02);
    pfd.rotation.y = 0.3;
    canoePitch.add(pfd);
    root.add(canoeYaw);

    // food pack hung from a long pine branch
    const branchBase = at(PACKTREE[0], PACKTREE[1], 2.15);
    const branchEnd = at(PACKTREE[0] + 1.1, PACKTREE[1] + 0.12, 0);
    branchEnd.y = branchBase.y + 0.12;
    const branch = K.mesh(K.merge([C.limb(branchBase, branchEnd, 0.06, 0.035, '#5d4b42', 5)]), toon('#ffffff', { vertexColors: true, noise: 0.1 }));
    root.add(branch);
    const hang = branchBase.clone().lerp(branchEnd, 0.78);
    const packPivot = new THREE.Group();
    packPivot.position.copy(hang);
    const pack = K.mesh(C.foodPack({ drop: 0.62 }), toon('#ffffff', { vertexColors: true, noise: 0.06 }));
    packPivot.add(pack);
    root.add(packPivot);
    {
      // the rope runs from the branch down to the trunk where it's tied off
      const tie = branchBase.clone();
      tie.y -= 1.2;
      tie.add(new THREE.Vector3(0.08, 0, 0.08));
      root.add(K.mesh(K.merge([C.limb(hang, tie, 0.028, 0.028, '#d9ccaa', 4)]), toon('#ffffff', { vertexColors: true, noise: 0 }), { cast: false }));
    }

    // ------------------------------------------------------------ lake life
    const loon = C.loon();
    loon.group.scale.setScalar(1.25);
    root.add(loon.group);
    const rip = C.ripples(7);
    root.add(rip.group);
    const spl = C.splash(40);
    root.add(spl.points);

    const sparkle = C.lakeSparkle({ size: SIZE });
    // fireflies along the bay, the birches and the point's edges
    const flyPts = [];
    for (let tries = 0; tries < 2000 && flyPts.length < 46; tries++) {
      const u = (rand() - 0.5) * 20, v = (rand() - 0.5) * 20;
      if (!inBlock(u, v, 0.6)) continue;
      const h = gUV(u, v);
      const nearShore = h > -0.6 && h < 0.9;
      const nearBay = Math.hypot(u - LILY[0], v - LILY[1]) < 2.6 || Math.hypot(u + 7.0, v - 1.3) < 2.2;
      if (!nearShore && !nearBay) continue;
      if (Math.hypot(u - FIRE[0], v - FIRE[1]) < 1.4) continue;
      const p = at(u, v);
      flyPts.push([p.x, Math.max(p.y, WATER) + 0.25 + rand() * 0.9, p.z]);
    }
    const flies = C.shoreFireflies(flyPts);
    root.add(flies);
    root.add(sparkle);
    const fog = C.mist({ size: SIZE });
    root.add(fog.group);
    const mistColor = new THREE.Color();
    const rippleLight = new THREE.Color();
    const warm = new THREE.Color('#ffc09a');

    // moonlight fill so the rock still reads at night (the engine's moon key is low and blue)
    const nightFill = new THREE.DirectionalLight('#8ea4e6', 0);
    nightFill.position.set(6, 9, 10);
    root.add(nightFill);
    const fillNight = new THREE.Color('#8ea4e6'), fillDusk = new THREE.Color('#e0a59a');
    const WHITE = new THREE.Color(1, 1, 1);

    // aurora fill: green light from the north sky when the lights are out
    const auroraLight = new THREE.DirectionalLight('#5dffb0', 0);
    auroraLight.position.set(-8, 12, -8);
    root.add(auroraLight);
    const auroraGreen = new THREE.Color('#2a8a6a');

    const info = {
      size: SIZE, top: T.max, bottom: BASE,
      surfaceAt: (x, z) => Math.max(ground(x, z), WATER),
      isLand,
    };

    // ------------------------------------------------------------ state
    // env.time keeps running across scene loads, so every timer starts from now
    const T0 = env.time;
    let stoke = 0, stokeAt = -100;
    const L = { state: 'swim', t0: 0, ang: 0.6, nextDive: T0 + 12, dur: 0, call: -100, fx: 0, pending: false };
    let lookUntil = -100;
    let nextCall = T0 + 5, nextOwl = T0 + 16, nextFish = T0 + 4, nextIdle = T0 + 8, idle = null;
    const loonPos = (ang) => {
      const u = LOON[0] + Math.cos(ang) * 1.2, v = LOON[1] + Math.sin(ang) * 0.7;
      const [x, z] = toXZ(u, v);
      return new THREE.Vector3(x, 0, z);
    };

    function doStoke(t) {
      stoke = 1;
      stokeAt = t;
      sparkFX.material.uniforms.uBurst.value = t;
      audio.play('whoosh', { dur: 1.2, gain: 0.5 });
      for (let i = 0; i < 5; i++) audio.play('spark', { delay: 0.05 + i * 0.18 + Math.random() * 0.1 });
    }
    function loonDisplay(t) {
      if (L.state === 'under' || L.state === 'dive') {
        L.state = 'surface';
        L.t0 = t;
        L.dur = 0.5;
      }
      L.pending = true;
      L.call = t;
      lookUntil = t + 5;
      audio.play('loon');
    }

    return {
      root,
      info,
      actions: [
        { id: 'stoke', label: 'Stoke', icon: ICONS.stoke, run: (e) => doStoke(e.time), active: () => stoke > 0.15 },
        {
          id: 'aurora', label: 'Aurora', icon: ICONS.aurora,
          run(e, a) {
            e.auroraOn = !e.auroraOn;
            if (!e.auroraOn) return;
            if (e.night < 0.7 && !e.tween) e.goToHour(23.2);
            if (e.weather !== 'clear') e.setWeather('clear');
            a.play('chord', { notes: [57, 64, 69, 71, 76], dur: 6, gain: 0.025 });
          },
          active: () => env.auroraOn,
        },
        { id: 'loon', label: 'Loon', icon: ICONS.loon, run: (e) => loonDisplay(e.time), active: () => L.state === 'display' },
      ],
      onClick(raycaster, e) {
        const hits = raycaster.intersectObjects([ring, camper, loon.group, canoeYaw], true);
        if (!hits.length) return;
        let o = hits[0].object;
        while (o && o !== ring && o !== camper && o !== loon.group && o !== canoeYaw) o = o.parent;
        if (o === loon.group) loonDisplay(e.time);
        else if (o === ring || o === camper) doStoke(e.time);
      },
      update(t, dt, e) {
        const W = e.cur;
        K.updateLamps(lights, e);

        // fire
        stoke *= Math.exp(-dt / 3.4);
        const damp = 1 - 0.35 * W.rain - 0.15 * W.snow;
        const fl = 1 + 0.16 * Math.sin(t * 13.1) * Math.sin(t * 7.3 + 1.3) + 0.09 * Math.sin(t * 23.7 + 0.4) + 0.07 * (Math.random() - 0.5);
        const power = damp * (1 + 1.3 * stoke);
        const dark = 0.25 + 0.75 * Math.max(e.night, e.lamps * 0.8);
        const flare = Math.exp(-Math.max(0, t - stokeAt) * 5);
        fireLight.intensity = 7.5 * dark * power * fl * (1 + 1.4 * flare);
        coalLight.intensity = 2.2 * dark * (0.8 + 0.4 * stoke) * fl;
        const fu = flame.material.uniforms;
        fu.uH.value = (0.9 + 0.07 * Math.sin(t * 3.3)) * damp * (1 + 1.1 * stoke);
        fu.uW.value = 0.95 * (1 + 0.3 * stoke);
        fu.uBright.value = (0.55 + 0.45 * dark) * (0.85 + 0.15 * fl) + 0.25 * stoke;
        const su = sparkFX.material.uniforms;
        su.uRate.value = (0.28 + 0.72 * stoke) * damp;
        su.uLift.value = 1 + 0.9 * stoke;
        coals.material.uniforms.uHeat.value = 0.85 + 0.35 * stoke;
        const sm = smoke.material.uniforms;
        sm.uOn.value = (0.35 + 0.55 * e.daylight) * (1 + 0.4 * W.rain) + 0.35 * stoke;
        sm.uColor.value.setRGB(0.52, 0.53, 0.56).multiplyScalar(0.25 + 0.75 * e.daylight);
        sm.uGlow.value.setRGB(0.9, 0.4, 0.12).multiplyScalar((0.35 + 0.4 * stoke) * e.night);
        audio.setLoop('fire', clamp((0.38 + 0.62 * stoke) * (1 - 0.3 * W.rain), 0, 1));

        // camper: warming hands, breathing, poking the fire after a stoke, glancing at the loon
        const sa = t - stokeAt;
        const poking = sa >= 0 && sa < 2.2;
        stick.visible = poking;
        cp.body.scale.y = 1 + 0.018 * Math.sin(t * 1.7);
        let armR = 0.95 + 0.05 * Math.sin(t * 0.8);
        let armL = 0.95 + 0.05 * Math.sin(t * 0.8 + 1);
        if (poking) armR = 1.25 + 0.22 * Math.sin(sa * 8.5);
        if (t > nextIdle && !idle) idle = { kind: Math.random() < 0.5 ? 'sip' : 'look', t0: t };
        if (idle) {
          const k = (t - idle.t0) / 2.6;
          if (k > 1) {
            idle = null;
            nextIdle = t + 7 + Math.random() * 8;
          } else if (idle.kind === 'sip') armL = 0.95 + Math.sin(k * Math.PI) * 1.2;
        }
        cp.armR.rotation.z = armR;
        cp.armL.rotation.z = armL;
        let yawT = 0;
        if (t < lookUntil || idle?.kind === 'look') {
          const lp = loon.group.position;
          const want = Math.atan2(-(lp.z - camper.position.z), lp.x - camper.position.x);
          let d = want - seatYaw;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          yawT = idle?.kind === 'look' && t >= lookUntil ? -0.7 : clamp(d, -1.3, 1.3);
        }
        for (const o of headBits) o.rotation.y += (yawT - o.rotation.y) * (1 - Math.exp(-dt * 4));

        // pack sways on its rope
        packPivot.rotation.x = Math.sin(t * 1.3) * (0.02 + W.wind * 0.07);
        packPivot.rotation.z = Math.sin(t * 1.05 + 1) * (0.025 + W.wind * 0.08);

        // loon: paddles about, dives now and then, displays and calls on cue
        const bob = Math.sin(t * 1.4) * 0.012;
        const lg = loon.group;
        if (L.state === 'swim') {
          L.ang += dt * 0.07;
          const p = loonPos(L.ang), ahead = loonPos(L.ang + 0.05);
          lg.position.set(p.x, WATER - 0.015 + bob, p.z);
          lg.rotation.set(0, Math.atan2(-(ahead.z - p.z), ahead.x - p.x), 0);
          loon.body.rotation.z = 0;
          if (L.pending) {
            L.pending = false;
            L.state = 'display';
            L.t0 = t;
            L.fx = 0;
          } else if (t > L.nextDive && W.storm < 0.5) {
            L.state = 'dive';
            L.t0 = t;
            rip.ring(lg.position.x, lg.position.z, t, 1.1, 2.0);
            spl.fire(lg.position, t, 0.5);
          }
        }
        if (L.state === 'display') {
          const k = t - L.t0;
          const rise = K.smoothstep(0, 0.35, k) * (1 - K.smoothstep(2.0, 2.5, k));
          loon.body.rotation.z = rise * 0.75;
          lg.position.y = WATER - 0.015 + rise * 0.12 + bob;
          const flap = Math.sin(k * 14) * 0.7;
          for (const w of loon.wings) {
            w.pivot.scale.setScalar(Math.max(0.001, rise));
            w.pivot.rotation.x = w.s * (0.4 + flap) * rise;
          }
          if (k > 0.25 && L.fx < 1) {
            L.fx = 1;
            rip.ring(lg.position.x, lg.position.z, t, 1.5, 2.4);
            spl.fire(lg.position, t, 0.9);
          }
          if (k > 1.2 && L.fx < 2) {
            L.fx = 2;
            rip.ring(lg.position.x, lg.position.z, t, 1.0, 2.0);
          }
          if (k > 2.6) {
            for (const w of loon.wings) w.pivot.scale.setScalar(0.001);
            L.state = 'swim';
            L.nextDive = t + 1.6;
          }
        } else if (L.state === 'dive') {
          const k = (t - L.t0) / 0.8;
          loon.body.rotation.z = -K.smoothstep(0, 0.5, k) * 0.9;
          lg.position.y = WATER - 0.015 - K.smoothstep(0.15, 1, k) * 0.5;
          if (k >= 1) {
            L.state = 'under';
            L.t0 = t;
            L.dur = 3.5 + Math.random() * 3;
            lg.visible = false;
          }
        } else if (L.state === 'under') {
          if (t - L.t0 > L.dur || L.pending) {
            L.ang += 0.9 + Math.random() * 1.2;
            L.state = 'surface';
            L.t0 = t;
            L.dur = 0.6;
            const p = loonPos(L.ang);
            lg.position.set(p.x, WATER - 0.3, p.z);
            rip.ring(p.x, p.z, t, 1.0, 1.8);
          }
        } else if (L.state === 'surface') {
          lg.visible = true;
          const k = clamp((t - L.t0) / L.dur, 0, 1);
          const p = loonPos(L.ang), ahead = loonPos(L.ang + 0.05);
          lg.position.set(p.x, WATER - 0.3 + 0.285 * K.smoothstep(0, 1, k) + bob, p.z);
          lg.rotation.set(0, Math.atan2(-(ahead.z - p.z), ahead.x - p.x), 0);
          loon.body.rotation.z = (1 - k) * 0.35;
          if (k >= 1) {
            L.state = 'swim';
            L.nextDive = t + 14 + Math.random() * 14;
          }
        }
        // the head lifts when it calls
        loon.head.rotation.z = (t - L.call < 2.8 ? Math.sin(Math.min(1, (t - L.call) / 0.4) * Math.PI * 0.5) * 0.35 : 0);

        // night voices
        if (t > nextCall) {
          nextCall = t + 24 + Math.random() * 30;
          if (e.night > 0.45 && W.rain < 0.3 && W.storm < 0.2) {
            audio.play('loon');
            L.call = t;
            if (Math.random() < 0.5) lookUntil = t + 3.5;
          }
        }
        if (t > nextOwl) {
          nextOwl = t + 30 + Math.random() * 35;
          if (e.night > 0.6 && W.rain < 0.3) audio.play('owl');
        }
        // fish rising on calm water
        if (t > nextFish) {
          nextFish = t + 5 + Math.random() * 9;
          if (W.rain < 0.2 && W.wind < 0.6) {
            for (let k = 0; k < 8; k++) {
              const x = (Math.random() - 0.5) * SIZE * 0.85, z = (Math.random() - 0.5) * SIZE * 0.85;
              if (ground(x, z) < -0.5) {
                rip.ring(x, z, t, 0.7, 1.6);
                break;
              }
            }
          }
        }
        const rl = rippleLight.setRGB(0.85, 0.92, 0.92).multiplyScalar(0.25 + 0.75 * e.daylight);
        rip.update(t, rl);
        spl.color.copy(rl).multiplyScalar(1.1);

        flies.material.uniforms.uAmount.value = e.fireflies;
        flies.visible = e.fireflies > 0.01;

        // lake sparkle: moon glitter and reflected stars
        const ku = sparkle.material.uniforms;
        ku.uMoon.value = e.post.moon;
        ku.uStars.value = e.post.stars;
        ku.uMoonPos.value.copy(e.post.moonPos);
        ku.uAurora.value = e.post.aurora;

        // mist: thick in fog, a thin layer on the lake at dawn
        const hr = e.hour;
        const dawn = K.smoothstep(4.6, 5.8, hr) * (1 - K.smoothstep(7.8, 9.4, hr));
        const amount = clamp(Math.max(W.fog * 1.2, dawn * 0.75) * (1 - W.rain * 0.7) * (1 - W.storm), 0, 1);
        mistColor.copy(e.post.fogColor).lerp(WHITE, 0.35).lerp(warm, dawn * 0.3 * e.daylight).multiplyScalar(0.45 + 0.75 * e.daylight);
        fog.set(amount, mistColor);

        // fill: dusky rose at sundown, moon blue at night
        const hr0 = e.hour;
        const duskF = Math.max(K.smoothstep(17.9, 19.0, hr0) * (1 - K.smoothstep(20.2, 21.4, hr0)), K.smoothstep(4.8, 5.6, hr0) * (1 - K.smoothstep(6.8, 7.9, hr0)));
        const nf = Math.max(K.smoothstep(0.15, 0.9, e.night) * 0.5, duskF * 0.55) * (1 - 0.42 * W.clouds) * (1 - 0.5 * W.fog);
        nightFill.intensity = nf;
        nightFill.color.copy(fillDusk).lerp(fillNight, K.smoothstep(0.45, 0.95, e.night));
        // grade: the engine's night tint is strongly blue; ease it so firelight stays orange
        e.post.tint.lerp(WHITE, 0.4 * e.night);

        // aurora: green fill light and a green cast in the lake
        const au = e.post.aurora;
        auroraLight.intensity = au * 0.9;
        if (au > 0.001) {
          // both are rewritten by the environment every frame, so this never accumulates
          e.hemi.color.lerp(auroraGreen, au * 0.2);
          shared.uSkyRefl.value.lerp(auroraGreen, au * 0.22);
        }
      },
    };
  },
};
