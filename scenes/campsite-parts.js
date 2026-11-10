import * as THREE from 'three';
import { toon, fxMaterial, shared } from '../engine/materials.js';
import * as K from './kit.js';

// Building blocks for the Campsite scene: Shield trees, camp gear, the loon and the fire effects.
// Geometry is built in local space with the base at y = 0 (so wind sway scales with height).

const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);

/** Tapered cylinder from a to b, painted one colour. */
export function limb(a, b, r0, r1, color, sides = 6) {
  const dir = new V3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, sides, 1);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()));
  g.translate(a.x, a.y, a.z);
  return K.paint(g, color);
}

/** Per-face colours: light on faces that look up, dark underneath (crisp pixel-art layering). */
export function shadeByNormal(geo, top, bottom, cut = 0.25) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  const n = g.attributes.normal;
  const ct = new THREE.Color(top), cb = new THREE.Color(bottom);
  const arr = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i += 3) {
    const ny = (n.getY(i) + n.getY(i + 1) + n.getY(i + 2)) / 3;
    const c = ny > cut ? ct : cb;
    for (let k = 0; k < 3; k++) arr.set([c.r, c.g, c.b], (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function blob(rand, c, rx, ry, rz, yaw = 0, detail = 1, rough = 0.32) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  K.jitter(g, rough, Math.floor(rand() * 1e4));
  g.scale(rx, ry, rz);
  g.rotateY(yaw);
  g.translate(c.x, c.y, c.z);
  return g;
}

// ---------------------------------------------------------------- trees

/**
 * Eastern white pine: a tall bare trunk with flat, layered needle pads swept to the leeward side (+x).
 * Rotate the mesh so +x points downwind.
 */
export function whitePineGeometry(rand, { h = 4.2, lean = 0.1, tiers = 5, reach = 1, pad = 1, bare = 0.34, trunk = '#5d4b42', leaf = ['#4f8c68', '#25503f'], leaf2 = ['#5c9a72', '#2c5946'] } = {}) {
  const parts = [];
  const P = (f) => new V3(lean * h * f * f, h * f, 0);
  const segs = 5;
  for (let i = 0; i < segs; i++) {
    const f0 = (i / segs) * 0.97, f1 = ((i + 1) / segs) * 0.97;
    parts.push(limb(P(f0), P(f1), 0.15 * (1 - f0 * 0.72), 0.15 * (1 - f1 * 0.72), trunk, 6));
  }
  const flare = new THREE.CylinderGeometry(0.15, 0.22, 0.2, 6);
  flare.translate(0, 0.1, 0);
  parts.push(K.paint(flare, trunk));
  for (let k = 0; k < tiers; k++) {
    const t = k / (tiers - 1);
    const base = P(bare + (0.9 - bare) * t);
    const L = (1.35 - 0.92 * t) * reach * (h / 4.2) * (0.85 + rand() * 0.3);
    const ang = (rand() - 0.5) * 0.7 + (k % 2 ? 0.42 : -0.42);
    const dir = new V3(Math.cos(ang), 0.1 + rand() * 0.14, Math.sin(ang)).normalize();
    const end = base.clone().addScaledVector(dir, L);
    parts.push(limb(base, end, 0.055, 0.035, trunk, 5));
    const cols = rand() < 0.5 ? leaf : leaf2;
    const pr = (0.46 + 0.3 * (1 - t)) * pad;
    parts.push(shadeByNormal(blob(rand, end.clone().add(new V3(0.04, 0.05, 0)), pr * 1.25, pr * 0.27, pr * 0.78, -ang, 1, 0.42), cols[0], cols[1]));
    const mid = base.clone().addScaledVector(dir, L * 0.5).add(new V3(0, 0.0, (rand() - 0.5) * 0.3));
    parts.push(shadeByNormal(blob(rand, mid, pr * 0.85, pr * 0.24, pr * 0.66, -ang + (rand() - 0.5) * 0.6, 1, 0.42), cols[0], cols[1]));
    if (t < 0.7) {
      // a little drooping tuft under the outer pad
      const tuft = end.clone().add(new V3(-0.12, -0.1, (rand() - 0.5) * 0.3));
      parts.push(shadeByNormal(blob(rand, tuft, pr * 0.55, pr * 0.2, pr * 0.45, -ang, 0, 0.4), cols[0], cols[1]));
    }
    if (rand() < 0.55) {
      // a short stub on the windward side
      const a2 = Math.PI + (rand() - 0.5) * 1.3;
      const d2 = new V3(Math.cos(a2), 0.18, Math.sin(a2)).normalize();
      const e2 = base.clone().addScaledVector(d2, L * 0.3);
      parts.push(limb(base, e2, 0.045, 0.03, trunk, 5));
      parts.push(shadeByNormal(blob(rand, e2, pr * 0.55, pr * 0.27, pr * 0.5, -a2), cols[0], cols[1]));
    }
  }
  const top = P(0.98);
  parts.push(shadeByNormal(blob(rand, top.clone().add(new V3(0.14, 0.04, 0)), 0.42 * pad, 0.17, 0.32 * pad), leaf[0], leaf[1]));
  return K.merge(parts);
}

/** Spruce: a narrow dark spire of stacked tiers. club adds the knobbly top of a black spruce. */
export function spruceGeometry(rand, { h = 2.6, w = 0.56, tiers = 6, club = false, leaf = '#29483a', leaf2 = '#335744', trunk = '#4c3b32' } = {}) {
  const parts = [];
  const t = new THREE.CylinderGeometry(0.05, 0.085, h * 0.3, 5);
  t.translate(0, h * 0.15, 0);
  parts.push(K.paint(t, trunk));
  for (let k = 0; k < tiers; k++) {
    const f = k / tiers;
    const r = w * Math.pow(1 - f, 0.95) + 0.07;
    const ch = h * (0.3 - f * 0.1);
    const c = new THREE.ConeGeometry(r, ch, 7, 1);
    c.rotateY(rand() * Math.PI);
    K.jitter(c, r * 0.2, Math.floor(rand() * 1e4));
    c.translate((rand() - 0.5) * 0.06, h * 0.13 + f * h * 0.74 + ch / 2, (rand() - 0.5) * 0.06);
    parts.push(K.paint(c, k % 2 ? leaf2 : leaf));
  }
  const tip = new THREE.ConeGeometry(0.07, h * 0.16, 5);
  tip.translate(0, h * 1.0, 0);
  parts.push(K.paint(tip, leaf2));
  if (club) {
    const b = blob(rand, new V3(0, h * 0.9, 0), 0.19, 0.24, 0.19, 0, 0, 0.3);
    parts.push(K.paint(b, leaf2));
  }
  const g = K.merge(parts);
  g.computeVertexNormals();
  return g;
}

/** White birch clump: chalky trunks with dark marks and a light, airy crown. */
export function birchGeometry(rand, { h = 2.5, trunks = 2, leaves = ['#7da64a', '#8db454', '#6d9842'] } = {}) {
  const parts = [];
  const tops = [];
  for (let i = 0; i < trunks; i++) {
    const a = (i / trunks) * Math.PI * 2 + rand() * 1.5;
    const tilt = trunks > 1 ? 0.1 + rand() * 0.16 : 0.04 + rand() * 0.06;
    const th = h * (0.8 + rand() * 0.2);
    const dir = new V3(Math.sin(tilt) * Math.cos(a), Math.cos(tilt), Math.sin(tilt) * Math.sin(a));
    const base = new V3(Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05);
    const segs = 6;
    for (let s = 0; s < segs; s++) {
      const p0 = base.clone().addScaledVector(dir, (th * s) / segs);
      const p1 = base.clone().addScaledVector(dir, (th * (s + 1)) / segs);
      const r = rand();
      const col = r < 0.3 ? '#2e2a27' : r < 0.45 ? '#cdc7bb' : '#eeeae0';
      parts.push(limb(p0, p1, 0.082 - 0.035 * (s / segs), 0.082 - 0.035 * ((s + 1) / segs), col, 6));
    }
    tops.push(base.clone().addScaledVector(dir, th));
  }
  for (const top of tops) {
    const n = 3 + Math.floor(rand() * 2);
    for (let j = 0; j < n; j++) {
      const r = 0.28 + rand() * 0.14;
      const c = new V3(top.x + (rand() - 0.5) * 0.65, top.y - 0.15 - rand() * h * 0.32, top.z + (rand() - 0.5) * 0.65);
      parts.push(K.paint(blob(rand, c, r, r * 0.85, r, 0, 1, 0.3), leaves[Math.floor(rand() * leaves.length)]));
    }
  }
  return K.merge(parts);
}

/** Low blueberry bush with a few berries showing. */
export function blueberryGeometry(rand, { r = 0.22, red = false } = {}) {
  const parts = [];
  const greens = red ? ['#7d4a36', '#8f5a3a', '#5e6a38'] : ['#3d6b3a', '#4a7a40', '#557f3c'];
  const n = 3 + Math.floor(rand() * 2);
  const tops = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand();
    const br = r * (0.5 + rand() * 0.3);
    const c = new V3(Math.cos(a) * r * 0.45, br * 0.55, Math.sin(a) * r * 0.45);
    parts.push(K.paint(blob(rand, c, br, br * 0.72, br, 0, 0, 0.35), greens[i % greens.length]));
    tops.push(c.clone().add(new V3(0, br * 0.55, 0)));
  }
  const berries = ['#3c4c9e', '#5566bb', '#2f3b80'];
  for (let i = 0; i < 4; i++) {
    const t = tops[i % tops.length];
    const b = new THREE.BoxGeometry(0.07, 0.07, 0.07);
    b.translate(t.x + (rand() - 0.5) * r * 0.6, t.y - rand() * 0.04, t.z + (rand() - 0.5) * r * 0.6);
    parts.push(K.paint(b, berries[i % 3]));
  }
  return K.merge(parts);
}

/** Granite boulder with lichen patches: pink or grey, flattened, faceted. */
export function boulderGeometry(rand, s = 0.5, { pink = true } = {}) {
  const g = new THREE.IcosahedronGeometry(s, 1);
  K.jitter(g, s * 0.38, Math.floor(rand() * 1e4));
  g.scale(1, 0.55 + rand() * 0.3, 0.85 + rand() * 0.3);
  g.computeVertexNormals();
  const base = pink ? ['#c08e7c', '#b48170', '#cc9d8a'] : ['#a19b9b', '#938e90', '#aea8a6'];
  const lichen = ['#c8b85e', '#d58a3a', '#9fae7e', '#ddd6c2'];
  const n = g.attributes.normal;
  const arr = new Float32Array(n.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < n.count; i += 3) {
    const up = (n.getY(i) + n.getY(i + 1) + n.getY(i + 2)) / 3;
    c.set(up > 0.3 && rand() < 0.22 ? lichen[Math.floor(rand() * lichen.length)] : base[Math.floor(rand() * base.length)]);
    for (let k = 0; k < 3; k++) arr.set([c.r, c.g, c.b], (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// ---------------------------------------------------------------- camp gear

/** A-frame tent, ridge along x, door on +x. Fabric and the open door glow when the lamps come up. */
export function tent({ L = 1.3, W = 1.04, H = 0.7, fabric = '#dba640', fly = '#c98f2c', trim = '#4a3a2e', glow = '#ffb45c' } = {}) {
  const g = new THREE.Group();
  const fabM = toon(fabric, { noise: 0.06, emissive: glow, emissiveIntensity: 0.75, lamp: true });
  const flyM = toon(fly, { noise: 0.06, emissive: glow, emissiveIntensity: 0.55, lamp: true });
  const doorM = toon('#3a2a1c', { noise: 0, emissive: '#ffb25e', emissiveIntensity: 2.9, lamp: true, snow: 0, wet: 0 });
  const trimM = toon(trim, { noise: 0.05 });
  const pitch = Math.atan2(H, W / 2);
  const slant = Math.hypot(H, W / 2);
  for (const s of [-1, 1]) {
    const p = K.mesh(new THREE.BoxGeometry(L + 0.1, 0.045, slant + 0.05), s > 0 ? flyM : fabM);
    p.rotation.x = s * pitch;
    p.position.set(0, H / 2 + 0.01, (s * W) / 4);
    g.add(p);
  }
  const ridge = K.mesh(new THREE.BoxGeometry(L + 0.16, 0.06, 0.07), trimM);
  ridge.position.y = H + 0.03;
  g.add(ridge);
  const tri = (x, w, h, y0 = 0) => {
    const geo = new THREE.BufferGeometry();
    const sx = Math.sign(x);
    const p = sx > 0 ? [x, y0, w, x, y0, -w, x, y0 + h, 0] : [x, y0, -w, x, y0, w, x, y0 + h, 0];
    geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute([sx, 0, 0, sx, 0, 0, sx, 0, 0], 3));
    return geo;
  };
  g.add(K.mesh(tri(-L / 2, W / 2 - 0.01, H - 0.01), fabM));
  g.add(K.mesh(tri(L / 2, W / 2 - 0.01, H - 0.01), fabM));
  // open door: a glowing triangle with the flaps tied back either side
  const door = K.mesh(tri(L / 2 + 0.012, W * 0.3, H * 0.78), doorM, { cast: false });
  g.add(door);
  for (const s of [-1, 1]) {
    const flap = K.mesh(new THREE.BoxGeometry(0.05, H * 0.42, 0.1), flyM);
    flap.position.set(L / 2 + 0.03, H * 0.24, s * W * 0.31);
    flap.rotation.x = s * 0.5;
    g.add(flap);
  }
  const floor = K.mesh(new THREE.BoxGeometry(L + 0.02, 0.06, W + 0.02), trimM);
  floor.position.y = 0.03;
  g.add(floor);
  // stakes and a pole tip so the shape reads
  const pole = K.mesh(new THREE.BoxGeometry(0.06, 0.12, 0.06), trimM);
  pole.position.set(L / 2 + 0.03, H + 0.05, 0);
  g.add(pole);
  return { group: g, light: new V3(L / 2 + 0.35, 0.35, 0), mats: [fabM, flyM, doorM] };
}

/** Lofted canoe, bow along +x, keel at y = 0. */
export function canoe({ L = 1.85, B = 0.44, D = 0.2, hull = '#c63a2b', inner = '#a8302a', rim = '#3a2a22', wood = '#c08d55' } = {}) {
  const N = 20, M = 8;
  const loft = (scaleB, lift, flip) => {
    const pos = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const t = -1 + (2 * i) / N, at = Math.abs(t);
      const b = (B / 2) * scaleB * Math.pow(Math.max(0, 1 - Math.pow(at, 2.3)), 0.55);
      const sheer = D + 0.085 * Math.pow(at, 4);
      const keel = 0.012 + lift + 0.06 * Math.pow(at, 6);
      for (let j = 0; j <= M; j++) {
        const th = (j / M) * Math.PI;
        pos.push((t * L) / 2, sheer - (sheer - keel) * Math.pow(Math.sin(th), 0.7), b * Math.cos(th));
      }
    }
    for (let i = 0; i < N; i++)
      for (let j = 0; j < M; j++) {
        const a = i * (M + 1) + j, b = a + M + 1, c = a + 1, d = b + 1;
        if (flip) idx.push(a, b, c, b, d, c);
        else idx.push(a, c, b, b, c, d);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  };
  const parts = [K.paint(loft(1, 0, false), hull), K.paint(loft(0.84, 0.03, true), inner)];
  // gunwales: a dark rim on top of both sheer lines
  for (const s of [-1, 1]) {
    for (let i = 0; i < N; i++) {
      const t0 = -1 + (2 * i) / N, t1 = -1 + (2 * (i + 1)) / N;
      const pt = (t) => {
        const at = Math.abs(t);
        const b = (B / 2) * 0.93 * Math.pow(Math.max(0, 1 - Math.pow(at, 2.3)), 0.55);
        return new V3((t * L) / 2, D + 0.085 * Math.pow(at, 4) + 0.012, s * b);
      };
      const a = pt(t0), b = pt(t1);
      if (a.distanceTo(b) < 1e-3) continue;
      parts.push(limb(a, b, 0.032, 0.032, rim, 4));
    }
  }
  const beamAt = (x) => (B / 2) * 0.84 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs((2 * x) / L), 2.3)), 0.55);
  for (const [x, w, y] of [[0.0, 0.07, D - 0.01], [0.34, 0.05, D - 0.02], [-0.34, 0.05, D - 0.02], [0.62, 0.15, D - 0.05], [-0.6, 0.15, D - 0.05]]) {
    const bw = beamAt(x) * 2;
    const box = new THREE.BoxGeometry(w, 0.035, bw);
    box.translate(x, y, 0);
    parts.push(K.paint(box, wood));
  }
  return K.merge(parts);
}

/** Canoe paddle along +x: grip at 0, blade at the far end. */
export function paddleGeometry({ len = 1.15, blade = '#c99c60', shaft = '#a97b48' } = {}) {
  const parts = [];
  const s = new THREE.BoxGeometry(len * 0.66, 0.06, 0.06);
  s.translate(len * 0.36, 0, 0);
  parts.push(K.paint(s, shaft));
  const grip = new THREE.BoxGeometry(0.06, 0.07, 0.14);
  grip.translate(0.03, 0, 0);
  parts.push(K.paint(grip, '#7d5734'));
  const b = new THREE.BoxGeometry(len * 0.34, 0.035, 0.18, 3, 1, 1);
  const p = b.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (len * 0.34) + 0.5;
    p.setZ(i, p.getZ(i) * (0.55 + 0.45 * Math.sin(Math.min(1, x * 1.25) * Math.PI * 0.5)));
  }
  b.translate(len * 0.83, 0, 0);
  b.computeVertexNormals();
  parts.push(K.paint(b, blade));
  return K.merge(parts);
}

/** Folding camp chair facing +x. Seat height ~0.2. */
export function campChair({ fabric = '#2f6f8f', frame = '#2b2e35' } = {}) {
  const parts = [];
  const seat = new THREE.BoxGeometry(0.3, 0.04, 0.3);
  seat.translate(0, 0.2, 0);
  parts.push(K.paint(seat, fabric));
  const back = new THREE.BoxGeometry(0.045, 0.28, 0.3);
  back.rotateZ(0.22);
  back.translate(-0.16, 0.34, 0);
  parts.push(K.paint(back, fabric));
  for (const s of [-1, 1]) {
    const arm = new THREE.BoxGeometry(0.3, 0.035, 0.05);
    arm.translate(0.0, 0.3, s * 0.16);
    parts.push(K.paint(arm, frame));
    for (const sx of [-1, 1]) {
      const leg = new THREE.BoxGeometry(0.05, 0.22, 0.05);
      leg.rotateZ(sx * 0.25);
      leg.translate(sx * 0.12, 0.1, s * 0.15);
      parts.push(K.paint(leg, frame));
    }
  }
  return K.mesh(K.merge(parts), toon('#ffffff', { vertexColors: true, noise: 0.05 }));
}

/** Sitting log: bark with pale cut ends, along x. */
export function logGeometry(rand, { len = 0.8, r = 0.11, bark = '#5f4331', cut = '#cfa673' } = {}) {
  const parts = [];
  const g = new THREE.CylinderGeometry(r, r * 1.05, len, 7, 1, false);
  g.rotateZ(Math.PI / 2);
  parts.push(K.paint(g, bark));
  for (const s of [-1, 1]) {
    const c = new THREE.CylinderGeometry(r * 0.86, r * 0.86, 0.02, 7);
    c.rotateZ(Math.PI / 2);
    c.translate((s * len) / 2 + s * 0.005, 0, 0);
    parts.push(K.paint(c, cut));
  }
  return K.merge(parts);
}

/** Campfire ring: stones, ash bed and a small crossed pile of logs. Centre at origin. */
export function fireRing(rand, { r = 0.34 } = {}) {
  const parts = [];
  const stones = ['#8f8a8a', '#a59f9c', '#b4887a', '#7d7878'];
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * 0.2;
    const s = 0.085 + rand() * 0.035;
    const st = new THREE.IcosahedronGeometry(s, 0);
    K.jitter(st, s * 0.4, Math.floor(rand() * 1e4));
    st.scale(1.15, 0.8, 1);
    st.rotateY(-a);
    st.translate(Math.cos(a) * r, s * 0.5, Math.sin(a) * r);
    parts.push(K.paint(st, stones[i % stones.length]));
  }
  const ash = new THREE.CylinderGeometry(r * 0.82, r * 0.86, 0.04, 9);
  ash.translate(0, 0.02, 0);
  parts.push(K.paint(ash, '#3b3634'));
  const logs = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const outer = new V3(Math.cos(a) * r * 0.85, 0.04, Math.sin(a) * r * 0.85);
    const inner = new V3(Math.cos(a) * 0.04, 0.2, Math.sin(a) * 0.04);
    logs.push(limb(outer, inner, 0.05, 0.04, i % 2 ? '#4f3828' : '#5d4230', 5));
  }
  parts.push(...logs);
  return K.merge(parts);
}

/** Stacked firewood, along x. */
export function woodpile(rand) {
  const parts = [];
  const cols = ['#8a6240', '#9c7048', '#7a5638'];
  let k = 0;
  for (let row = 0; row < 3; row++) {
    const n = 3 - row;
    for (let i = 0; i < n; i++) {
      const g = new THREE.CylinderGeometry(0.055, 0.055, 0.42, 5);
      g.rotateZ(Math.PI / 2);
      g.rotateX(rand() * Math.PI);
      g.translate((rand() - 0.5) * 0.06, 0.055 + row * 0.095, (i - (n - 1) / 2) * 0.115);
      parts.push(K.paint(g, cols[k++ % 3]));
    }
  }
  return K.merge(parts);
}

/** Barrel-style food pack, hanging from its top at y = 0. */
export function foodPack({ color = '#2f69ad', lid = '#1d3c66', rope = '#d9ccaa', drop = 0.55 } = {}) {
  const parts = [];
  const r = new THREE.BoxGeometry(0.06, drop, 0.06);
  r.translate(0, -drop / 2, 0);
  parts.push(K.paint(r, rope));
  const body = new THREE.CylinderGeometry(0.13, 0.13, 0.3, 8);
  body.translate(0, -drop - 0.17, 0);
  parts.push(K.paint(body, color));
  const top = new THREE.CylinderGeometry(0.135, 0.135, 0.05, 8);
  top.translate(0, -drop - 0.02, 0);
  parts.push(K.paint(top, lid));
  for (const y of [-drop - 0.1, -drop - 0.25]) {
    const strap = new THREE.CylinderGeometry(0.138, 0.138, 0.035, 8);
    strap.translate(0, y, 0);
    parts.push(K.paint(strap, '#232a33'));
  }
  return K.merge(parts);
}

/** Enamel pot on a flat stone. */
export function pot() {
  const parts = [];
  const st = new THREE.CylinderGeometry(0.13, 0.15, 0.06, 7);
  st.translate(0, 0.03, 0);
  parts.push(K.paint(st, '#8d8786'));
  const b = new THREE.CylinderGeometry(0.075, 0.07, 0.11, 8);
  b.translate(0, 0.115, 0);
  parts.push(K.paint(b, '#3e74b0'));
  const l = new THREE.CylinderGeometry(0.08, 0.08, 0.02, 8);
  l.translate(0, 0.18, 0);
  parts.push(K.paint(l, '#e8e4dc'));
  return K.merge(parts);
}

// ---------------------------------------------------------------- loon

/** Common loon, facing +x, waterline at y = 0. Returns { group, body, head, wings, parts }. */
export function loon() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const bodyGeo = new THREE.SphereGeometry(1, 10, 6).toNonIndexed();
  bodyGeo.scale(0.26, 0.1, 0.11);
  bodyGeo.computeVertexNormals();
  const p = bodyGeo.attributes.position;
  const cols = new Float32Array(p.count * 3);
  const dark = new THREE.Color('#1b2022'), white = new THREE.Color('#e9e8e2'), spot = new THREE.Color('#cfd2d0');
  for (let i = 0; i < p.count; i += 3) {
    const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    let c = dark;
    if (y < -0.01) c = white;
    else if (y > 0.03 && Math.abs(z) > 0.035 && ((Math.floor(x * 30) + Math.floor(z * 30)) & 1)) c = spot;
    for (let k = 0; k < 3; k++) cols.set([c.r, c.g, c.b], (i + k) * 3);
  }
  bodyGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const mat = toon('#ffffff', { vertexColors: true, noise: 0, snow: 0.2 });
  const bodyM = K.mesh(bodyGeo, mat);
  bodyM.position.y = 0.03;
  body.add(bodyM);
  const tail = K.mesh(K.paint(new THREE.BoxGeometry(0.08, 0.05, 0.08), '#1b2022'), mat);
  tail.position.set(-0.26, 0.06, 0);
  body.add(tail);
  // neck with a white striped collar, head, bill
  const head = new THREE.Group();
  head.position.set(0.18, 0.06, 0);
  body.add(head);
  const neckParts = [];
  const n1 = new THREE.CylinderGeometry(0.045, 0.055, 0.14, 6);
  n1.translate(0, 0.07, 0);
  neckParts.push(K.paint(n1, '#16201f'));
  const collar = new THREE.CylinderGeometry(0.05, 0.05, 0.035, 6);
  collar.translate(0, 0.075, 0);
  neckParts.push(K.paint(collar, '#d8dad6'));
  const hd = new THREE.IcosahedronGeometry(0.07, 1);
  hd.scale(1.25, 0.95, 0.9);
  hd.translate(0.03, 0.16, 0);
  neckParts.push(K.paint(hd, '#142321'));
  const bill = new THREE.ConeGeometry(0.03, 0.13, 5);
  bill.rotateZ(-Math.PI / 2);
  bill.translate(0.15, 0.15, 0);
  neckParts.push(K.paint(bill, '#2f3438'));
  const eye = new THREE.BoxGeometry(0.03, 0.03, 0.13);
  eye.translate(0.06, 0.18, 0);
  neckParts.push(K.paint(eye, '#b8231f'));
  head.add(K.mesh(K.merge(neckParts), mat));
  // wings (folded away until the display)
  const wings = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.02, 0.08, s * 0.08);
    const w = K.mesh(K.paint(new THREE.BoxGeometry(0.2, 0.025, 0.3), '#202628'), mat);
    w.position.z = s * 0.15;
    const tip = K.mesh(K.paint(new THREE.BoxGeometry(0.14, 0.026, 0.1), '#e0e0da'), mat);
    tip.position.set(-0.02, 0, s * 0.27);
    pivot.add(w, tip);
    pivot.scale.setScalar(0.001);
    body.add(pivot);
    wings.push({ pivot, s });
  }
  return { group: g, body, head, wings };
}

// ---------------------------------------------------------------- effects

const GLSL_NOISE = /* glsl */`
float cHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(cHash(i), cHash(i + vec2(1.0, 0.0)), f.x), mix(cHash(i + vec2(0.0, 1.0)), cHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

/** Pixel flame: a camera-facing (around y) quad with three animated tongues in hot HDR colours. */
export function flame({ width = 0.62, height = 0.8, seed = 0 } = {}) {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.translate(0, 0.5, 0);
  const mat = fxMaterial({
    vertexShader: /* glsl */`
      uniform vec3 uOrigin;
      uniform float uW;
      uniform float uH;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 right = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]) + vec3(1e-5));
        vec3 p = uOrigin + right * position.x * uW + vec3(0.0, position.y * uH, 0.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: GLSL_NOISE + /* glsl */`
      uniform float uTime;
      uniform float uBright;
      uniform float uSeed;
      varying vec2 vUv;
      void main() {
        float x = vUv.x * 2.0 - 1.0, y = vUv.y;
        float t = uTime + uSeed;
        float turb = cNoise(vec2(x * 2.3, y * 2.8 - t * 2.5)) * 0.62 + cNoise(vec2(x * 5.0 + 5.0, y * 5.5 - t * 3.9)) * 0.38 - 0.5;
        float f = -1.0;
        for (int k = 0; k < 3; k++) {
          float fk = float(k);
          float cx = (fk - 1.0) * 0.4 + sin(t * (1.3 + fk * 0.45) + fk * 2.0) * 0.08 * y;
          float hk = k == 1 ? 1.0 : 0.6 + 0.14 * sin(t * 2.3 + fk * 3.1);
          float yy = y / hk;
          float w = (1.0 - yy) * (k == 1 ? 0.64 : 0.5) * smoothstep(-0.1, 0.22, yy);
          f = max(f, w - abs(x - cx + turb * 0.5 * yy) + turb * 0.16);
        }
        if (f < 0.015) discard;
        vec3 c = f > 0.32 ? vec3(1.0, 0.74, 0.3) * 4.6 : f > 0.13 ? vec3(1.0, 0.42, 0.07) * 3.6 : vec3(0.9, 0.17, 0.03) * 2.9;
        gl_FragColor = vec4(c * uBright, 1.0);
        gNormal = vec4(0.0);
      }`,
    uniforms: { uTime: shared.uTime, uOrigin: { value: new V3() }, uW: { value: width }, uH: { value: height }, uBright: { value: 1 }, uSeed: { value: seed } },
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  return m;
}

/** Sparks: a steady trickle plus a burst when the fire is stoked (uBurst = time of the stoke). */
export function sparks(origin, { count = 110, burst = 340 } = {}) {
  const total = count + burst;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(total * 3), 3));
  const seed = new Float32Array(total * 4);
  const kind = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    kind[i] = i < count ? 0 : 1;
  }
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  g.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
  const mat = fxMaterial({
    vertexShader: /* glsl */`
      uniform float uTime;
      uniform vec3 uWind;
      uniform float uWindStrength;
      uniform vec3 uOrigin;
      uniform float uRate;
      uniform float uBurst;
      uniform float uLift;
      attribute vec4 aSeed;
      attribute float aKind;
      varying float vA;
      varying float vHot;
      void main() {
        vec3 p = uOrigin;
        float a = 0.0;
        float age = 0.0;
        if (aKind < 0.5) {
          float life = 1.1 + aSeed.y * 1.5;
          float t = fract(uTime / life + aSeed.x);
          age = t;
          float rise = t * life * (0.5 + aSeed.z * 0.55) * uLift;
          p.y += rise;
          p.x += sin(uTime * 3.1 + aSeed.x * 40.0) * 0.07 * t + (aSeed.z - 0.5) * 0.25 * t;
          p.z += cos(uTime * 2.7 + aSeed.y * 30.0) * 0.07 * t + (aSeed.w - 0.5) * 0.25 * t;
          p.xz += uWind.xz * (0.15 + uWindStrength * 0.8) * rise * 0.45;
          a = step(aSeed.w, uRate) * (1.0 - t);
        } else {
          float delay = aSeed.x * aSeed.x * 0.9;
          float life = 1.6 + aSeed.y * 2.6;
          float tau = uTime - uBurst - delay;
          float t = tau / life;
          age = t;
          float v = 1.8 + aSeed.z * 2.8;
          float ang = aSeed.w * 6.2832;
          float spread = 0.4 + aSeed.y * 0.85;
          p.y += v * tau - 0.32 * tau * tau;
          p.x += cos(ang + tau * 1.7) * spread * tau * 0.55;
          p.z += sin(ang + tau * 1.7) * spread * tau * 0.55;
          p.xz += uWind.xz * (0.2 + uWindStrength) * tau * 0.5;
          a = step(0.0, tau) * step(t, 1.0) * (1.0 - t);
        }
        float tw = 0.55 + 0.45 * sin(uTime * 23.0 + aSeed.w * 60.0);
        vA = a * tw;
        vHot = 1.0 - age;
        gl_PointSize = (aKind > 0.5 && age < 0.22 && aSeed.z > 0.6) ? 2.0 : 1.0;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying float vA;
      varying float vHot;
      void main() {
        if (vA < 0.12) discard;
        vec3 c = mix(vec3(1.0, 0.32, 0.08), vec3(1.0, 0.8, 0.35), vHot);
        gl_FragColor = vec4(c * 5.5 * vA, 1.0);
        gNormal = vec4(0.0);
      }`,
    uniforms: { uTime: shared.uTime, uWind: shared.uWind, uWindStrength: shared.uWindStrength, uOrigin: { value: origin.clone() }, uRate: { value: 0.4 }, uBurst: { value: -100 }, uLift: { value: 1 } },
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return pts;
}

/** Glowing coals scattered on the ash bed. */
export function embers(origin, rand, { count = 26, r = 0.24 } = {}) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r;
    pos.set([origin.x + Math.cos(a) * d, origin.y + 0.05 + rand() * 0.03, origin.z + Math.sin(a) * d], i * 3);
    seed[i] = rand();
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = fxMaterial({
    vertexShader: /* glsl */`
      uniform float uTime;
      uniform float uHeat;
      attribute float aSeed;
      varying float vA;
      void main() {
        vA = uHeat * (0.45 + 0.55 * sin(uTime * (1.5 + aSeed * 3.0) + aSeed * 40.0));
        gl_PointSize = aSeed > 0.7 ? 2.0 : 1.0;
        gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying float vA;
      void main() {
        if (vA < 0.1) discard;
        gl_FragColor = vec4(mix(vec3(0.9, 0.2, 0.04), vec3(1.0, 0.62, 0.2), vA) * 3.6 * vA, 1.0);
        gNormal = vec4(0.0);
      }`,
    uniforms: { uTime: shared.uTime, uHeat: { value: 1 } },
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return pts;
}

/** Campfire smoke: puffs that lean downwind, lit orange from below at night. */
export function fireSmoke(origin, { count = 40 } = {}) {
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
      uniform float uRise;
      attribute vec2 aSeed;
      varying float vA;
      varying float vT;
      void main() {
        float t = fract(uTime / 5.0 + aSeed.x);
        vec3 p = uOrigin;
        p.y += t * uRise;
        p.xz += uWind.xz * (0.35 + uWindStrength * 1.2) * t * t * 2.4;
        p.x += sin(t * 5.0 + aSeed.y * 20.0) * 0.24 * t + (aSeed.y - 0.5) * 0.3 * t;
        p.z += cos(t * 4.0 + aSeed.y * 13.0) * 0.24 * t + (fract(aSeed.y * 7.3) - 0.5) * 0.3 * t;
        vA = (1.0 - t) * smoothstep(0.0, 0.1, t);
        vT = t;
        gl_PointSize = t < 0.25 ? 1.0 : (t < 0.6 ? 2.0 : 3.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      uniform vec3 uGlow;
      uniform float uOn;
      varying float vA;
      varying float vT;
      void main() {
        float a = vA * uOn;
        if (a < 0.06) discard;
        vec3 c = uColor + uGlow * (1.0 - smoothstep(0.0, 0.45, vT));
        gl_FragColor = vec4(c, a * 0.5);
        gNormal = vec4(0.0);
      }`,
    uniforms: { uTime: shared.uTime, uWind: shared.uWind, uWindStrength: shared.uWindStrength, uOrigin: { value: origin.clone() }, uRise: { value: 2.4 }, uColor: { value: new THREE.Color('#bfc0c4') }, uGlow: { value: new THREE.Color(0, 0, 0) }, uOn: { value: 1 } },
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return pts;
}

/**
 * Lake sparkle: a pixel moon path (short horizontal dashes in a column under the moon, in screen space so it
 * follows the camera) and faint reflected stars. A plane just above the water, kept out of the mirror pass.
 */
export function lakeSparkle({ size = 16, y = 0.04 } = {}) {
  const geo = new THREE.PlaneGeometry(size, size);
  geo.rotateX(-Math.PI / 2);
  const mat = fxMaterial({
    vertexShader: /* glsl */`
      varying vec4 vClip;
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vClip = projectionMatrix * viewMatrix * w;
        gl_Position = vClip;
      }`,
    fragmentShader: GLSL_NOISE + /* glsl */`
      uniform float uTime;
      uniform float uMoon;
      uniform float uStars;
      uniform float uAurora;
      uniform vec2 uMoonPos;
      varying vec4 vClip;
      varying vec3 vW;
      // same hash and noise as the engine sky, so the reflected rays line up with the curtains above
      float eH(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float eN(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(eH(i), eH(i + vec2(1.0, 0.0)), f.x), mix(eH(i + vec2(0.0, 1.0)), eH(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        vec2 s = vClip.xy / vClip.w * 0.5 + 0.5;
        float dy = uMoonPos.y - s.y;
        float width = 0.006 + 0.05 * clamp(dy, 0.0, 1.0);
        float path = (1.0 - smoothstep(width * 0.2, width, abs(s.x - uMoonPos.x))) * step(0.05, dy);
        vec2 cell = floor(gl_FragCoord.xy / vec2(3.0, 1.0));
        float h = cHash(cell + floor(uTime * 2.2 + cHash(cell * 0.7) * 5.0) * 0.37);
        float glit = step(0.88 - path * 0.05, h) * step(0.1, path) * uMoon * (0.55 + 0.45 * fract(h * 13.7));
        vec2 sc = floor(vW.xz * 14.0);
        float sh = cHash(sc + 3.7);
        float star = step(0.9965, sh) * uStars * (0.45 + 0.55 * sin(uTime * (0.8 + fract(sh * 91.0) * 2.5) + sh * 50.0));
        float a = max(glit, star * 0.5);
        vec3 c = glit > 0.0 ? vec3(0.8, 0.88, 1.0) * 2.6 : vec3(0.75, 0.82, 1.0) * 1.4;
        c *= a;
        if (uAurora > 0.01) {
          float rays = 0.45 + 0.55 * eN(vec2(s.x * 70.0 + uTime * 0.9, uTime * 0.2));
          float curtain = rays * (0.6 + 0.4 * sin(s.x * 9.0 - uTime * 0.4));
          float rip = cNoise(vec2(s.x * 55.0, gl_FragCoord.y * 0.55 - uTime * 1.3));
          float streak = smoothstep(0.62, 1.0, curtain * (0.7 + 0.5 * rip)) * step(0.45, rip);
          vec3 ac = mix(vec3(0.12, 1.0, 0.5), vec3(0.55, 0.22, 0.95), smoothstep(0.7, 0.95, rip) * 0.6);
          c += ac * streak * uAurora * 0.32 * smoothstep(0.08, 0.45, s.y);
        }
        if (max(c.r, max(c.g, c.b)) < 0.03) discard;
        gl_FragColor = vec4(c, 1.0);
        gNormal = vec4(0.0);
      }`,
    uniforms: { uTime: shared.uTime, uMoon: { value: 0 }, uStars: { value: 0 }, uAurora: { value: 0 }, uMoonPos: { value: new THREE.Vector2(0.8, 0.8) } },
    blending: THREE.AdditiveBlending,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.y = y;
  m.renderOrder = 2;
  m.frustumCulled = false;
  m.layers.set(1);
  return m;
}

/** Low mist sheets over the water: drifting noise, faded at the block edges. */
export function mist({ size = 16, layers = [0.07, 0.2, 0.36] } = {}) {
  const group = new THREE.Group();
  const mats = [];
  layers.forEach((y, i) => {
    const geo = new THREE.PlaneGeometry(size, size, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = fxMaterial({
      vertexShader: /* glsl */`
        varying vec3 vW;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: GLSL_NOISE + /* glsl */`
        uniform float uTime;
        uniform float uAmount;
        uniform float uLayer;
        uniform float uHalf;
        uniform vec3 uColor;
        uniform vec3 uWind;
        varying vec3 vW;
        void main() {
          vec2 dir = normalize(uWind.xz + 1e-4);
          vec2 p = vec2(dot(vW.xz, dir), dot(vW.xz, vec2(-dir.y, dir.x)));
          vec2 q = p * vec2(0.3, 1.1) - vec2(uTime * (0.07 + uLayer * 0.035), 0.0) + uLayer * 7.3;
          float n = cNoise(q) * 0.65 + cNoise(q * 2.7 + 4.1) * 0.35;
          float edge = smoothstep(uHalf, uHalf - 1.4, max(abs(vW.x), abs(vW.z)));
          float breakup = smoothstep(0.3, 0.62, cNoise(p * 0.42 + uLayer * 3.1 + vec2(uTime * 0.025, 0.0)));
          float a = smoothstep(0.62 - uAmount * 0.14, 0.86, n) * breakup * uAmount * edge * (1.0 - uLayer * 0.3);
          if (a < 0.04) discard;
          gl_FragColor = vec4(uColor, min(a, 0.55));
          gNormal = vec4(0.0);
        }`,
      uniforms: { uTime: shared.uTime, uWind: shared.uWind, uAmount: { value: 0 }, uLayer: { value: i }, uHalf: { value: size / 2 }, uColor: { value: new THREE.Color(1, 1, 1) } },
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    m.renderOrder = 3 + i;
    m.frustumCulled = false;
    m.layers.set(1);
    mats.push(mat);
    group.add(m);
  });
  return {
    group,
    set(amount, color) {
      group.visible = amount > 0.01;
      for (const m of mats) {
        m.uniforms.uAmount.value = amount;
        m.uniforms.uColor.value.copy(color);
      }
    },
  };
}

/** Expanding ripple rings on the water (loon dives, fish rising). A small pool; ring(x, z, size). */
export function ripples(count = 6) {
  const group = new THREE.Group();
  const items = [];
  for (let i = 0; i < count; i++) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = fxMaterial({
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform float uT;
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          float d = length(vUv - 0.5) * 2.0;
          float r1 = abs(d - uT);
          float r2 = abs(d - uT * 0.62);
          float ring = max(1.0 - step(0.075, r1), (1.0 - step(0.075, r2)) * step(0.15, uT));
          float a = ring * (1.0 - uT) * step(uT, 0.999);
          if (a < 0.05) discard;
          gl_FragColor = vec4(uColor, a * 0.9);
          gNormal = vec4(0.0);
        }`,
      uniforms: { uT: { value: 1 }, uColor: { value: new THREE.Color('#dfeceb') } },
    });
    const m = new THREE.Mesh(geo, mat);
    m.visible = false;
    m.layers.set(1);
    m.renderOrder = 2;
    group.add(m);
    items.push({ m, mat, t0: -100, dur: 2, size: 1 });
  }
  let next = 0;
  return {
    group,
    ring(x, z, t, size = 1.1, dur = 2.2) {
      const it = items[next++ % items.length];
      it.m.position.set(x, 0.035, z);
      it.m.scale.setScalar(size);
      Object.assign(it, { t0: t, dur, size });
    },
    update(t, light) {
      for (const it of items) {
        const k = (t - it.t0) / it.dur;
        it.m.visible = k >= 0 && k < 1;
        it.mat.uniforms.uT.value = Math.min(Math.max(k, 0), 1);
        it.mat.uniforms.uColor.value.copy(light);
      }
    },
  };
}

/** Little water splash: droplets thrown up and falling back (loon dives and wing flaps). */
export function splash(count = 36) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const seed = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const mat = fxMaterial({
    vertexShader: /* glsl */`
      uniform float uTime;
      uniform float uStart;
      uniform float uPower;
      uniform vec3 uOrigin;
      attribute vec4 aSeed;
      varying float vA;
      void main() {
        float tau = uTime - uStart - aSeed.x * 0.5 * uPower;
        float ang = aSeed.y * 6.2832;
        float sp = (0.25 + aSeed.z * 0.5) * uPower;
        vec3 p = uOrigin + vec3(cos(ang) * sp * tau, (0.9 + aSeed.w * 1.1) * uPower * tau - 2.6 * tau * tau, sin(ang) * sp * tau);
        vA = step(0.0, tau) * step(0.0, p.y) * step(tau, 1.2);
        gl_PointSize = 1.0;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      varying float vA;
      void main() {
        if (vA < 0.5) discard;
        gl_FragColor = vec4(uColor, 1.0);
        gNormal = vec4(0.0);
      }`,
    uniforms: { uTime: shared.uTime, uStart: { value: -100 }, uPower: { value: 1 }, uOrigin: { value: new V3() }, uColor: { value: new THREE.Color('#e8f2f2') } },
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return {
    points: pts,
    fire(pos, t, power = 1) {
      mat.uniforms.uOrigin.value.copy(pos);
      mat.uniforms.uStart.value = t;
      mat.uniforms.uPower.value = power;
    },
    color: mat.uniforms.uColor.value,
  };
}

/** Lily pads (instanced discs) with a few white flowers. place(rand) returns [x, z] or null. */
export function lilyPads(rand, count, place, y = 0.045) {
  const geo = new THREE.CylinderGeometry(0.13, 0.13, 0.025, 7);
  const m = new THREE.InstancedMesh(geo, toon('#ffffff', { noise: 0.1, noiseScale: 9, snow: 0.6, wet: 0.2 }), count);
  m.castShadow = false;
  m.receiveShadow = true;
  const flowers = [];
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const cols = ['#4f8d3c', '#5f9c45', '#6ba64c', '#3f7b36', '#7aa84e'];
  let n = 0;
  for (let tries = 0; tries < count * 6 && n < count; tries++) {
    const p = place(rand);
    if (!p) continue;
    dummy.position.set(p[0], y, p[1]);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.scale.set(0.75 + rand() * 0.7, 1, 0.75 + rand() * 0.7);
    dummy.updateMatrix();
    m.setMatrixAt(n, dummy.matrix);
    m.setColorAt(n, color.set(cols[Math.floor(rand() * cols.length)]));
    if (rand() < 0.16) flowers.push([p[0], p[1]]);
    n++;
  }
  m.count = n;
  const parts = [];
  for (const [x, z] of flowers) {
    const b = new THREE.BoxGeometry(0.1, 0.06, 0.1);
    b.translate(x, y + 0.04, z);
    parts.push(K.paint(b, '#f4f1ea'));
    const c = new THREE.BoxGeometry(0.05, 0.03, 0.05);
    c.translate(x, y + 0.08, z);
    parts.push(K.paint(c, '#f2c94c'));
  }
  const fl = parts.length ? K.mesh(K.merge(parts), toon('#ffffff', { vertexColors: true, noise: 0, snow: 0.5 }), { cast: false }) : null;
  return { pads: m, flowers: fl };
}

/** Green-gold fireflies drifting low over the shore and the bay; blink and glow (cool counterpoint to the fire). */
export function shoreFireflies(points) {
  const n = points.length;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), seed = new Float32Array(n * 4);
  points.forEach((p, i) => {
    pos.set(p, i * 3);
    seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
  });
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const mat = fxMaterial({
    vertexShader: /* glsl */`
      uniform float uTime;
      uniform float uAmount;
      attribute vec4 aSeed;
      varying float vA;
      void main() {
        vec3 p = position;
        float t = uTime * (0.25 + aSeed.z * 0.2) + aSeed.x * 40.0;
        p.x += sin(t) * 0.45 + sin(t * 2.3 + aSeed.y * 9.0) * 0.12;
        p.z += cos(t * 0.8 + aSeed.w * 7.0) * 0.45;
        p.y += sin(t * 1.4 + aSeed.y * 20.0) * 0.18;
        float cyc = fract(uTime * (0.18 + aSeed.w * 0.22) + aSeed.y);
        float blink = smoothstep(0.0, 0.08, cyc) * (1.0 - smoothstep(0.16, 0.42, cyc));
        vA = blink * uAmount;
        gl_PointSize = 1.0;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying float vA;
      void main() {
        if (vA < 0.05) discard;
        gl_FragColor = vec4(vec3(0.55, 1.0, 0.42) * 6.0 * vA, 1.0);
        gNormal = vec4(0.0);
      }`,
    uniforms: { uTime: shared.uTime, uAmount: { value: 0 } },
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return pts;
}
