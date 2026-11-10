import * as THREE from 'three';
import * as K from './kit.js';

// Stand-in until a scene is built: a plain grass block.
export function placeholder(name) {
  return {
    name,
    view: { target: [0, 0, 0], size: 14, azimuth: 45, elevation: 30 },
    create() {
      const root = new THREE.Group();
      const T = K.terrain({
        size: 10, cells: 20, step: 0.3, base: -2, height: () => 0.3,
        top: (x, z, h, c) => c.set('#6eb156'),
        side: (x, z, y, h, outer, c) => c.set(h - y < 0.11 ? '#5b9547' : '#8e6444'),
      });
      root.add(T.mesh);
      return { root, info: { size: 10, top: 0.3, bottom: -2, surfaceAt: () => 0.3, isLand: () => true }, update() {} };
    },
  };
}
