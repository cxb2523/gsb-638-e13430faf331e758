import * as THREE from 'three';
import { FULLSCREEN_VERT, BRIGHT_FRAG, BLUR_FRAG, DOWN_FRAG, COMPOSITE_FRAG, UPSCALE_FRAG } from './shaders.js';
import { shared } from './materials.js';
import { PALETTES, paletteArrays } from './palettes.js';

export const QUANTIZE = { none: 0, levels: 1, palette: 2 };

export const defaultLook = () => ({
  pixelSize: 4,
  quantize: 'levels',
  levels: 14,
  palette: 'Harbour',
  dither: 0.55,
  outline: 0.5,
  highlight: 0.3,
  edge: 0.3,
  bloom: 0.9,
  bloomThreshold: 2.4,
  exposure: 1.0,
  contrast: 1.06,
  saturation: 1.12,
  vignette: 0.22,
  texture: 1.0,
});

export const LOOK_PRESETS = {
  Clean: { quantize: 'levels', levels: 16, dither: 0.4, outline: 0.45, highlight: 0.3, saturation: 1.1 },
  Retro: { quantize: 'palette', dither: 0.7, outline: 0.6, highlight: 0.35, saturation: 1.15 },
  Soft: { quantize: 'levels', levels: 24, dither: 0.3, outline: 0.3, highlight: 0.2, bloom: 1.2, saturation: 1.05 },
  Crunchy: { quantize: 'levels', levels: 7, dither: 0.9, outline: 0.7, highlight: 0.45, saturation: 1.25 },
};

/**
 * Renders a three.js scene as pixel art:
 *   1. scene at low resolution into an HDR colour buffer + view normals (MRT) + depth
 *   2. glow from anything brighter than the threshold (lamps, fireflies)
 *   3. composite: sky, outlines, edge highlights, glow, fog, tone, grade, quantise + dither
 *   4. nearest-neighbour blow-up to the output size
 * The orthographic camera snaps to whole pixels so still scenes never shimmer.
 */
export class PixelEngine {
  constructor(canvas) {
    this.canvas = canvas;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' }));
    r.setPixelRatio(1);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.BasicShadowMap;
    r.shadowMap.autoUpdate = false;
    r.localClippingEnabled = true;
    r.toneMapping = THREE.NoToneMapping;

    this.look = defaultLook();
    this.out = { w: 1920, h: 1080 };
    this.low = { w: 0, h: 0, ps: 0 };
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.5, 160);
    this.camera.layers.enableAll();
    this.view = { target: new THREE.Vector3(), size: 16, azimuth: 45, elevation: 30, zoom: 1, snap: true };
    this.depthRange = 159.5;
    // planar reflection: set engine.mirror = { y } for scenes with water or wet streets
    this.mirror = null;
    this.mirrorCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.5, 160);
    this.mirrorCam.layers.set(0);
    this._clip = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)];

    this._quadScene = new THREE.Scene();
    this._quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this._quad.frustumCulled = false;
    this._quadScene.add(this._quad);

    const mk = (frag, uniforms) =>
      new THREE.ShaderMaterial({ vertexShader: FULLSCREEN_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    const v2 = () => ({ value: new THREE.Vector2() });
    const col = () => ({ value: new THREE.Color() });
    this.mBright = mk(BRIGHT_FRAG, { tColor: { value: null }, uSrc: v2(), uThreshold: { value: 2.4 } });
    this.mBlur = mk(BLUR_FRAG, { tSrc: { value: null }, uDir: v2(), uSize: v2() });
    this.mDown = mk(DOWN_FRAG, { tSrc: { value: null }, uSize: v2() });
    this.mComposite = mk(COMPOSITE_FRAG, {
      tColor: { value: null }, tNormal: { value: null }, tDepth: { value: null }, tBloomA: { value: null }, tBloomB: { value: null },
      uRes: v2(), uDepthRange: { value: 1 }, uOutline: { value: 0.5 }, uHighlight: { value: 0.3 }, uEdge: { value: 0.3 },
      uBloom: { value: 1 }, uSkyTop: col(), uSkyBottom: col(), uStars: { value: 0 }, uTime: { value: 0 },
      uFog: { value: 0 }, uFogColor: col(), uFlash: { value: 0 }, uExposure: { value: 1 }, uContrast: { value: 1 },
      uSaturation: { value: 1 }, uTint: { value: new THREE.Color(1, 1, 1) }, uVignette: { value: 0 },
      uMode: { value: 1 }, uLevels: { value: 14 }, uDither: { value: 0.5 },
      uPalLab: { value: Array.from({ length: 48 }, () => new THREE.Vector3()) },
      uPalRgb: { value: Array.from({ length: 48 }, () => new THREE.Vector3()) },
      uPalSize: { value: 0 },
      uMilky: { value: 0 }, uAurora: { value: 0 }, uMoon: { value: 0 }, uMoonPos: { value: new THREE.Vector2(0.82, 0.8) },
    });
    this.mUpscale = mk(UPSCALE_FRAG, { tPix: { value: null }, uPixel: { value: 4 }, uLow: v2() });

    this.setOutput(1920, 1080);
    this.applyLook();
  }

  setOutput(w, h) {
    this.out = { w, h };
    this.renderer.setSize(w, h, false);
    this._alloc();
  }

  applyLook() {
    const L = this.look;
    if (Math.round(L.pixelSize) !== this.low.ps) this._alloc();
    shared.uTexture.value = L.texture;
    const pal = paletteArrays(PALETTES[L.palette] || PALETTES.Harbour);
    const u = this.mComposite.uniforms;
    pal.lab.forEach((v, i) => u.uPalLab.value[i].set(v[0], v[1], v[2]));
    pal.rgb.forEach((v, i) => u.uPalRgb.value[i].set(v[0], v[1], v[2]));
    u.uPalSize.value = pal.size;
  }

  _alloc() {
    const ps = Math.max(1, Math.round(this.look.pixelSize));
    const W = Math.ceil(this.out.w / ps), H = Math.ceil(this.out.h / ps);
    this.low = { w: W, h: H, ps };
    [this.rtScene, this.rtHalfA, this.rtHalfB, this.rtQA, this.rtQB, this.rtPix, this.rtMirror].forEach((t) => t && t.dispose());
    this.rtMirror = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, type: THREE.HalfFloatType, depthBuffer: true });
    shared.uMirror.value = this.rtMirror.texture;
    const nearest = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false };
    this.rtScene = new THREE.WebGLRenderTarget(W, H, { ...nearest, type: THREE.HalfFloatType, count: 2, depthBuffer: true });
    this.rtScene.depthTexture = new THREE.DepthTexture(W, H);
    const lin = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, type: THREE.HalfFloatType, depthBuffer: false };
    const hw = Math.max(1, Math.ceil(W / 2)), hh = Math.max(1, Math.ceil(H / 2));
    const qw = Math.max(1, Math.ceil(hw / 2)), qh = Math.max(1, Math.ceil(hh / 2));
    this.rtHalfA = new THREE.WebGLRenderTarget(hw, hh, lin);
    this.rtHalfB = new THREE.WebGLRenderTarget(hw, hh, lin);
    this.rtQA = new THREE.WebGLRenderTarget(qw, qh, lin);
    this.rtQB = new THREE.WebGLRenderTarget(qw, qh, lin);
    this.rtPix = new THREE.WebGLRenderTarget(W, H, { ...nearest, depthBuffer: false });
    this.mComposite.uniforms.uRes.value.set(W, H);
    this.mUpscale.uniforms.uLow.value.set(W, H);
    this.mUpscale.uniforms.uPixel.value = ps;
  }

  _updateCamera() {
    const v = this.view, cam = this.camera, low = this.low;
    const viewH = v.size / v.zoom;
    const viewW = (viewH * low.w) / low.h;
    cam.left = -viewW / 2;
    cam.right = viewW / 2;
    cam.top = viewH / 2;
    cam.bottom = -viewH / 2;
    cam.near = 0.5;
    cam.far = 160;
    cam.updateProjectionMatrix();
    const az = THREE.MathUtils.degToRad(v.azimuth), el = THREE.MathUtils.degToRad(v.elevation);
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    cam.position.copy(v.target).addScaledVector(dir, 70);
    cam.up.set(0, 1, 0);
    cam.lookAt(v.target);
    cam.updateMatrixWorld();
    if (v.snap) {
      // lock the camera to the pixel grid so nothing shimmers when it drifts
      const upp = viewH / low.h;
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      const pr = cam.position.dot(right), pu = cam.position.dot(up);
      cam.position.addScaledVector(right, Math.round(pr / upp) * upp - pr).addScaledVector(up, Math.round(pu / upp) * upp - pu);
      cam.updateMatrixWorld();
    }
    this.depthRange = cam.far - cam.near;
  }

  _pass(material, target) {
    this._quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this._quadScene, this._quadCam);
  }

  _blur(a, b, radius) {
    const u = this.mBlur.uniforms;
    u.uSize.value.set(a.width, a.height);
    u.tSrc.value = a.texture;
    u.uDir.value.set(radius, 0);
    this._pass(this.mBlur, b);
    u.tSrc.value = b.texture;
    u.uDir.value.set(0, radius);
    this._pass(this.mBlur, a);
  }

  /** Ray from a point on the canvas (0..1, origin top-left) through the scene. */
  raycaster(x01, y01) {
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(x01 * 2 - 1, -(y01 * 2 - 1)), this.camera);
    return rc;
  }

  /**
   * Call once after building a scene.
   * Layer 1: reflective surfaces (the mirror pass skips them).
   * Layer 2: tiny, non-glowing details, or anything under userData.noMirror (main pass only, never reflected).
   * Tiny details also stop casting shadows: at this pixel size they are invisible and cost a draw call each.
   */
  prepareScene(scene) {
    scene.updateMatrixWorld(true);
    const s = new THREE.Vector3();
    const flagged = (o) => { for (let p = o; p; p = p.parent) if (p.userData?.noMirror) return true; return false; };
    scene.traverse((o) => {
      if (!o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.some((m) => m?.userData?.mirror)) { o.layers.set(1); return; }
      if (!o.isMesh || o.isInstancedMesh || !o.geometry) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      o.getWorldScale(s);
      const r = (o.geometry.boundingSphere?.radius ?? 1) * Math.max(s.x, s.y, s.z);
      const glows = mats.some((m) => m?.emissive && m.emissive.getHex() !== 0 && (m.emissiveIntensity ?? 0) > 0.5);
      if (r < 0.12 && !glows) o.castShadow = false;
      if (o.layers.mask === 1 && !glows && (r < 0.2 || flagged(o))) o.layers.set(2);
    });
  }

  _renderMirror(scene) {
    const r = this.renderer, cam = this.camera, mc = this.mirrorCam, y = this.mirror.y;
    mc.left = cam.left; mc.right = cam.right; mc.top = cam.top; mc.bottom = cam.bottom;
    mc.near = cam.near; mc.far = cam.far;
    mc.updateProjectionMatrix();
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    fwd.y = -fwd.y;
    mc.position.set(cam.position.x, 2 * y - cam.position.y, cam.position.z);
    mc.up.set(0, -1, 0);
    mc.lookAt(mc.position.clone().add(fwd));
    mc.updateMatrixWorld();
    shared.uMirrorMatrix.value.multiplyMatrices(mc.projectionMatrix, mc.matrixWorldInverse);
    shared.uClipOn.value = 1;
    shared.uClipY.value = y + 0.02;
    r.setRenderTarget(this.rtMirror);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(scene, mc);
    shared.uClipOn.value = 0;
  }

  render(scene, env) {
    const r = this.renderer, L = this.look;
    this._updateCamera();
    r.shadowMap.needsUpdate = true;

    if (this.mirror) {
      // reflections mostly see the unlit undersides of things: lift the ambient a little for this pass
      const hemi = env?.hemi;
      const h0 = hemi ? hemi.intensity : 0;
      if (hemi) hemi.intensity = h0 * 1.5;
      this._renderMirror(scene);
      if (hemi) hemi.intensity = h0;
      shared.uMirrorOn.value = 1;
    } else shared.uMirrorOn.value = 0;

    r.setRenderTarget(this.rtScene);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(scene, this.camera);

    const bloom = L.bloom > 0.001;
    if (bloom) {
      const ub = this.mBright.uniforms;
      ub.tColor.value = this.rtScene.textures[0];
      ub.uSrc.value.set(this.low.w, this.low.h);
      ub.uThreshold.value = L.bloomThreshold;
      this._pass(this.mBright, this.rtHalfA);
      this._blur(this.rtHalfA, this.rtHalfB, 1.0);
      this.mDown.uniforms.tSrc.value = this.rtHalfA.texture;
      this.mDown.uniforms.uSize.value.set(this.rtQA.width, this.rtQA.height);
      this._pass(this.mDown, this.rtQA);
      this._blur(this.rtQA, this.rtQB, 1.0);
      this._blur(this.rtQA, this.rtQB, 2.0);
    }

    const u = this.mComposite.uniforms, p = env.post;
    u.tColor.value = this.rtScene.textures[0];
    u.tNormal.value = this.rtScene.textures[1];
    u.tDepth.value = this.rtScene.depthTexture;
    u.tBloomA.value = this.rtHalfA.texture;
    u.tBloomB.value = this.rtQA.texture;
    u.uDepthRange.value = this.depthRange;
    u.uOutline.value = L.outline;
    u.uHighlight.value = L.highlight;
    u.uEdge.value = L.edge;
    u.uBloom.value = bloom ? L.bloom : 0;
    u.uSkyTop.value.copy(p.skyTop);
    u.uSkyBottom.value.copy(p.skyBottom);
    u.uStars.value = p.stars;
    u.uTime.value = env.time;
    u.uFog.value = p.fog;
    u.uFogColor.value.copy(p.fogColor);
    u.uFlash.value = p.flash;
    u.uExposure.value = L.exposure * p.exposure;
    u.uContrast.value = L.contrast;
    u.uSaturation.value = L.saturation;
    u.uTint.value.copy(p.tint).convertLinearToSRGB();
    u.uVignette.value = L.vignette;
    u.uMode.value = QUANTIZE[L.quantize] ?? 1;
    u.uLevels.value = L.levels;
    u.uDither.value = L.dither;
    u.uMilky.value = p.milky ?? 0;
    u.uAurora.value = p.aurora ?? 0;
    u.uMoon.value = p.moon ?? 0;
    if (p.moonPos) u.uMoonPos.value.copy(p.moonPos);
    this._pass(this.mComposite, this.rtPix);

    this.mUpscale.uniforms.tPix.value = this.rtPix.texture;
    this._pass(this.mUpscale, null);
  }
}
