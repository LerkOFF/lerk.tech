import { initUI } from './ui.js';

// The 3D scene is optional: if it fails to load or start, the map keeps working
// and the details sheet is shown over a plain dark background.
let scene = null;
try {
  const canvas = document.getElementById('scene');
  const mod = await import('./scene.js');
  scene = mod.createScene(canvas);
} catch (err) {
  console.warn('3D scene unavailable, falling back to 2D only:', err);
  scene = null;
}

initUI(scene);
