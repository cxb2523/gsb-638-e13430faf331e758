// Post passes. Everything runs at the low "pixel" resolution, then gets blown up with nearest sampling.

export const FULLSCREEN_VERT = /* glsl */`
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// 2x downsample of the HDR scene, keeping only what is brighter than the threshold (lamps, fireflies).
export const BRIGHT_FRAG = /* glsl */`
uniform sampler2D tColor;
uniform vec2 uSrc;
uniform float uThreshold;
void main() {
  ivec2 m = ivec2(uSrc) - 1;
  ivec2 p = ivec2(gl_FragCoord.xy) * 2;
  vec3 c = texelFetch(tColor, min(p, m), 0).rgb
         + texelFetch(tColor, min(p + ivec2(1, 0), m), 0).rgb
         + texelFetch(tColor, min(p + ivec2(0, 1), m), 0).rgb
         + texelFetch(tColor, min(p + ivec2(1, 1), m), 0).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  c *= max(l - uThreshold, 0.0) / max(l, 1e-4);
  gl_FragColor = vec4(c, 1.0);
}
`;

export const BLUR_FRAG = /* glsl */`
uniform sampler2D tSrc;
uniform vec2 uDir;
uniform vec2 uSize;
void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  vec2 px = uDir / uSize;
  vec3 c = texture(tSrc, uv).rgb * 0.2270270270;
  c += texture(tSrc, uv + px * 1.3846153846).rgb * 0.3162162162;
  c += texture(tSrc, uv - px * 1.3846153846).rgb * 0.3162162162;
  c += texture(tSrc, uv + px * 3.2307692308).rgb * 0.0702702703;
  c += texture(tSrc, uv - px * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}
`;

export const DOWN_FRAG = /* glsl */`
uniform sampler2D tSrc;
uniform vec2 uSize;
void main() { gl_FragColor = vec4(texture(tSrc, gl_FragCoord.xy / uSize).rgb, 1.0); }
`;

// The pixel-art pass: sky, outlines (depth) and edge highlights (normals), glow, fog,
// tone and grade, then colour quantising with an ordered dither.
export const COMPOSITE_FRAG = /* glsl */`
uniform sampler2D tColor;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform sampler2D tBloomA;
uniform sampler2D tBloomB;
uniform vec2 uRes;
uniform float uDepthRange;
uniform float uOutline;
uniform float uHighlight;
uniform float uEdge;
uniform float uBloom;
uniform vec3 uSkyTop;
uniform vec3 uSkyBottom;
uniform float uStars;
uniform float uTime;
uniform float uFog;
uniform vec3 uFogColor;
uniform float uFlash;
uniform float uExposure;
uniform float uContrast;
uniform float uSaturation;
uniform vec3 uTint;
uniform float uVignette;
uniform int uMode;
uniform float uLevels;
uniform float uDither;
uniform vec3 uPalLab[48];
uniform vec3 uPalRgb[48];
uniform int uPalSize;
uniform float uMilky;
uniform float uAurora;
uniform float uMoon;
uniform vec2 uMoonPos;

float h2(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float n2(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y);
}

float depthAt(ivec2 p) { return texelFetch(tDepth, clamp(p, ivec2(0), ivec2(uRes) - 1), 0).r; }
vec4 normalAt(ivec2 p) {
  vec4 n = texelFetch(tNormal, clamp(p, ivec2(0), ivec2(uRes) - 1), 0);
  return vec4(n.xyz * 2.0 - 1.0, n.a);
}
float bayer(ivec2 p) {
  const float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return (m[(p.y & 3) * 4 + (p.x & 3)] + 0.5) / 16.0;
}
// Outline on the nearer pixel wherever a neighbour is much farther away.
float depthEdge(ivec2 p, float d) {
  float s = max(depthAt(p + ivec2(1, 0)) - d, 0.0) + max(depthAt(p - ivec2(1, 0)) - d, 0.0)
          + max(depthAt(p + ivec2(0, 1)) - d, 0.0) + max(depthAt(p - ivec2(0, 1)) - d, 0.0);
  s *= uDepthRange;
  return floor(smoothstep(uEdge, uEdge * 2.0, s) * 2.0) / 2.0;
}
// Highlight on convex creases (roof ridges, terrace lips), only on the shallower side.
float normalEdgeOne(ivec2 q, float d, vec3 n) {
  vec4 m = normalAt(q);
  if (m.a < 0.5) return 0.0;
  float dd = (depthAt(q) - d) * uDepthRange;
  float ni = smoothstep(-0.01, 0.01, dot(n - m.xyz, vec3(1.0)));
  float di = step(-0.02, dd);
  return (1.0 - dot(n, m.xyz)) * di * ni;
}
float normalEdge(ivec2 p, float d, vec3 n) {
  float s = normalEdgeOne(p + ivec2(1, 0), d, n) + normalEdgeOne(p - ivec2(1, 0), d, n)
          + normalEdgeOne(p + ivec2(0, 1), d, n) + normalEdgeOne(p - ivec2(0, 1), d, n);
  return step(0.1, s);
}
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toOklab(vec3 srgb) {
  vec3 c = toLinear(srgb);
  float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
  float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
  float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
  l = pow(max(l, 0.0), 1.0 / 3.0); m = pow(max(m, 0.0), 1.0 / 3.0); s = pow(max(s, 0.0), 1.0 / 3.0);
  return vec3(0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
              1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
              0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s);
}
vec3 paletteMap(vec3 c, float b) {
  vec3 lab = toOklab(c);
  float d1 = 1e9; float d2 = 1e9; int i1 = 0; int i2 = 0;
  for (int i = 0; i < 48; i++) {
    if (i >= uPalSize) break;
    vec3 e = lab - uPalLab[i];
    e.x *= 1.5;
    float dd = dot(e, e);
    if (dd < d1) { d2 = d1; i2 = i1; d1 = dd; i1 = i; }
    else if (dd < d2) { d2 = dd; i2 = i; }
  }
  float a = sqrt(d1);
  float r = a / (a + sqrt(d2) + 1e-6);
  return (b < r * uDither) ? uPalRgb[i2] : uPalRgb[i1];
}
vec3 sky(vec2 uv, ivec2 p) {
  vec3 c = mix(uSkyBottom, uSkyTop, smoothstep(0.0, 1.0, uv.y));
  vec2 fp = vec2(p);
  vec2 q = uv - 0.5;
  q.x *= uRes.x / uRes.y;
  // Milky Way: a soft dithered band of dust and extra stars, lower left to upper right
  float band = 0.0;
  if (uMilky > 0.0) {
    float d = abs(dot(q, normalize(vec2(-0.6, 1.0))) - 0.06 + 0.03 * sin(q.x * 4.0));
    band = exp(-d * d / 0.014) * uMilky;
    float dust = n2(fp * 0.05) * 0.6 + n2(fp * 0.13 + 7.0) * 0.4;
    float lane = smoothstep(0.35, 0.65, n2(fp * 0.035 + 21.0));
    c += mix(vec3(0.22, 0.18, 0.42), vec3(0.45, 0.32, 0.5), dust) * band * dust * (0.55 + 0.45 * lane) * 0.5;
  }
  float h = h2(fp);
  float starCut = 0.9955 - band * 0.02;
  if (h > starCut) {
    float tw = 0.55 + 0.45 * sin(uTime * (1.3 + fract(h * 91.0) * 3.0) + h * 300.0);
    c += vec3(0.85, 0.9, 1.0) * uStars * tw * smoothstep(0.15, 0.75, uv.y) * 1.4;
  }
  // aurora: wavy curtains with vertical rays, green into violet
  if (uAurora > 0.0) {
    float base = 0.6 + 0.07 * sin(uv.x * 5.0 + uTime * 0.22) + 0.035 * sin(uv.x * 13.0 - uTime * 0.55);
    float hh = uv.y - base;
    float rays = 0.45 + 0.55 * n2(vec2(uv.x * 70.0 + uTime * 0.9, uTime * 0.2));
    float curtain = smoothstep(-0.015, 0.0, hh) * (1.0 - smoothstep(0.0, 0.24, hh)) * rays;
    curtain *= 0.6 + 0.4 * sin(uv.x * 9.0 - uTime * 0.4);
    vec3 ac = mix(vec3(0.12, 1.0, 0.5), vec3(0.55, 0.22, 0.95), smoothstep(0.03, 0.2, hh));
    c += ac * curtain * uAurora * 0.95;
  }
  // moon: a cratered disc with a halo
  if (uMoon > 0.0) {
    vec2 mp = uMoonPos * uRes;
    float r = max(5.0, uRes.y * 0.03);
    float d = length(fp + 0.5 - mp);
    if (d < r) {
      float crater = step(0.7, h2(floor((fp - mp) / 2.0) + 11.0)) * step(d, r - 1.5);
      float limb = smoothstep(r - 2.0, r, d);
      c = mix(c, vec3(1.0, 0.96, 0.86) * (1.35 - crater * 0.3 - limb * 0.2), uMoon);
    } else {
      c += vec3(0.45, 0.5, 0.75) * uMoon * 0.3 * exp(-(d - r) / (r * 0.8));
    }
  }
  return c;
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 uv = (vec2(p) + 0.5) / uRes;
  vec4 sc = texelFetch(tColor, p, 0);
  vec3 c = sc.rgb;
  float d = depthAt(p);
  bool bg = d >= 0.99999;
  if (bg) {
    // effects (snow, smoke, sparks, fireworks) drawn over empty sky keep their colour
    c = sky(uv, p) * (1.0 - clamp(sc.a, 0.0, 1.0)) + sc.rgb;
  } else {
    vec4 n = normalAt(p);
    float de = uOutline > 0.0 ? depthEdge(p, d) : 0.0;
    float ne = (uHighlight > 0.0 && n.a > 0.5) ? normalEdge(p, d, n.xyz) : 0.0;
    c *= de > 0.0 ? (1.0 - uOutline * de) : (1.0 + uHighlight * ne);
  }
  c += uBloom * (texture(tBloomA, uv).rgb + texture(tBloomB, uv).rgb * 0.85);
  c = mix(c, uFogColor, uFog * (bg ? 0.85 : (0.16 + 0.62 * uv.y)));
  c += uFlash * (bg ? vec3(0.9, 0.95, 1.1) : vec3(0.35, 0.38, 0.45));
  c = 1.0 - exp(-max(c, 0.0) * uExposure);
  c = toSRGB(c) * uTint;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturation);
  c = (c - 0.5) * uContrast + 0.5;
  vec2 q = uv - 0.5;
  q.x *= uRes.x / uRes.y;
  c *= 1.0 - uVignette * smoothstep(0.45, 1.05, length(q));
  c = clamp(c, 0.0, 1.0);
  float b = bayer(p);
  if (uMode == 1) {
    float L = uLevels - 1.0;
    c = floor(c * L + 0.5 + (b - 0.5) * uDither) / L;
  } else if (uMode == 2) {
    c = paletteMap(c, b);
  }
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

// Nearest-neighbour blow-up: every low-res texel becomes a crisp uPixel x uPixel block.
export const UPSCALE_FRAG = /* glsl */`
uniform sampler2D tPix;
uniform float uPixel;
uniform vec2 uLow;
void main() {
  ivec2 p = min(ivec2(floor(gl_FragCoord.xy / uPixel)), ivec2(uLow) - 1);
  gl_FragColor = vec4(texelFetch(tPix, p, 0).rgb, 1.0);
}
`;
