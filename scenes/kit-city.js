import * as THREE from 'three';
import { toon, setGlow } from '../engine/materials.js';
import { mesh, paint, merge, glass } from './kit.js';

/**
 * Low-rise building with a procedural window grid that lights up window by window at dusk.
 * Footprint centred on the origin, base at y = 0.
 * opts: w, d, h, color, trim, floorH, shop ({ faces: ['+x', '+z'], height, glow, awning }), lit, roofProps
 * Returns { group, lights: [Vector3 local], signs: [{ pos: Vector3, face }] }.
 */
export function building({ w = 2, d = 2, h = 3, color = '#9b4f3c', trim = '#e8dcc8', floorH = 0.78, winW = 0.46, shop = null, lit = 0.7, roofProps = true, rand = Math.random, glassTint = '#283048' } = {}) {
  const g = new THREE.Group();
  const shopH = shop ? shop.height ?? 0.85 : 0;
  const wall = toon(color, {
    noise: 0.2, noiseScale: 5,
    windows: { size: [winW, floorH], frac: [0.52, 0.56], base: shopH + 0.12, top: h - 0.2, lit, glass: glassTint },
  });
  const body = mesh(new THREE.BoxGeometry(w, h, d), wall);
  body.position.y = h / 2;
  g.add(body);
  const trimM = toon(trim, { noise: 0.08 });
  const cornice = mesh(new THREE.BoxGeometry(w + 0.1, 0.12, d + 0.1), trimM);
  cornice.position.y = h + 0.02;
  const parapet = mesh(new THREE.BoxGeometry(w + 0.04, 0.16, d + 0.04), toon(color, { noise: 0.2 }));
  parapet.position.y = h + 0.14;
  const roofTop = mesh(new THREE.BoxGeometry(w - 0.06, 0.02, d - 0.06), toon('#4a4d57', { noise: 0.25, noiseScale: 6 }));
  roofTop.position.y = h + 0.2;
  g.add(cornice, parapet, roofTop);
  if (roofProps) {
    const ac = mesh(new THREE.BoxGeometry(0.4, 0.26, 0.3), toon('#b9bcc4', { noise: 0.1 }));
    ac.position.set((rand() - 0.5) * (w - 0.8), h + 0.34, (rand() - 0.5) * (d - 0.8));
    const vent = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 6), toon('#8d9099'));
    vent.position.set((rand() - 0.5) * (w - 0.6), h + 0.36, (rand() - 0.5) * (d - 0.6));
    g.add(ac, vent);
  }
  const lights = [];
  const signs = [];
  if (shop) {
    const glassM = glass(shop.glow || '#ffcf8a', shop.power ?? 4, '#323a52');
    const awningC = shop.awning || '#2f6e5b';
    for (const face of shop.faces || ['+x']) {
      const alongX = face === '+z' || face === '-z';
      const sgn = face[0] === '+' ? 1 : -1;
      const len = (alongX ? w : d) - 0.4;
      const win = mesh(new THREE.BoxGeometry(alongX ? len : 0.06, shopH - 0.22, alongX ? 0.06 : len), glassM, { cast: false });
      const off = (alongX ? d : w) / 2 + 0.01;
      if (alongX) win.position.set(0, (shopH - 0.22) / 2 + 0.08, sgn * off);
      else win.position.set(sgn * off, (shopH - 0.22) / 2 + 0.08, 0);
      g.add(win);
      // awning: a sloped striped slab over the window
      const aw = new THREE.BoxGeometry(alongX ? len + 0.1 : 0.42, 0.05, alongX ? 0.42 : len + 0.1, alongX ? 8 : 1, 1, alongX ? 1 : 8).toNonIndexed();
      const pos = aw.attributes.position;
      const cols = new Float32Array(pos.count * 3);
      const ca = new THREE.Color(awningC), cb = new THREE.Color('#efe7d6');
      for (let i = 0; i < pos.count; i += 3) {
        const c = (alongX ? pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2) : pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
        const stripe = Math.floor((c + 10) / 0.16) % 2 ? ca : cb;
        for (let k = 0; k < 3; k++) cols.set([stripe.r, stripe.g, stripe.b], (i + k) * 3);
      }
      aw.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      aw.computeVertexNormals();
      const awning = mesh(aw, toon('#ffffff', { vertexColors: true, noise: 0.06 }));
      const out = off + 0.2;
      if (alongX) {
        awning.position.set(0, shopH + 0.02, sgn * out);
        awning.rotation.x = sgn * 0.42;
      } else {
        awning.position.set(sgn * out, shopH + 0.02, 0);
        awning.rotation.z = -sgn * 0.42;
      }
      g.add(awning);
      const lp = alongX ? new THREE.Vector3(0, shopH * 0.55, sgn * (off + 0.5)) : new THREE.Vector3(sgn * (off + 0.5), shopH * 0.55, 0);
      lights.push(lp);
      signs.push({ pos: alongX ? new THREE.Vector3(0, shopH + 0.3, sgn * (off + 0.02)) : new THREE.Vector3(sgn * (off + 0.02), shopH + 0.3, 0), face });
    }
  }
  // place(x, y, z): position the building and line its window grid up with the facades
  const u = wall.userData.nx.uniforms;
  const base0 = u.uWinBase.value, top0 = u.uWinTop.value;
  const place = (x, y, z) => {
    g.position.set(x, y, z);
    u.uWinBase.value = base0 + y;
    u.uWinTop.value = top0 + y;
    const nx = Math.max(1, Math.round(w / winW)), nz = Math.max(1, Math.round(d / winW));
    u.uWinSize.value.x = Math.min(w / nx, d / nz);
    u.uWinOffset.value.set(x - w / 2 + (w - nx * u.uWinSize.value.x) / 2, z - d / 2 + (d - nz * u.uWinSize.value.x) / 2);
    return g;
  };
  return { group: g, lights, signs, wall, place };
}

/** Small car facing +x. kind: 'sedan' | 'taxi' | 'van'. Head and tail lights come on with the lamps. */
export function car({ color = '#3f6fb0', kind = 'sedan' } = {}) {
  const g = new THREE.Group();
  const L = kind === 'van' ? 1.0 : 0.92, W = 0.42;
  const bodyH = kind === 'van' ? 0.36 : 0.2;
  const paintM = toon(color, { noise: 0.05 });
  const body = mesh(new THREE.BoxGeometry(L, bodyH, W), paintM);
  body.position.y = 0.11 + bodyH / 2;
  g.add(body);
  if (kind !== 'van') {
    const cab = mesh(new THREE.BoxGeometry(L * 0.52, 0.15, W * 0.9), paintM);
    cab.position.set(-0.04, 0.11 + bodyH + 0.075, 0);
    const win = mesh(new THREE.BoxGeometry(L * 0.5, 0.11, W * 0.92), toon('#2b3346', { noise: 0 }));
    win.position.copy(cab.position);
    win.position.y -= 0.005;
    g.add(cab, win);
  } else {
    const win = mesh(new THREE.BoxGeometry(0.06, 0.12, W * 0.92), toon('#2b3346', { noise: 0 }));
    win.position.set(L / 2 - 0.02, 0.38, 0);
    g.add(win);
  }
  if (kind === 'taxi') {
    const sign = mesh(new THREE.BoxGeometry(0.14, 0.06, 0.1), glass('#ffe08a', 3, '#e2c35a'), { cast: false });
    sign.position.set(-0.04, 0.11 + bodyH + 0.18, 0);
    g.add(sign);
  }
  const wheel = new THREE.CylinderGeometry(0.085, 0.085, 0.07, 8);
  wheel.rotateX(Math.PI / 2);
  const wm = toon('#1b1d24', { noise: 0, snow: 0 });
  for (const [x, z] of [[L * 0.32, W / 2], [L * 0.32, -W / 2], [-L * 0.32, W / 2], [-L * 0.32, -W / 2]]) {
    const wh = mesh(wheel, wm);
    wh.position.set(x, 0.085, z);
    g.add(wh);
  }
  const head = glass('#fff2c8', 6, '#d8d8cf');
  const tail = glass('#ff3b30', 4, '#8a2a26');
  for (const s of [1, -1]) {
    const hl = mesh(new THREE.BoxGeometry(0.04, 0.07, 0.1), head, { cast: false });
    hl.position.set(L / 2 + 0.01, 0.2, s * 0.13);
    const tl = mesh(new THREE.BoxGeometry(0.04, 0.07, 0.1), tail, { cast: false });
    tl.position.set(-L / 2 - 0.01, 0.2, s * 0.13);
    g.add(hl, tl);
  }
  return g;
}

/**
 * Neon tube along a path of [x, y, z] points (local space). Lit with the lamps; flicker with neonFlicker().
 * Returns { mesh, material }.
 */
export function neon(points, { color = '#ff3d8b', radius = 0.028, power = 7, closed = false, always = false } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed, 'catmullrom', 0.05);
  const geo = new THREE.TubeGeometry(curve, Math.max(8, points.length * 6), radius, 5, closed);
  const material = toon('#2a2230', { emissive: color, emissiveIntensity: power, lamp: !always, noise: 0, snow: 0, wet: 0 });
  const m = mesh(geo, material, { cast: false, receive: false });
  return { mesh: m, material };
}

/** Classic neon misbehaviour: mostly steady, the odd stutter. Call each frame. */
export function neonFlicker(material, t, seed = 0, amount = 1) {
  const k = Math.sin(t * 0.7 + seed * 13.1) * Math.sin(t * 1.9 + seed * 7.3);
  let v = 1;
  if (k > 0.93 - 0.05 * amount) v = Math.sin(t * 60 + seed) > 0 ? 1 : 0.15;
  setGlow(material, v);
  return v;
}

/** Traffic signal on a pole, head facing +x. update(t) cycles green, amber, red. */
export function trafficLight({ h = 1.5, period = 12, phase = 0 } = {}) {
  const g = new THREE.Group();
  const dark = toon('#2b2f3a', { noise: 0.05 });
  const pole = mesh(new THREE.CylinderGeometry(0.035, 0.045, h, 6), dark);
  pole.position.y = h / 2;
  const head = mesh(new THREE.BoxGeometry(0.12, 0.38, 0.14), toon('#2a2d33', { noise: 0.05 }));
  head.position.set(0.04, h + 0.12, 0);
  g.add(pole, head);
  const colors = ['#ff3b30', '#ffb21f', '#36e07a'];
  const mats = colors.map((c) => toon('#1a1c22', { emissive: c, emissiveIntensity: 5, noise: 0, snow: 0 }));
  mats.forEach((m, i) => {
    const lens = mesh(new THREE.BoxGeometry(0.03, 0.08, 0.08), m, { cast: false });
    lens.position.set(0.115, h + 0.24 - i * 0.12, 0);
    g.add(lens);
  });
  return {
    group: g,
    update(t) {
      const c = (((t + phase) % period) + period) % period / period;
      const state = c < 0.45 ? 2 : c < 0.55 ? 1 : 0;
      mats.forEach((m, i) => setGlow(m, i === state ? 1 : 0.06));
      return state;
    },
  };
}

export function hydrant(color = '#d8382f') {
  const parts = [];
  const b = new THREE.CylinderGeometry(0.06, 0.07, 0.22, 8);
  b.translate(0, 0.11, 0);
  const c = new THREE.SphereGeometry(0.065, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  c.translate(0, 0.22, 0);
  const n = new THREE.CylinderGeometry(0.025, 0.025, 0.18, 6);
  n.rotateZ(Math.PI / 2);
  n.translate(0, 0.14, 0);
  parts.push(paint(b, color), paint(c, color), paint(n, color));
  return mesh(merge(parts), toon('#ffffff', { vertexColors: true, noise: 0.05 }));
}

export function bench(color = '#7a5a3c') {
  const parts = [];
  const seat = new THREE.BoxGeometry(0.6, 0.04, 0.18);
  seat.translate(0, 0.2, 0);
  const back = new THREE.BoxGeometry(0.6, 0.16, 0.035);
  back.translate(0, 0.32, -0.08);
  parts.push(paint(seat, color), paint(back, color));
  for (const x of [-0.24, 0.24]) {
    const leg = new THREE.BoxGeometry(0.04, 0.2, 0.16);
    leg.translate(x, 0.1, 0);
    parts.push(paint(leg, '#2b2f3a'));
  }
  return mesh(merge(parts), toon('#ffffff', { vertexColors: true, noise: 0.1 }));
}

export function bin(color = '#2f6e5b') {
  const g = new THREE.CylinderGeometry(0.09, 0.08, 0.28, 8);
  g.translate(0, 0.14, 0);
  return mesh(paint(g, color), toon('#ffffff', { vertexColors: true, noise: 0.08 }));
}
