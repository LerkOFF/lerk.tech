// 3D auditorium: stadium seating, procedural screen, and the camera flight
// from an overhead overview down into the first-person view from a seat.
// Units are metres, matching hall.js.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HALL, SCREEN_CENTER, SEATS, eyePosition } from './hall.js';

const MINT = 0x7ee2a8;
const SEATED_FOV = 63;
const OVER_FOV = 55;
const TOP_PX = 84; // screen top sits this far below the canvas top (clears the top UI pill)
const BACK_BAND = 0.66; // seat-back top sits this far down the visible area
const MAX_SEATED_FOV = 80;
const MIN_SEATED_FOV = 30;
const OVER_DIR = new THREE.Vector3(0, 0.9, 0.44).normalize();

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// ---------------------------------------------------------------- screen art

function paintScreen(aspect) {
  const W = 2048;
  const H = Math.round(W / aspect);
  const fs = H / 858;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');

  // Sky: pale peach to sand.
  const sky = g.createLinearGradient(0, 0, 0, H * 0.7);
  sky.addColorStop(0, '#f1cdb4');
  sky.addColorStop(0.45, '#f6dcc1');
  sky.addColorStop(1, '#ecc597');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);

  // Sun glow, hazy.
  const sx = W * 0.7;
  const sy = H * 0.4;
  const glow = g.createRadialGradient(sx, sy, 0, sx, sy, W * 0.4);
  glow.addColorStop(0, 'rgba(255,246,228,0.95)');
  glow.addColorStop(0.15, 'rgba(255,236,208,0.55)');
  glow.addColorStop(1, 'rgba(255,225,190,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,250,238,0.9)';
  g.beginPath();
  g.arc(sx, sy, 34, 0, Math.PI * 2);
  g.fill();

  // Thin drifting haze bands.
  for (let i = 0; i < 6; i++) {
    const y = H * (0.18 + i * 0.07);
    const gr = g.createLinearGradient(0, y - 18, 0, y + 18);
    gr.addColorStop(0, 'rgba(255,240,222,0)');
    gr.addColorStop(0.5, 'rgba(255,240,222,0.18)');
    gr.addColorStop(1, 'rgba(255,240,222,0)');
    g.fillStyle = gr;
    g.fillRect((i * 173) % 400 - 200, y - 18, W, 36);
  }

  // Dune layers, back to front.
  const layers = [
    { base: 0.5, amp: 0.018, f: 1.3, p: 0.4, color: '#dbab7a', haze: 0.34 },
    { base: 0.58, amp: 0.026, f: 1.9, p: 2.1, color: '#c98f5c', haze: 0.24 },
    { base: 0.66, amp: 0.03, f: 1.5, p: 4.0, color: '#b3703f', haze: 0.15 },
    { base: 0.77, amp: 0.034, f: 2.3, p: 1.2, color: '#8e5230', haze: 0.08 },
    { base: 0.9, amp: 0.03, f: 1.7, p: 3.3, color: '#5f3520', haze: 0 },
  ];
  const ridge = (L, x) => {
    const u = x / W;
    const a = Math.sin(u * Math.PI * 2 * L.f + L.p);
    const b = Math.sin(u * Math.PI * 2 * L.f * 2.3 + L.p * 1.7) * 0.45;
    const crest = Math.pow(Math.abs(Math.sin(u * Math.PI * L.f + L.p * 0.5)), 0.6) * 0.7;
    return H * (L.base + L.amp * (a + b - crest));
  };

  layers.forEach((L, i) => {
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) g.lineTo(x, ridge(L, x));
    g.lineTo(W, H);
    g.closePath();
    const top = H * (L.base - 0.05);
    const fill = g.createLinearGradient(0, top, 0, H);
    fill.addColorStop(0, L.color);
    fill.addColorStop(1, '#6b3d24');
    g.fillStyle = fill;
    g.fill();

    // Soft light edge along the crest for volume.
    g.strokeStyle = 'rgba(255,224,180,0.28)';
    g.lineWidth = 3;
    g.beginPath();
    for (let x = 0; x <= W; x += 8) {
      const y = ridge(L, x);
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();

    // The lone figure stands on the ridge of the third layer.
    if (i === 2) {
      const fx = W * 0.31;
      const fy = ridge(L, fx);
      g.fillStyle = '#1b1210';
      g.beginPath();
      g.moveTo(fx - 7 * fs, fy + fs);
      g.lineTo(fx - 3 * fs, fy - 24 * fs);
      g.lineTo(fx + 3 * fs, fy - 24 * fs);
      g.lineTo(fx + 8 * fs, fy + fs);
      g.closePath();
      g.fill();
      g.beginPath();
      g.arc(fx, fy - 29 * fs, 4.2 * fs, 0, Math.PI * 2);
      g.fill();
      g.fillRect(fx - fs, fy - 26 * fs, 2 * fs, 4 * fs);
      g.fillStyle = 'rgba(40,22,14,0.35)';
      g.beginPath();
      g.ellipse(fx + 22 * fs, fy + 3 * fs, 24 * fs, 2.2 * fs, 0, 0, Math.PI * 2);
      g.fill();
    }

    // Atmospheric haze between layers.
    if (L.haze > 0) {
      const hz = g.createLinearGradient(0, H * (L.base - 0.06), 0, H * (L.base + 0.2));
      hz.addColorStop(0, `rgba(244,210,172,${L.haze})`);
      hz.addColorStop(1, 'rgba(244,210,172,0)');
      g.fillStyle = hz;
      g.fillRect(0, H * (L.base - 0.06), W, H * 0.26);
    }
  });

  // Film grain.
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
    g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }

  // Gentle vignette.
  const vg = g.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(20,8,0,0.4)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ---------------------------------------------------------------- seat model

// Origin: floor level at seat centre. Faces -z, backrest toward +z.
function buildChairGeometry() {
  const parts = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);

  // Baked vertex shade: up-facing faces are lifted so the chair reads from above.
  const shade = (geo, base) => {
    const n = geo.attributes.normal;
    const col = new Float32Array(n.count * 3);
    for (let i = 0; i < n.count; i++) {
      const k = base * (1 + 0.3 * Math.max(n.getY(i), 0));
      col[i * 3] = k;
      col[i * 3 + 1] = k;
      col[i * 3 + 2] = k;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(geo);
  };

  const place = (geo, x, y, z, base = 1) => {
    m.compose(new THREE.Vector3(x, y, z), q.identity(), one);
    geo.applyMatrix4(m);
    shade(geo, base);
  };

  // Pedestal and cushion.
  place(new THREE.BoxGeometry(0.34, 0.36, 0.4), 0, 0.18, 0.02, 0.6);
  place(new THREE.BoxGeometry(0.46, 0.14, 0.5), 0, 0.43, -0.03);

  // Armrests.
  for (const sx of [-1, 1]) {
    place(new THREE.BoxGeometry(0.07, 0.07, 0.46), sx * 0.255, 0.62, -0.02, 0.85);
    place(new THREE.BoxGeometry(0.05, 0.26, 0.2), sx * 0.255, 0.49, 0.1, 0.6);
  }

  // Backrest, tilted back about its base, with a rounded top roll.
  const tilt = 0.2;
  const pivotY = 0.44;
  const pivotZ = 0.2;
  const bh = 0.56;
  const back = new THREE.BoxGeometry(0.5, bh, 0.1);
  back.translate(0, bh / 2, 0);
  back.applyMatrix4(
    new THREE.Matrix4()
      .makeTranslation(0, pivotY, pivotZ)
      .multiply(new THREE.Matrix4().makeRotationX(tilt))
  );
  shade(back, 0.95);

  const roll = new THREE.CylinderGeometry(0.05, 0.05, 0.5, 10);
  roll.rotateZ(Math.PI / 2);
  roll.translate(0, bh, 0);
  roll.applyMatrix4(
    new THREE.Matrix4()
      .makeTranslation(0, pivotY, pivotZ)
      .multiply(new THREE.Matrix4().makeRotationX(tilt))
  );
  shade(roll, 1.1);

  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

// ---------------------------------------------------------------- scene

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.setClearColor(0x070708, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070708);

  const camera = new THREE.PerspectiveCamera(OVER_FOV, 390 / 844, 0.05, 120);
  const disposables = [];
  const track = (o) => {
    disposables.push(o);
    return o;
  };

  // ---- hall dimensions, all derived from HALL
  const rows = HALL.rows.length;
  const rise = HALL.rowRise;
  const pitch = HALL.rowPitch;
  const B = HALL.bounds;
  const wallX = HALL.halfWidth + 1.2;
  const depthEnd = B.maxZ + 1.5;
  const screenTop = HALL.screen.bottom + HALL.screen.height;
  const ceilY = screenTop + 1.2;
  const archWidth = wallX * 2;
  const sw = HALL.screen.width;
  const sy = SCREEN_CENTER.y;

  // ---- lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  scene.add(new THREE.HemisphereLight(0xffe8dc, 0x40282c, 0.5));
  const top = new THREE.DirectionalLight(0xfff0e4, 0.9);
  top.position.set(0.3, 1, 0.5);
  scene.add(top);
  // Warm spill from the screen onto the front rows (soft decay, no cutoff).
  [
    [-sw * 0.3, sy - 0.8, 2.0, 5],
    [sw * 0.3, sy - 0.8, 2.0, 5],
    [0, sy, B.minZ + 1.5, 4],
  ].forEach(([x, y, z, k]) => {
    const l = new THREE.PointLight(0xffb272, k, 0, 1.2);
    l.position.set(x, y, z);
    scene.add(l);
  });

  // ---- architecture
  const carpet = track(new THREE.MeshStandardMaterial({ color: 0x1c1417, roughness: 1 }));
  const wallMat = track(new THREE.MeshStandardMaterial({ color: 0x100c12, roughness: 1 }));
  const blackMat = track(new THREE.MeshBasicMaterial({ color: 0x000000 }));
  const ceilMat = track(new THREE.MeshBasicMaterial({ color: 0x050506 }));
  const stripMat = track(new THREE.MeshBasicMaterial({ color: 0x9a6430 }));

  const addBox = (w, h, d, x, y, z, mat) => {
    const geo = track(new THREE.BoxGeometry(w, h, d));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    return mesh;
  };

  // Flat floor in front of the first row.
  const frontEnd = HALL.firstRowZ - pitch / 2;
  addBox(archWidth, 0.5, frontEnd, 0, -0.25, frontEnd / 2, carpet);
  // One step per row.
  for (let i = 0; i < rows; i++) {
    const zc = HALL.firstRowZ + i * pitch;
    const z0 = zc - pitch / 2;
    const z1 = i === rows - 1 ? depthEnd : zc + pitch / 2;
    const topY = i * rise;
    addBox(archWidth, topY + 0.5, z1 - z0, 0, (topY - 0.5) / 2, (z0 + z1) / 2, carpet);
    if (i > 0) addBox(archWidth, 0.025, 0.03, 0, topY - 0.04, z0 + 0.015, stripMat);
  }

  const addPlane = (w, h, x, y, z, rotY, rotX, mat) => {
    const geo = track(new THREE.PlaneGeometry(w, h));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rotX, rotY, 0);
    scene.add(mesh);
  };
  // Single-sided planes: invisible from outside, so the overview sees inside.
  addPlane(archWidth, ceilY, 0, ceilY / 2, 0, 0, 0, blackMat); // behind the screen
  addPlane(depthEnd, ceilY, -wallX, ceilY / 2, depthEnd / 2, Math.PI / 2, 0, wallMat);
  addPlane(depthEnd, ceilY, wallX, ceilY / 2, depthEnd / 2, -Math.PI / 2, 0, wallMat);
  addPlane(archWidth, ceilY, 0, ceilY / 2, depthEnd, Math.PI, 0, wallMat);
  addPlane(archWidth, depthEnd, 0, ceilY, depthEnd / 2, 0, Math.PI / 2, ceilMat); // ceiling, faces down

  // ---- screen
  const screenTex = track(paintScreen(HALL.screen.width / HALL.screen.height));
  const screenGeo = track(new THREE.PlaneGeometry(HALL.screen.width, HALL.screen.height));
  const screenMat = track(new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false, fog: false }));
  const screen = new THREE.Mesh(screenGeo, screenMat);
  screen.position.set(0, HALL.screen.bottom + HALL.screen.height / 2, 0.02);
  scene.add(screen);

  // ---- seats
  const chairGeo = track(buildChairGeometry());
  const seatMat = track(
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, vertexColors: true })
  );
  const selMat = track(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(MINT).multiplyScalar(0.6),
      emissive: 0x3a9d68,
      emissiveIntensity: 1,
      roughness: 0.7,
      toneMapped: false,
      vertexColors: true,
    })
  );

  const SCALE = { standard: new THREE.Vector3(1, 1, 1), recliner: new THREE.Vector3(1.06, 1.04, 1.12) };
  const COLORS = {
    standard: new THREE.Color(0xa81220),
    recliner: new THREE.Color(0x6e0c28),
    standardTaken: new THREE.Color(0x6d0b15),
    reclinerTaken: new THREE.Color(0x48081a),
  };
  const colorOf = (seat) => COLORS[seat.taken ? `${seat.type}Taken` : seat.type];

  const groups = {};
  ['standard', 'recliner'].forEach((type) => {
    const list = SEATS.filter((s) => s.type === type);
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(chairGeo, seatMat, list.length);
    mesh.frustumCulled = false;
    groups[type] = { mesh, list };
    scene.add(mesh);
  });

  const slot = new Map(); // seat id -> { mesh, index }
  const identity = new THREE.Quaternion();
  const matrixOf = (seat) =>
    new THREE.Matrix4().compose(new THREE.Vector3(seat.x, seat.y, seat.z), identity, SCALE[seat.type]);
  const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

  Object.values(groups).forEach(({ mesh, list }) => {
    list.forEach((seat, i) => {
      slot.set(seat.id, { mesh, index: i });
      mesh.setMatrixAt(i, matrixOf(seat));
      mesh.setColorAt(i, colorOf(seat));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  });

  function refreshColors() {
    Object.values(groups).forEach(({ mesh, list }) => {
      list.forEach((seat, i) => mesh.setColorAt(i, colorOf(seat)));
      mesh.instanceColor.needsUpdate = true;
    });
  }

  const selMesh = new THREE.Mesh(chairGeo, selMat);
  selMesh.visible = false;
  scene.add(selMesh);

  let selected = null;
  let viewerInside = false;

  function setInstance(seat, hidden) {
    const s = slot.get(seat.id);
    if (!s) return;
    s.mesh.setMatrixAt(s.index, hidden ? hiddenMatrix : matrixOf(seat));
    s.mesh.instanceMatrix.needsUpdate = true;
  }

  function setSelected(seat) {
    if (selected) setInstance(selected, false);
    selected = seat || null;
    refreshColors();
    if (selected) {
      setInstance(selected, true);
      selMesh.position.set(selected.x, selected.y, selected.z);
      selMesh.scale.copy(SCALE[selected.type]);
    }
    selMesh.visible = !!selected && !viewerInside;
  }

  // ---- camera poses
  const cur = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), fov: OVER_FOV };
  let aspect = 390 / 844;
  let viewH = 844;

  const overTarget = new THREE.Vector3(
    (B.minX + B.maxX) / 2,
    ((rows - 1) * rise) / 2 + 0.4,
    ((B.minZ + B.maxZ) / 2) * 0.88
  );

  function overheadPose(target, scale = 1, extraMargin = 0) {
    const tv = Math.tan(THREE.MathUtils.degToRad(OVER_FOV) / 2);
    const th = tv * aspect;
    const halfW = HALL.halfWidth + 0.25 + extraMargin;
    const halfDepth = (B.maxZ - B.minZ) / 2 + 1.5;
    const dFit = halfW / th; // never closer than the full seat width allows
    const d = Math.max(dFit, Math.max(dFit, (halfDepth * 0.95) / tv) * scale);
    return {
      pos: target.clone().addScaledVector(OVER_DIR, d),
      tgt: target.clone(),
      fov: OVER_FOV,
    };
  }

  // Bottom inset: CSS px at the bottom of the canvas covered by the UI sheet.
  let insetFrom = 300;
  let insetTo = 300;
  let insetT0 = 0;
  const INSET_MS = 300;
  function insetNow(now) {
    const k = clamp01((now - insetT0) / INSET_MS);
    return insetFrom + (insetTo - insetFrom) * easeInOutCubic(k);
  }
  function setBottomInset(px) {
    const now = performance.now();
    insetFrom = insetNow(now);
    insetTo = Math.max(0, Number(px) || 0);
    insetT0 = now;
  }

  // Seated pose. Yaw looks at the screen centre. Pitch and vertical FOV are
  // solved so that, in canvas pixel rows (0 = top, H = bottom):
  //   - the screen top edge lands at TOP_PX, and
  //   - the top of the backrests of the row in front lands at
  //     yS = TOP_PX + BACK_BAND * (visibleHeight - TOP_PX),
  // where visibleHeight = H - inset. With axis pitch p, vertical half-angle
  // tangent t and NDC row v = 1 - 2y / H, a ray at elevation a hits
  // tan(a - p) = v * t. Two rays give two equations; if the solved FOV falls
  // outside [30, 80] degrees it is clamped and pitch is fitted to the screen
  // top only (the backrests then sit nearer the bottom edge).
  function seatedPose(seat, inset) {
    const eye = eyePosition(seat);
    const H = viewH;
    const visH = Math.max(160, H - inset);
    const yT = Math.min(TOP_PX, visH * 0.2);
    const yS = yT + BACK_BAND * (visH - yT);
    const vT = 1 - (2 * yT) / H;
    const vS = 1 - (2 * yS) / H;

    const hx = -eye.x;
    const hz = -eye.z;
    const dh = Math.hypot(hx, hz);
    const aT = Math.atan2(screenTop - eye.y, dh);
    const backTop = seat.y - rise + 0.99;
    const aS = Math.atan2(backTop - eye.y, pitch);

    const g = (p) => Math.tan(aT - p) * vS - Math.tan(aS - p) * vT;
    const lim = THREE.MathUtils.degToRad(84);
    const step = THREE.MathUtils.degToRad(0.25);
    const lo = THREE.MathUtils.degToRad(-60);
    const hi = THREE.MathUtils.degToRad(60);
    const minT = Math.tan(THREE.MathUtils.degToRad(MIN_SEATED_FOV / 2));
    const maxT = Math.tan(THREE.MathUtils.degToRad(MAX_SEATED_FOV / 2));
    let pitchA = null;
    let t = 0;
    let rawT = null;
    let prevP = null;
    let prevG = 0;
    for (let p = lo; p <= hi && pitchA === null; p += step) {
      if (Math.abs(aT - p) >= lim || Math.abs(aS - p) >= lim) {
        prevP = null;
        continue;
      }
      const gv = g(p);
      if (prevP !== null && prevG * gv <= 0) {
        let a = prevP;
        let b = p;
        for (let i = 0; i < 24; i++) {
          const mid = (a + b) / 2;
          if (g(a) * g(mid) <= 0) b = mid;
          else a = mid;
        }
        const root = (a + b) / 2;
        const tt = Math.tan(aT - root) / vT;
        if (rawT === null && tt > 0) rawT = tt;
        if (tt >= minT && tt <= maxT) {
          pitchA = root;
          t = tt;
        }
      }
      prevP = p;
      prevG = gv;
    }
    if (pitchA === null) {
      // Clamp the FOV and fit pitch to the screen top.
      t = Math.min(maxT, Math.max(minT, rawT === null ? maxT : rawT));
      pitchA = aT - Math.atan(vT * t);
    }

    const len = dh || 1;
    const cp = Math.cos(pitchA);
    const dir = new THREE.Vector3((hx / len) * cp, Math.sin(pitchA), (hz / len) * cp);
    return {
      pos: new THREE.Vector3(eye.x, eye.y, eye.z),
      tgt: new THREE.Vector3(eye.x, eye.y, eye.z).addScaledVector(dir, 10),
      fov: THREE.MathUtils.radToDeg(2 * Math.atan(t)),
    };
  }

  const setCur = (p) => {
    cur.pos.copy(p.pos);
    cur.tgt.copy(p.tgt);
    cur.fov = p.fov;
  };
  const snap = () => ({ pos: cur.pos.clone(), tgt: cur.tgt.clone(), fov: cur.fov });

  setCur(overheadPose(overTarget));
  let mode = 'overhead'; // 'overhead' | 'seated' | 'anim'
  let seatedSeat = null;

  // ---- animation
  let anim = null;

  function cancelAnim() {
    if (anim) {
      const done = anim.resolve;
      anim = null;
      done();
    }
  }

  function run(segs, finalMode) {
    cancelAnim();
    mode = 'anim';
    return new Promise((resolve) => {
      anim = { segs, i: 0, t0: performance.now(), from: snap(), resolve, finalMode };
    });
  }

  function stepAnim(now) {
    if (!anim) return;
    const seg = anim.segs[anim.i];
    const to = seg.toFn ? seg.toFn(now) : seg.to;
    const k = clamp01((now - anim.t0) / seg.dur);
    const e = easeInOutCubic(k);
    cur.pos.lerpVectors(anim.from.pos, to.pos, e);
    cur.tgt.lerpVectors(anim.from.tgt, to.tgt, e);
    cur.fov = anim.from.fov + (to.fov - anim.from.fov) * e;
    if (seg.enterAt !== undefined && k >= seg.enterAt && !viewerInside) {
      viewerInside = true;
      selMesh.visible = false;
    }
    if (k >= 1) {
      anim.from = { pos: to.pos.clone(), tgt: to.tgt.clone(), fov: to.fov };
      anim.i++;
      anim.t0 = now;
      if (anim.i >= anim.segs.length) {
        const done = anim.resolve;
        mode = anim.finalMode;
        anim = null;
        done();
      }
    }
  }

  function flyToSeat(seat) {
    viewerInside = false;
    seatedSeat = seat;
    setSelected(seat);
    const focus = new THREE.Vector3(overTarget.x, seat.y + 0.3, seat.z - 0.5);
    const close = overheadPose(focus, 0.85, 0.2);
    return run(
      [
        { dur: 1100, to: close },
        { dur: 1500, toFn: (now) => seatedPose(seat, insetNow(now)), enterAt: 0.55 },
      ],
      'seated'
    );
  }

  function leaveSeat() {
    viewerInside = false;
    selMesh.visible = !!selected;
    return run([{ dur: 1200, to: overheadPose(overTarget) }], 'overhead');
  }

  // ---- sizing
  function resize() {
    const w = canvas.clientWidth || 390;
    const h = canvas.clientHeight || 844;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    aspect = w / h;
    viewH = h;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (mode === 'overhead' && !anim) setCur(overheadPose(overTarget));
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  // ---- loop
  let raf = 0;
  let disposed = false;
  let lastFov = -1;

  function frame(ts) {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    stepAnim(now);
    if (mode === 'seated' && seatedSeat) setCur(seatedPose(seatedSeat, insetNow(now)));

    camera.position.copy(cur.pos);
    if (mode === 'seated') {
      const t = ts / 1000;
      camera.position.x += Math.sin(t * 0.55) * 0.004 + Math.sin(t * 1.3) * 0.0015;
      camera.position.y += Math.sin(t * 0.8 + 1.1) * 0.003;
    }
    camera.up.set(0, 1, 0);
    camera.lookAt(cur.tgt);
    if (cur.fov !== lastFov) {
      camera.fov = cur.fov;
      camera.updateProjectionMatrix();
      lastFov = cur.fov;
    }
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnim();
    cancelAnimationFrame(raf);
    observer.disconnect();
    disposables.forEach((d) => d.dispose && d.dispose());
    Object.values(groups).forEach(({ mesh }) => mesh.dispose());
    renderer.dispose();
  }

  return { flyToSeat, leaveSeat, setSelected, setBottomInset, dispose };
}
