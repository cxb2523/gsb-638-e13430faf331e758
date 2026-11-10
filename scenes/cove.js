import * as THREE from 'three';
import * as K from './kit.js';
import { toon } from '../engine/materials.js';

// Cove: a test scene for the engine. A floating block of coast with a lighthouse headland,
// a cottage, a pier and a moored rowboat. Shows off night lights, water, rain, snow and fog.

const SIZE = 16, CELLS = 40, WATER = 0, BASE = -3.2, STEP = 0.3;
const S2 = Math.SQRT1_2;
// u runs to the right of the default view, v runs toward the camera
const toUV = (x, z) => [(x - z) * S2, (x + z) * S2];
const toXZ = (u, v) => [(u + v) * S2, (v - u) * S2];

const HEAD = toXZ(-6.0, 2.4);
const HOME = [-2.4, -2.5];
const PIER = { x0: 2.3, x1: 7.4, z: -3.6, deck: 0.42 };
const PATH = [[-0.9, -2.3], [0.6, -2.4], [2.4, -3.3], [2.9, -3.6]];
const PATH2 = [[-1.7, -1.3], [-1.6, 0.6], [-2.3, 2.6], [-2.9, 4.1], [HEAD[0] + 0.5, HEAD[1] - 0.9]];

const bump = (x, z, [cx, cz], r) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r));
function segDist(px, pz, [ax, az], [bx, bz]) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
const pathDist = (x, z) => {
  let d = Infinity;
  for (const line of [PATH, PATH2]) for (let i = 0; i < line.length - 1; i++) d = Math.min(d, segDist(x, z, line[i], line[i + 1]));
  return d;
};

export default {
  name: 'Cove',
  view: { target: [0.3, 0.7, 0.3], size: 17, azimuth: 45, elevation: 30 },
  look: {},
  env: { hour: 9.5, weather: 'clear' },
  audio: { water: 0.75, birds: 1, crickets: 1, foghorn: 1 },
  mirror: { y: 0 },
  sky: { moon: 1, milky: 0.5 },

  create() {
    const root = new THREE.Group();
    const rand = K.rng(42);
    const n = K.noise2(11);

    const raw = (x, z) => {
      const [u, v] = toUV(x, z);
      const shore = 1.0 - 0.32 * u + 0.75 * Math.sin(u * 0.55 + 0.4) + (n(x * 0.45, z * 0.45) - 0.5) * 0.9;
      const d = shore - v;
      let h = d < 0 ? Math.max(-0.1 + d * 0.5, -1.25) : 0.12 + Math.min(d, 1.4) * 0.45 + Math.max(d - 3.2, 0) * 0.2;
      h += bump(x, z, HEAD, 2.3) * 1.9;
      h += bump(x, z, [-6.2, -5.6], 3.4) * 0.9;
      h += (n(x * 0.6 + 40, z * 0.6) - 0.5) * 0.3 * K.smoothstep(0, 1, d);
      return h;
    };
    const padHome = raw(...HOME), padHead = raw(...HEAD);
    const height = (x, z) => {
      let h = raw(x, z);
      h += (padHome - h) * (1 - K.smoothstep(1.6, 2.3, Math.hypot(x - HOME[0], z - HOME[1])));
      h += (padHead - h) * (1 - K.smoothstep(0.7, 1.3, Math.hypot(x - HEAD[0], z - HEAD[1])));
      return h;
    };

    const T = K.terrain({
      size: SIZE, cells: CELLS, step: STEP, base: BASE, height,
      top(x, z, h, c) {
        if (h < WATER - 0.05) return c.set(h < -0.7 ? '#9a8c6c' : '#c4ad7c');
        if (h < 0.35) return c.set('#e5cf99');
        if (pathDist(x, z) < 0.42) return c.set('#d4b383');
        if (h > 1.9 && n(x * 1.3, z * 1.3) > 0.58) return c.set('#9da0a9');
        const t = n(x * 0.9 + 3, z * 0.9);
        return c.set(t > 0.62 ? '#7fc264' : t < 0.36 ? '#5f9f4b' : '#6eb156');
      },
      side(x, z, y, h, outer, c) {
        if (h - y < 0.11 && h >= 0.35) return c.set('#5b9547');
        if (h < 0.35 && h - y < 0.45) return c.set('#d4b985');
        if (y > -1.0) return c.set(Math.floor(y / 0.6) % 2 ? '#8e6444' : '#7f593c');
        return c.set(Math.floor(y / 0.6) % 2 ? '#70737e' : '#62646f');
      },
    });
    root.add(T.mesh);
    const ground = T.heightAt;
    const isLand = (x, z) => ground(x, z) > WATER + 0.2;

    root.add(K.water({ size: SIZE, level: WATER, heightAt: ground, base: BASE, edgeCells: CELLS, shallow: '#5fcfc6', deep: '#1f5a96', deepAt: 1.1, reflect: 0.2 }));

    // cottage
    const home = K.cottage({});
    home.group.position.set(HOME[0], ground(...HOME), HOME[1]);
    root.add(home.group);
    const lights = [];
    for (const p of home.lights) lights.push(K.lampLight(root, p.clone().add(home.group.position)));
    root.add(K.smoke(home.smoke.clone().add(home.group.position)));

    // lighthouse
    const lh = K.lighthouse({});
    lh.group.position.set(HEAD[0], ground(...HEAD), HEAD[1]);
    root.add(lh.group);
    const lhLight = K.lampLight(root, lh.lamp.clone().add(lh.group.position), { color: '#ffe08a', power: 4, distance: 6 });
    lights.push(lhLight);

    // pier, boat, lamps, cargo
    root.add(K.pier({ ...PIER }));
    const boat = K.boat({});
    boat.position.set(6.4, WATER, -2.75);
    boat.rotation.y = 0.12;
    root.add(boat);
    for (const [x, z, y] of [[2.6, -2.95, ground(2.6, -2.95)], [7.15, -4.0, PIER.deck]]) {
      const lp = K.lampPost({});
      lp.group.position.set(x, y, z);
      root.add(lp.group);
      lights.push(K.lampLight(root, lp.light.clone().add(lp.group.position), { power: 2.4, distance: 4 }));
    }
    const c1 = K.crate();
    c1.position.set(5.2, PIER.deck + 0.2, -3.85);
    const c2 = K.crate(0.26, '#9a6c44');
    c2.position.set(5.5, PIER.deck + 0.17, -3.9);
    c2.rotation.y = 0.5;
    const b1 = K.barrel();
    b1.position.set(4.2, PIER.deck + 0.03, -3.85);
    const b2 = K.barrel();
    b2.position.set(-1.0, ground(-1.0, -3.4), -3.4);
    const c3 = K.crate(0.3);
    c3.position.set(-0.95, ground(-0.95, -1.4) + 0.15, -1.4);
    root.add(c1, c2, b1, b2, c3);

    // fence on the headland's sea side
    const fencePts = [];
    for (let a = -0.3; a <= 2.2; a += 0.45) fencePts.push([HEAD[0] + Math.cos(a + 0.6) * 1.15, HEAD[1] + Math.sin(a + 0.6) * 1.15]);
    root.add(K.fence(fencePts, ground));

    // rocks in the sea and on the hills
    const rockSpots = [[-4.0, 4.7, 0.6], [-2.7, 5.7, 0.45], [-5.4, 4.9, 0.5], [1.6, 3.9, 0.4], [-1.2, 6.4, 0.35], [3.4, 2.4, 0.3]];
    const rockMat = toon('#ffffff', { vertexColors: true, noise: 0.2, noiseScale: 5 });
    for (const [u, v, s] of rockSpots) {
      const [x, z] = toXZ(u, v);
      root.add(placeRock(x, z, s));
    }
    function placeRock(x, z, s, land = false) {
      const m = K.mesh(K.rockGeometry(rand, s), rockMat);
      m.position.set(x, land ? ground(x, z) : Math.max(ground(x, z), WATER - s * 0.35), z);
      m.rotation.y = rand() * Math.PI;
      return m;
    }

    // trees and bushes, kept off the paths, pads and beach
    const clear = (x, z, r = 0.9) =>
      pathDist(x, z) > 0.75 &&
      Math.hypot(x - HOME[0], z - HOME[1]) > 2.2 + r * 0.3 &&
      Math.hypot(x - HEAD[0], z - HEAD[1]) > 1.6 &&
      Math.abs(x) < SIZE / 2 - 0.5 && Math.abs(z) < SIZE / 2 - 0.5;
    const pineGeos = [0, 1, 2, 3].map((i) => K.pineGeometry(rand, { h: 1.9 + i * 0.35, w: 0.7 + i * 0.07 }));
    const pineMat = foliage(false);
    let placed = 0;
    for (let tries = 0; tries < 900 && placed < 26; tries++) {
      const x = (rand() - 0.5) * SIZE, z = (rand() - 0.5) * SIZE;
      const h = ground(x, z);
      if (h < 0.9 || !clear(x, z)) continue;
      const [u, v] = toUV(x, z);
      if (v > 1.5 && rand() < 0.75) continue; // keep the front open
      const t = K.mesh(pineGeos[Math.floor(rand() * pineGeos.length)], pineMat);
      t.position.set(x, h, z);
      t.rotation.y = rand() * Math.PI;
      t.scale.setScalar(0.85 + rand() * 0.35);
      root.add(t);
      placed++;
    }
    const bushGeos = [0, 1, 2].map(() => K.bushGeometry(rand, { r: 0.42 + rand() * 0.2, blobs: 3 }));
    const bushMat = foliage(true);
    for (let tries = 0, b = 0; tries < 400 && b < 14; tries++) {
      const x = (rand() - 0.5) * SIZE, z = (rand() - 0.5) * SIZE;
      const h = ground(x, z);
      if (h < 0.6 || !clear(x, z, 0.4)) continue;
      const m = K.mesh(bushGeos[b % 3], bushMat);
      m.position.set(x, h, z);
      root.add(m);
      b++;
    }
    for (let i = 0; i < 7; i++) {
      const x = -7 + rand() * 5, z = -7 + rand() * 6;
      if (ground(x, z) > 1.2 && clear(x, z, 0.3)) root.add(placeRock(x, z, 0.25 + rand() * 0.2, true));
    }

    // grass and flowers
    root.add(
      K.grass(rand, 2400, (r) => {
        const x = (r() - 0.5) * SIZE * 0.99, z = (r() - 0.5) * SIZE * 0.99;
        const h = ground(x, z);
        if (h < 0.35 || pathDist(x, z) < 0.45) return null;
        if (Math.hypot(x - HOME[0], z - HOME[1]) < 1.45 || Math.hypot(x - HEAD[0], z - HEAD[1]) < 0.75) return null;
        return [x, h, z];
      }),
    );
    root.add(
      K.flowers(rand, 160, (r) => {
        const x = (r() - 0.5) * SIZE * 0.9, z = (r() - 0.5) * SIZE * 0.9;
        const h = ground(x, z);
        if (h < 0.5 || pathDist(x, z) < 0.5 || Math.hypot(x - HOME[0], z - HOME[1]) < 1.45) return null;
        return [x, h, z];
      }),
    );

    const info = { size: SIZE, top: T.max, bottom: BASE, surfaceAt: (x, z) => Math.max(ground(x, z), WATER), isLand };

    // scene buttons: keep the lighthouse burning any time, sound the horn
    let beamForced = false;
    let beam = 0;
    let rock = 0;
    const ICON_BEAM = ['.........', '#...#....', '.#..#....', '..#.#....', '#######..', '..#.#....', '.#..#....', '#...#....', '.........'];
    const ICON_HORN = ['.........', '......##.', '....####.', '########.', '########.', '....####.', '......##.', '.........', '.........'];
    return {
      root,
      info,
      actions: [
        { id: 'beam', label: 'Lighthouse', icon: ICON_BEAM, run: () => { beamForced = !beamForced; }, active: () => beamForced },
        { id: 'horn', label: 'Horn', icon: ICON_HORN, run: (env, audio) => { audio.play('horn', { pitch: 0.55, dur: 2.6 }); rock = 1; } },
      ],
      update(t, dt, env) {
        K.updateLamps(lights, env);
        beam += ((beamForced ? 1 : env.lamps) - beam) * (1 - Math.exp(-dt * 3));
        rock = Math.max(0, rock - dt * 0.35);
        lh.beam.rotation.y = t * (0.8 + beam * 0.4);
        lh.beam.material.uniforms.uOn.value = beam;
        lhLight.intensity = Math.max(lhLight.intensity, beam * 4);
        boat.position.y = WATER - 0.06 + Math.sin(t * 1.3) * 0.035 * (1 + env.cur.wind);
        boat.rotation.z = Math.sin(t * 1.1) * 0.05 * (1 + env.cur.wind + rock * 2);
        boat.rotation.x = Math.sin(t * 0.9 + 1) * 0.04 * (1 + env.cur.wind);
      },
    };
  },
};

function foliage(round) {
  return toon('#ffffff', { vertexColors: true, ramp: 'foliage', wind: round ? 0.05 : 0.03, noise: 0.18, noiseScale: 4 });
}
