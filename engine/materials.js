import * as THREE from 'three';

// Uniforms shared by every engine material. The Environment and the engine write them each frame,
// so time of day, wind, rain, snow, lamps and reflections reach every surface at once.
export const shared = {
  uTime: { value: 0 },
  uWind: { value: new THREE.Vector3(0.85, 0, 0.53) },
  uWindStrength: { value: 0.3 },
  uSnow: { value: 0 },
  uWet: { value: 0 },
  uRain: { value: 0 },
  uCloudShadow: { value: 0 },
  uCloudOffset: { value: new THREE.Vector2() },
  uCloudScale: { value: 0.085 },
  uLamps: { value: 0 },
  uDaylight: { value: 1 },
  uGlint: { value: new THREE.Color(0, 0, 0) },
  uSnowColor: { value: new THREE.Color('#eef2f8') },
  uTexture: { value: 1 },
  // planar reflections (engine.mirror)
  uMirror: { value: null },
  uMirrorMatrix: { value: new THREE.Matrix4() },
  uMirrorOn: { value: 0 },
  uSkyRefl: { value: new THREE.Color('#8fb4e8') },
  // the mirror pass cuts everything under the water line with these (a uniform, so no shader switching)
  uClipOn: { value: 0 },
  uClipY: { value: 0 },
};

function gradient(values) {
  const data = new Uint8Array(values.length * 4);
  values.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  const t = new THREE.DataTexture(data, values.length, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

// Toon light ramps, read by N·L from -1 (first value) to 1 (last value). Stepped = pixel-art banding.
export const RAMPS = {
  soft: gradient([0, 0, 0, 150, 205, 255]),
  hard: gradient([0, 0, 0, 190, 255, 255]),
  foliage: gradient([0, 0, 0, 135, 196, 255]),
  flat: gradient([0, 0, 0, 220, 240, 255]),
};

const VERT_HEAD = /* glsl */`
uniform float uTime;
uniform vec3 uWind;
uniform float uWindStrength;
uniform float uWindAmt;
varying vec3 vNxWorld;
varying vec3 vNxWorldNormal;
#ifdef NX_WATER
attribute float aDepth;
varying float vNxDepth;
#endif
`;

const VERT_NORMAL = /* glsl */`
{
  vec3 nxN = objectNormal;
  #ifdef USE_INSTANCING
    nxN = mat3(instanceMatrix) * nxN;
  #endif
  vNxWorldNormal = normalize(mat3(modelMatrix) * nxN);
}
`;

// Replaces three's project_vertex so wind and water motion happen in (unrotated) model space.
const VERT_PROJECT = /* glsl */`
vec4 mvPosition = vec4(transformed, 1.0);
#ifdef USE_BATCHING
  mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
#ifdef NX_WIND
{
  vec3 nxRoot = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  #ifdef USE_INSTANCING
    nxRoot = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;
  #endif
  float nxPhase = dot(nxRoot.xz, vec2(0.71, 0.53));
  float nxGust = 0.55 + 0.45 * sin(uTime * 0.9 + nxPhase * 0.35);
  float nxWave = sin(uTime * 2.3 + nxPhase) * 0.6 + sin(uTime * 4.1 + nxPhase * 1.9) * 0.25;
  float nxBend = uWindAmt * max(position.y, 0.0) * (0.25 + uWindStrength * 1.4) * (nxGust + nxWave * 0.5);
  mvPosition.xz += normalize(uWind.xz + 1e-4) * nxBend;
}
#endif
#ifdef NX_WATER
  mvPosition.y += (sin(uTime * 1.1 + mvPosition.x * 0.9 + mvPosition.z * 0.5) + sin(uTime * 1.7 - mvPosition.z * 1.3)) * 0.0175;
  vNxDepth = aDepth;
#endif
vNxWorld = (modelMatrix * mvPosition).xyz;
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
`;

const FRAG_HEAD = /* glsl */`
uniform float uTime;
uniform float uSnow;
uniform float uWet;
uniform float uRain;
uniform float uCloudShadow;
uniform vec2 uCloudOffset;
uniform float uCloudScale;
uniform float uLamps;
uniform vec3 uGlint;
uniform vec3 uSnowColor;
uniform float uTexture;
uniform float uNoiseAmt;
uniform float uNoiseScale;
uniform float uSnowAffect;
uniform float uWetAffect;
uniform float uGlow;
uniform float uClipOn;
uniform float uClipY;
varying vec3 vNxWorld;
varying vec3 vNxWorldNormal;
layout(location = 1) out highp vec4 gNormal;
#ifdef NX_WATER
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform float uDeepAt;
varying float vNxDepth;
#endif
#ifdef NX_MIRROR
uniform sampler2D uMirror;
uniform mat4 uMirrorMatrix;
uniform float uMirrorOn;
uniform vec3 uSkyRefl;
uniform float uReflect;
uniform float uReflectWet;
uniform float uPuddles;
#endif
#ifdef NX_WINDOWS
uniform vec2 uWinSize;
uniform vec2 uWinOffset;
uniform vec2 uWinFrac;
uniform float uWinBase;
uniform float uWinTop;
uniform float uWinLit;
uniform vec3 uWinWarm;
uniform vec3 uWinCool;
uniform vec3 uWinGlass;
float nxWinOn = 0.0;
vec3 nxWinCol = vec3(0.0);
#endif
float nxHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float nxNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(nxHash(i), nxHash(i + vec3(1, 0, 0)), f.x), mix(nxHash(i + vec3(0, 1, 0)), nxHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(nxHash(i + vec3(0, 0, 1)), nxHash(i + vec3(1, 0, 1)), f.x), mix(nxHash(i + vec3(0, 1, 1)), nxHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float nxFbm(vec2 p) { return nxNoise(vec3(p, 1.7)) * 0.55 + nxNoise(vec3(p * 2.1, 4.3)) * 0.3 + nxNoise(vec3(p * 4.3, 9.1)) * 0.15; }
`;

const FRAG_SURFACE = /* glsl */`
if (uClipOn > 0.5 && vNxWorld.y < uClipY) discard;
{
  float nxA = nxNoise(vNxWorld * uNoiseScale);
  float nxB = nxNoise(vNxWorld * uNoiseScale * 2.9 + 7.3);
  diffuseColor.rgb *= 1.0 + ((nxA * 0.6 + nxB * 0.4) - 0.5) * uNoiseAmt * uTexture;
#ifdef NX_WATER
  float nxD = clamp(vNxDepth / uDeepAt, 0.0, 1.0);
  vec3 nxW = mix(uShallow, uDeep, smoothstep(0.0, 1.0, nxD));
  float nxWave = nxNoise(vec3(vNxWorld.xz * vec2(0.8, 1.6) + vec2(uTime * 0.18, uTime * 0.05), uTime * 0.12));
  nxW *= 1.0 + step(0.66, nxWave) * 0.16 - step(nxWave, 0.3) * 0.08;
  float nxShore = 0.16 + 0.06 * sin(uTime * 1.4 + vNxWorld.x * 2.1 + vNxWorld.z * 1.3);
  float nxFoam = 1.0 - smoothstep(nxShore * 0.45, nxShore, vNxDepth);
  vec2 nxCell = floor(vNxWorld.xz * 1.6);
  vec2 nxLocal = fract(vNxWorld.xz * 1.6) - 0.5;
  float nxSeed = nxHash(vec3(nxCell, 3.1));
  float nxT = fract(uTime * 0.9 + nxSeed);
  vec2 nxC = (vec2(nxHash(vec3(nxCell, 5.0)), nxHash(vec3(nxCell, 8.0))) - 0.5) * 0.4;
  float nxR = abs(length(nxLocal - nxC) - nxT * 0.4);
  float nxRing = (1.0 - smoothstep(0.0, 0.05, nxR)) * (1.0 - nxT) * step(nxSeed, uRain * 1.2) * uRain;
  nxW = mix(nxW, uFoam, clamp(nxFoam * 0.9 + nxRing * 0.7, 0.0, 1.0));
  diffuseColor.rgb = nxW;
  diffuseColor.a *= mix(0.7, 0.94, smoothstep(0.0, 0.7, vNxDepth));
#endif
#ifdef NX_WINDOWS
  {
    vec3 wn = vNxWorldNormal;
    if (abs(wn.y) < 0.4 && vNxWorld.y > uWinBase && vNxWorld.y < uWinTop) {
      float hc = abs(wn.x) > abs(wn.z) ? vNxWorld.z - uWinOffset.y : vNxWorld.x - uWinOffset.x;
      vec2 g = vec2(hc, vNxWorld.y - uWinBase) / uWinSize;
      vec2 cell = floor(g);
      vec2 f = fract(g) - 0.5;
      if (abs(f.x) < uWinFrac.x * 0.5 && abs(f.y) < uWinFrac.y * 0.5) {
        float face = floor(dot(wn, vec3(1.0, 0.0, 2.0)) + 0.5);
        float id = nxHash(vec3(cell, face + 17.0));
        float id2 = nxHash(vec3(cell.yx, face + 31.0));
        diffuseColor.rgb = uWinGlass;
        nxWinOn = step(id, uWinLit) * smoothstep(id * 0.95, id * 0.95 + 0.05, uLamps * uWinLit + 0.001);
        nxWinCol = id2 < 0.16 ? uWinCool * (0.7 + 0.3 * sin(uTime * (6.0 + id * 9.0) + id * 40.0)) : uWinWarm * (0.8 + 0.35 * id2);
      }
    }
  }
#endif
  float nxWet = uWet * uWetAffect;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * diffuseColor.rgb * 1.5, nxWet * 0.3);
  diffuseColor.rgb *= 1.0 - 0.25 * nxWet;
  float nxUp = clamp(vNxWorldNormal.y, 0.0, 1.0) * (0.45 + 0.55 * nxA);
  float nxCover = uSnow * uSnowAffect;
  float nxSnowMask = smoothstep(1.0 - nxCover, 1.05 - nxCover, nxUp);
  diffuseColor.rgb = mix(diffuseColor.rgb, uSnowColor * (0.93 + 0.1 * nxB), nxSnowMask);
}
`;

const FRAG_EMISSIVE = /* glsl */`
#ifdef NX_LAMP
  totalEmissiveRadiance *= uLamps;
#endif
#ifdef NX_WINDOWS
  totalEmissiveRadiance += nxWinCol * nxWinOn;
#endif
#ifdef NX_WATER
  {
    float nxG = nxNoise(vec3(vNxWorld.xz * vec2(2.2, 4.4), uTime * 0.9));
    totalEmissiveRadiance += uGlint * step(0.955, nxG) * 0.32 * smoothstep(0.1, 0.5, vNxDepth);
  }
#endif
  totalEmissiveRadiance *= uGlow;
`;

const FRAG_LIGHT = /* glsl */`
{
  float nxCl = nxFbm(vNxWorld.xz * uCloudScale + uCloudOffset);
  outgoingLight -= reflectedLight.directDiffuse * smoothstep(0.5, 0.62, nxCl) * uCloudShadow;
}
#ifdef NX_MIRROR
{
  vec4 nxRp = uMirrorMatrix * vec4(vNxWorld, 1.0);
  vec2 nxRuv = nxRp.xy / nxRp.w * 0.5 + 0.5;
  #ifdef NX_WATER
  nxRuv.x += (nxNoise(vec3(vNxWorld.xz * vec2(1.5, 3.0), uTime * 0.7)) - 0.5) * 0.012;
  #endif
  vec4 nxRc = texture2D(uMirror, nxRuv);
  if (uPuddles > 0.0) {
    // wet asphalt: smear the reflection vertically into streaks
    vec2 nxSt = vec2(0.0, 0.0065);
    nxRc = nxRc * 0.34 + texture2D(uMirror, nxRuv + nxSt) * 0.26 + texture2D(uMirror, nxRuv + nxSt * 2.0) * 0.22 + texture2D(uMirror, nxRuv + nxSt * 3.2) * 0.18;
  }
  vec3 nxRefl = mix(uSkyRefl, nxRc.rgb, clamp(nxRc.a, 0.0, 1.0));
  float nxPud = mix(1.0, smoothstep(0.42, 0.56, nxFbm(vNxWorld.xz * 0.8 + 3.0)), uPuddles);
  float nxRk = clamp((uReflect + uReflectWet * uWet * nxPud) * uMirrorOn, 0.0, 0.95);
  outgoingLight = mix(outgoingLight, nxRefl, nxRk);
}
#endif
`;

const FRAG_OUT = /* glsl */`
gNormal = vec4(normalize(normal) * 0.5 + 0.5, 1.0);
`;

// One patch function for every engine material. Variations come from defines only,
// so three's program cache stays correct.
function nxPatch(shader) {
  const o = this.userData.nx;
  Object.assign(shader.uniforms, shared, o.uniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + VERT_HEAD)
    .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\n' + VERT_NORMAL)
    .replace('#include <project_vertex>', VERT_PROJECT);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + FRAG_HEAD)
    .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_SURFACE)
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_EMISSIVE)
    .replace('#include <opaque_fragment>', FRAG_LIGHT + '\n#include <opaque_fragment>')
    .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n' + FRAG_OUT);
}

const col = (c, fallback) => new THREE.Color(c ?? fallback);

/**
 * Toon material that knows about the engine: surface texture noise, wind sway, snow that settles
 * on upward faces, wet darkening, cloud shadows, lamps that switch on at night, water, reflections,
 * and procedural lit windows.
 *
 * Options
 *   ramp ('soft' | 'hard' | 'foliage' | 'flat'), vertexColors, emissive, emissiveIntensity,
 *   transparent, opacity, side, depthWrite,
 *   noise, noiseScale       surface texture
 *   snow, wet               how much snow settles / how dark it gets in rain (0..1)
 *   wind                    sway amount (scaled by local height above y = 0)
 *   lamp                    emissive only shows when env.lamps is up (dusk, night, storms)
 *   glow                    emissive multiplier, animate it with setGlow() for flicker or toggles
 *   water + shallow, deep, foam, deepAt
 *   mirror + reflect, reflectWet, puddles   reflective surface (needs a scene mirror plane)
 *   windows: { size:[w,h], frac:[x,y], base, top, lit, warm, cool, glass }   lit window grid on vertical faces
 */
export function toon(color = '#ffffff', o = {}) {
  const m = new THREE.MeshToonMaterial({
    color,
    gradientMap: RAMPS[o.ramp || 'soft'],
    vertexColors: !!o.vertexColors,
    emissive: o.emissive || '#000000',
    emissiveIntensity: o.emissiveIntensity ?? 1,
    transparent: !!o.transparent,
    opacity: o.opacity ?? 1,
    side: o.side ?? THREE.FrontSide,
    depthWrite: o.depthWrite ?? true,
  });
  const w = o.windows || {};
  m.userData.nx = {
    uniforms: {
      uNoiseAmt: { value: o.noise ?? 0.14 },
      uNoiseScale: { value: o.noiseScale ?? 2.4 },
      uSnowAffect: { value: o.snow ?? 1 },
      uWetAffect: { value: o.wet ?? 1 },
      uWindAmt: { value: o.wind ?? 0 },
      uGlow: { value: o.glow ?? 1 },
      uShallow: { value: col(o.shallow, '#58c7c4') },
      uDeep: { value: col(o.deep, '#1f548f') },
      uFoam: { value: col(o.foam, '#e9f7ff') },
      uDeepAt: { value: o.deepAt ?? 1.1 },
      uReflect: { value: o.reflect ?? 0.35 },
      uReflectWet: { value: o.reflectWet ?? 0 },
      uPuddles: { value: o.puddles ?? 0 },
      uWinSize: { value: new THREE.Vector2(...(w.size || [0.55, 0.62])) },
      uWinOffset: { value: new THREE.Vector2(...(w.offset || [0, 0])) },
      uWinFrac: { value: new THREE.Vector2(...(w.frac || [0.5, 0.52])) },
      uWinBase: { value: w.base ?? 0 },
      uWinTop: { value: w.top ?? 100 },
      uWinLit: { value: w.lit ?? 0.72 },
      uWinWarm: { value: col(w.warm, '#ffbf6a').multiplyScalar(w.power ?? 3.2) },
      uWinCool: { value: col(w.cool, '#8fb8ff').multiplyScalar((w.power ?? 3.2) * 0.8) },
      uWinGlass: { value: col(w.glass, '#2a3247') },
    },
  };
  if (o.wind) m.defines.NX_WIND = '';
  if (o.lamp) m.defines.NX_LAMP = '';
  if (o.water) m.defines.NX_WATER = '';
  if (o.mirror) {
    m.defines.NX_MIRROR = '';
    m.userData.mirror = true;
  }
  if (o.windows) m.defines.NX_WINDOWS = '';
  m.onBeforeCompile = nxPatch;
  m.customProgramCacheKey = () => 'nx-toon-2';
  return m;
}

/** Set an engine material's emissive multiplier (flicker, toggles). */
export function setGlow(material, value) {
  const u = material?.userData?.nx?.uniforms?.uGlow;
  if (u) u.value = value;
}

/** Live access to a material's per-material uniforms (e.g. uni(mat).uReflect.value = 0.5). */
export function uni(material) {
  return material.userData.nx.uniforms;
}

/**
 * Effects material (particles, beams, glows). Writes colour only and leaves the normal buffer
 * untouched, so effects never create outlines.
 */
export function fxMaterial({ vertexShader, fragmentShader, uniforms = {}, blending = THREE.NormalBlending, side = THREE.FrontSide, depthTest = true }) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: 'layout(location = 1) out highp vec4 gNormal;\n' + fragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest,
    blending,
    side,
  });
}
