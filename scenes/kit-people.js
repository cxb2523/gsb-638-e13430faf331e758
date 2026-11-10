import * as THREE from 'three';
import { toon } from '../engine/materials.js';
import { mesh } from './kit.js';

const SKIN = ['#f1c7a3', '#e0ac85', '#b97c55', '#7a4c33'];
const COATS = ['#c94a3d', '#2f4a7a', '#e2b33c', '#3f6e4f', '#6b4a8a', '#2a2e3a', '#d8d2c4', '#b8673a'];
const HAIR = ['#2a1e17', '#5a3a22', '#c99a52', '#141414', '#9a9a9a'];
const pick = (rand, list) => list[Math.floor(rand() * list.length)];
const MATS = new Map();

/**
 * Tiny person (~0.58 tall at scale 1), facing +x. Limbs are separate so walker() can animate them.
 * Options: coat, pants, skin, hair, umbrella (colour), hat (colour), scale, pose ('stand' | 'sit').
 */
export function person(rand = Math.random, { coat, pants = '#2b2f3a', skin, hair, umbrella = null, hat = null, scale = 1, pose = 'stand' } = {}) {
  const g = new THREE.Group();
  const mat = (c) => {
    // people share materials by colour: far fewer state changes with a crowd
    const key = String(c);
    if (!MATS.has(key)) MATS.set(key, toon(c, { noise: 0.04, snow: 0.6 }));
    return MATS.get(key);
  };
  const coatC = coat || pick(rand, COATS);
  const skinM = mat(skin || pick(rand, SKIN));
  const coatM = mat(coatC);
  const pantsM = mat(pants);

  const legGeo = new THREE.BoxGeometry(0.075, 0.23, 0.075);
  legGeo.translate(0, -0.115, 0);
  const legL = mesh(legGeo, pantsM);
  const legR = mesh(legGeo, pantsM);
  legL.position.set(0, 0.23, 0.045);
  legR.position.set(0, 0.23, -0.045);
  const body = mesh(new THREE.BoxGeometry(0.14, 0.23, 0.18), coatM);
  body.position.y = 0.34;
  const head = mesh(new THREE.BoxGeometry(0.115, 0.115, 0.115), skinM);
  head.position.y = 0.515;
  const hairM = mesh(new THREE.BoxGeometry(0.125, 0.045, 0.125), mat(hair || pick(rand, HAIR)));
  hairM.position.set(-0.01, 0.575, 0);
  const armGeo = new THREE.BoxGeometry(0.055, 0.2, 0.055);
  armGeo.translate(0, -0.095, 0);
  const armL = mesh(armGeo, coatM);
  const armR = mesh(armGeo, coatM);
  armL.position.set(0, 0.44, 0.12);
  armR.position.set(0, 0.44, -0.12);
  g.add(legL, legR, body, head, hairM, armL, armR);

  if (hat) {
    const h = mesh(new THREE.BoxGeometry(0.13, 0.07, 0.13), mat(hat));
    h.position.y = 0.6;
    g.add(h);
  }
  if (umbrella) {
    const canopy = mesh(new THREE.ConeGeometry(0.3, 0.13, 8), toon(umbrella, { noise: 0.05 }), { cast: true });
    canopy.position.set(0.02, 0.82, 0);
    const pole = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 4), toon('#2a2a2a'));
    pole.position.set(0.04, 0.6, -0.06);
    armR.rotation.z = 1.1;
    g.add(canopy, pole);
    g.userData.umbrella = true;
  }
  if (pose === 'sit') {
    legL.rotation.z = legR.rotation.z = Math.PI / 2;
    legL.position.y = legR.position.y = 0.2;
    g.position.y = -0.05;
  }
  g.scale.setScalar(scale);
  g.userData.parts = { legL, legR, armL, armR, body, head };
  return g;
}

/**
 * Moves an object along a path of [x, z] points (y from heightAt, or 0).
 * mode 'loop' closes the path, 'pingpong' walks back and forth.
 * People get leg and arm swing, everything gets turned to face where it goes.
 * dwell: [{ at: distance along path, time: seconds }] pauses (bus stops, docks).
 * Returns { update(t), state: { s, moving } }.
 */
export function walker(obj, points, { speed = 0.6, mode = 'loop', heightAt = null, offset = 0, y = 0, stride = 9, turn = true, dwell = [] } = {}) {
  const pts = points.map(([x, z]) => new THREE.Vector3(x, heightAt ? heightAt(x, z) : y, z));
  if (mode === 'loop') pts.push(pts[0].clone());
  const segs = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const len = pts[i].distanceTo(pts[i + 1]);
    segs.push({ a: pts[i], b: pts[i + 1], s0: total, len });
    total += len;
  }
  const parts = obj.userData.parts;
  const state = { s: 0, moving: true, total };
  // time spent on the path, including dwells
  const stops = [...dwell].sort((p, q) => p.at - q.at);
  const cycle = (mode === 'pingpong' ? total * 2 : total) / speed + stops.reduce((a, d) => a + d.time, 0) * (mode === 'pingpong' ? 2 : 1);
  const at = (s) => {
    let seg = segs[segs.length - 1];
    for (const sg of segs) if (s <= sg.s0 + sg.len) { seg = sg; break; }
    const k = seg.len > 0 ? (s - seg.s0) / seg.len : 0;
    return { p: seg.a.clone().lerp(seg.b, Math.min(1, Math.max(0, k))), dir: seg.b.clone().sub(seg.a) };
  };
  const distanceAt = (time) => {
    // walk the timeline: moving between stops, holding at each stop
    let tt = time, s = 0, moving = true;
    for (const d of stops) {
      const travel = (d.at - s) / speed;
      if (tt < travel) return { s: s + tt * speed, moving: true };
      tt -= travel;
      s = d.at;
      if (tt < d.time) return { s, moving: false };
      tt -= d.time;
    }
    return { s: Math.min(total, s + tt * speed), moving };
  };
  return {
    state,
    update(t) {
      const tt = ((t + offset) % cycle + cycle) % cycle;
      let s, moving, back = false;
      if (mode === 'pingpong') {
        const half = cycle / 2;
        if (tt < half) ({ s, moving } = distanceAt(tt));
        else {
          ({ s, moving } = distanceAt(tt - half));
          s = total - s;
          back = true;
        }
      } else ({ s, moving } = distanceAt(tt));
      state.s = s;
      state.moving = moving;
      const { p, dir } = at(Math.min(s, total - 1e-4));
      if (back) dir.negate();
      obj.position.copy(p);
      if (turn && dir.lengthSq() > 1e-8) obj.rotation.y = Math.atan2(-dir.z, dir.x);
      if (parts) {
        const ph = s * stride;
        const sw = moving ? Math.sin(ph) * 0.55 : 0;
        parts.legL.rotation.z = sw;
        parts.legR.rotation.z = -sw;
        if (!obj.userData.umbrella) parts.armR.rotation.z = sw * 0.8;
        parts.armL.rotation.z = -sw * 0.8;
        obj.position.y += moving ? Math.abs(Math.sin(ph)) * 0.018 : 0;
      }
    },
  };
}
