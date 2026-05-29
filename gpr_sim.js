/* ================================================================
    GPR SIMULATOR v4 — GPU.js + Three.js
    Accelerated synthesis with GPU compute and 3D rendering
    ================================================================ */

// GPU.js will be initialized lazily when needed
// (Three.js rendering is GPU-accelerated via WebGL)
let gpu = null;

const C = 3e8; // m/s

// ── PRESETS ────────────────────────────────────────────────────────
const PRESETS = {
  dry: {
    general: {
      alt: 50,
      fMin: 140e6,
      fMax: 800e6,
      fStep: 1.1e6,
      dwell: 2.5e-6,
      cycle: 0.0015,
    },
    focus: {
      alt: 20,
      fMin: 801e6,
      fMax: 1500e6,
      fStep: 2.0e6,
      dwell: 3.0e-6,
      cycle: 0.001049,
    },
    extreme: {
      alt: 20,
      fMin: 1501e6,
      fMax: 3000e6,
      fStep: 2.0e6,
      dwell: 5.0e-6,
      cycle: 0.003748,
    },
  },
  wet: {
    general: {
      alt: 50,
      fMin: 140e6,
      fMax: 600e6,
      fStep: 1.1e6,
      dwell: 6.0e-6,
      cycle: 0.002509,
    },
    focus: {
      alt: 20,
      fMin: 601e6,
      fMax: 1000e6,
      fStep: 3.0e6,
      dwell: 10.0e-6,
      cycle: 0.00133,
    },
    extreme: {
      alt: 20,
      fMin: 1001e6,
      fMax: 1500e6,
      fStep: 3.0e6,
      dwell: 15.0e-6,
      cycle: 0.002495,
    },
  },
};
const SOIL = {
  dry: { er: 4.0, sigma: 0.001, name: "Dry Soil" },
  wet: { er: 20.0, sigma: 0.05, name: "Wet Soil" },
};

// World: 20 m along-track × 10 m cross-track
const WX = 20; // world X extent (m)
const WZ = 10; // world Z extent (m)
const NT = 400; // traces per B-scan
const NS = 512; // time samples per trace

// Each B-scan covers SCAN_W metres along-track
const SCAN_W = 10.0; // metres of terrain shown per B-scan

const TEMPLATES = [
  {
    type: "pipe",
    label: "Metal Pipe",
    color: "#ff3333",
    eps: 1,
    strong: true,
    refl: 0.95,
  },
  {
    type: "void",
    label: "Air Void",
    color: "#44aaff",
    eps: 1,
    strong: false,
    refl: 0.5,
  },
  {
    type: "rock",
    label: "Rock/Boulder",
    color: "#aacc55",
    eps: 6,
    strong: false,
    refl: 0.3,
  },
  {
    type: "water",
    label: "Water Pocket",
    color: "#2299ff",
    eps: 80,
    strong: false,
    refl: 0.65,
  },
  {
    type: "cable",
    label: "Cable/Conduit",
    color: "#ff88cc",
    eps: 2,
    strong: true,
    refl: 0.8,
  },
  {
    type: "root",
    label: "Tree Root",
    color: "#cc8833",
    eps: 12,
    strong: false,
    refl: 0.2,
  },
];

const state = {
  soil: "dry",
  mode: "general",
  xPos: 0,
  zPos: 100, // slider values 0-200
  gain: 0,
  tw: 25,
  clip: 98,
  dewow: true,
  agc: false,
  grid: true,
  wiggle: false,
  cmap: "seismic",
  world: null,
  cache: new Map(),
  userObjs: [],
  curTr: 200,
};

// ── THREE.JS SETUP & GPU RENDERING ────────────────────────────────
let threeScene, threeCamera, threeRenderer, bscanCanvas, bscanCtx;
let offscreenBscanTexture = null;
let bscanMesh = null;
let lastWidth = 0,
  lastHeight = 0;

function initThreeJS() {
  const container = document.getElementById("sa");
  const W = Math.max(1, container.clientWidth - 44);
  const H = Math.max(1, container.clientHeight);

  // Hide the old canvas if it exists
  const oldCanvas = document.getElementById("bc");
  if (oldCanvas) {
    oldCanvas.style.display = "none";
  }

  // Clean up old renderer if it exists
  if (threeRenderer) {
    container.removeChild(threeRenderer.domElement);
  }

  // Scene setup
  threeScene = new THREE.Scene();
  threeScene.background = new THREE.Color(0x0b0d10);

  // Camera
  threeCamera = new THREE.OrthographicCamera(
    -W / 2,
    W / 2,
    H / 2,
    -H / 2,
    0.1,
    1000,
  );
  threeCamera.position.z = 5;

  // Renderer with GPU acceleration
  threeRenderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
  });
  threeRenderer.setSize(W, H);
  threeRenderer.setPixelRatio(window.devicePixelRatio);
  threeRenderer.domElement.style.display = "block";
  threeRenderer.domElement.style.position = "absolute";
  threeRenderer.domElement.style.top = "0";
  threeRenderer.domElement.style.left = "44px";
  threeRenderer.domElement.style.zIndex = "1";
  container.appendChild(threeRenderer.domElement);

  // Create HTML5 canvas for B-scan data
  bscanCanvas = document.createElement("canvas");
  bscanCanvas.width = W;
  bscanCanvas.height = H;
  bscanCtx = bscanCanvas.getContext("2d", { willReadFrequently: true });

  // Create texture from canvas
  offscreenBscanTexture = new THREE.CanvasTexture(bscanCanvas);
  offscreenBscanTexture.minFilter = THREE.LinearFilter;
  offscreenBscanTexture.magFilter = THREE.LinearFilter;

  // Remove old mesh if it exists
  if (bscanMesh) {
    threeScene.remove(bscanMesh);
  }

  // Create plane mesh with the texture
  const geom = new THREE.PlaneGeometry(W, H);
  const mat = new THREE.MeshBasicMaterial({ map: offscreenBscanTexture });
  bscanMesh = new THREE.Mesh(geom, mat);
  threeScene.add(bscanMesh);

  lastWidth = W;
  lastHeight = H;
}

function renderToThreeJS() {
  const container = document.getElementById("sa");
  const W = Math.max(1, container.clientWidth - 44);
  const H = Math.max(1, container.clientHeight);

  // Reinitialize if window size changed significantly
  if (
    !threeRenderer ||
    Math.abs(W - lastWidth) > 5 ||
    Math.abs(H - lastHeight) > 5
  ) {
    initThreeJS();
    return;
  }

  // Update camera
  threeCamera.left = -W / 2;
  threeCamera.right = W / 2;
  threeCamera.top = H / 2;
  threeCamera.bottom = -H / 2;
  threeCamera.updateProjectionMatrix();

  // Update renderer size
  threeRenderer.setSize(W, H);

  // Render Three.js scene
  threeRenderer.render(threeScene, threeCamera);
}

// ── PRNG ──────────────────────────────────────────────────────────
function prng(seed) {
  let s = seed | 0;
  return () => {
    s = (s ^ (s << 13)) >>> 0;
    s = (s ^ (s >>> 17)) >>> 0;
    s = (s ^ (s << 5)) >>> 0;
    return s / 4294967296;
  };
}

// ── COLOURMAP ─────────────────────────────────────────────────────
function buildLUT(name, N = 512) {
  const lut = new Uint8Array(N * 3);
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    let r, g, b;
    switch (name) {
      case "seismic":
      default: {
        // blue→white→red (classic GPR)
        if (t < 0.5) {
          const s = t * 2;
          r = Math.round(s * 255);
          g = Math.round(s * 255);
          b = 255;
        } else {
          const s = (t - 0.5) * 2;
          r = 255;
          g = Math.round((1 - s) * 255);
          b = Math.round((1 - s) * 255);
        }
        break;
      }
      case "rdbu": {
        const c = [
          [5, 48, 97],
          [33, 102, 172],
          [92, 182, 217],
          [247, 247, 247],
          [244, 165, 130],
          [178, 24, 43],
          [103, 0, 31],
        ];
        const idx = t * (c.length - 1);
        const lo = idx | 0,
          hi = Math.min(lo + 1, c.length - 1),
          f = idx - lo;
        r = Math.round(c[lo][0] * (1 - f) + c[hi][0] * f);
        g = Math.round(c[lo][1] * (1 - f) + c[hi][1] * f);
        b = Math.round(c[lo][2] * (1 - f) + c[hi][2] * f);
        break;
      }
      case "bwr": {
        if (t < 0.5) {
          const s = t * 2;
          r = Math.round(s * 255);
          g = Math.round(s * 255);
          b = 255;
        } else {
          const s = (t - 0.5) * 2;
          r = 255;
          g = Math.round((1 - s) * 255);
          b = Math.round((1 - s) * 255);
        }
        break;
      }
      case "gray": {
        const v = Math.round(t * 255);
        r = g = b = v;
        break;
      }
      case "hot": {
        r = Math.min(255, Math.round(t * 3 * 255));
        g = Math.min(255, Math.max(0, Math.round((t - 1 / 3) * 3 * 255)));
        b = Math.min(255, Math.max(0, Math.round((t - 2 / 3) * 3 * 255)));
        break;
      }
    }
    lut[i * 3] = r;
    lut[i * 3 + 1] = g;
    lut[i * 3 + 2] = b;
  }
  return lut;
}
let LUT = buildLUT("seismic");

// ── WORLD GENERATOR ───────────────────────────────────────────────
function makeWorld(seed) {
  const rng = prng(seed);

  // ── Large objects ────────────────────────────────────────────
  const objs = [];
  const n = 6 + Math.floor(rng() * 6);
  for (let i = 0; i < n; i++) {
    const tmpl = TEMPLATES[Math.floor(rng() * TEMPLATES.length)];
    objs.push({
      ...tmpl,
      id: "w" + i,
      auto: true,
      // World 3D position
      wx: 1 + rng() * (WX - 2), // along-track (m)
      wz: 0.5 + rng() * (WZ - 1), // cross-track (m)
      depth: 0.3 + rng() * 1.5, // centre depth (m) — DEEPER for better hyperbolas
      // radius used only for 3D falloff, not for amplitude suppression
      radius: 0.05 + rng() * 0.15,
    });
  }

  // ── Micro-scatterers (clutter, pebbles, roots) ────────────────
  const micro = [];
  const nm = 100 + Math.floor(rng() * 150);
  for (let i = 0; i < nm; i++) {
    micro.push({
      wx: rng() * WX,
      wz: rng() * WZ,
      depth: 0.05 + rng() * 2.0,
      refl: 0.03 + rng() * 0.12,
      radius: 0.005 + rng() * 0.025,
    });
  }

  // ── Soil layers ────────────────────────────────────────────────
  const layers = [];
  const nl = 2 + Math.floor(rng() * 3);
  for (let l = 0; l < nl; l++) {
    layers.push({
      baseDepth: 0.2 + l * 0.4 + rng() * 0.15,
      ampX: 0.03 + rng() * 0.07,
      ampZ: 0.02 + rng() * 0.05,
      freqX: 0.4 + rng() * 2.0,
      freqZ: 0.3 + rng() * 1.5,
      phX: rng() * Math.PI * 2,
      phZ: rng() * Math.PI * 2,
      refl: 0.08 + rng() * 0.18,
      roughSeed: (rng() * 1e7) | 0,
    });
  }

  return { seed, objs, micro, layers };
}

// ── RICKER WAVELET ────────────────────────────────────────────────
function ricker(t, t0, fc, amp) {
  const u = Math.PI * fc * (t - t0);
  const env = Math.exp(-u * u * 0.5);
  return amp * Math.cos(2 * u) * env;
}

// ── SYNTHESISE B-SCAN ─────────────────────────────────────────────
//  xStart : world-X of first trace (m)
//  zLine  : world-Z of this scan line (m)  — cross-track position
function synth(xStart, zLine) {
  const p = PRESETS[state.soil][state.mode];
  const sp = SOIL[state.soil];
  const v = C / Math.sqrt(sp.er); // wave velocity in medium
  const fc = (p.fMin + p.fMax) / 2; // centre frequency
  const tw = state.tw * 1e-9; // time window (s)
  const dt = tw / NS;
  const dx = SCAN_W / NT; // trace spacing (m)

  const data = new Float32Array(NT * NS);
  const W = state.world;
  if (!W) return data;

  // ── Helper: add Ricker wavelet to trace t at arrival time t0 ──
  function addWavelet(trIdx, t0, amp, fcMod) {
    if (t0 >= tw || t0 < 0) return;
    const fc2 = fcMod || fc;
    // Only need to fill samples near the wavelet (±3 half-widths)
    const halfW = 3 / fc2;
    const sStart = Math.max(0, Math.floor((t0 - halfW) / dt));
    const sEnd = Math.min(NS - 1, Math.ceil((t0 + halfW) / dt));
    const base = trIdx * NS;
    for (let s = sStart; s <= sEnd; s++) {
      data[base + s] += ricker(s * dt, t0, fc2, amp);
    }
  }

  // ── 1. Direct wave band — flat horizontal wavelets at top of scan ─
  // In real GPR this is the air/ground coupling pulse: a strong flat
  // band of 3–4 oscillation cycles pinned to the top few nanoseconds.
  const tDirect = (2 * (p.alt * 0.01)) / C;
  const fcDirect = fc * 1.8;
  const gap = 0.55 / fcDirect;
  // Reduce direct wave amplitude to prevent it from interfering with other signals
  for (let t = 0; t < NT; t++) {
    addWavelet(t, tDirect, 0.15, fcDirect);
    addWavelet(t, tDirect + gap, 0.06, fcDirect);
    addWavelet(t, tDirect + gap * 2, 0.015, fcDirect);
  }

  // ── 2. Thermal + system noise (very low level) ────────────────
  const nrng = prng(((xStart * 100) | 0) ^ ((zLine * 137) | 0) ^ 0xf00baa);
  // Store noise values for later re-application to keep it visible above strong signals
  const noiseBuffer = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) {
    const noiseVal = (nrng() - 0.5) * 0.000012;
    noiseBuffer[i] = noiseVal;
    data[i] += noiseVal;
  }

  // ── 3. (no correlated noise — keep scan clean) ────────────────
  // ── 3. Faint continuous soil layering ────────────────────────
  const lrng = prng(((xStart * 71) | 0) ^ ((zLine * 113) | 0));
  W.layers.forEach((layer) => {
    const rrng = prng(layer.roughSeed ^ ((zLine * 99) | 0));
    for (let t = 0; t < NT; t++) {
      const traceX = xStart + t * dx;
      const fx = traceX / WX;
      const fz = zLine / WZ;
      const w1 =
        Math.sin(fx * Math.PI * 2 * layer.freqX + layer.phX) *
        Math.cos(fz * Math.PI * 2 * layer.freqZ + layer.phZ);
      const rough = (rrng() - 0.5) * 0.008;
      const d = Math.max(0.03, layer.baseDepth + layer.ampX * w1 * 0.3 + rough);
      const tArr = (2 * d) / v;
      if (tArr >= tw) continue;
      const att = Math.exp(-d * sp.sigma * 6) * 0.008;
      addWavelet(t, tArr, layer.refl * att * 0.15, fc * 0.6); // was 0.4
    }
  });

  // ── 4. LARGE OBJECTS — hyperbola synthesis ────────────────────
  // Only objects whose scan line passes very close to them (within
  // their radius) produce a strong, clearly visible hyperbola.
  // Objects further away produce an extremely faint ghost so the
  // scan doesn't look completely empty but they don't dominate.

  const allObjs = [
    ...W.objs,
    ...state.userObjs.map((o) => ({
      ...o,
      wx: o.xFrac * WX,
      wz: o.zFrac * WZ,
      depth: o.depthM,
      radius: 0.1,
    })),
  ];

  allObjs.forEach((obj) => {
    const offZ = obj.wz - zLine;

    // Hard beam-width gate: objects beyond 2–3× their radius are essentially invisible.
    const beamSigma = Math.max(obj.radius, 0.12);
    const zFalloff = Math.exp(-(offZ * offZ) / (2 * beamSigma * beamSigma));

    // Only process objects that are actually close to the scan line (eliminates ghosts)
    if (zFalloff < 0.08) return;

    const effDepth = Math.sqrt(obj.depth * obj.depth + offZ * offZ);

    // Objects right under the scan line get full amplitude.
    // Objects at the beam edge (zFalloff ~0.08) get reduced amplitude — barely visible.
    // Apply an extra power so the falloff is sharp rather than gradual.
    const ampScale = Math.pow(zFalloff, 3);
    // User objects should be ghostly (much fainter); world objects are real
    const isUserObj = state.userObjs.some((u) => u.id === obj.id);
    const ampMult = isUserObj ? 0.08 : 0.3;
    const baseAmp = obj.refl * ampScale * ampMult;

    for (let t = 0; t < NT; t++) {
      const traceX = xStart + t * dx;
      const dX = traceX - obj.wx;
      const slant = Math.sqrt(dX * dX + effDepth * effDepth);
      const tArr = (2 * slant) / v;
      if (tArr >= tw * 0.98) continue;

      const depthAtt = Math.exp(-effDepth * sp.sigma * 5);
      const horizAtt = Math.exp(-(dX * dX) / (2 * effDepth * effDepth * 4.0));
      // Smooth attenuation as hyperbola extends deeper: exponential decay with time
      const tailFade = Math.exp(-(tArr / tw) * (tArr / tw) * 2.5);
      const amp = baseAmp * depthAtt * horizAtt * tailFade;

      addWavelet(t, tArr, amp, fc);

      if (obj.strong) {
        if (tArr + 1.2 / fc < tw * 0.98) {
          const tailFade2 = Math.exp(
            -((tArr + 1.2 / fc) / tw) * ((tArr + 1.2 / fc) / tw) * 2.5,
          );
          addWavelet(t, tArr + 1.2 / fc, amp * 0.35 * tailFade2, fc);
        }
        if (tArr + 2.4 / fc < tw * 0.98) {
          const tailFade3 = Math.exp(
            -((tArr + 2.4 / fc) / tw) * ((tArr + 2.4 / fc) / tw) * 2.5,
          );
          addWavelet(t, tArr + 2.4 / fc, amp * 0.12 * tailFade3, fc);
        }
      }
    }
  });

  // ── 5. Micro-scatterers — just tiny background texture, very faint
  W.micro.forEach((m) => {
    const offZ = m.wz - zLine;
    const sigma = Math.max(m.radius, 0.05);
    const zFall = Math.exp(-(offZ * offZ) / (2 * sigma * sigma));
    if (zFall < 0.5) return;
    const effD = Math.sqrt(m.depth * m.depth + offZ * offZ);
    const baseAmp = m.refl * zFall * 0.004;

    for (let t = 0; t < NT; t++) {
      const dX = xStart + t * dx - m.wx;
      const slant = Math.sqrt(dX * dX + effD * effD);
      const tArr = (2 * slant) / v;
      if (tArr >= tw * 0.98) continue;
      const att = Math.exp(-effD * sp.sigma * 4);
      const tailFade = Math.exp(-(tArr / tw) * (tArr / tw) * 2.5);
      addWavelet(t, tArr, baseAmp * att * tailFade, fc * (0.8 + 0.4 * nrng()));
    }
  });
  // ── 6. Re-blend noise to ensure it stays visible above all signals ────────
  // This prevents strong hyperbolas from drowning out the thermal background
  for (let i = 0; i < data.length; i++) {
    data[i] = data[i] * 0.98 + noiseBuffer[i] * 0.02;
  }

  // ── 7. Dewow: remove DC/low-freq component per time sample ────
  if (state.dewow) {
    for (let s = 0; s < NS; s++) {
      let mean = 0;
      for (let t = 0; t < NT; t++) mean += data[t * NS + s];
      mean /= NT;
      for (let t = 0; t < NT; t++) data[t * NS + s] -= mean;
    }
  }

  // ── 8. AGC: trace-by-trace running-RMS gain ───────────────────
  if (state.agc) {
    // Compute global RMS for this trace as a floor
    const win = Math.max(16, (NS * 0.08) | 0);
    const agcStartSample = (NS * 0.05) | 0;

    for (let t = 0; t < NT; t++) {
      // Global RMS floor for this trace
      let globalRms = 0;
      for (let s = 0; s < NS; s++) globalRms += data[t * NS + s] ** 2;
      globalRms = Math.sqrt(globalRms / NS);

      for (let s = agcStartSample; s < NS; s++) {
        let rms = 0,
          cnt = 0;

        for (let k = -win; k <= win; k++) {
          const sk = s + k;
          if (sk >= 0 && sk < NS) {
            rms += data[t * NS + sk] ** 2;
            cnt++;
          }
        }
        const localRms = Math.sqrt(rms / cnt);
        // Blend local and global RMS — prevents runaway gain in dead zones
        const effectiveRms = localRms * 0.6 + globalRms * 0.4;
        data[t * NS + s] /= effectiveRms + 0.003;
      }
    }
  }

  // ── 9. User gain ──────────────────────────────────────────────
  if (state.gain !== 0) {
    const g = Math.pow(10, state.gain / 20);
    for (let i = 0; i < data.length; i++) data[i] *= g;
  }

  return data;
}

// ── CACHE ─────────────────────────────────────────────────────────
const CMAX = 60;
function getLine(xStart, zLine) {
  const key = xStart.toFixed(2) + "_" + zLine.toFixed(3);
  if (state.cache.has(key)) {
    const v = state.cache.get(key);
    state.cache.delete(key);
    state.cache.set(key, v);
    return v;
  }
  const d = synth(xStart, zLine);
  state.cache.set(key, d);
  if (state.cache.size > CMAX)
    state.cache.delete(state.cache.keys().next().value);
  return d;
}

function xStart() {
  return (state.xPos / 200) * (WX - SCAN_W);
}
function zLine() {
  return (state.zPos / 200) * WZ;
}
function curData() {
  return getLine(xStart(), zLine());
}

// ── RENDER ────────────────────────────────────────────────────────
function render() {
  const wrap = document.getElementById("sa");
  const W = Math.max(1, wrap.clientWidth - 44);
  const H = Math.max(1, wrap.clientHeight);

  if (!threeRenderer) {
    initThreeJS();
  }

  const data = curData();

  // Compute scale excluding direct wave band
  const sorted = Float32Array.from(data).sort();
  const hi = sorted[Math.floor((state.clip / 100) * (sorted.length - 1))];
  const lo =
    sorted[Math.floor(((100 - state.clip) / 100) * (sorted.length - 1))];
  const scale = Math.max(1e-8, Math.max(Math.abs(lo), Math.abs(hi))) * 2.8;

  bscanCtx.fillStyle = "#000";
  bscanCtx.fillRect(0, 0, W, H);

  if (!state.wiggle) {
    const imgData = bscanCtx.createImageData(W, H);
    const pix = imgData.data;
    const LN = LUT.length / 3;

    for (let py = 0; py < H; py++) {
      const sf = (py / (H - 1)) * (NS - 1);
      const s0 = sf | 0,
        s1 = Math.min(s0 + 1, NS - 1),
        sa = sf - s0,
        osa = 1 - sa;

      for (let px = 0; px < W; px++) {
        const tf = (px / (W - 1)) * (NT - 1);
        const t0 = tf | 0,
          t1 = Math.min(t0 + 1, NT - 1),
          ta = tf - t0,
          ota = 1 - ta;
        const val =
          data[t0 * NS + s0] * ota * osa +
          data[t1 * NS + s0] * ta * osa +
          data[t0 * NS + s1] * ota * sa +
          data[t1 * NS + s1] * ta * sa;

        // Attenuate direct wave in display so it doesn't blow out the scale
        const norm = Math.max(0, Math.min(1, (val / scale + 1) * 0.5));
        const ci = ((norm * (LN - 1)) | 0) * 3;
        const i4 = (py * W + px) * 4;
        pix[i4] = LUT[ci];
        pix[i4 + 1] = LUT[ci + 1];
        pix[i4 + 2] = LUT[ci + 2];
        pix[i4 + 3] = 255;
      }
    }
    bscanCtx.putImageData(imgData, 0, 0);
  } else {
    const nd = Math.min(100, NT),
      tw2 = W / nd;
    for (let i = 0; i < nd; i++) {
      const ti = Math.floor((i / nd) * (NT - 1));
      const cx = i * tw2 + tw2 / 2;
      bscanCtx.fillStyle = "rgba(0,229,255,.08)";
      bscanCtx.beginPath();
      bscanCtx.moveTo(cx, 0);
      for (let py = 0; py < H; py++) {
        const si = Math.floor((py / H) * (NS - 1));
        bscanCtx.lineTo(
          cx + Math.max(0, data[ti * NS + si] / scale) * (tw2 * 0.48),
          py,
        );
      }
      bscanCtx.lineTo(cx, H);
      bscanCtx.fill();
      bscanCtx.strokeStyle = "rgba(0,229,255,.6)";
      bscanCtx.lineWidth = 0.8;
      bscanCtx.beginPath();
      for (let py = 0; py < H; py++) {
        const si = Math.floor((py / H) * (NS - 1));
        const x = cx + (data[ti * NS + si] / scale) * (tw2 * 0.48);
        py === 0 ? bscanCtx.moveTo(x, py) : bscanCtx.lineTo(x, py);
      }
      bscanCtx.stroke();
    }
  }

  if (state.grid) drawGridToCanvas(bscanCtx, W, H);

  offscreenBscanTexture.needsUpdate = true;
  renderToThreeJS();

  drawXRuler(W);
  drawZRuler(H);
  drawMinimap();
  drawATrace(state.curTr);
  updateSBar();
}

function drawGridToCanvas(ctx, W, H) {
  const sp = SOIL[state.soil],
    v = C / Math.sqrt(sp.er),
    tw = state.tw * 1e-9;
  ctx.font = "9px Share Tech Mono";
  for (let g = 1; g <= 6; g++) {
    const f = g / 7,
      py = Math.round(f * H);
    ctx.strokeStyle = "rgba(29,37,48,.8)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(W, py);
    ctx.stroke();
    const dep = (((v * f * tw) / 2) * 100).toFixed(0);
    const ns = (f * tw * 1e9).toFixed(1);
    ctx.fillStyle = "rgba(74,90,106,.9)";
    ctx.fillText(`${dep}cm / ${ns}ns`, 3, py - 2);
  }
  for (let g = 1; g < 10; g++) {
    const px = Math.round((g / 10) * W);
    ctx.strokeStyle = "rgba(29,37,48,.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, H);
    ctx.stroke();
  }
}

function drawXRuler(W) {
  const c = document.getElementById("xrc");
  c.width = W + 44;
  c.height = 20;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#12151a";
  ctx.fillRect(0, 0, c.width, 20);
  ctx.fillStyle = "#1d2530";
  ctx.fillRect(0, 19, c.width, 1);
  ctx.font = "9px Share Tech Mono";
  ctx.fillStyle = "#4a5a6a";
  const x0 = xStart(),
    x1 = x0 + SCAN_W;
  for (let i = 0; i <= 10; i++) {
    const px = 44 + Math.round((i / 10) * W);
    const xm = (x0 + (i / 10) * (x1 - x0)).toFixed(1);
    ctx.fillStyle = "#1d2530";
    ctx.fillRect(px, 15, 1, 5);
    ctx.fillStyle = "#4a5a6a";
    ctx.textAlign = "center";
    ctx.fillText(xm + "m", px, 13);
  }
  ctx.textAlign = "left";
  ctx.fillText("X (m)", 2, 13);
}

function drawZRuler(H) {
  const c = document.getElementById("zrc");
  c.width = 44;
  c.height = H;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 44, H);
  const sp = SOIL[state.soil],
    v = C / Math.sqrt(sp.er),
    tw = state.tw * 1e-9;
  ctx.font = "9px Share Tech Mono";
  for (let i = 0; i <= 8; i++) {
    const f = i / 8,
      py = Math.round(f * H);
    const ns = (f * tw * 1e9).toFixed(0);
    const dep = (((v * f * tw) / 2) * 100).toFixed(0);
    ctx.strokeStyle = "#1d2530";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(34, py);
    ctx.lineTo(44, py);
    ctx.stroke();
    ctx.fillStyle = "#4a5a6a";
    ctx.textAlign = "right";
    ctx.fillText(ns, 42, Math.max(9, py - 1));
    if (i > 0 && i < 8) {
      ctx.fillStyle = "#2a3540";
      ctx.fillText(dep + "c", 42, py + 9);
    }
  }
  ctx.save();
  ctx.translate(9, H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = "#4a5a6a";
  ctx.textAlign = "center";
  ctx.fillText("ns", 0, 0);
  ctx.restore();
}

function drawMinimap() {
  const el = document.getElementById("mmc");
  const W = el.parentElement.clientWidth,
    H = el.parentElement.clientHeight;
  el.width = W;
  el.height = H;
  const ctx = el.getContext("2d");
  ctx.fillStyle = "#0b0d10";
  ctx.fillRect(0, 0, W, H);

  // Faint grid
  ctx.strokeStyle = "#1d2530";
  ctx.lineWidth = 0.5;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo((i / 4) * W, 0);
    ctx.lineTo((i / 4) * W, H);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, (i / 4) * H);
    ctx.lineTo(0, (i / 4) * H); // dummy
    ctx.moveTo(0, (i / 4) * H);
    ctx.lineTo(W, (i / 4) * H);
    ctx.stroke();
  }

  const W2 = state.world;
  if (!W2) return;

  // Micro-scatterers as faint dots
  ctx.fillStyle = "rgba(74,90,106,.3)";
  W2.micro.forEach((m) =>
    ctx.fillRect((m.wx / WX) * W - 0.5, (m.wz / WZ) * H - 0.5, 1, 1),
  );

  // Large objects
  W2.objs.forEach((o) => {
    const px = (o.wx / WX) * W,
      py = (o.wz / WZ) * H;
    ctx.fillStyle = o.color + "cc";
    ctx.beginPath();
    ctx.arc(px, py, Math.max(2.5, (o.radius / WX) * W * 6), 0, Math.PI * 2);
    ctx.fill();
  });

  // User objects
  state.userObjs.forEach((o) => {
    ctx.fillStyle = o.color;
    ctx.beginPath();
    ctx.arc(o.xFrac * W, o.zFrac * H, 3.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Current scan line (cross-track = fixed Z)
  const bz = (zLine() / WZ) * H;
  ctx.strokeStyle = "rgba(255,107,0,.8)";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 2]);
  ctx.beginPath();
  ctx.moveTo(0, bz);
  ctx.lineTo(W, bz);
  ctx.stroke();
  ctx.setLineDash([]);

  // Scan window along-track
  const bx0 = (xStart() / WX) * W,
    bx1 = ((xStart() + SCAN_W) / WX) * W;
  ctx.strokeStyle = "rgba(0,229,255,.55)";
  ctx.lineWidth = 1;
  ctx.strokeRect(bx0, bz - 4, bx1 - bx0, 8);

  ctx.fillStyle = "#4a5a6a";
  ctx.font = "7px Share Tech Mono";
  ctx.textAlign = "left";
  ctx.fillText("WORLD VIEW", 2, 8);
}

function drawATrace(ti) {
  const c = document.getElementById("tc");
  const W = c.parentElement.clientWidth,
    H = c.parentElement.clientHeight;
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#0b0d10";
  ctx.fillRect(0, 0, W, H);

  const data = curData();
  const t = Math.max(0, Math.min(NT - 1, ti));
  let mx = 0;
  for (let s = 0; s < NS; s++) mx = Math.max(mx, Math.abs(data[t * NS + s]));
  if (mx < 1e-10) mx = 1;

  // Grid lines
  ctx.strokeStyle = "#1d2530";
  ctx.lineWidth = 0.8;
  for (let g = 1; g < 4; g++) {
    ctx.beginPath();
    ctx.moveTo((g / 4) * W, 0);
    ctx.lineTo((g / 4) * W, H);
    ctx.stroke();
  }
  ctx.strokeStyle = "#2a3540";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, H);
  ctx.stroke();

  // Positive fill
  ctx.fillStyle = "rgba(0,229,255,.09)";
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  for (let s = 0; s < NS; s++) {
    ctx.lineTo(
      W / 2 + Math.max(0, data[t * NS + s] / mx) * (W / 2 - 3),
      (s / NS) * H,
    );
  }
  ctx.lineTo(W / 2, H);
  ctx.fill();

  // Trace
  ctx.strokeStyle = "#00e5ff";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let s = 0; s < NS; s++) {
    const x = W / 2 + (data[t * NS + s] / mx) * (W / 2 - 3),
      y = (s / NS) * H;
    s === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.fillStyle = "#4a5a6a";
  ctx.font = "9px Share Tech Mono";
  ctx.textAlign = "left";
  ctx.fillText(`TR ${t}`, 3, 11);
  const sp = SOIL[state.soil],
    v = C / Math.sqrt(sp.er);
  ctx.fillStyle = "#2a3540";
  ctx.fillText(`v=${(v / 1e8).toFixed(3)}m/ns`, 3, 21);
}

function updateSBar() {
  const p = PRESETS[state.soil][state.mode];
  document.getElementById("sbt").textContent = NT;
  document.getElementById("sbdt").textContent =
    (state.tw / NS).toFixed(2) + "ns";
  document.getElementById("sbf").textContent =
    `${(p.fMin / 1e6).toFixed(0)}–${(p.fMax / 1e6).toFixed(0)}MHz`;
  document.getElementById("sbx").textContent = xStart().toFixed(1) + "m";
  document.getElementById("sbz").textContent = zLine().toFixed(2) + "m";
}

function updateGPR() {
  const p = PRESETS[state.soil][state.mode];
  document.getElementById("gpp").innerHTML = `
    <div class="ikv"><span class="k">Altitude</span><span class="v">${p.alt} cm</span></div>
    <div class="ikv"><span class="k">f-min</span><span class="v">${(p.fMin / 1e6).toFixed(0)} MHz</span></div>
    <div class="ikv"><span class="k">f-max</span><span class="v">${(p.fMax / 1e6).toFixed(0)} MHz</span></div>
    <div class="ikv"><span class="k">Step</span><span class="v">${(p.fStep / 1e6).toFixed(1)} MHz</span></div>
    <div class="ikv"><span class="k">Dwell</span><span class="v">${(p.dwell * 1e6).toFixed(2)} μs</span></div>
    <div class="ikv"><span class="k">Cycle</span><span class="v">${(p.cycle * 1000).toFixed(3)} ms</span></div>`;
  const sp = SOIL[state.soil],
    v = C / Math.sqrt(sp.er);
  document.getElementById("minfo").innerHTML = `
    <div class="ikv"><span class="k">Soil</span><span class="v">${sp.name}</span></div>
    <div class="ikv"><span class="k">εr</span><span class="v">${sp.er}</span></div>
    <div class="ikv"><span class="k">v (m/ns)</span><span class="v">${(v / 1e8).toFixed(3)}</span></div>
    <div class="ikv"><span class="k">World</span><span class="v">${WX}×${WZ} m</span></div>`;
}

function updateLegend() {
  const g = {
    seismic: "linear-gradient(to right,#0000ff,#fff,#ff0000)",
    rdbu: "linear-gradient(to right,#053061,#2166ac,#f7f7f7,#d6604d,#67001f)",
    bwr: "linear-gradient(to right,#0000ff,#fff,#ff0000)",
    gray: "linear-gradient(to right,#000,#fff)",
    hot: "linear-gradient(to right,#000,#f00,#ff0,#fff)",
  };
  document.getElementById("legbar").style.background =
    g[state.cmap] || g.seismic;
}

function setStatus(txt, col) {
  const d = document.getElementById("sdot");
  d.style.background = col;
  d.style.boxShadow = `0 0 5px ${col}`;
  document.getElementById("stxt").textContent = txt;
}

function renderObjList() {
  const el = document.getElementById("ol");
  el.innerHTML = "";
  state.userObjs.forEach((o) => {
    const row = document.createElement("div");
    row.className = "oi";
    row.innerHTML = `<div class="oc" style="background:${o.color}"></div>
      <div class="on">${o.label}</div>
      <div class="od">d=${o.depthM.toFixed(2)}m</div>
      <button class="ox" data-id="${o.id}">✕</button>`;
    el.appendChild(row);
  });
  el.querySelectorAll(".ox").forEach((b) =>
    b.addEventListener("click", () => {
      state.userObjs = state.userObjs.filter((o) => o.id !== b.dataset.id);
      state.cache.clear();
      renderObjList();
      render();
    }),
  );
}

// ── EVENTS ────────────────────────────────────────────────────────
document.getElementById("ssel").addEventListener("change", (e) => {
  state.soil = e.target.value;
  state.cache.clear();
  updateGPR();
  render();
});
document.getElementById("msel").addEventListener("change", (e) => {
  state.mode = e.target.value;
  state.cache.clear();
  updateGPR();
  render();
});
document.getElementById("cmsel").addEventListener("change", (e) => {
  state.cmap = e.target.value;
  LUT = buildLUT(e.target.value);
  updateLegend();
  render();
});

document.getElementById("xs").addEventListener("input", (e) => {
  state.xPos = +e.target.value;
  document.getElementById("xv").textContent = xStart().toFixed(1) + " m";
  render();
});
document.getElementById("zs").addEventListener("input", (e) => {
  state.zPos = +e.target.value;
  document.getElementById("zv").textContent = zLine().toFixed(2) + " m";
  render();
});
document.getElementById("gs").addEventListener("input", (e) => {
  state.gain = +e.target.value;
  document.getElementById("gv").textContent = state.gain + " dB";
  state.cache.clear();
  render();
});
document.getElementById("tws").addEventListener("input", (e) => {
  state.tw = +e.target.value;
  document.getElementById("twv").textContent = state.tw + " ns";
  state.cache.clear();
  render();
});
document.getElementById("cs").addEventListener("input", (e) => {
  state.clip = +e.target.value;
  document.getElementById("cv").textContent =
    (+e.target.value).toFixed(1) + "%";
  render();
});
document.getElementById("cdewow").addEventListener("change", (e) => {
  state.dewow = e.target.checked;
  state.cache.clear();
  render();
});
document.getElementById("cagc").addEventListener("change", (e) => {
  state.agc = e.target.checked;
  state.cache.clear();
  render();
});
document.getElementById("cgrid").addEventListener("change", (e) => {
  state.grid = e.target.checked;
  render();
});
document.getElementById("cwiggle").addEventListener("change", (e) => {
  state.wiggle = e.target.checked;
  render();
});

document.getElementById("bregen").addEventListener("click", () => {
  setStatus("GENERATING…", "#ffcc00");
  setTimeout(() => {
    state.world = makeWorld(Math.floor(Math.random() * 999999));
    state.cache.clear();
    render();
    setStatus("READY", "#39ff14");
  }, 20);
});
document.getElementById("bexp").addEventListener("click", () => {
  // Export from Three.js WebGL canvas
  const canvas = threeRenderer.domElement;
  const a = document.createElement("a");
  a.download = `bscan_${state.soil}_${state.mode}_x${xStart().toFixed(1)}_z${zLine().toFixed(2)}.png`;
  a.href = canvas.toDataURL();
  a.click();
});
document.getElementById("badd").addEventListener("click", () => {
  const tmpl = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
  const rng2 = prng(Date.now());
  state.userObjs.push({
    ...tmpl,
    id: Math.random().toString(36).slice(2),
    xFrac: 0.1 + rng2() * 0.8,
    zFrac: rng2(),
    depthM: 0.3 + rng2() * 1.2,
    radius: 0.1 + rng2() * 0.1,
  });
  state.cache.clear();
  renderObjList();
  render();
});

// Hover crosshair + A-scan
const sa = document.getElementById("sa");
sa.addEventListener("mousemove", (e) => {
  const r = sa.getBoundingClientRect();
  const mx = e.clientX - r.left - 44,
    my = e.clientY - r.top;
  const W = r.width - 44,
    H = r.height;
  if (mx < 0) return;
  document.getElementById("chh").style.cssText =
    `display:block;top:${my}px;left:44px;right:0;height:1px`;
  document.getElementById("chv").style.cssText =
    `display:block;left:${mx + 44}px;top:0;bottom:0;width:1px`;

  const ti = Math.round((mx / W) * (NT - 1));
  const sf = my / H;
  const sp = SOIL[state.soil],
    v = C / Math.sqrt(sp.er),
    tw = state.tw * 1e-9;
  const t = sf * tw,
    d = (v * t) / 2;
  const xm = (xStart() + (mx / W) * SCAN_W).toFixed(2);

  state.curTr = Math.max(0, Math.min(NT - 1, ti));

  const data = curData();
  const si = Math.round(sf * (NS - 1));
  const amp =
    data[state.curTr * NS + Math.max(0, Math.min(NS - 1, si))].toFixed(4);

  document.getElementById("hi").style.display = "block";
  document.getElementById("hi").innerHTML =
    `X: ${xm} m<br>TIME: ${(t * 1e9).toFixed(1)} ns<br>DEPTH: ${(d * 100).toFixed(1)} cm<br>AMP: ${amp}`;
  document.getElementById("sbc").textContent =
    `TR:${ti}|${(t * 1e9).toFixed(1)}ns|${(d * 100).toFixed(1)}cm`;
  drawATrace(state.curTr);
});
sa.addEventListener("mouseleave", () => {
  document.getElementById("chh").style.display = "none";
  document.getElementById("chv").style.display = "none";
  document.getElementById("hi").style.display = "none";
  document.getElementById("sbc").textContent = "—";
});

new ResizeObserver(() => render()).observe(sa);

// ── BOOT ──────────────────────────────────────────────────────────
async function boot() {
  const lb = document.getElementById("lbar"),
    lm = document.getElementById("lmsg");
  const steps = [
    [15, "LOADING COLORMAPS…"],
    [30, "BUILDING 3D WORLD…"],
    [50, "PLACING OBJECTS & MICRO-SCATTERERS…"],
    [68, "COMPUTING SOIL LAYERS…"],
    [83, "SYNTHESISING SFCW RESPONSE…"],
    [95, "APPLYING DEWOW + AGC…"],
    [100, "READY"],
  ];
  for (const [p, m] of steps) {
    lb.style.width = p + "%";
    lm.textContent = m;
    await new Promise((r) => setTimeout(r, 140));
  }
  initThreeJS();
  setStatus("GENERATING…", "#ffcc00");
  setTimeout(() => {
    state.world = makeWorld(Math.floor(Math.random() * 999999));
    state.cache.clear();
    render();
    setStatus("READY", "#39ff14");
  }, 20);

  state.cmap = "gray";
  LUT = buildLUT("gray");
  document.getElementById("cmsel").value = "gray";

  updateGPR();
  updateLegend();
  document.getElementById("xv").textContent = "0.0 m";
  document.getElementById("zv").textContent = (WZ / 2).toFixed(2) + " m";

  const ld = document.getElementById("ld");
  ld.style.transition = "opacity .35s";
  ld.style.opacity = "0";
  await new Promise((r) => setTimeout(r, 380));
  ld.style.display = "none";

  render();
  setStatus("READY", "#39ff14");
}
boot();
