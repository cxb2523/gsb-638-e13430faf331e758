// Palettes for the "palette" quantise mode. Each one is generated from a few base colours:
// every base becomes a 5-step ramp with pixel-art hue shifting (shadows lean blue-violet,
// highlights lean warm), plus an ink and a paper. Up to 48 colours.

const srgbToLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const linToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
export function rgbToHex(rgb) {
  return '#' + rgb.map((v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('');
}
export function rgbToOklab([r, g, b]) {
  const R = srgbToLin(r), G = srgbToLin(g), B = srgbToLin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
export function oklabToRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    linToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}
function lch(L, C, hDeg) {
  // reduce chroma until the colour fits in sRGB
  for (let c = C; c >= 0; c -= 0.005) {
    const h = (hDeg * Math.PI) / 180;
    const rgb = oklabToRgb([L, c * Math.cos(h), c * Math.sin(h)]);
    if (rgb.every((v) => v >= -0.001 && v <= 1.001)) return rgb.map((v) => clamp(v, 0, 1));
  }
  return oklabToRgb([L, 0, 0]).map((v) => clamp(v, 0, 1));
}
function towards(h, target, amount) {
  let d = ((target - h + 540) % 360) - 180;
  return h + clamp(d, -Math.abs(amount), Math.abs(amount));
}

export function rampPalette(bases, { steps = 5, shift = 22, extras = ['#0f111a', '#f6f3ea'] } = {}) {
  const out = [];
  for (const hex of bases) {
    const [L, a, b] = rgbToOklab(hexToRgb(hex));
    const C = Math.hypot(a, b);
    const h = (Math.atan2(b, a) * 180) / Math.PI;
    for (let k = 0; k < steps; k++) {
      const t = steps === 1 ? 0.5 : k / (steps - 1);
      const Lk = clamp(L + (t - 0.58) * 0.6, 0.1, 0.97);
      const hk = t < 0.5 ? towards(h, 268, shift * (0.5 - t) * 2) : towards(h, 88, shift * (t - 0.5) * 2);
      const Ck = C * (0.82 + 0.32 * (1 - Math.abs(t - 0.45) * 2));
      out.push(rgbToHex(lch(Lk, Ck, hk)));
    }
  }
  out.push(...extras);
  // drop near-duplicates
  const kept = [];
  for (const hex of out) {
    const lab = rgbToOklab(hexToRgb(hex));
    if (!kept.some((k) => Math.hypot(k.lab[0] - lab[0], k.lab[1] - lab[1], k.lab[2] - lab[2]) < 0.018)) kept.push({ hex, lab });
  }
  return kept.slice(0, 48).map((k) => k.hex);
}

export const PALETTES = {
  Harbour: rampPalette(['#68ad52', '#3d7a4b', '#e3c690', '#8d919c', '#9a6a46', '#c9533f', '#3f8fc2', '#86b8e8', '#ffc66e', '#27305f']),
  Autumn: rampPalette(['#c8752f', '#a8402f', '#e7b44c', '#6f7d3a', '#7a5a43', '#8e8a96', '#4b7fa6', '#f2d2a0', '#2c2a4a']),
  Winter: rampPalette(['#e7eef8', '#9fb7d4', '#5f7fa8', '#3b4f7a', '#7e5b48', '#2f5d4f', '#d8a35c', '#a83f3f', '#1c2240']),
  Neon: rampPalette(['#ff3d8b', '#7b3dff', '#2ee6d6', '#ffd23d', '#3d5bff', '#24263d', '#8a8fa8', '#ff8a3d']),
};

export function paletteArrays(hexes) {
  const lab = [], rgb = [];
  for (const hex of hexes.slice(0, 48)) {
    lab.push(rgbToOklab(hexToRgb(hex)));
    rgb.push(hexToRgb(hex));
  }
  return { lab, rgb, size: lab.length };
}
