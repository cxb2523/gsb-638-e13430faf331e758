import * as THREE from 'three';
import { toon, fxMaterial, shared } from '../engine/materials.js';
import * as K from './kit.js';

// Building blocks for the Alpine scene: faceted valley terrain (the peaks are real geometry, cut by the
// block walls), the alpenglow patch for the mountain material, a log cabin, dock and Muskoka chairs,
// a rigged grizzly with fish, the waterfall, a flock of birds, clouds that cling to the peaks and the
// scene's own synthesised sounds (roar, splash, sniff, elk bugle, wings, waterfall).

const V3 = THREE.Vector3;

const GLSL_NOISE = /* glsl */`
float aHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float aNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(aHash(i), aHash(i + vec2(1.0, 0.0)), f.x), mix(aHash(i + vec2(0.0, 1.0)), aHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

const box = (w, h, d, x, y, z, c) => K.paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), c);

export function rampTexture(values) {
  const data = new Uint8Array(values.length * 4);
  values.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  const t = new THREE.DataTexture(data, values.length, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- terrain

/**
 * Faceted heightfield on a square block: every grid cell is two flat-shaded triangles (the diagonal that
 * best follows the true surface, so ridges stay sharp), plus outer walls with strata bands.
 *   top(x, y, z, nx, ny, nz, color) colours each triangle, side(x, z, y, hTop, isLip, color) the walls.
 */
export function facetTerrain({ size = 16, cells = 64, height, base = -1.6, top, side, band = 0.45, lip = 0.09, material }) {
  const n = cells, cs = size / n, half = size / 2, N1 = n + 1;
  const H = new Float32Array(N1 * N1);
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) H[i * N1 + j] = height(-half + i * cs, -half + j * cs);
  const hv = (i, j) => H[i * N1 + j];
  const diag = new Uint8Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const hc = height(-half + (i + 0.5) * cs, -half + (j + 0.5) * cs);
      const e1 = Math.abs(hc - (hv(i, j) + hv(i + 1, j + 1)) / 2);
      const e0 = Math.abs(hc - (hv(i + 1, j) + hv(i, j + 1)) / 2);
      diag[i * n + j] = e1 <= e0 ? 1 : 0;
    }
  const P = [], NN = [], C = [];
  const col = new THREE.Color();
  const e1 = new V3(), e2 = new V3(), nn = new V3();
  const tri = (a, b, c) => {
    e1.subVectors(b, a);
    e2.subVectors(c, a);
    nn.crossVectors(e1, e2).normalize();
    top((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3, nn.x, nn.y, nn.z, col);
    for (const p of [a, b, c]) {
      P.push(p.x, p.y, p.z);
      NN.push(nn.x, nn.y, nn.z);
      C.push(col.r, col.g, col.b);
    }
  };
  const p00 = new V3(), p10 = new V3(), p01 = new V3(), p11 = new V3();
  const V = (i, j, out) => out.set(-half + i * cs, hv(i, j), -half + j * cs);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      V(i, j, p00); V(i + 1, j, p10); V(i, j + 1, p01); V(i + 1, j + 1, p11);
      if (diag[i * n + j]) { tri(p00, p01, p11); tri(p00, p11, p10); }
      else { tri(p00, p01, p10); tri(p10, p01, p11); }
    }

  // outer walls: the sloped top edge follows the terrain, strata bands below a soil lip
  const clipY = (poly, y, above) => {
    const out = [];
    for (let k = 0; k < poly.length; k++) {
      const A = poly[k], B = poly[(k + 1) % poly.length];
      const ia = above ? A[1] >= y : A[1] <= y;
      const ib = above ? B[1] >= y : B[1] <= y;
      if (ia) out.push(A);
      if (ia !== ib) {
        const t = (y - A[1]) / (B[1] - A[1]);
        out.push([A[0] + (B[0] - A[0]) * t, y]);
      }
    }
    return out;
  };
  const wall = (x0, z0, x1, z1, h0, h1, nrm) => {
    const emit = (poly, yMid, isLip) => {
      if (poly.length < 3) return;
      const sm = poly.reduce((s, p) => s + p[0], 0) / poly.length;
      side(x0 + (x1 - x0) * sm, z0 + (z1 - z0) * sm, yMid, h0 + (h1 - h0) * sm, isLip, col);
      for (let k = 1; k < poly.length - 1; k++)
        for (const p of [poly[0], poly[k], poly[k + 1]]) {
          P.push(x0 + (x1 - x0) * p[0], p[1], z0 + (z1 - z0) * p[0]);
          NN.push(nrm[0], nrm[1], nrm[2]);
          C.push(col.r, col.g, col.b);
        }
    };
    const l0 = Math.max(base, h0 - lip), l1 = Math.max(base, h1 - lip);
    emit(clipY([[0, l0], [0, h0], [1, h1], [1, l1]], base, true), (h0 + h1) / 2 - lip / 2, true);
    const body = [[0, base], [0, l0], [1, l1], [1, base]];
    const topY = Math.max(l0, l1);
    for (let y = base; y < topY - 1e-4; y += band) {
      const poly = clipY(clipY(body, y, true), Math.min(y + band, topY), false);
      emit(poly, Math.min(y + band / 2, (y + topY) / 2), false);
    }
  };
  for (let k = 0; k < n; k++) {
    const a = -half + k * cs, b = a + cs;
    wall(half, a, half, b, hv(n, k), hv(n, k + 1), [1, 0, 0]);
    wall(-half, b, -half, a, hv(0, k + 1), hv(0, k), [-1, 0, 0]);
    wall(b, half, a, half, hv(k + 1, n), hv(k, n), [0, 0, 1]);
    wall(a, -half, b, -half, hv(k, 0), hv(k + 1, 0), [0, 0, -1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(NN, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  const mesh = K.mesh(g, material || toon('#ffffff', { vertexColors: true, noise: 0.16, noiseScale: 2.6 }));

  const cell = (x, z) => {
    let fx = (x + half) / cs, fz = (z + half) / cs;
    const i = Math.min(n - 1, Math.max(0, Math.floor(fx))), j = Math.min(n - 1, Math.max(0, Math.floor(fz)));
    fx = Math.min(1, Math.max(0, fx - i));
    fz = Math.min(1, Math.max(0, fz - j));
    return [i, j, fx, fz];
  };
  // exact height and slope of the drawn triangles, so nothing floats
  const plane = (x, z) => {
    const [i, j, fx, fz] = cell(x, z);
    const h00 = hv(i, j), h10 = hv(i + 1, j), h01 = hv(i, j + 1), h11 = hv(i + 1, j + 1);
    if (diag[i * n + j]) {
      if (fz >= fx) return [h00 + (h11 - h01) * fx + (h01 - h00) * fz, h11 - h01, h01 - h00];
      return [h00 + (h10 - h00) * fx + (h11 - h10) * fz, h10 - h00, h11 - h10];
    }
    if (fx + fz <= 1) return [h00 + (h10 - h00) * fx + (h01 - h00) * fz, h10 - h00, h01 - h00];
    return [h11 + (h11 - h01) * (fx - 1) + (h11 - h10) * (fz - 1), h11 - h01, h11 - h10];
  };
  const heightAt = (x, z) => plane(x, z)[0];
  const normalAt = (x, z, out = new V3()) => {
    const [, a, b] = plane(x, z);
    return out.set(-a / cs, 1, -b / cs).normalize();
  };
  let max = -Infinity;
  for (const v of H) max = Math.max(max, v);
  return { mesh, heightAt, normalAt, max, size, cells, cs };
}

/**
 * Mountain material patch on an engine toon material:
 *  - limestone strata: steep faces get horizontal bands per pixel, with snow lying on the ledges above uStrata.z
 *  - alpenglow: everything above uAlpenY.x glows with uAlpen (tinted by the surface, strongest on faces turned
 *    to the set sun). Returns the uniforms to drive.
 */
export function mountainMaterial(mat, { from = 2.2, to = 6.4, band = 0.34, strataFrom = 0.9, ledgeSnow = 3.6 } = {}) {
  const u = {
    uAlpen: { value: new THREE.Color(0, 0, 0) },
    uAlpenY: { value: new THREE.Vector2(from, to) },
    uAlpenDir: { value: new V3(0.62, 0.46, -0.64).normalize() },
    uStrata: { value: new V3(band, strataFrom, ledgeSnow) },
  };
  const base = mat.onBeforeCompile;
  mat.onBeforeCompile = function (shader, renderer) {
    base.call(this, shader, renderer);
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = shader.fragmentShader
      .replace('uniform float uGlow;', 'uniform float uGlow;\nuniform vec3 uAlpen;\nuniform vec2 uAlpenY;\nuniform vec3 uAlpenDir;\nuniform vec3 uStrata;')
      .replace('float nxWet = uWet * uWetAffect;', /* glsl */`{
    float aSteep = 1.0 - smoothstep(0.42, 0.74, vNxWorldNormal.y);
    float aBy = vNxWorld.y + (nxNoise(vNxWorld * vec3(1.1, 0.35, 1.1)) - 0.5) * 0.32;
    float aB = fract(aBy / uStrata.x);
    float aOn = aSteep * smoothstep(uStrata.y, uStrata.y + 0.5, vNxWorld.y);
    diffuseColor.rgb *= 1.0 + aOn * (step(0.68, aB) * 0.13 - step(aB, 0.2) * 0.17);
    float aLedge = aOn * step(0.74, aB) * smoothstep(uStrata.z, uStrata.z + 0.35, vNxWorld.y + (nxNoise(vNxWorld * 2.3) - 0.5) * 0.9);
    diffuseColor.rgb = mix(diffuseColor.rgb, uSnowColor * (0.9 + 0.08 * nxB), aLedge);
  }
  float nxWet = uWet * uWetAffect;`)
      .replace('totalEmissiveRadiance *= uGlow;', /* glsl */`totalEmissiveRadiance *= uGlow;
  {
    float aH = smoothstep(uAlpenY.x, uAlpenY.y, vNxWorld.y);
    float aF = 0.4 + 0.6 * max(dot(normalize(vNxWorldNormal), uAlpenDir), 0.0);
    totalEmissiveRadiance += uAlpen * diffuseColor.rgb * aH * aF;
  }`);
  };
  mat.customProgramCacheKey = () => 'nx-toon-2-alpine-rock';
  return u;
}

// ---------------------------------------------------------------- cabin, dock, chairs

function logGeo(list, axis, x, y, z, len, r, color, end) {
  const c = new THREE.CylinderGeometry(r, r, len, 6, 1).toNonIndexed();
  if (axis === 'x') c.rotateZ(Math.PI / 2);
  else c.rotateX(Math.PI / 2);
  c.translate(x, y, z);
  c.computeVertexNormals();
  const nrm = c.attributes.normal, arr = new Float32Array(nrm.count * 3);
  const cw = new THREE.Color(color), ce = new THREE.Color(end);
  for (let i = 0; i < nrm.count; i += 3) {
    const a = axis === 'x' ? Math.abs(nrm.getX(i)) : Math.abs(nrm.getZ(i));
    const cc = a > 0.9 ? ce : cw;
    for (let k = 0; k < 3; k++) arr.set([cc.r, cc.g, cc.b], (i + k) * 3);
  }
  c.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  list.push(c);
}

/**
 * Log cabin, gable end and porch facing +x, ridge along x. Notched log corners, log gables, a ribbed tin
 * roof that runs out over the porch, river-stone chimney on the back gable.
 * Returns { group, smoke, lights, lantern } (local space; merge it with K.mergeGroup).
 */
export function logCabin({ D = 1.7, W = 1.5, wallH = 0.84, pitch = 0.64, porch = 0.44, roofA = '#b4452f', roofB = '#8a3022', glow = '#ffc06a' } = {}) {
  const g = new THREE.Group();
  const wood = [], stone = [], roof = [], glassL = [];
  const R = 0.064, CO = 0.118, Y0 = 0.15;
  const LOGS = ['#a3703e', '#946238', '#9d6a3b', '#8a5b33'];
  const END = '#dcb27a';
  // foundation and a dark solid core
  stone.push(box(D + 0.12, Y0, W + 0.12, 0, Y0 / 2, 0, '#8b8985'));
  wood.push(box(D - 0.06, wallH - Y0, W - 0.06, 0, (wallH + Y0) / 2, 0, '#4a3220'));
  const courses = Math.round((wallH - Y0) / CO);
  for (let k = 0; k < courses; k++) {
    const ya = Y0 + R + k * CO, yb = ya + CO / 2;
    for (const s of [-1, 1]) {
      logGeo(wood, 'z', (s * D) / 2, ya, 0, W + 0.2, R, LOGS[(k + (s > 0 ? 0 : 2)) % 4], END);
      if (yb < wallH + 0.02) logGeo(wood, 'x', 0, yb, (s * W) / 2, D + 0.2, R, LOGS[(k + 1) % 4], END);
    }
  }
  // log gables, shortening toward the ridge
  const rise = (W / 2) * Math.tan(pitch);
  for (let y = wallH + R + 0.01, k = 0; y < wallH + rise - 0.06; y += CO, k++) {
    const len = W * (1 - (y - wallH) / rise) + 0.02;
    for (const s of [-1, 1]) logGeo(wood, 'z', (s * D) / 2, y, 0, len, R, LOGS[(k + 3) % 4], END);
  }
  // roof: ribbed tin slabs running out over the porch
  const over = 0.14, front = porch + 0.1, back = 0.12;
  const run = W / 2 + over;
  const slabLen = run / Math.cos(pitch);
  const lenX = D + front + back;
  for (const s of [-1, 1]) {
    const segs = Math.max(4, Math.round(lenX / 0.19));
    const sl = new THREE.BoxGeometry(lenX, 0.07, slabLen, segs, 1, 1).toNonIndexed();
    const pos = sl.attributes.position;
    const arr = new Float32Array(pos.count * 3);
    const ca = new THREE.Color(roofA), cb = new THREE.Color(roofB);
    for (let i = 0; i < pos.count; i += 3) {
      const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3 + lenX / 2;
      const c = Math.floor(x / (lenX / segs)) % 2 ? cb : ca;
      for (let k = 0; k < 3; k++) arr.set([c.r, c.g, c.b], (i + k) * 3);
    }
    sl.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    sl.computeVertexNormals();
    sl.rotateX(s * pitch);
    sl.translate((front - back) / 2, wallH + rise - (run / 2) * Math.tan(pitch) + 0.06, (s * run) / 2);
    roof.push(sl);
  }
  roof.push(box(lenX + 0.02, 0.07, 0.12, (front - back) / 2, wallH + rise + 0.07, 0, '#5e2a20'));
  // porch: plank deck, posts, beam, step, a little rail
  const px0 = D / 2, px1 = D / 2 + porch;
  for (let x = px0, i = 0; x < px1 - 1e-3; x += 0.1, i++) wood.push(box(0.092, 0.05, W + 0.12, x + 0.05, Y0 - 0.02, 0, ['#9a7650', '#8d6a46', '#a47f57'][i % 3]));
  const postH = wallH - Y0 + 0.02;
  for (const s of [-1, 1]) {
    wood.push(box(0.08, postH, 0.08, px1 - 0.04, Y0 + postH / 2, s * (W / 2 + 0.02), '#7c5634'));
    wood.push(box(0.06, 0.05, 0.36, px1 - 0.04, Y0 + 0.3, s * (W / 2 - 0.16), '#7c5634'));
  }
  wood.push(box(0.09, 0.08, W + 0.2, px1 - 0.04, wallH + 0.02, 0, '#6e4b2d'));
  stone.push(box(0.16, 0.08, 0.42, px1 + 0.08, 0.04, 0.18, '#94918c'));
  // door, windows with shutters, a flower box; everything sits proud of the log faces (outer surface at R)
  const TRIM = '#e3d3b0';
  const win = (x, y, z, axis, w = 0.3, h = 0.3, shutters = true) => {
    const ax = axis === 'x';
    const sg = ax ? Math.sign(x) : Math.sign(z);
    const B = (bw, bh, depth, dx, dy, c, list = wood) => {
      const off = depth / 2;
      if (ax) list.push(box(depth, bh, bw, x + sg * off, y + dy, z + dx, c));
      else list.push(box(bw, bh, depth, x + dx, y + dy, z + sg * off, c));
    };
    B(w, h, 0.03, 0, 0, '#fff', glassL);
    B(w + 0.1, 0.045, 0.06, 0, h / 2 + 0.022, TRIM);
    B(w + 0.12, 0.045, 0.07, 0, -h / 2 - 0.022, TRIM);
    B(0.045, h, 0.06, -w / 2 - 0.022, 0, TRIM);
    B(0.045, h, 0.06, w / 2 + 0.022, 0, TRIM);
    B(0.03, h, 0.05, 0, 0, TRIM);
    B(w, 0.03, 0.05, 0, 0, TRIM);
    if (shutters) for (const s of [-1, 1]) B(0.11, h + 0.04, 0.04, s * (w / 2 + 0.105), 0, '#2f5c48');
  };
  const fx = D / 2 + R;
  wood.push(box(0.05, 0.66, 0.36, fx + 0.02, Y0 + 0.33, 0.2, TRIM));
  wood.push(box(0.06, 0.6, 0.28, fx + 0.035, Y0 + 0.3, 0.2, '#5a3820'));
  wood.push(box(0.03, 0.04, 0.04, fx + 0.075, Y0 + 0.3, 0.1, '#d9b062'));
  win(fx, Y0 + 0.4, -0.33, 'x');
  wood.push(box(0.12, 0.08, 0.38, fx + 0.06, Y0 + 0.2, -0.33, '#6e4b2d'));
  for (let k = 0; k < 5; k++) wood.push(box(0.07, 0.06, 0.06, fx + 0.08, Y0 + 0.27, -0.49 + k * 0.08, k % 2 ? '#e6553f' : '#f2c14e'));
  win(fx - 0.02, wallH + rise * 0.36, 0, 'x', 0.18, 0.2, false);
  for (const s of [-1, 1]) {
    win(-0.32, Y0 + 0.4, s * (W / 2 + R), 'z', 0.3, 0.28, true);
    win(0.42, Y0 + 0.4, s * (W / 2 + R), 'z', 0.3, 0.28, true);
  }
  // lantern on the porch post by the door
  glassL.push(box(0.09, 0.12, 0.09, px1 - 0.04, Y0 + 0.58, W / 2 - 0.08, '#fff'));
  wood.push(box(0.12, 0.03, 0.12, px1 - 0.04, Y0 + 0.66, W / 2 - 0.08, '#2b2b2f'));
  // river-stone chimney on the back gable
  const cx = -D / 2 - 0.17, chTop = wallH + rise + 0.38;
  const stones = ['#8f8c88', '#a29d97', '#7d7a77', '#b1aaa1', '#938b84'];
  for (let y = 0, k = 0; y < chTop; y += 0.11, k++) {
    const w = y < wallH ? 0.36 : 0.28;
    stone.push(box(w, 0.11, w + 0.04, cx + (k % 2 ? 0.01 : -0.01), y + 0.055, (k % 3 - 1) * 0.008, stones[k % 5]));
  }
  stone.push(box(0.34, 0.06, 0.38, cx, chTop + 0.03, 0, '#6f6b68'));
  const woodM = toon('#ffffff', { vertexColors: true, noise: 0.14, noiseScale: 7 });
  const stoneM = toon('#ffffff', { vertexColors: true, noise: 0.28, noiseScale: 8 });
  const roofM = toon('#ffffff', { vertexColors: true, noise: 0.08, noiseScale: 5, snow: 1 });
  const glassM = K.glass(glow, 5.2, '#28324a');
  g.add(K.mesh(K.merge(wood), woodM), K.mesh(K.merge(stone), stoneM), K.mesh(K.merge(roof), roofM), K.mesh(K.merge(glassL), glassM, { cast: false }));
  return {
    group: g,
    smoke: new V3(cx, chTop + 0.12, 0),
    lights: [new V3(D / 2 + 0.75, 0.55, -0.2), new V3(0, 0.55, -(W / 2 + 0.6))],
    lantern: new V3(px1 + 0.12, Y0 + 0.6, W / 2 - 0.08),
    glass: glassM,
  };
}

/** Plank dock along +x from 0 to len, deck at `deck`, posts down to `bottom`. */
export function dockGeometry({ len = 2.3, width = 0.62, deck = 0.2, bottom = -0.9 } = {}) {
  const parts = [];
  const woods = ['#a28d72', '#94806a', '#ab977c', '#8b775f'];
  for (let x = 0, i = 0; x < len - 1e-3; x += 0.13, i++) parts.push(box(0.115, 0.05, width + (i % 3 === 1 ? 0.04 : 0), x + 0.065, deck, 0, woods[i % 4]));
  for (const s of [-1, 1]) parts.push(box(len, 0.06, 0.06, len / 2, deck - 0.05, s * (width / 2 - 0.05), '#6f5d49'));
  for (let x = 0.2; x <= len; x += 0.7) for (const s of [-1, 1]) {
    const p = new THREE.CylinderGeometry(0.05, 0.055, deck - bottom + 0.12, 6);
    p.translate(x, (deck + bottom) / 2 + 0.06, s * (width / 2 - 0.02));
    parts.push(K.paint(p, '#5d4c3b'));
  }
  const cleat = box(0.05, 0.06, 0.16, len - 0.12, deck + 0.05, width / 2 - 0.08, '#3b3530');
  parts.push(cleat);
  return K.merge(parts);
}

/** Muskoka (Adirondack) chair facing +x: fan back, wide flat arms. */
export function muskokaChair(color = '#c8402e') {
  const parts = [];
  const c = new THREE.Color(color), dk = '#' + c.clone().multiplyScalar(0.78).getHexString();
  const seat = new THREE.BoxGeometry(0.34, 0.03, 0.3);
  seat.rotateZ(0.16);
  seat.translate(0.02, 0.14, 0);
  parts.push(K.paint(seat, color));
  for (let k = -2; k <= 2; k++) {
    const h = 0.44 + 0.05 * (2 - Math.abs(k));
    const s = new THREE.BoxGeometry(0.025, h, 0.062);
    s.translate(0, h / 2, 0);
    s.rotateX(k * 0.09);
    s.rotateZ(0.42);
    s.translate(-0.13, 0.12, k * 0.064);
    parts.push(K.paint(s, k % 2 ? dk : color));
  }
  for (const s of [-1, 1]) {
    parts.push(K.paint(new THREE.BoxGeometry(0.4, 0.025, 0.085).translate(0.04, 0.25, s * 0.18), color));
    parts.push(K.paint(new THREE.BoxGeometry(0.045, 0.25, 0.05).translate(0.17, 0.125, s * 0.17), dk));
    parts.push(K.paint(new THREE.BoxGeometry(0.045, 0.16, 0.05).rotateZ(0.3).translate(-0.12, 0.08, s * 0.17), dk));
  }
  return K.merge(parts);
}

/** Chopping block with an axe sunk in it. */
export function choppingBlock() {
  const parts = [];
  const st = new THREE.CylinderGeometry(0.13, 0.14, 0.2, 8);
  st.translate(0, 0.1, 0);
  parts.push(K.paint(st, '#7a5536'));
  parts.push(box(0.2, 0.012, 0.2, 0, 0.205, 0, '#cfa673'));
  const handle = new THREE.BoxGeometry(0.035, 0.3, 0.035);
  handle.translate(0, 0.15, 0);
  handle.rotateZ(-0.6);
  handle.translate(0.0, 0.2, 0);
  parts.push(K.paint(handle, '#b88a52'));
  parts.push(box(0.1, 0.05, 0.02, 0.0, 0.215, 0, '#8d939c'));
  return K.merge(parts);
}

/** Short alpine grass tufts (instanced). place(rand) returns [x, y, z] or null. */
export function tufts(rand, count, place, colors, { h = 0.2 } = {}) {
  const blades = [];
  for (let k = 0; k < 3; k++) {
    const c = new THREE.ConeGeometry(0.04, h * (0.8 + k * 0.2), 3, 1);
    c.translate(0, (h * (0.8 + k * 0.2)) / 2, 0);
    c.rotateZ((k - 1) * 0.4);
    c.rotateY(k * 2.1);
    blades.push(c);
  }
  const geo = K.merge(blades);
  const m = new THREE.InstancedMesh(geo, toon('#ffffff', { wind: 1.0, noise: 0, snow: 0.6, ramp: 'foliage' }), count);
  m.castShadow = false;
  m.receiveShadow = true;
  const d = new THREE.Object3D();
  const col = new THREE.Color();
  let n = 0;
  for (let tries = 0; tries < count * 5 && n < count; tries++) {
    const p = place(rand);
    if (!p) continue;
    d.position.set(p[0], p[1], p[2]);
    d.rotation.set(0, rand() * Math.PI * 2, 0);
    d.scale.setScalar(0.7 + rand() * 0.6);
    d.updateMatrix();
    m.setMatrixAt(n, d.matrix);
    m.setColorAt(n, col.set(colors[Math.floor(rand() * colors.length)]));
    n++;
  }
  m.count = n;
  return m;
}

// ---------------------------------------------------------------- the bear

/** Little trout, nose along +x. */
export function fishGeometry(len = 0.3) {
  return K.merge([
    box(len * 0.72, 0.075, 0.05, 0, 0, 0, '#d3dbd8'),
    box(len * 0.66, 0.028, 0.052, 0, 0.028, 0, '#4b6a60'),
    box(len * 0.52, 0.02, 0.054, 0.01, -0.004, 0, '#ec8a92'),
    box(0.06, 0.1, 0.02, -len * 0.42, 0, 0, '#7d948e'),
    box(0.05, 0.055, 0.046, len * 0.38, -0.004, 0, '#bcc7c2'),
  ]);
}

/**
 * Chunky grizzly built from boxes, facing +x, about 1.0 long at scale 1: a big shoulder hump with grizzled
 * tips, dark legs, a pale dished muzzle. The hind legs hang off the root (they stay planted when it rears),
 * everything else pivots at the hip. apply(pose, t) poses it:
 *   phase/walk (gait), rear (0..1 up on hind legs), sit, crouch, pitch (head down), yaw (head turn),
 *   jaw (open), paws (raised when rearing), swipe (right paw strike), wiggle (back scratch), bob.
 */
export function bearRig({ fur = '#875430', back = '#b27c4a', tips = '#dcae72', dark = '#462a18', belly = '#5e3a22', muzzle = '#e3bb86', nose = '#140e0b' } = {}) {
  const mat = toon('#ffffff', { vertexColors: true, noise: 0.08, noiseScale: 12, snow: 0.55, wet: 0.9 });
  const eyeMat = toon('#130e0b', { emissive: '#e4ff9a', emissiveIntensity: 3.4, noise: 0, snow: 0, wet: 0, glow: 0 });
  const fishMat = toon('#ffffff', { vertexColors: true, noise: 0, snow: 0, wet: 0, emissive: '#d8f6ff', emissiveIntensity: 1, glow: 0 });
  const M = (list, m = mat) => K.mesh(K.merge(list), m);
  const root = new THREE.Group();
  const HIP = new V3(-0.25, 0.37, 0);
  const body = new THREE.Group();
  body.position.copy(HIP);
  root.add(body);
  const torso = M([
    box(0.27, 0.29, 0.31, 0.0, 0.0, 0, fur),          // rump
    box(0.19, 0.06, 0.25, 0.0, 0.17, 0, fur),         // rounded top of the rump
    box(0.3, 0.34, 0.36, 0.21, 0.02, 0, fur),         // barrel
    box(0.24, 0.38, 0.37, 0.43, 0.04, 0, fur),        // shoulders
    box(0.26, 0.1, 0.31, 0.42, 0.25, 0, back),        // hump
    box(0.16, 0.06, 0.22, 0.42, 0.32, 0, tips),       // grizzled crest of the hump
    box(0.3, 0.05, 0.27, 0.19, 0.2, 0, back),         // back line
    box(0.12, 0.31, 0.33, 0.58, 0.0, 0, fur),         // chest
    box(0.46, 0.05, 0.3, 0.27, -0.155, 0, belly),     // belly
    box(0.07, 0.07, 0.09, -0.15, 0.09, 0, dark),      // tail
  ]);
  body.add(torso);
  const neck = new THREE.Group();
  neck.position.set(0.6, 0.06, 0);
  body.add(neck);
  neck.add(M([
    box(0.13, 0.25, 0.32, 0.01, 0.0, 0, fur),         // ruff and cheeks
    box(0.2, 0.2, 0.26, 0.13, 0.01, 0, fur),          // skull
    box(0.1, 0.04, 0.24, 0.17, 0.11, 0, back),        // brow
    box(0.15, 0.105, 0.135, 0.3, -0.035, 0, muzzle),  // snout
    box(0.045, 0.055, 0.085, 0.385, -0.005, 0, nose), // nose
    box(0.07, 0.075, 0.055, 0.07, 0.14, 0.1, dark),   // ears
    box(0.07, 0.075, 0.055, 0.07, 0.14, -0.1, dark),
    box(0.03, 0.035, 0.03, 0.225, 0.05, 0.105, nose), // eyes
    box(0.03, 0.035, 0.03, 0.225, 0.05, -0.105, nose),
    box(0.12, 0.016, 0.1, 0.3, -0.09, 0, '#6a2420'),  // inside of the mouth
  ]));
  const jaw = new THREE.Group();
  jaw.position.set(0.22, -0.088, 0);
  neck.add(jaw);
  jaw.add(M([box(0.15, 0.04, 0.12, 0.075, -0.02, 0, '#b48c5e'), box(0.1, 0.012, 0.09, 0.07, 0.004, 0, '#7a2a24')]));
  const eyes = M([box(0.02, 0.025, 0.026, 0.242, 0.05, 0.111, '#fff'), box(0.02, 0.025, 0.026, 0.242, 0.05, -0.111, '#fff')], eyeMat);
  neck.add(eyes);
  const legGeo = (front) => K.merge(front
    ? [box(0.15, 0.25, 0.15, 0, -0.11, 0, fur), box(0.13, 0.09, 0.14, 0.01, -0.27, 0, dark), box(0.18, 0.06, 0.16, 0.04, -0.33, 0, dark)]
    : [box(0.2, 0.22, 0.17, -0.01, -0.09, 0, fur), box(0.13, 0.12, 0.14, 0.0, -0.26, 0, dark), box(0.19, 0.06, 0.16, 0.04, -0.34, 0, dark)]);
  const fg = legGeo(true), hg = legGeo(false);
  const leg = (geo, parent, x, y, z) => {
    const p = new THREE.Group();
    p.position.set(x, y, z);
    p.add(K.mesh(geo, mat));
    parent.add(p);
    return p;
  };
  const FL = leg(fg, body, 0.5, -0.02, 0.115), FR = leg(fg, body, 0.5, -0.02, -0.115);
  const HL = leg(hg, root, HIP.x + 0.02, HIP.y, 0.115), HR = leg(hg, root, HIP.x + 0.02, HIP.y, -0.115);
  const fish = K.mesh(fishGeometry(), fishMat);
  fish.position.set(0.32, -0.085, 0);
  fish.rotation.y = Math.PI / 2;
  fish.visible = false;
  neck.add(fish);

  const pose = { phase: 0, walk: 0, rear: 0, sit: 0, crouch: 0, pitch: 0, yaw: 0, jaw: 0, paws: 0, swipe: 0, bob: 0, wiggle: 0 };
  function apply(p, t) {
    const bodyPitch = p.rear * 1.2 + p.sit * 0.5 - p.crouch * 0.22;
    body.rotation.z = bodyPitch;
    body.rotation.x = p.wiggle * 0.12;
    const hipY = HIP.y - p.sit * 0.18 - p.crouch * 0.05 + p.bob;
    body.position.y = hipY;
    HL.position.y = HR.position.y = hipY;
    const sw = Math.sin(p.phase) * 0.55 * p.walk;
    const fold = p.sit * 1.35;
    HL.rotation.z = -sw * (1 - p.sit) + fold + p.crouch * 0.25;
    HR.rotation.z = sw * (1 - p.sit) + fold + p.crouch * 0.25;
    const standF = p.rear * 0.72 + p.paws * 0.75;
    const wave = p.paws * Math.sin(t * 7) * 0.12;
    FL.rotation.z = -bodyPitch + standF + sw + wave;
    FR.rotation.z = -bodyPitch + standF - sw - wave + p.swipe * 1.5;
    FL.rotation.x = -p.paws * 0.15;
    FR.rotation.x = p.paws * 0.15;
    neck.rotation.z = -p.pitch - bodyPitch * 0.72 + Math.sin(p.phase * 2) * 0.06 * p.walk;
    neck.rotation.y = p.yaw;
    jaw.rotation.z = -p.jaw * 0.75;
    torso.scale.y = 1 + Math.sin(t * 1.9) * 0.018 * (1 - p.walk);
  }
  apply(pose, 0);
  return { group: root, pose, apply, fish, fishMat, eyes, eyeMat, mat, neck, body };
}

// ---------------------------------------------------------------- water effects

/**
 * Waterfall: a ribbon hanging in front of the rock along a top-to-bottom polyline, with streaks pouring
 * down it and ragged edges. uLight tints it with the time of day.
 */
export function waterfall(points, { width = 0.34, face = new V3(0, 0, 1) } = {}) {
  const n = points.length;
  const lat = new V3().crossVectors(new V3(0, 1, 0), face).normalize();
  const P = [], UV = [], I = [];
  const acc = [0];
  for (let i = 1; i < n; i++) acc.push(acc[i - 1] + points[i].distanceTo(points[i - 1]));
  const total = acc[n - 1];
  for (let i = 0; i < n; i++) {
    const w = width * (0.75 + 0.6 * Math.pow(acc[i] / total, 1.5));
    for (const s of [-1, 1]) {
      const p = points[i].clone().addScaledVector(lat, (s * w) / 2);
      P.push(p.x, p.y, p.z);
      UV.push(s < 0 ? 0 : 1, acc[i] / total);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.setIndex(I);
  const mat = fxMaterial({
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: GLSL_NOISE + /* glsl */`
      uniform float uTime;
      uniform float uLen;
      uniform float uFlow;
      uniform vec3 uLight;
      varying vec2 vUv;
      void main() {
        float x = vUv.x, s = vUv.y * uLen;
        float fall = s * 1.5 - uTime * 2.7 * uFlow;
        float a = aNoise(vec2(x * 6.0, fall)) * 0.62 + aNoise(vec2(x * 13.0 + 4.0, fall * 2.2 + 1.7)) * 0.38;
        float edge = min(x, 1.0 - x) * 2.0;
        if (edge < 0.16 + 0.55 * (a - 0.5) + 0.12 * (1.0 - vUv.y)) discard;
        vec3 c = a > 0.6 ? vec3(1.0) : a > 0.42 ? vec3(0.8, 0.93, 0.96) : vec3(0.52, 0.78, 0.86);
        c = mix(c, vec3(1.0), smoothstep(0.82, 1.0, vUv.y) * 0.7);
        gl_FragColor = vec4(c * uLight, 1.0);
        gNormal = vec4(0.0);
      }`,
    uniforms: { uTime: shared.uTime, uLen: { value: total }, uFlow: { value: 1 }, uLight: { value: new THREE.Color(1, 1, 1) } },
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  m.renderOrder = 3;
  return { mesh: m, uniforms: mat.uniforms };
}

/** Continuous spray and drift at the foot of the falls. */
export function spray(origin, { count = 110, spread = 0.42, rise = 0.6 } = {}) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const seed = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const mat = fxMaterial({
    vertexShader: /* glsl */`
      uniform float uTime;
      uniform vec3 uOrigin;
      uniform float uSpread;
      uniform float uRise;
      uniform vec3 uWind;
      uniform float uWindStrength;
      attribute vec4 aSeed;
      varying float vA;
      void main() {
        float life = 0.8 + aSeed.y * 1.1;
        float t = fract(uTime / life + aSeed.x);
        float ang = aSeed.z * 6.2832;
        float sp = uSpread * (0.25 + aSeed.w * 0.9);
        vec3 p = uOrigin + vec3(cos(ang) * sp * t, uRise * (0.4 + aSeed.w) * (t * 2.2 - t * t * 1.7), sin(ang) * sp * t * 0.6);
        p.xz += uWind.xz * (0.1 + uWindStrength) * t * 0.5;
        vA = (1.0 - t) * step(-0.02, p.y - uOrigin.y);
        gl_PointSize = (aSeed.w > 0.8 && t < 0.35) ? 2.0 : 1.0;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      varying float vA;
      void main() {
        if (vA < 0.3) discard;
        gl_FragColor = vec4(uColor, 0.9);
        gNormal = vec4(0.0);
      }`,
    uniforms: { uTime: shared.uTime, uWind: shared.uWind, uWindStrength: shared.uWindStrength, uOrigin: { value: origin.clone() }, uSpread: { value: spread }, uRise: { value: rise }, uColor: { value: new THREE.Color(1, 1, 1) } },
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return { points: pts, uniforms: mat.uniforms };
}

// ---------------------------------------------------------------- birds and clouds

/**
 * A flock that bursts out of the trees and scatters (wing V's drawn as pixel lines). launch(from, dirs, t)
 * sends the birds off along the given headings (Vector3, y ignored), alternating between them.
 */
export function flock(count = 14) {
  const pos = new Float32Array(count * 4 * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = fxMaterial({
    vertexShader: 'void main() { gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uColor; void main() { gl_FragColor = vec4(uColor, 1.0); gNormal = vec4(0.0); }',
    uniforms: { uColor: { value: new THREE.Color('#262a35') } },
  });
  const lines = new THREE.LineSegments(g, mat);
  lines.frustumCulled = false;
  lines.visible = false;
  const birds = Array.from({ length: count }, () => ({ p: new V3(), v: new V3(), ph: Math.random() * 6, rate: 14 + Math.random() * 6, delay: 0, climb: 1 }));
  let t0 = -100;
  const lat = new V3(), up = new V3(0, 1, 0), dir = new V3();
  return {
    lines,
    color: mat.uniforms.uColor.value,
    launch(from, dirs, t) {
      t0 = t;
      lines.visible = true;
      birds.forEach((b, i) => {
        const d0 = dirs[i % dirs.length];
        const a = (Math.random() - 0.5) * 0.7;
        dir.set(d0.x * Math.cos(a) - d0.z * Math.sin(a), 0, d0.x * Math.sin(a) + d0.z * Math.cos(a)).normalize();
        b.p.set(from.x + (Math.random() - 0.5) * 1.0, from.y + Math.random() * 0.4, from.z + (Math.random() - 0.5) * 1.0);
        b.v.copy(dir).multiplyScalar(1.3 + Math.random() * 0.8);
        b.climb = d0.y || 1;
        b.v.y = (1.2 + Math.random() * 0.8) * b.climb;
        b.delay = i * 0.04 + Math.random() * 0.12;
      });
    },
    update(t, dt) {
      if (!lines.visible) return;
      const k = t - t0;
      if (k > 8) { lines.visible = false; return; }
      birds.forEach((b, i) => {
        const o = i * 12;
        if (k < b.delay) { pos.fill(0, o, o + 12); for (let q = 0; q < 4; q++) pos[o + q * 3 + 1] = -50; return; }
        b.v.y = Math.max(0.2 * b.climb, b.v.y - dt * 0.45);
        b.p.addScaledVector(b.v, dt);
        b.ph += dt * b.rate;
        lat.crossVectors(up, b.v).setY(0).normalize().multiplyScalar(0.16);
        const f = Math.sin(b.ph) * 0.1;
        const L = [b.p.x - lat.x, b.p.y + f, b.p.z - lat.z], R = [b.p.x + lat.x, b.p.y + f, b.p.z + lat.z];
        pos.set([...L, b.p.x, b.p.y - 0.03, b.p.z, b.p.x, b.p.y - 0.03, b.p.z, ...R], o);
      });
      g.attributes.position.needsUpdate = true;
    },
  };
}

/** A long bank of faceted puffs along x, flat-bottomed (a cloud collar for the mountainside). */
export function cloudBankGeometry(rand, n = 7, step = 0.48) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const mid = 1 - Math.abs(i - (n - 1) / 2) / ((n - 1) / 2 + 0.5);
    const r = 0.3 + mid * 0.32 + rand() * 0.16;
    const g = new THREE.IcosahedronGeometry(r, 1);
    K.jitter(g, r * 0.2, Math.floor(rand() * 1e4));
    g.scale(1.3, 0.72, 1.05);
    g.translate((i - (n - 1) / 2) * step + (rand() - 0.5) * 0.18, r * 0.28 + (rand() - 0.5) * 0.08, (rand() - 0.5) * 0.5);
    parts.push(g);
    if (rand() < 0.55) {
      const r2 = r * (0.55 + rand() * 0.25);
      const g2 = new THREE.IcosahedronGeometry(r2, 1);
      K.jitter(g2, r2 * 0.2, Math.floor(rand() * 1e4));
      g2.scale(1.2, 0.8, 1);
      g2.translate((i - (n - 1) / 2) * step + (rand() - 0.5) * 0.3, r * 0.55 + r2 * 0.3, (rand() - 0.5) * 0.4);
      parts.push(g2);
    }
  }
  const m = mergeGeos(parts);
  const p = m.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setY(i, p.getY(i) * 0.3);
  const out = m.toNonIndexed();
  out.computeVertexNormals();
  return out;
}
function mergeGeos(list) {
  const clean = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of clean) n += g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  let o = 0;
  for (const g of clean) { arr.set(g.attributes.position.array, o); o += g.attributes.position.array.length; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  return out;
}

/**
 * Cloud banks that wrap the mountainsides in bad weather (summits poke out above), and a low fog band.
 * spots: [{ x, y, z, s, ry, ph, th, kind: 'collar' | 'fog' }]; update(t, dt, { collar, fog }).
 */
export function mountainClouds(spots, rand = Math.random) {
  const geos = [cloudBankGeometry(rand, 7), cloudBankGeometry(rand, 8, 0.5), cloudBankGeometry(rand, 6, 0.46)];
  const mat = toon('#ffffff', { noise: 0.04, snow: 0, wet: 0 });
  mat.gradientMap = rampTexture([150, 176, 212, 236, 251, 255]);
  const meshes = geos.map((g, gi) => {
    const list = spots.filter((_, i) => i % 3 === gi);
    const m = new THREE.InstancedMesh(g, mat, Math.max(1, list.length));
    m.castShadow = false;
    m.receiveShadow = true;
    m.frustumCulled = false;
    m.userData.spots = list;
    m.count = list.length;
    return m;
  });
  const group = new THREE.Group();
  group.add(...meshes);
  const d = new THREE.Object3D();
  const state = new Map(spots.map((s) => [s, 0]));
  return {
    group,
    material: mat,
    update(t, dt, amounts, snap = false) {
      let any = false;
      for (const m of meshes) {
        m.userData.spots.forEach((s, i) => {
          const k0 = state.get(s), want = (amounts[s.kind] ?? 0) > s.th ? 1 : 0;
          const k = snap ? want : k0 + (want - k0) * (1 - Math.exp(-dt * 0.7));
          state.set(s, k);
          if (k > 0.02) any = true;
          const drift = Math.sin(t * 0.04 + s.ph) * 0.35;
          d.position.set(s.x + Math.cos(s.ry) * drift, s.y + Math.sin(t * 0.17 + s.ph) * 0.04, s.z - Math.sin(s.ry) * drift);
          d.rotation.set(0, s.ry, 0);
          d.scale.set(Math.max(0.001, s.s * k), Math.max(0.001, s.s * k * (0.85 + 0.15 * k)), Math.max(0.001, s.s * k));
          d.updateMatrix();
          m.setMatrixAt(i, d.matrix);
        });
        m.instanceMatrix.needsUpdate = true;
      }
      group.visible = any;
    },
  };
}

// ---------------------------------------------------------------- sound
// Everything is built on audio.ctx into audio.master and timed with audio.now(), so the offline clip export
// renders it in sync.

const live = (a) => !!(a && a.ctx && a.on);
const shaperCache = new WeakMap();
function shaper(ctx, k) {
  const s = ctx.createWaveShaper();
  let curve = shaperCache.get(ctx);
  if (!curve) {
    curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    shaperCache.set(ctx, curve);
  }
  s.curve = curve;
  return s;
}
function osc(ctx, type, t, dur, curve, dest, gain = 1, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.detune.value = detune;
  o.frequency.setValueAtTime(curve[0][0], t);
  for (const [f, at, exp] of curve.slice(1)) {
    if (exp) o.frequency.exponentialRampToValueAtTime(f, t + at);
    else o.frequency.linearRampToValueAtTime(f, t + at);
  }
  const g = ctx.createGain();
  g.gain.value = gain;
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}
function envGain(ctx, t, points, dest) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  for (const [v, at] of points) g.gain.exponentialRampToValueAtTime(Math.max(v, 0.0001), t + at);
  g.connect(dest);
  return g;
}

export const sfx = {
  /** Bear roar: gritty detuned saws through a waveshaper, a growl flutter, breath noise, valley echo. */
  roar(a, { delay = 0, gain = 1 } = {}) {
    if (!live(a)) return;
    const ctx = a.ctx, t = a.now() + 0.02 + delay, dur = 2.0;
    const out = a._echo ? a._echo(0.42, 0.3, 0.38) : a.master;
    const env = envGain(ctx, t, [[0.34 * gain, 0.14], [0.31 * gain, 0.95], [0.2 * gain, 1.4], [0.0001, dur]], out);
    const trem = ctx.createGain();
    trem.gain.value = 0.72;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 24;
    const lg = ctx.createGain();
    lg.gain.value = 0.28;
    lfo.connect(lg);
    lg.connect(trem.gain);
    lfo.start(t);
    lfo.stop(t + dur + 0.1);
    trem.connect(env);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 3;
    lp.frequency.setValueAtTime(420, t);
    lp.frequency.linearRampToValueAtTime(1500, t + 0.3);
    lp.frequency.linearRampToValueAtTime(1100, t + 1.0);
    lp.frequency.exponentialRampToValueAtTime(320, t + dur);
    lp.connect(trem);
    const sh = shaper(ctx, 5);
    sh.connect(lp);
    const f0 = [[96, 0], [150, 0.32], [128, 1.0], [70, dur, true]];
    osc(ctx, 'sawtooth', t, dur, f0, sh, 0.34);
    osc(ctx, 'sawtooth', t, dur, f0, sh, 0.3, 14);
    osc(ctx, 'square', t, dur, f0, sh, 0.22, -1200);
    const src = ctx.createBufferSource();
    src.buffer = a.brown;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 520;
    bp.Q.value = 0.8;
    const ng = ctx.createGain();
    ng.gain.value = 1.4;
    src.connect(bp);
    bp.connect(ng);
    ng.connect(sh);
    src.start(t, Math.random() * 2);
    src.stop(t + dur + 0.05);
  },
  /** Splash: a noise burst, a low plunk and a few droplets. */
  splash(a, { delay = 0, gain = 1 } = {}) {
    if (!live(a)) return;
    const ctx = a.ctx, t = a.now() + 0.02 + delay;
    a._burst(t, 0.42, { type: 'bandpass', freq: 1300, q: 0.6, gain: 0.5 * gain });
    a._burst(t + 0.03, 0.25, { type: 'highpass', freq: 3800, q: 0.5, gain: 0.18 * gain });
    const g = envGain(ctx, t, [[0.4 * gain, 0.01], [0.0001, 0.22]], a.master);
    osc(ctx, 'sine', t, 0.24, [[170, 0], [60, 0.2, true]], g);
    for (let i = 0; i < 6; i++) a._burst(t + 0.12 + Math.random() * 0.5, 0.025, { freq: 2600 + Math.random() * 2400, q: 4, gain: (0.03 + Math.random() * 0.05) * gain });
  },
  /** Three quick sniffs. */
  sniff(a, { delay = 0 } = {}) {
    if (!live(a)) return;
    const t = a.now() + 0.02 + delay;
    for (let i = 0; i < 3; i++) a._burst(t + i * 0.14, 0.07, { type: 'bandpass', freq: 2400 + i * 200, q: 1.3, gain: 0.09 });
  },
  /** Heavy paws landing. */
  thump(a, { delay = 0, gain = 1 } = {}) {
    if (!live(a)) return;
    const ctx = a.ctx, t = a.now() + 0.02 + delay;
    const g = envGain(ctx, t, [[0.55 * gain, 0.008], [0.0001, 0.3]], a.master);
    osc(ctx, 'sine', t, 0.32, [[90, 0], [38, 0.28, true]], g);
    a._burst(t, 0.12, { buf: a.brown, type: 'lowpass', freq: 400, gain: 0.35 * gain });
  },
  /** Bull elk bugle off the far wall of the valley: a rising whistle, a held scream, grunts. */
  bugle(a, { delay = 0, gain = 1 } = {}) {
    if (!live(a)) return;
    const ctx = a.ctx, t = a.now() + 0.02 + delay;
    const out = a._echo ? a._echo(0.62, 0.42, 0.62) : a.master;
    const env = envGain(ctx, t, [[0.07 * gain, 0.3], [0.08 * gain, 1.1], [0.06 * gain, 2.0], [0.0001, 2.7]], out);
    const curve = [[330, 0], [980, 0.45], [1480, 0.9], [1540, 1.9], [880, 2.45], [700, 2.7]];
    const o1 = osc(ctx, 'sine', t, 2.7, curve, env, 1);
    const o2 = osc(ctx, 'triangle', t, 2.7, curve, env, 0.22, 1200);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 6.5;
    const lg = ctx.createGain();
    lg.gain.value = 26;
    lfo.connect(lg);
    lg.connect(o1.frequency);
    lg.connect(o2.frequency);
    lfo.start(t + 0.8);
    lfo.stop(t + 2.8);
    for (const s of [2.95, 3.35, 3.7]) a._burst(t + s, 0.14, { buf: a.brown, type: 'lowpass', freq: 380, gain: 0.22 * gain });
  },
  /** Wings: a flock clattering up out of the trees, with a couple of alarm chirps. */
  wings(a, { delay = 0 } = {}) {
    if (!live(a)) return;
    const ctx = a.ctx, t = a.now() + 0.02 + delay;
    let s = 0;
    for (let i = 0; i < 22; i++) {
      a._burst(t + s, 0.035, { type: 'bandpass', freq: 900 + Math.random() * 900, q: 0.9, gain: 0.11 * (1 - i / 26) });
      s += 0.025 + Math.random() * 0.045;
    }
    for (let i = 0; i < 3; i++) {
      const st = t + 0.1 + i * 0.22 + Math.random() * 0.1;
      const g = envGain(ctx, st, [[0.045, 0.01], [0.0001, 0.12]], a.master);
      osc(ctx, 'sine', st, 0.13, [[3600 + Math.random() * 900, 0], [2500, 0.11]], g);
    }
  },
  /** Small plop (fish rising, a paw dipping). */
  plop(a, { delay = 0, gain = 1 } = {}) {
    if (!live(a)) return;
    const ctx = a.ctx, t = a.now() + 0.02 + delay;
    const g = envGain(ctx, t, [[0.22 * gain, 0.006], [0.0001, 0.14]], a.master);
    osc(ctx, 'sine', t, 0.15, [[640, 0], [260, 0.12, true]], g);
    a._burst(t, 0.06, { type: 'bandpass', freq: 2200, q: 1, gain: 0.08 * gain });
  },
};

/** A filtered noise bed (the waterfall), rebuilt on whichever audio context is live (incl. offline export). */
export function noiseBed(audio, { type = 'bandpass', freq = 900, q = 0.55, buffer = 'pink' } = {}) {
  const per = new Map();
  let acc = 1;
  return {
    set(level, dt) {
      if (!live(audio)) return;
      acc += dt;
      let L = per.get(audio.ctx);
      if (L && acc < 0.1) return;
      acc = 0;
      if (!L) {
        const ctx = audio.ctx;
        const src = ctx.createBufferSource();
        src.buffer = audio[buffer];
        src.loop = true;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 160;
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        f.Q.value = q;
        const g = ctx.createGain();
        g.gain.value = 0;
        src.connect(hp);
        hp.connect(f);
        f.connect(g);
        g.connect(audio.master);
        src.start(audio.now(), Math.random() * 2);
        L = { src, g };
        per.set(audio.ctx, L);
      }
      L.g.gain.setTargetAtTime(level, audio.now(), 0.4);
    },
    dispose() {
      for (const L of per.values()) {
        try { L.src.stop(); L.g.disconnect(); } catch (e) { /* already gone */ }
      }
      per.clear();
    },
  };
}
