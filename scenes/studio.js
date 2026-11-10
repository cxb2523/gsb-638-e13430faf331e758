import * as THREE from 'three';
import * as K from './kit.js';
import { toon, setGlow } from '../engine/materials.js';
import { neonFlicker } from './kit-city.js';
import * as P from './studio-parts.js';

const { NOXE } = P;

// Studio: Noxe Studio as a cutaway room. Oak floor on an ink plinth, a dark accent wall with the desk,
// posters and neon, a plaster wall with a big steel window onto the city, a sleeping cat on the sill,
// a reading corner, a record player, plants, fairy lights and a clock that follows the time of day.
// Weather only happens outside, behind the glass.

const H = 3.9;          // the floor runs from -H to H
const T = 0.4;          // wall thickness
const WALL = 4.3;       // wall height
const BASE = -1.1;      // bottom of the floor block
const OZ = -H - T;      // outside face of the window wall
const WIN = { x0: -2.55, x1: 0.65, y0: 1.0, y1: 3.8, cols: 4, rows: 3 };
const WXC = (WIN.x0 + WIN.x1) / 2;
const GZ = -H - T / 2;  // glass plane
const SKY_Z = OZ - 1.9;
const LEDGE = { x0: WIN.x0 - 0.15, x1: WIN.x1 + 0.15, z0: OZ - 0.32, y: WIN.y0 - 0.06 };
const BLD_A = { x0: WXC - 4.4, x1: WXC - 1.25, z0: OZ - 1.85, z1: OZ - 1.2, top: 1.0 };
const BLD_B = { x0: WXC - 1.15, x1: WXC + 0.75, z0: OZ - 1.85, z1: OZ - 1.35, top: 0.45 };
// rain and snow fall in a shallow box right outside the window, low enough that the wall hides it
// everywhere but the glass (checked for azimuth 30 to 60)
const BOX = { cx: WXC - 0.8, cz: OZ - 0.5, w: 6.6, d: 0.75, top: 2.9, bottom: BASE, snowScale: 0.6, splash: true };
const SNOW_TOP = 3.0; // the engine starts snow 1 above the box top; lowered at runtime so no flake shows over the wall

const COL = {
  oak: ['#c48c58', '#b98250', '#cf9965', '#b07a4b'],
  oakEnd: ['#a8784b', '#93673f'],
  joist: '#5a4232', gap: '#2e2733',
  plinth: '#262a3c', line: '#8e6ff0',
  wallL: '#3b4060', wallR: '#e8e1d5', reveal: '#d6cdbf', cut: '#f1ece3', outside: '#8c5a47',
  skirt: '#f3eee6', steel: '#1d2130',
};
const BOOKS = ['#6E2BF0', '#B08CFF', '#EDEFF2', '#141823', '#69707F', '#e2b33c', '#c8553d', '#2f8f88', '#8fb38a', '#d98aa0', '#3d5a99', '#f2d7a6', '#8a5a3c'];

const ICONS = {
  vinyl: ['..#####..', '.#######.', '###...###', '##..#..##', '##.###.##', '##..#..##', '###...###', '.#######.', '..#####..'],
  lamp: ['..#####..', '..#####..', '.#######.', '.#######.', '....#....', '....#....', '....#....', '..#####..', '.........'],
  screen: ['#########', '#.......#', '#.##..#.#', '#.##.##.#', '#.......#', '#########', '....#....', '...###...', '.........'],
};

export default {
  name: 'Studio',
  view: { target: [0, 1.92, 0], size: 10.8, azimuth: 45, elevation: 30 },
  look: { levels: 16, dither: 0.45, outline: 0.55, highlight: 0.3, bloom: 1.15, saturation: 1.12, contrast: 1.06, vignette: 0.08, exposure: 1.08 },
  env: { hour: 19.5, weather: 'rain' },
  audio: { water: 0, birds: 0.35, crickets: 0.3, foghorn: 0, rain: 'roof', rainLevel: 0.5 },
  sky: { moon: 0.9, milky: 0.25 },

  create({ audio }) {
    const root = new THREE.Group();
    const rand = K.rng(2024);
    const textures = [];
    const base = { snow: 0, wet: 0 };
    const mats = {
      paint: toon('#ffffff', { vertexColors: true, noise: 0.07, noiseScale: 6, ...base }),
      wood: toon('#ffffff', { vertexColors: true, noise: 0.18, noiseScale: 4.5, ...base }),
      fabric: toon('#ffffff', { vertexColors: true, noise: 0.26, noiseScale: 11, ...base }),
      metal: toon('#ffffff', { vertexColors: true, noise: 0.03, ramp: 'hard', ...base }),
      leaf: toon('#ffffff', { vertexColors: true, ramp: 'foliage', noise: 0.12, noiseScale: 7, side: THREE.DoubleSide, ...base }),
      out: toon('#ffffff', { vertexColors: true, noise: 0.18, noiseScale: 5 }),
      outLeaf: toon('#ffffff', { vertexColors: true, ramp: 'foliage', noise: 0.15, wind: 0.05 }),
    };
    const B = new P.Batch();

    // ------------------------------------------------------------ floor block
    {
      const top = new P.Mesher();
      for (let z = -H; z < H - 1e-6; z += 0.42) {
        const za = z, zb = Math.min(H, z + 0.42);
        let x = -H - rand() * 1.6;
        while (x < H) {
          const len = 1.3 + rand() * 1.5;
          const xa = Math.max(-H, x), xb = Math.min(H, x + len);
          top.quad([xa, 0, za], [xa, 0, zb], [xb, 0, zb], [xb, 0, za], [0, 1, 0], COL.oak[Math.floor(rand() * COL.oak.length)]);
          x += len;
        }
      }
      root.add(K.mesh(top.geometry(), mats.wood));

      const S = new P.Mesher();
      const x0 = -H - T, x1 = H, z0 = -H - T, z1 = H;
      const faceX = (x, za, zb, lo, hi, c, n) => (n > 0 ? S.quad([x, lo, za], [x, hi, za], [x, hi, zb], [x, lo, zb], [1, 0, 0], c) : S.quad([x, lo, zb], [x, hi, zb], [x, hi, za], [x, lo, za], [-1, 0, 0], c));
      const faceZ = (z, xa, xb, lo, hi, c, n) => (n > 0 ? S.quad([xb, lo, z], [xb, hi, z], [xa, hi, z], [xa, lo, z], [0, 0, 1], c) : S.quad([xa, lo, z], [xa, hi, z], [xb, hi, z], [xb, lo, z], [0, 0, -1], c));
      const bands = (face, fixed, a0, a1, n) => {
        for (let a = a0, i = 0; a < a1 - 1e-6; a += 0.42, i++) face(fixed, a, Math.min(a1, a + 0.42), -0.13, 0, COL.oakEnd[i % 2], n);
        for (let a = a0, i = 0; a < a1 - 1e-6; a += 0.3, i++) face(fixed, a, Math.min(a1, a + 0.3), -0.42, -0.13, i % 2 ? COL.joist : COL.gap, n);
        face(fixed, a0, a1, -0.5, -0.42, COL.plinth, n);
        face(fixed, a0, a1, -0.55, -0.5, COL.line, n);
        face(fixed, a0, a1, BASE, -0.55, COL.plinth, n);
      };
      bands(faceX, x1, z0, z1, 1);
      bands(faceZ, z1, x0, x1, 1);
      bands(faceX, x0, z0, z1, -1);
      bands(faceZ, z0, x0, x1, -1);
      root.add(K.mesh(S.geometry(), mats.paint));
    }

    // ------------------------------------------------------------ walls
    B.box('paint', T, WALL, 2 * H + T, -H - T / 2, WALL / 2, -T / 2, { px: COL.wallL, py: COL.cut, pz: COL.cut, nz: COL.cut, nx: COL.outside, ny: COL.cut });
    const wz = -H - T / 2;
    const sillY = WIN.y0 - 0.08;
    B.box('paint', 2 * H, sillY, T, 0, sillY / 2, wz, { pz: COL.wallR, py: COL.reveal, px: COL.cut, nx: COL.cut, nz: COL.outside, ny: COL.cut });
    B.box('paint', 2 * H, WALL - WIN.y1, T, 0, (WALL + WIN.y1) / 2, wz, { pz: COL.wallR, py: COL.cut, px: COL.cut, nx: COL.cut, nz: COL.outside, ny: COL.reveal });
    B.box('paint', WIN.x0 + H, WIN.y1 - sillY, T, (WIN.x0 - H) / 2, (WIN.y1 + sillY) / 2, wz, { pz: COL.wallR, px: COL.reveal, nx: COL.cut, nz: COL.outside, py: COL.cut, ny: COL.cut });
    B.box('paint', H - WIN.x1, WIN.y1 - sillY, T, (WIN.x1 + H) / 2, (WIN.y1 + sillY) / 2, wz, { pz: COL.wallR, nx: COL.reveal, px: COL.cut, nz: COL.outside, py: COL.cut, ny: COL.cut });
    B.box('paint', 0.06, 0.2, 2 * H, -H + 0.03, 0.1, 0, COL.skirt);
    B.box('paint', 2 * H, 0.2, 0.06, 0, 0.1, -H + 0.03, COL.skirt);

    // ------------------------------------------------------------ window
    {
      const fz = GZ, fd = 0.1, bar = 0.12, mul = 0.08;
      const steel = (w, h, x, y) => B.box('metal', w, h, fd, x, y, fz, COL.steel);
      const W = WIN.x1 - WIN.x0, Hh = WIN.y1 - WIN.y0;
      steel(W, bar, WXC, WIN.y1 - bar / 2);
      steel(W, bar, WXC, WIN.y0 + bar / 2);
      steel(bar, Hh, WIN.x0 + bar / 2, (WIN.y0 + WIN.y1) / 2);
      steel(bar, Hh, WIN.x1 - bar / 2, (WIN.y0 + WIN.y1) / 2);
      const pw = (W - 2 * bar - (WIN.cols - 1) * mul) / WIN.cols;
      const ph = (Hh - 2 * bar - (WIN.rows - 1) * mul) / WIN.rows;
      for (let i = 1; i < WIN.cols; i++) steel(mul, Hh - 2 * bar, WIN.x0 + bar + i * pw + (i - 0.5) * mul, (WIN.y0 + WIN.y1) / 2);
      for (let j = 1; j < WIN.rows; j++) steel(W - 2 * bar, mul, WXC, WIN.y0 + bar + j * ph + (j - 0.5) * mul);
      B.box('metal', 0.05, 0.16, 0.06, WIN.x0 + bar + 2 * pw + 1.5 * mul, WIN.y0 + bar + ph * 1.5 + mul, fz + 0.07, '#c9ccd6');
      B.box('wood', W + 0.44, 0.08, 0.75, WXC, WIN.y0 - 0.04, -H - 0.2 + 0.375, { all: '#c9a174', py: '#d6ae80' });
      B.box('out', LEDGE.x1 - LEDGE.x0, 0.1, fz - 0.05 - LEDGE.z0, WXC, LEDGE.y - 0.05, (fz - 0.05 + LEDGE.z0) / 2, { all: '#8f909a', py: '#a5a6ae' });
      for (let i = 0; i < 11; i++) B.box('metal', 0.12, 0.6, 0.2, WXC - 1.07 + i * 0.215, 0.5, -H + 0.15, '#cfc9c0');
      B.box('metal', 2.35, 0.06, 0.1, WXC, 0.24, -H + 0.15, '#bdb6ab');
      B.box('metal', 2.35, 0.06, 0.1, WXC, 0.76, -H + 0.15, '#bdb6ab');
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.04, Hh - 0.04), P.glassMaterial({ w: W, h: Hh, cols: WIN.cols, rows: WIN.rows }));
      glass.position.set(WXC, (WIN.y0 + WIN.y1) / 2, fz - 0.06);
      glass.renderOrder = 5;
      root.add(glass);
    }

    // ------------------------------------------------------------ outside: sky, buildings, water tower, tree
    const skyMat = P.skyBackdropMaterial([-0.5, 1.95]);
    // sized to what the window can show between azimuth 30 and 60, so a dragged camera never sees the set behind the wall
    const skyPlane = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 3.1), skyMat);
    skyPlane.position.set(-3.7, 0.45, SKY_Z);
    root.add(skyPlane);
    const bldMat = (c) => toon(c, { noise: 0.22, noiseScale: 7, windows: { size: [0.2, 0.26], frac: [0.5, 0.5], base: -1.2, top: 100, lit: 0.6, glass: '#2a3247', power: 3.0 } });
    for (const [b, c] of [[BLD_A, '#7d4a3a'], [BLD_B, '#5d6478']]) {
      const m = K.mesh(new THREE.BoxGeometry(b.x1 - b.x0, b.top - BASE, b.z1 - b.z0), bldMat(c), { cast: false });
      m.position.set((b.x0 + b.x1) / 2, (b.top + BASE) / 2, (b.z0 + b.z1) / 2);
      root.add(m);
      B.box('out', b.x1 - b.x0 + 0.06, 0.08, b.z1 - b.z0 + 0.06, (b.x0 + b.x1) / 2, b.top + 0.04, (b.z0 + b.z1) / 2, { all: '#5a5660', py: '#6b6873' });
    }
    {
      const tx = WXC - 2.2, tz = OZ - 1.5, ty = BLD_A.top + 0.08;
      for (const [dx, dz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) B.box('out', 0.07, 0.42, 0.07, tx + dx, ty + 0.21, tz + dz, '#3b3437');
      B.add('out', P.at(P.cyl(0.32, 0.32, 0.55, 12, '#8d5e3e'), tx, ty + 0.7, tz));
      B.add('out', P.at(P.cyl(0.33, 0.33, 0.04, 12, '#3b3437'), tx, ty + 0.58, tz));
      B.add('out', P.at(P.cyl(0.33, 0.33, 0.04, 12, '#3b3437'), tx, ty + 0.82, tz));
      B.add('out', P.at(P.cyl(0.02, 0.38, 0.26, 12, '#4a3f44'), tx, ty + 1.1, tz));
      B.box('out', 0.32, 0.22, 0.26, WXC - 0.1, BLD_B.top + 0.19, OZ - 1.6, '#a3a6b0');
      B.box('out', 0.06, 0.5, 0.06, WXC + 0.5, BLD_B.top + 0.3, OZ - 1.55, '#3b3437');
      B.add('out', P.at(P.cyl(0.06, 0.09, 1.7, 6, '#5a3f2e'), WXC + 0.65, BASE + 1.05, OZ - 0.9));
      B.add('outLeaf', P.at(K.bushGeometry(rand, { r: 0.62, blobs: 4, leaf: '#4f8a4a' }), WXC + 0.65, 0.15, OZ - 0.9));
    }

    // ------------------------------------------------------------ desk
    const D = { x0: -H, x1: -H + 1.25, z0: -2.5, z1: 0.6, top: 1.12 };
    const dcx = (D.x0 + D.x1) / 2, dcz = (D.z0 + D.z1) / 2;
    B.box('wood', D.x1 - D.x0, 0.08, D.z1 - D.z0, dcx, D.top - 0.04, dcz, { all: '#b98a5e', py: '#d9ad80' });
    for (const z of [D.z0 + 0.12, D.z1 - 0.12]) {
      for (const x of [D.x0 + 0.14, D.x1 - 0.12]) B.box('metal', 0.07, D.top - 0.08, 0.07, x, (D.top - 0.08) / 2, z, COL.steel);
      B.box('metal', D.x1 - D.x0 - 0.2, 0.06, 0.08, dcx, 0.04, z, COL.steel);
      B.box('metal', D.x1 - D.x0 - 0.2, 0.06, 0.06, dcx, D.top - 0.12, z, COL.steel);
    }
    B.box('paint', 0.78, 0.86, 0.66, -H + 0.5, 0.49, D.z0 + 0.6, { all: '#e9e6e1', px: '#efece7' });
    for (let i = 0; i < 3; i++) {
      B.box('paint', 0.02, 0.02, 0.62, -H + 0.9, 0.33 + i * 0.26, D.z0 + 0.6, '#b9b4ad');
      B.box('metal', 0.04, 0.04, 0.22, -H + 0.91, 0.22 + i * 0.26, D.z0 + 0.6, '#9b85e0');
    }

    // monitor
    const MON = { x: -H + 0.34, y: 1.95, z: -1.0, w: 1.78, h: 1.0 };
    B.box('metal', 0.36, 0.03, 0.26, MON.x + 0.04, D.top + 0.015, MON.z, '#2a2f3e');
    B.box('metal', 0.06, 0.45, 0.12, MON.x - 0.08, D.top + 0.24, MON.z, '#2a2f3e');
    B.box('metal', 0.07, MON.h, MON.w, MON.x, MON.y, MON.z, { all: '#1b1f2c', px: '#141823' });
    const screen = P.canvasTexture(32, 18);
    textures.push(screen.tex);
    const screenMat = toon('#06070b', { emissive: '#ffffff', emissiveIntensity: 2.6, noise: 0, ...base });
    screenMat.emissiveMap = screen.tex;
    const screenMesh = K.mesh(new THREE.PlaneGeometry(MON.w - 0.12, MON.h - 0.1), screenMat, { cast: false });
    screenMesh.rotation.y = Math.PI / 2;
    screenMesh.position.set(MON.x + 0.037, MON.y + 0.01, MON.z);
    root.add(screenMesh);

    // laptop (the second screen)
    const LAP = { x: -H + 0.38, z: D.z0 + 0.62 };
    const laptop = new THREE.Group();
    laptop.position.set(LAP.x, D.top + 0.035, LAP.z);
    B.box('metal', 0.6, 0.035, 0.82, LAP.x + 0.3, D.top + 0.018, LAP.z, { all: '#8e939e', py: '#a4a9b3' });
    const lid = new THREE.Group();
    lid.rotation.z = 0.2;
    const lidBox = K.mesh(P.at(P.box(0.025, 0.56, 0.82, '#8e939e'), 0, 0.28, 0), mats.metal);
    const lapTex = P.canvasTexture(16, 10);
    textures.push(lapTex.tex);
    const lapMat = toon('#06070b', { emissive: '#ffffff', emissiveIntensity: 2.0, noise: 0, ...base });
    lapMat.emissiveMap = lapTex.tex;
    const lapScreen = K.mesh(new THREE.PlaneGeometry(0.74, 0.47), lapMat, { cast: false });
    lapScreen.rotation.y = Math.PI / 2;
    lapScreen.position.set(0.014, 0.29, 0);
    lid.add(lidBox, lapScreen);
    laptop.add(lid);
    root.add(laptop);

    // keyboard, mouse, mug, plant, pencils
    B.box('metal', 0.34, 0.035, 1.02, MON.x + 0.6, D.top + 0.018, MON.z, '#2a2f3e');
    B.box('paint', 0.28, 0.02, 0.94, MON.x + 0.6, D.top + 0.045, MON.z, { all: '#c9cbd3', py: '#dcdde3' });
    B.box('fabric', 0.5, 0.012, 0.56, MON.x + 0.62, D.top + 0.006, MON.z + 0.85, '#8c79d6');
    B.box('paint', 0.2, 0.05, 0.12, MON.x + 0.64, D.top + 0.035, MON.z + 0.85, { all: '#d8d9de', py: '#ecedf0' });
    const mugPos = new THREE.Vector3(MON.x + 0.6, D.top, 0.38);
    B.add('paint', P.at(P.cyl(0.1, 0.09, 0.22, 10, '#f2efe9'), mugPos.x, mugPos.y + 0.11, mugPos.z));
    B.add('paint', P.at(P.cyl(0.103, 0.103, 0.06, 10, NOXE.violet), mugPos.x, mugPos.y + 0.12, mugPos.z));
    B.add('paint', P.at(P.cyl(0.085, 0.085, 0.01, 10, '#3b2618'), mugPos.x, mugPos.y + 0.215, mugPos.z));
    B.box('paint', 0.05, 0.12, 0.04, mugPos.x + 0.12, mugPos.y + 0.12, mugPos.z, '#f2efe9');
    P.pot(B, -H + 0.18, D.top, D.z0 + 0.18, 0.12, '#efe9df');
    P.succulent(B, rand, -H + 0.18, D.top + 0.15, D.z0 + 0.18, 0.16);
    B.add('paint', P.at(P.cyl(0.07, 0.07, 0.2, 8, '#2f8f88'), -H + 0.18, D.top + 0.1, 0.05));
    for (const [dx, dz, c] of [[0.02, 0.01, '#e2b33c'], [-0.02, -0.02, '#c8553d'], [0.0, 0.03, '#141823']]) B.box('paint', 0.025, 0.2, 0.025, -H + 0.18 + dx, D.top + 0.27, 0.05 + dz, c);

    // desk lamp: brass arm, shade aimed at the keyboard
    const lamp = new THREE.Group();
    const lampBase = new THREE.Vector3(-H + 0.22, D.top, 0.42);
    const elbow = new THREE.Vector3(-H + 0.45, 2.17, 0.3);
    const head = new THREE.Vector3(-H + 0.95, 2.05, -0.04);
    const aim = new THREE.Vector3(-H + 1.05, D.top, -0.55);
    const brass = '#d6a24a';
    lamp.add(K.mesh(K.merge([
      P.at(P.cyl(0.17, 0.19, 0.06, 12, brass), lampBase.x, lampBase.y + 0.03, lampBase.z),
      P.rod(lampBase.clone().setY(lampBase.y + 0.05), elbow, 0.04, brass),
      P.rod(elbow, head, 0.04, brass),
      P.at(P.box(0.09, 0.09, 0.09, '#b98a3a'), elbow.x, elbow.y, elbow.z),
    ]), mats.metal));
    const dir = aim.clone().sub(head).normalize();
    const shadeGeo = new THREE.ConeGeometry(0.24, 0.34, 12, 1, true);
    shadeGeo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate()));
    const shade = K.mesh(shadeGeo, toon(brass, { noise: 0.04, side: THREE.DoubleSide, ...base }));
    shade.position.copy(head).addScaledVector(dir, 0.12);
    lamp.add(shade);
    const bulbMat = toon('#3a3226', { emissive: '#ffd59a', emissiveIntensity: 7, noise: 0, ...base });
    const bulb = K.mesh(new THREE.SphereGeometry(0.085, 8, 6), bulbMat, { cast: false });
    bulb.position.copy(head).addScaledVector(dir, 0.24);
    lamp.add(bulb);
    // a lit rim at the mouth of the shade, so the lamp reads as on from any angle
    const rimGeo = new THREE.TorusGeometry(0.225, 0.03, 5, 18);
    rimGeo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir));
    const rim = K.mesh(rimGeo, bulbMat, { cast: false });
    rim.position.copy(head).addScaledVector(dir, 0.285);
    lamp.add(rim);
    root.add(lamp);
    const lampLight = new THREE.PointLight('#ff9a3c', 0, 7, 2);
    lampLight.position.copy(head).addScaledVector(dir, 0.42);
    root.add(lampLight);
    const lampCone = P.coneFx(bulb.position, dir, 1.05, 0.75);
    root.add(lampCone);

    // office chair
    const chair = new THREE.Group();
    {
      const cp = [];
      const ink = '#20243a', fab = '#353a52', fabTop = '#41476a';
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + 0.3;
        cp.push(P.at(P.box(0.36, 0.06, 0.07, ink), Math.cos(a) * 0.18, 0.09, Math.sin(a) * 0.18, -a));
        cp.push(P.at(P.box(0.08, 0.07, 0.08, '#111420'), Math.cos(a) * 0.36, 0.035, Math.sin(a) * 0.36));
      }
      cp.push(P.at(P.cyl(0.08, 0.08, 0.08, 8, ink), 0, 0.1, 0));
      cp.push(P.at(P.cyl(0.045, 0.045, 0.42, 6, '#5b6070'), 0, 0.33, 0));
      cp.push(P.at(P.box(0.64, 0.12, 0.62, { all: fab, py: fabTop }), 0, 0.6, 0));
      cp.push(P.at(P.box(0.08, 0.42, 0.1, ink), 0.3, 0.8, 0));
      cp.push(P.at(P.box(0.1, 0.8, 0.58, { all: fab, nx: fabTop }), 0.33, 1.12, 0, 0, 0, -0.1));
      for (const s of [-1, 1]) {
        cp.push(P.at(P.box(0.05, 0.22, 0.05, ink), 0.06, 0.76, s * 0.3));
        cp.push(P.at(P.box(0.38, 0.05, 0.08, '#2a2f45'), 0.02, 0.88, s * 0.3));
      }
      chair.add(K.mesh(K.merge(cp), mats.fabric));
      chair.position.set(-H + 1.95, 0, MON.z + 0.15);
      chair.rotation.y = 0.32;
      root.add(chair);
    }

    // ------------------------------------------------------------ corner monstera
    {
      const px = -H + 0.68, pz = -H + 0.68;
      B.add('paint', P.at(P.cyl(0.42, 0.33, 0.72, 14, '#c6714a'), px, 0.36, pz));
      B.add('paint', P.at(P.cyl(0.45, 0.45, 0.08, 14, '#b4623e'), px, 0.7, pz));
      B.add('paint', P.at(P.cyl(0.38, 0.38, 0.02, 14, '#3b2a20'), px, 0.73, pz));
      P.monstera(B, rand, px, 0.72, pz, { leaves: 12, hMin: 1.0, hMax: 2.6, a0: -0.3, a1: 1.87 });
    }

    // ------------------------------------------------------------ left wall: posters, neon, bookcase, reading corner
    const wallX = -H + 0.02;
    const posters = [
      { z: -2.2, y: 2.75, w: 1.05, h: 1.5, kind: 0, cw: 20, ch: 28 },
      { z: MON.z + 0.05, y: 3.12, w: 0.9, h: 1.05, kind: 1, cw: 18, ch: 21 },
      { z: 0.4, y: 3.12, w: 0.6, h: 0.8, kind: 2, cw: 14, ch: 18 },
    ];
    for (const p of posters) {
      B.box('paint', 0.05, p.h + 0.1, p.w + 0.1, wallX + 0.025, p.y, p.z, '#1a1e2b');
      const c = P.canvasTexture(p.cw, p.ch);
      P.drawPoster(p.kind, c.ctx, p.cw, p.ch);
      c.tex.needsUpdate = true;
      textures.push(c.tex);
      const m = toon('#ffffff', { noise: 0.05, ...base });
      m.map = c.tex;
      const art = K.mesh(new THREE.PlaneGeometry(p.w - 0.04, p.h - 0.04), m, { cast: false });
      art.rotation.y = Math.PI / 2;
      art.position.set(wallX + 0.052, p.y, p.z);
      root.add(art);
    }
    const NEON = { z: 1.2, y: 3.0 };
    const neonArcs = [];
    for (const [r, c] of [[0.44, NOXE.lavender], [0.28, '#8f5cff']]) {
      const pts = [];
      for (let i = 0; i <= 14; i++) {
        const a = Math.PI * (i / 14);
        pts.push([wallX + 0.08, NEON.y + Math.sin(a) * r, NEON.z + Math.cos(a) * r]);
      }
      const n = P.neonTube(pts, c);
      root.add(n.mesh);
      neonArcs.push(n.material);
    }
    {
      const bx0 = -H, bx1 = -H + 0.5, bz0 = 1.75, bz1 = 3.75, bh = 3.0, t = 0.05;
      const shelf = '#ece7df';
      const bcx = (bx0 + bx1) / 2;
      B.box('paint', bx1 - bx0, bh, t, bcx, bh / 2, bz0 + t / 2, shelf);
      B.box('paint', bx1 - bx0, bh, t, bcx, bh / 2, bz1 - t / 2, shelf);
      B.box('paint', bx1 - bx0, bh, t, bcx, bh / 2, (bz0 + bz1) / 2, shelf);
      for (const y of [0.06, 0.78, 1.52, 2.26, bh - t / 2]) B.box('paint', bx1 - bx0, t, bz1 - bz0, bcx, y, (bz0 + bz1) / 2, shelf);
      B.box('paint', 0.02, bh, bz1 - bz0, bx0 + 0.01, bh / 2, (bz0 + bz1) / 2, '#d9d3c9');
      const L = { z0: bz0 + t, z1: (bz0 + bz1) / 2 - t / 2 }, R = { z0: (bz0 + bz1) / 2 + t / 2, z1: bz1 - t };
      const books = [];
      const row = (z0, z1, y, x = bcx + 0.02) => {
        let z = z0 + 0.02;
        while (z < z1 - 0.08) {
          const th = 0.06 + rand() * 0.06, hh = 0.36 + rand() * 0.22;
          if (z + th > z1 - 0.02) break;
          const lean = rand() < 0.12 && z > z0 + 0.2 ? 0.22 : 0;
          books.push({ p: [x, y + hh / 2, z + th / 2], s: [0.32 + rand() * 0.06, hh, th], r: lean, c: BOOKS[Math.floor(rand() * BOOKS.length)] });
          z += th + (rand() < 0.15 ? 0.04 : 0.005);
        }
      };
      const stack = (zc, y, n) => {
        let yy = y;
        for (let i = 0; i < n; i++) {
          const th = 0.05 + rand() * 0.04;
          books.push({ p: [bcx + 0.02, yy + th / 2, zc + (rand() - 0.5) * 0.05], s: [0.3, th, 0.42 + rand() * 0.08], r: 0, c: BOOKS[Math.floor(rand() * BOOKS.length)] });
          yy += th;
        }
      };
      for (let i = 0; i < 9; i++) B.box('paint', 0.42, 0.42, 0.025, bcx + 0.03, 0.31, L.z0 + 0.06 + i * 0.09, [NOXE.violet, '#e2b33c', NOXE.paper, '#2f8f88', '#c8553d', NOXE.lavender][i % 6]);
      row(R.z0, R.z1, 0.085);
      row(L.z0, L.z1, 0.805);
      B.box('fabric', 0.42, 0.42, 0.84, bcx + 0.02, 0.805 + 0.21, (R.z0 + R.z1) / 2, '#9f8ad8');
      P.pot(B, bcx, 1.545, L.z0 + 0.25, 0.14, '#efe9df');
      P.succulent(B, rand, bcx, 1.545 + 0.17, L.z0 + 0.25, 0.22);
      B.add('paint', P.at(P.cyl(0.08, 0.11, 0.42, 10, '#2f8f88'), bcx, 1.545 + 0.21, L.z1 - 0.25));
      row(R.z0, R.z1, 1.545);
      row(L.z0 + 0.4, L.z1, 2.285);
      P.camera(B, bcx + 0.03, 2.285, L.z0 + 0.2);
      stack((R.z0 + R.z1) / 2 - 0.12, 2.285, 5);
      P.succulent(B, rand, bcx, 2.285 + 0.4, R.z1 - 0.18, 0.12);
      P.pot(B, bcx, bh, bz1 - 0.45, 0.17, NOXE.paper);
      const vines = [];
      for (let v = 0; v < 6; v++) {
        const z = bz1 - 0.45 + (rand() - 0.5) * 0.4;
        const len = 0.6 + rand() * 1.6;
        const out = 0.06 + rand() * 0.1;
        for (let s = 0; s < len; s += 0.11) vines.push([bx1 + out + Math.sin(s * 3 + v) * 0.04, bh + 0.15 - s, z + Math.sin(s * 2.2 + v * 1.7) * 0.12 - s * 0.05 * (v % 2 ? 1 : -1)]);
      }
      for (let i = 0; i < 9; i++) vines.push([bcx + (rand() - 0.5) * 0.3, bh + 0.2 + rand() * 0.15, bz1 - 0.45 + (rand() - 0.5) * 0.35]);
      root.add(P.leafCloud(rand, vines, 0.13));
      root.add(P.instancedBooks(books));
    }
    // reading corner: club chair with a throw, side table, tripod floor lamp
    // listening corner on the right: club chair turned to the room, side table, tripod lamp
    P.armchair(B, 2.35, -0.35, -1.0);
    {
      const tx = 1.55, tz = 0.2;
      B.add('wood', P.at(P.cyl(0.3, 0.3, 0.05, 14, '#7a4a2e'), tx, 0.62, tz));
      B.add('wood', P.at(P.cyl(0.04, 0.05, 0.6, 6, '#5e3a24'), tx, 0.31, tz));
      B.add('wood', P.at(P.cyl(0.2, 0.22, 0.04, 12, '#5e3a24'), tx, 0.02, tz));
      B.box('paint', 0.34, 0.06, 0.26, tx - 0.04, 0.675, tz + 0.04, '#2f8f88', 0.3);
      B.box('paint', 0.3, 0.05, 0.24, tx - 0.03, 0.73, tz + 0.03, '#efe9df', 0.1);
      P.pot(B, tx + 0.12, 0.645, tz - 0.12, 0.09, '#c6714a');
      P.succulent(B, rand, tx + 0.12, 0.645 + 0.12, tz - 0.12, 0.13);
    }
    const FL = { x: 3.35, z: -1.25, y: 2.2 };
    {
      const top = new THREE.Vector3(FL.x, 1.45, FL.z);
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + 0.4;
        B.add('wood', P.rod(new THREE.Vector3(FL.x + Math.cos(a) * 0.36, 0, FL.z + Math.sin(a) * 0.36), top, 0.035, '#6b4329', 5));
      }
      B.add('metal', P.rod(top, new THREE.Vector3(FL.x, FL.y - 0.1, FL.z), 0.03, '#2a2d36', 5));
    }
    const floorShadeMat = toon('#efe4cf', { emissive: '#ffb05a', emissiveIntensity: 0.95, lamp: true, noise: 0.05, ...base });
    const floorShade = K.mesh(P.cyl(0.3, 0.36, 0.42, 14, '#ffffff'), floorShadeMat, { cast: false });
    floorShade.position.set(FL.x, FL.y + 0.1, FL.z);
    root.add(floorShade);

    // ------------------------------------------------------------ right wall: credenza, record player, speakers, shelves, clock
    const CR = { x0: 1.1, x1: 3.6, z0: -H, z1: -H + 0.62, top: 0.86 };
    const stripMat = toon('#2a2440', { emissive: NOXE.lavender, emissiveIntensity: 5, noise: 0, ...base });
    const ledStrip = K.mesh(new THREE.BoxGeometry(2.0, 0.035, 0.04), stripMat, { cast: false });
    {
      const cx = (CR.x0 + CR.x1) / 2, cz = (CR.z0 + CR.z1) / 2;
      B.box('wood', CR.x1 - CR.x0, 0.06, CR.z1 - CR.z0 + 0.02, cx, CR.top - 0.03, cz, { all: '#7a4a2e', py: '#8d5838' });
      B.box('wood', CR.x1 - CR.x0, 0.58, CR.z1 - CR.z0 - 0.04, cx, 0.22 + 0.29, cz - 0.02, '#6a3f27');
      for (let x = CR.x0 + 0.08, i = 0; x < CR.x1 - 0.1; x += 0.13, i++) B.box('wood', 0.11, 0.54, 0.03, x + 0.055, 0.51, CR.z1 - 0.025, i % 2 ? '#80502f' : '#734628');
      for (const x of [CR.x0 + 0.1, CR.x1 - 0.1]) for (const z of [CR.z0 + 0.08, CR.z1 - 0.1]) B.box('metal', 0.06, 0.22, 0.06, x, 0.11, z, COL.steel);
    }
    const RP = { x: 2.35, z: -H + 0.33, y: CR.top };
    B.box('wood', 1.0, 0.14, 0.72, RP.x, RP.y + 0.07, RP.z, { all: '#a3734b', py: '#b98a5c' });
    B.box('metal', 0.08, 0.02, 0.08, RP.x + 0.4, RP.y + 0.15, RP.z + 0.28, '#d7dae2');
    const ledMat = toon('#331a1a', { emissive: '#ff4f6a', emissiveIntensity: 5, noise: 0, ...base });
    const led = K.mesh(new THREE.BoxGeometry(0.05, 0.03, 0.05), ledMat, { cast: false });
    led.position.set(RP.x + 0.4, RP.y + 0.15, RP.z + 0.16);
    root.add(led);
    const record = new THREE.Group();
    record.position.set(RP.x - 0.12, RP.y + 0.14, RP.z);
    {
      const platter = P.discGeometry([{ r0: 0, r1: 0.36, c: () => '#2a2d36' }], 28, 0.05, (a) => (Math.floor((a / (Math.PI * 2)) * 18) % 2 ? '#c9ccd4' : '#4a4f5e'));
      const grooves = [];
      for (let r = 0.13, i = 0; r < 0.34; r += 0.035, i++) grooves.push({ r0: r, r1: Math.min(0.34, r + 0.035), c: () => (i % 2 ? '#1a1b22' : '#262833') });
      const vinyl = P.discGeometry([{ r0: 0.02, r1: 0.13, c: (a) => (a < Math.PI ? NOXE.violet : NOXE.lavender) }, ...grooves], 28, 0.02, () => '#111217');
      vinyl.translate(0, 0.05, 0);
      record.add(K.mesh(K.merge([platter, vinyl]), mats.paint));
    }
    root.add(record);
    const tonearm = new THREE.Group();
    tonearm.position.set(RP.x + 0.36, RP.y + 0.22, RP.z - 0.26);
    B.add('metal', P.at(P.cyl(0.06, 0.07, 0.08, 10, '#c9ccd4'), RP.x + 0.36, RP.y + 0.18, RP.z - 0.26));
    tonearm.add(K.mesh(K.merge([
      P.at(P.box(0.045, 0.04, 0.5, '#d7dae2'), 0, 0, 0.24),
      P.at(P.box(0.08, 0.04, 0.11, '#2a2d36'), 0, -0.01, 0.52),
      P.at(P.box(0.09, 0.08, 0.09, '#3a3e4c'), 0, 0, -0.1),
    ]), mats.metal));
    root.add(tonearm);
    const woofers = [];
    for (const x of [CR.x0 + 0.33, CR.x1 - 0.33]) {
      B.box('wood', 0.44, 0.66, 0.42, x, CR.top + 0.33, RP.z - 0.05, { all: '#5e3a24', pz: '#2b2a33', py: '#6b4329' });
      B.add('metal', P.at(P.cyl(0.05, 0.05, 0.03, 10, '#6a6e7c'), x, CR.top + 0.52, RP.z + 0.165, 0, Math.PI / 2));
      const wf = new THREE.Group();
      wf.position.set(x, CR.top + 0.24, RP.z + 0.16);
      wf.add(K.mesh(P.at(P.cyl(0.15, 0.15, 0.04, 14, '#15161c'), 0, 0, 0.02, 0, Math.PI / 2), mats.metal));
      wf.add(K.mesh(P.at(P.cyl(0.13, 0.13, 0.02, 14, '#4a4e5c'), 0, 0, 0.035, 0, Math.PI / 2), mats.metal));
      wf.add(K.mesh(P.at(P.cyl(0.055, 0.055, 0.05, 10, '#a3a7b4'), 0, 0, 0.05, 0, Math.PI / 2), mats.metal));
      root.add(wf);
      woofers.push(wf);
    }
    {
      const x = CR.x1 - 0.25, z = CR.z1 + 0.7;
      B.box('wood', 0.56, 0.06, 0.52, x, 0.03, z, '#b0844f');
      for (const s of [-1, 1]) {
        B.box('wood', 0.56, 0.4, 0.04, x, 0.2, z + s * 0.24, '#b0844f');
        B.box('wood', 0.04, 0.4, 0.52, x + s * 0.26, 0.2, z, '#a37847');
      }
      const cols = ['#e2b33c', NOXE.violet, '#2f8f88', NOXE.paper, '#c8553d', '#141823', NOXE.lavender];
      for (let i = 0; i < 7; i++) B.add('paint', P.at(P.box(0.03, 0.46, 0.44, cols[i]), x - 0.2 + i * 0.065, 0.3, z, 0, 0, -0.25 + i * 0.04));
    }
    {
      const sx = 2.65, sw = 2.2;
      for (const y of [2.2, 2.98]) B.box('wood', sw, 0.06, 0.34, sx, y, -H + 0.17, { all: '#b98a5e', py: '#c99a6b' });
      ledStrip.position.set(sx, 2.155, -H + 0.3);
      root.add(ledStrip);
      const books = [];
      let x = sx - 1.05;
      while (x < sx - 0.35) {
        const th = 0.06 + rand() * 0.05, hh = 0.32 + rand() * 0.18;
        books.push({ p: [x + th / 2, 2.23 + hh / 2, -H + 0.17], s: [th, hh, 0.28], r: 0, c: BOOKS[Math.floor(rand() * BOOKS.length)], axis: 'x' });
        x += th + 0.008;
      }
      let y = 3.01;
      for (let i = 0; i < 4; i++) {
        const th = 0.05 + rand() * 0.04;
        books.push({ p: [sx + 0.25 + (rand() - 0.5) * 0.05, y + th / 2, -H + 0.17], s: [0.45, th, 0.27], r: 0, c: BOOKS[Math.floor(rand() * BOOKS.length)], axis: 'x' });
        y += th;
      }
      root.add(P.instancedBooks(books));
      B.add('paint', P.at(P.cyl(0.07, 0.1, 0.34, 10, NOXE.lavender), sx + 0.3, 2.4, -H + 0.17));
      B.box('paint', 0.36, 0.44, 0.03, sx - 0.2, 2.45, -H + 0.1, '#1a1e2b');
      B.box('paint', 0.28, 0.36, 0.01, sx - 0.2, 2.45, -H + 0.12, '#e2b33c');
      B.box('paint', 0.28, 0.12, 0.012, sx - 0.2, 2.33, -H + 0.122, '#2f8f88');
      P.pot(B, sx + 0.95, 2.23, -H + 0.17, 0.12, '#c6714a');
      P.succulent(B, rand, sx + 0.95, 2.23 + 0.15, -H + 0.17, 0.18);
      P.pot(B, sx - 0.75, 3.01, -H + 0.17, 0.15, NOXE.paper);
      const vines = [];
      for (let v = 0; v < 5; v++) {
        const xx = sx - 0.75 + (rand() - 0.5) * 0.35;
        const len = 0.5 + rand() * 1.3;
        for (let s = 0; s < len; s += 0.11) vines.push([xx + Math.sin(s * 2.4 + v) * 0.1 + (v - 2) * 0.03 * s, 3.18 - s, -H + 0.3 + Math.sin(s * 3 + v) * 0.04]);
      }
      for (let i = 0; i < 8; i++) vines.push([sx - 0.75 + (rand() - 0.5) * 0.32, 3.23 + rand() * 0.15, -H + 0.17 + (rand() - 0.5) * 0.2]);
      root.add(P.leafCloud(rand, vines, 0.13));
      P.camera(B, sx + 0.95, 3.01, -H + 0.17, true);
    }
    const clock = new THREE.Group();
    const hands = {};
    {
      clock.position.set(WIN.x1 + 0.47, 3.15, -H + 0.03);
      clock.add(K.mesh(P.at(P.cyl(0.4, 0.4, 0.05, 24, '#1a1e2b'), 0, 0, 0.025, 0, Math.PI / 2), mats.paint));
      clock.add(K.mesh(P.at(P.cyl(0.34, 0.34, 0.02, 24, '#f4f1ea'), 0, 0, 0.055, 0, Math.PI / 2), mats.paint));
      const ticks = [];
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const big = k % 3 === 0;
        ticks.push(P.at(P.box(big ? 0.06 : 0.04, big ? 0.09 : 0.05, 0.01, '#1a1e2b'), Math.sin(a) * 0.28, Math.cos(a) * 0.28, 0.068, 0, 0, -a));
      }
      clock.add(K.mesh(K.merge(ticks), mats.paint, { cast: false }));
      const hand = (len, wid, c, z) => {
        const g = new THREE.Group();
        g.position.z = z;
        g.add(K.mesh(P.at(P.box(wid, len, 0.012, c), 0, len / 2 - 0.05, 0), mats.paint, { cast: false }));
        clock.add(g);
        return g;
      };
      hands.h = hand(0.21, 0.06, '#1a1e2b', 0.075);
      hands.m = hand(0.3, 0.045, '#1a1e2b', 0.085);
      hands.s = hand(0.31, 0.025, NOXE.violet, 0.095);
      clock.add(K.mesh(P.at(P.cyl(0.035, 0.035, 0.02, 8, NOXE.violet), 0, 0, 0.1, 0, Math.PI / 2), mats.paint, { cast: false }));
      root.add(clock);
    }

    // ------------------------------------------------------------ rug, pouf, cat
    {
      const RUG = { x: 0.15, z: 0.85, w: 3.8, d: 2.8 };
      const rug = P.canvasTexture(52, 39);
      P.drawRug(rug.ctx, 52, 39);
      rug.tex.needsUpdate = true;
      textures.push(rug.tex);
      const m = toon('#ffffff', { noise: 0.22, noiseScale: 12, ...base });
      m.map = rug.tex;
      const rg = new THREE.PlaneGeometry(RUG.w, RUG.d);
      rg.rotateX(-Math.PI / 2);
      const r = K.mesh(rg, m, { cast: false });
      r.position.set(RUG.x, 0.012, RUG.z);
      root.add(r);
      for (let i = 0; i < 14; i++) for (const s of [-1, 1]) B.box('fabric', 0.04, 0.012, 0.1, RUG.x + s * (RUG.w / 2 + 0.05), 0.006, RUG.z - RUG.d / 2 + 0.12 + i * ((RUG.d - 0.24) / 13), '#e9e1d2');
      // ottoman in front of the armchair
      B.add('fabric', P.at(P.cyl(0.34, 0.36, 0.36, 14, '#9f8ad8'), 2.15, 0.18, 0.75));
      B.add('fabric', P.at(P.cyl(0.3, 0.3, 0.02, 14, '#b3a1e6'), 2.15, 0.37, 0.75));
      // snake plant: a tall foreground silhouette at the front left
      P.pot(B, -2.85, 0, 3.15, 0.32, '#efe9df');
      B.add('paint', P.at(P.cyl(0.322, 0.322, 0.08, 10, NOXE.violet), -2.85, 0.24, 3.15));
      P.snakePlant(B, rand, -2.85, 0.41, 3.15);
      // floor cushion and a stack of books by the bookcase
      B.add('fabric', P.at(P.box(0.7, 0.16, 0.7, { all: '#c8553d', py: '#d9694f' }), -1.85, 0.08, 3.25, 0.4));
      let by = 0;
      for (const [c, th] of [['#2f8f88', 0.07], ['#efe9df', 0.06], [NOXE.violet, 0.08], ['#e2b33c', 0.05]]) {
        B.box('paint', 0.42, th, 0.32, -3.15, by + th / 2, 2.35 + by * 0.4, c, by * 3);
        by += th;
      }
    }
    const catPos = new THREE.Vector3(WXC - 0.15, WIN.y0, -H + 0.2);
    B.add('fabric', P.at(P.cyl(0.38, 0.4, 0.12, 16, '#9f8ad8').scale(1.4, 1, 1), catPos.x, catPos.y + 0.06, catPos.z));
    const cat = P.buildCat(mats);
    cat.group.position.set(catPos.x, catPos.y + 0.12, catPos.z + 0.02);
    cat.group.rotation.y = 0.15;
    cat.group.scale.setScalar(1.55);
    root.add(cat.group);
    P.pot(B, WIN.x1 - 0.42, WIN.y0, -H + 0.25, 0.1, '#c6714a');
    P.succulent(B, rand, WIN.x1 - 0.42, WIN.y0 + 0.13, -H + 0.25, 0.14);
    P.pot(B, WIN.x1 - 0.17, WIN.y0, -H + 0.32, 0.08, NOXE.paper);
    P.succulent(B, rand, WIN.x1 - 0.17, WIN.y0 + 0.11, -H + 0.32, 0.1);

    // ------------------------------------------------------------ fairy lights along the top of both walls
    const fairyPins = [];
    for (let z = H - 0.15; z > -H + 0.3; z -= 1.45) fairyPins.push([-H + 0.06, 4.1, z]);
    fairyPins.push([-H + 0.06, 4.1, -H + 0.06]);
    for (let x = -H + 1.45; x < H - 0.3; x += 1.45) fairyPins.push([x, 4.1, -H + 0.06]);
    fairyPins.push([H - 0.15, 4.1, -H + 0.06]);
    const fairy = P.fairyLights(fairyPins, { sag: 0.2 });
    root.add(fairy.group);

    B.build(mats, root);

    // ------------------------------------------------------------ lights
    const point = (color, pos, distance) => {
      const l = new THREE.PointLight(color, 0, distance, 2);
      l.position.set(...pos);
      root.add(l);
      return l;
    };
    const monLight = point('#8f63ff', [MON.x + 0.45, 1.95, MON.z], 5);
    const fairyA = point('#ffb260', [-H + 0.45, 3.5, 1.5], 5.5);
    const fairyB = point('#ffb260', [2.6, 2.75, -H + 0.55], 5.5);
    const neonLight = point('#9b6bff', [-H + 0.35, NEON.y + 0.1, NEON.z], 3.4);
    const winLight = point('#7090ff', [WXC, 2.3, -H + 0.5], 4.2);
    const floorLight = point('#ffaa5c', [FL.x + 0.15, FL.y - 0.05, FL.z + 0.1], 6.5);
    const warmFill = new THREE.AmbientLight('#ffb070', 0);
    root.add(warmFill);

    // sun (or moon) shaft through the window
    const L = new THREE.Vector3(-0.3, -0.72, 0.62).normalize();
    const winC = new THREE.Vector3(WXC, (WIN.y0 + WIN.y1) / 2, GZ);
    const spot = new THREE.SpotLight('#fff1d6', 0, 0, 0.24, 0.12, 0);
    spot.position.copy(winC).addScaledVector(L, -14);
    spot.target.position.copy(winC).addScaledVector(L, 3);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.camera.near = 8;
    spot.shadow.camera.far = 32;
    spot.shadow.bias = -0.0008;
    root.add(spot, spot.target);
    const corners = [[WIN.x0 + 0.12, WIN.y0 + 0.12], [WIN.x1 - 0.12, WIN.y0 + 0.12], [WIN.x1 - 0.12, WIN.y1 - 0.12], [WIN.x0 + 0.12, WIN.y1 - 0.12]].map(([x, y]) => new THREE.Vector3(x, y, GZ));
    const floorPts = corners.map((c) => c.clone().addScaledVector(L, (c.y - 0.02) / -L.y));
    const shaft = P.beam(corners, floorPts);
    const motes = P.dust(corners, floorPts, 70);
    root.add(shaft, motes);
    const steam = P.steam(mugPos.clone().setY(mugPos.y + 0.24), 30);
    root.add(steam);

    // ------------------------------------------------------------ state, update, actions
    const S = {
      lampOn: true, lampLevel: 1, flick: 0,
      vinylOn: false, spin: 0, arm: 0, armDelay: 0, beatClock: 0,
      art: 0, artFrom: 0, artT: 1, edit: 0, nextType: 6, lastFrame: -1,
      lastSec: -1, flickTail: 4, tailKick: 0, ear: 0, nextEar: 3, vinylLevel: 0,
    };
    const warmC = new THREE.Color('#ffb260'), lavC = new THREE.Color('#a77cff');
    const art = (i, t, opts) => P.drawScreen(screen.ctx, 32, 18, i, t, opts);
    const monCol = new THREE.Color(), monA = new THREE.Color(), monB = new THREE.Color();
    const BEAT = 60 / 72;
    const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);

    function beatInfo(dt, musicOn) {
      if (!musicOn) {
        S.beatClock = 0;
        return { phase: 0, index: 0, kick: 0 };
      }
      const lo = audio?.loops?.lofi;
      let phase, index;
      if (audio?.ctx && audio.on && lo && lo.next) {
        // follow the synth's own clock so the speakers punch on the real kick
        const now = audio.ctx.currentTime;
        const k = Math.max(1, Math.ceil((lo.next - now) / BEAT - 1e-6));
        phase = Math.min(1, Math.max(0, (now - (lo.next - k * BEAT)) / BEAT));
        index = lo.beat - k;
      } else {
        S.beatClock += dt;
        phase = (S.beatClock / BEAT) % 1;
        index = Math.floor(S.beatClock / BEAT);
      }
      const decay = Math.exp(-phase * BEAT * 9);
      return { phase, index, kick: index % 2 === 0 ? decay : decay * 0.45 };
    }

    const actions = [
      {
        id: 'vinyl', label: 'Vinyl', icon: ICONS.vinyl,
        run() {
          S.vinylOn = !S.vinylOn;
          S.armDelay = S.vinylOn ? 0.35 : 0;
          audio?.play('tick');
        },
        active: () => S.vinylOn,
      },
      {
        id: 'lamp', label: 'Lamp', icon: ICONS.lamp,
        run() {
          S.lampOn = !S.lampOn;
          if (S.lampOn) S.flick = 0.3;
          audio?.play('tick');
        },
        active: () => S.lampOn,
      },
      {
        id: 'screen', label: 'Screen', icon: ICONS.screen,
        run() {
          S.artFrom = S.art;
          S.art = (S.art + 1) % P.SCREEN_ART.length;
          S.artT = 0;
          audio?.play('typing');
        },
      },
    ];

    function update(t, dt, env) {
      tuneWeather(env);
      // the engine grades deep night very blue: give the warm sources a little more push then
      const deep = 1 + 0.5 * K.smoothstep(0.6, 1.0, env.night);
      // desk lamp
      S.lampLevel += ((S.lampOn ? 1 : 0) - S.lampLevel) * (1 - Math.exp(-dt * (S.lampOn ? 18 : 10)));
      let lampK = S.lampLevel;
      if (S.flick > 0) {
        S.flick -= dt;
        lampK *= Math.sin(S.flick * 60) > -0.3 ? 1 : 0.12;
      }
      const flicker = 1 + Math.sin(t * 9.3) * 0.015 + Math.sin(t * 23.1) * 0.01;
      lampLight.intensity = 5.6 * lampK * flicker * deep;
      setGlow(bulbMat, lampK);
      lampCone.material.uniforms.uOn.value = lampK * (0.35 + 0.65 * env.lamps);

      // vinyl: platter spins up, the arm swings over, then the music starts
      const want = S.vinylOn ? 1 : 0;
      S.spin += (want * 3.5 - S.spin) * (1 - Math.exp(-dt * (want ? 2.4 : 1.0)));
      record.rotation.y -= S.spin * dt;
      if (S.armDelay > 0) S.armDelay -= dt;
      else S.arm = Math.min(1, Math.max(0, S.arm + (want ? dt : -dt) / 0.9));
      const a = ease(S.arm);
      tonearm.rotation.y = -0.6 * a;
      tonearm.position.y = RP.y + 0.22 + Math.sin(Math.PI * a) * 0.05;
      const musicOn = S.vinylOn && S.arm >= 1;
      const beat = beatInfo(dt, musicOn);
      S.vinylLevel += ((musicOn ? 1 : 0) - S.vinylLevel) * (1 - Math.exp(-dt * 3));
      audio?.setLoop('vinyl', S.vinylOn ? (musicOn ? 1 : 0.5) : 0);
      audio?.setLoop('lofi', musicOn ? 1 : 0);
      audio?.setLoop('hum', 0.45);
      audio?.setLoop('buzz', 0.18 * env.lamps);
      for (const w of woofers) w.scale.z = 1 + beat.kick * 1.6;
      setGlow(ledMat, S.vinylOn ? 1 : 0.08);

      // screen art, redrawn at 12 fps like a pixel animation
      S.artT = Math.min(1, S.artT + dt / 0.45);
      S.nextType -= dt;
      if (S.nextType <= 0) {
        S.edit++;
        S.nextType = 7 + Math.random() * 9;
        if (!musicOn) audio?.play('typing');
      }
      const frame = Math.floor(t * 12);
      if (frame !== S.lastFrame || S.artT < 1) {
        S.lastFrame = frame;
        const opts = { pulse: beat.kick > 0.55 ? 1 : 0, edit: S.edit, music: S.vinylLevel, kick: beat.kick };
        if (S.artT < 1) {
          art(S.artFrom, t, opts);
          const wx = Math.round(S.artT * 32);
          screen.ctx.save();
          screen.ctx.beginPath();
          screen.ctx.rect(0, 0, wx, 18);
          screen.ctx.clip();
          art(S.art, t, opts);
          screen.ctx.restore();
          screen.ctx.fillStyle = NOXE.paper;
          screen.ctx.fillRect(Math.min(31, wx), 0, 1, 18);
        } else art(S.art, t, opts);
        screen.tex.needsUpdate = true;
        P.drawLaptop(lapTex.ctx, 16, 10, t, S.art);
        lapTex.tex.needsUpdate = true;
      }
      setGlow(screenMat, 0.7 + 0.45 * env.lamps);
      setGlow(lapMat, 0.7 + 0.5 * env.lamps);
      monA.set(P.SCREEN_ART[S.artFrom].light);
      monB.set(P.SCREEN_ART[S.art].light);
      monCol.copy(monA).lerp(monB, S.artT);
      monLight.color.copy(monCol);
      monLight.intensity = (0.7 + 1.6 * env.lamps) * (1 + beat.kick * 0.25);

      // fairy lights, neon and the floor lamp come on with the lamps
      const pump = musicOn ? beat.kick : 0;
      fairy.material.uniforms.uOn.value = env.lamps;
      fairy.material.uniforms.uBeat.value = pump;
      fairy.material.uniforms.uMusic.value = S.vinylLevel;
      fairyA.intensity = 2.0 * Math.max(env.lamps, S.vinylLevel * 0.6) * (1 + pump * 0.3) * deep;
      fairyB.color.copy(warmC).lerp(lavC, S.vinylLevel * 0.7);
      fairyB.intensity = 1.8 * env.lamps * deep + S.vinylLevel * (1.0 + 1.6 * pump);
      setGlow(stripMat, S.vinylLevel * (0.5 + 0.5 * pump));
      let nv = 1;
      neonArcs.forEach((m, i) => {
        const v = neonFlicker(m, t, i * 3.1, 0.5);
        nv = Math.min(nv, v);
        setGlow(m, v * (1 + 0.45 * pump));
      });
      neonLight.intensity = 1.8 * env.lamps * nv;
      floorLight.intensity = 3.6 * env.lamps * deep;
      warmFill.intensity = 0.16 * env.lamps * (0.4 + 0.6 * S.lampLevel);

      // window: cool city light at night, lightning flashes through the glass
      winLight.intensity = (0.2 + 1.1 * env.night) * (1 - 0.35 * env.cur.clouds) + env.flash * 9;

      // sun or moon shaft
      const sunUp = env.k.sunI > 0.02;
      const keyI = env.key.intensity;
      // late in the day the real sun comes in through the window on its own (with true shadows),
      // so the painted shaft steps aside
      const through = K.smoothstep(-0.15, 0.1, env.key.position.z / 40);
      const sh = (sunUp ? Math.min(1, keyI / 2.0) : Math.min(1, keyI / 0.65) * 0.55) * through;
      spot.color.copy(env.key.color);
      spot.intensity = sh * (sunUp ? 2.4 : 1.4);
      shaft.material.uniforms.uOn.value = sh;
      shaft.material.uniforms.uColor.value.copy(env.key.color);
      motes.material.uniforms.uOn.value = sh * (sunUp ? 1 : 0.4);

      // sky outside
      const u = skyMat.uniforms;
      u.uTop.value.copy(env.post.skyTop);
      u.uBot.value.copy(env.post.skyBottom);
      u.uStars.value = env.post.stars;
      u.uNight.value = env.night;
      u.uMoon.value = 0; // the engine already draws the moon in the open sky; one moon per frame
      u.uHaze.value = Math.min(0.8, env.cur.rain * 0.35 + env.cur.fog * 0.9 + env.cur.snow * 0.3);

      // clock
      const hr = env.hour;
      hands.h.rotation.z = -((hr % 12) / 12) * Math.PI * 2;
      hands.m.rotation.z = -(hr % 1) * Math.PI * 2;
      const sec = Math.floor(env.time);
      hands.s.rotation.z = -((sec % 60) / 60) * Math.PI * 2;
      if (sec !== S.lastSec) {
        S.lastSec = sec;
        if (!musicOn) audio?.play('tick');
      }

      // cat: breathing, tail swish (to the beat when music plays), the odd ear flick
      cat.body.scale.y = 1 + Math.sin(t * 1.5) * 0.045;
      S.flickTail -= dt;
      if (S.flickTail <= 0) {
        S.tailKick = 1;
        S.flickTail = 4 + Math.random() * 6;
      }
      S.tailKick = Math.max(0, S.tailKick - dt * 0.9);
      const groove = musicOn ? Math.sin((beat.index + beat.phase) * Math.PI) : 0;
      cat.tail.forEach((seg, i) => {
        // only the last three segments move, so the curl stays wrapped round the body
        const k = Math.max(0, i - 2) / (cat.tail.length - 3);
        seg.rotation.y = seg.userData.base + k * (0.12 * Math.sin(t * 1.3 - i * 0.7) + 0.3 * S.tailKick * Math.sin(t * 9 - i * 0.9) + 0.14 * groove);
      });
      S.nextEar -= dt;
      if (S.nextEar <= 0) {
        S.ear = 1;
        S.nextEar = 3 + Math.random() * 5;
      }
      S.ear = Math.max(0, S.ear - dt * 4);
      cat.ear.rotation.x = Math.sin(S.ear * Math.PI * 3) * 0.35 * S.ear;
    }

    // The engine spawns snow one unit above the weather box top, which would peek over the wall now that
    // effects stay visible against the sky. Pull the snow ceiling down to just under the wall's sightline.
    function tuneWeather(env) {
      const g = env.fx?.group;
      if (!g || g.userData.studioTuned) return;
      for (const o of g.children) {
        const u = o.material?.uniforms;
        if (o.isPoints && u?.uArea && u?.uTop) u.uTop.value = SNOW_TOP;
      }
      g.userData.studioTuned = true;
    }

    const hitTargets = [lamp, record, tonearm, screenMesh, cat.group];
    function onClick(raycaster) {
      const hits = raycaster.intersectObjects(hitTargets, true);
      if (!hits.length) return;
      let o = hits[0].object;
      while (o && !hitTargets.includes(o)) o = o.parent;
      if (o === lamp) actions[1].run();
      else if (o === record || o === tonearm) actions[0].run();
      else if (o === screenMesh) actions[2].run();
      else if (o === cat.group) {
        S.tailKick = 1;
        S.ear = 1;
      }
    }

    // where weather lands: only outside, behind the window. Everything else sends
    // the engine's fireflies far below the room, out of sight.
    const surfaceAt = (x, z) => {
      if (z > OZ) return -60;
      if (x > LEDGE.x0 && x < LEDGE.x1 && z > LEDGE.z0) return LEDGE.y;
      for (const b of [BLD_A, BLD_B]) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return b.top + 0.08;
      return BASE;
    };

    return {
      root,
      // top is set high so the engine's floating clouds stay out of frame: this is a room, not an island
      info: { size: 12, top: 30, bottom: BASE, surfaceAt, isLand: () => true, weather: BOX },
      update,
      actions,
      // review helper: put the toggles in a known state (used by review sheets)
      setState({ lamp = true, vinyl = false } = {}) {
        S.lampOn = lamp;
        S.lampLevel = lamp ? 1 : 0;
        S.flick = 0;
        S.vinylOn = vinyl;
        S.arm = vinyl ? 1 : 0;
        S.armDelay = 0;
      },
      onClick,
      dispose() {
        textures.forEach((x) => x.dispose());
      },
    };
  },
};
