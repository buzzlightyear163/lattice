// The specimen: a crystal lattice rendered with WebGL.
// Exposed: nodes vibrate, defects flicker red, strain shows as Michel-Lévy interference colour.
// Sealed: a lock wave crosses the crystal, body-centred nodes grow in, everything goes still.
// The canvas is fixed. The crystal flies between DOM elements marked [data-specimen-slot]
// (hero scope, vault chamber, token, and a small corner companion), always showing the visitor's own key.
import * as THREE from 'three';
import { interferenceTable } from './lib/michel.js';
import { clamp, lerp, easeInOut, smooth, prefersReducedMotion } from './lib/format.js';

const R_OCTA = 6; // |x|+|y|+|z| <= R
const T_CUBE = 4; // max(|x|,|y|,|z|) <= T  → truncated octahedron habit

const inCrystal = (x, y, z) => Math.abs(x) + Math.abs(y) + Math.abs(z) <= R_OCTA + 1e-6 && Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) <= T_CUBE + 1e-6;

const COMMON = /* glsl */ `
  uniform float uTime;
  uniform float uWave;
  uniform float uWaveActive;
  uniform float uStrain;
  uniform float uAgitate;
  uniform float uOpacity;
  uniform float uCenterZ;
  uniform float uDepthRange;
  uniform float uIntro;
  uniform sampler2D uTex;

  float h1(float s) { return fract(sin(s * 12.9898) * 43758.5453); }
  vec3 jitter(vec3 b, float seed, float t) {
    vec3 p = b * 0.37;
    vec3 d = vec3(
      sin(t * 1.31 + seed * 6.283 + p.y * 2.1 + p.z * 1.3),
      sin(t * 1.73 + seed * 4.117 + p.z * 1.7 + p.x * 2.3),
      sin(t * 1.17 + seed * 2.931 + p.x * 1.9 + p.y * 1.1));
    d += 0.55 * vec3(
      sin(t * 3.1 + seed * 11.0 + p.z * 4.0),
      sin(t * 2.7 + seed * 7.0 + p.x * 3.6),
      sin(t * 3.7 + seed * 5.0 + p.y * 4.2));
    return d;
  }
  // 0 → scattered, 1 → assembled. Nodes arrive in a staggered order.
  float introE(float seed) {
    float e = clamp(uIntro * 1.55 - seed * 0.55, 0.0, 1.0);
    return 1.0 - pow(1.0 - e, 3.0);
  }
  float localLock(vec3 b) {
    float d = length(b);
    return smoothstep(d - 1.4, d + 0.1, uWave);
  }
  vec3 displaced(vec3 b, float seed, float defect, out float L, out float E) {
    L = localLock(b);
    E = introE(seed);
    vec3 dir = normalize(vec3(h1(seed + 0.11), h1(seed + 0.37), h1(seed + 0.73)) - 0.5 + 1e-3);
    vec3 scatter = dir * (7.0 + 9.0 * h1(seed + 0.91)) * (1.0 - E);
    float speed = 1.0 + uAgitate * 2.6;
    float amp = uStrain * (0.065 + defect * 0.26) * (1.0 + uAgitate * 1.6);
    vec3 j = jitter(b, seed, uTime * speed) * amp * (1.0 - L);
    float front = uWave - length(b);
    float kick = sin(clamp(front * 1.7, 0.0, 3.14159)) * exp(-max(front, 0.0) * 0.8) * uWaveActive;
    vec3 radial = normalize(b + vec3(1e-4)) * kick * 0.16;
    return b + scatter + j + radial;
  }
  float depthFade(vec4 mv) {
    return mix(0.2, 1.0, smoothstep(-1.1, 0.9, (mv.z - uCenterZ) / uDepthRange));
  }
  vec3 interference(float nm) {
    return texture2D(uTex, vec2(clamp(nm / 1600.0, 0.0, 1.0), 0.5)).rgb;
  }
  const vec3 QUARTZ = vec3(0.886, 0.906, 0.922);
  const vec3 RED = vec3(1.0, 0.255, 0.157);
`;

// Lines are instanced screen-space quads: crisp, anti-aliased, any width, on any screen.
const LINE_VS = /* glsl */ `
  ${COMMON}
  uniform vec2 uRes;
  uniform float uLineW;
  attribute vec2 aQuad;
  attribute vec3 aA;
  attribute vec3 aB;
  attribute float aSeedA;
  attribute float aSeedB;
  attribute float aDefA;
  attribute float aDefB;
  attribute float aDiag;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vAcross;
  varying float vHalfW;
  void main() {
    float LA, LB, EA, EB;
    vec3 pA = displaced(aA, aSeedA, aDefA, LA, EA);
    vec3 pB = displaced(aB, aSeedB, aDefB, LB, EB);
    float rest = length(aB - aA);
    float strain = abs(length(pB - pA) - rest) / rest;
    float lockv = min(LA, LB);
    float dfx = max(aDefA, aDefB);
    float nm = 120.0 + min(strain, 0.5) * 2600.0 + dfx * (430.0 + 240.0 * sin(uTime * 2.3 + aSeedA * 9.0));
    vec3 exposed = mix(QUARTZ * 0.42, interference(nm) * 1.12, 0.55 + 0.45 * dfx);
    vec3 sealed = QUARTZ * (aDiag > 0.5 ? 0.62 : 0.95);
    vec3 col = mix(exposed, sealed, lockv);
    vec3 mid = (aA + aB) * 0.5;
    float front = uWave - length(mid);
    float flash = exp(-front * front * 1.6) * uWaveActive;
    col += QUARTZ * flash * 0.9;

    vec4 mvA = modelViewMatrix * vec4(pA, 1.0);
    vec4 mvB = modelViewMatrix * vec4(pB, 1.0);
    vec4 cA = projectionMatrix * mvA;
    vec4 cB = projectionMatrix * mvB;
    vec2 sA = cA.xy / cA.w * 0.5 * uRes;
    vec2 sB = cB.xy / cB.w * 0.5 * uRes;
    vec2 dir = sB - sA;
    float len = length(dir);
    dir = len > 1e-4 ? dir / len : vec2(1.0, 0.0);
    vec2 nrm = vec2(-dir.y, dir.x);
    float w = uLineW * (aDiag > 0.5 ? 0.78 : 1.0) * (1.0 + flash * 0.8);
    float halfW = w * 0.5 + 1.0;
    vec4 c = mix(cA, cB, aQuad.x);
    vec2 off = nrm * aQuad.y * halfW + dir * (aQuad.x * 2.0 - 1.0) * 0.5;
    c.xy += off / (0.5 * uRes) * c.w;
    gl_Position = c;
    vAcross = aQuad.y * halfW;
    vHalfW = w * 0.5;

    vec4 mv = mix(mvA, mvB, aQuad.x);
    float E = min(EA, EB);
    float baseA = aDiag > 0.5 ? 0.15 * lockv : mix(0.5 + dfx * 0.3, 0.58, lockv);
    vColor = col;
    vAlpha = (baseA + flash * 0.4) * depthFade(mv) * uOpacity * E * E;
  }
`;

const LINE_FS = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vAcross;
  varying float vHalfW;
  void main() {
    float d = abs(vAcross);
    float cover = clamp(vHalfW + 0.5 - d, 0.0, 1.0) * min(1.0, vHalfW * 2.0);
    float a = vAlpha * cover;
    if (a < 0.003) discard;
    gl_FragColor = vec4(vColor * a, a);
  }
`;

const POINT_VS = /* glsl */ `
  ${COMMON}
  uniform float uSize;
  uniform float uHalo;
  uniform float uGlow;
  attribute float aSeed;
  attribute float aDefect;
  attribute float aFill;
  attribute float aByte;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float L, E;
    vec3 p = displaced(position, aSeed, aDefect, L, E);
    float disp = length(p - position) * step(0.999, E);
    vec3 exposed = mix(QUARTZ * 0.78, interference(disp * 3200.0 + 160.0), 0.45);
    float blink = 0.55 + 0.45 * sin(uTime * (5.0 + aSeed * 6.0) + aSeed * 30.0);
    exposed = mix(exposed, RED * (0.8 + blink * 0.6), aDefect);
    vec3 sealed = QUARTZ * mix(0.7, 1.15, aByte);
    vec3 col = mix(exposed, sealed, L);
    float front = uWave - length(position);
    float flash = exp(-front * front * 1.4) * uWaveActive;
    col += QUARTZ * flash;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float grow = mix(1.0, L, aFill);
    float size = uSize * (1.0 + aDefect * 0.8 * (1.0 - L)) * mix(1.0, 0.72, aFill) * grow * (1.0 + flash * 0.9);
    float a = depthFade(mv) * uOpacity * grow * (aFill > 0.5 ? 0.85 : 1.0) * E;
    if (uHalo > 0.5) {
      // soft glow: sealed nodes, red defects, and the wave front
      size *= 4.2;
      float g = uGlow * L * mix(0.5, 1.0, aByte) + aDefect * (1.0 - L) * 0.55 + flash * 0.9;
      a *= g * 0.16;
    }
    gl_PointSize = size * (14.0 / -mv.z);
    vColor = col;
    vAlpha = a;
  }
`;

const POINT_FS = /* glsl */ `
  uniform float uHalo;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c);
    float alpha;
    if (uHalo > 0.5) {
      alpha = exp(-r * r * 22.0) * vAlpha;
    } else {
      float a = smoothstep(0.5, 0.12, r);
      float core = smoothstep(0.22, 0.0, r);
      alpha = (a * 0.55 + core * 0.6) * vAlpha;
    }
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(vColor * alpha, alpha);
  }
`;

// Paper theme: black "eyepiece" windows drawn behind the crystal (circle or rect, anti-aliased).
const BACKDROP_VS = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const BACKDROP_FS = /* glsl */ `
  uniform float uShape;
  uniform float uR;
  uniform float uOpacity;
  uniform vec2 uPx;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv - 0.5;
    float d;
    float aa;
    if (uShape < 0.5) {
      d = length(p) - uR;
      aa = 1.0 / uPx.x;
    } else {
      vec2 q = abs(p) - vec2(0.5);
      d = max(q.x, q.y);
      aa = 0.0001;
    }
    float a = 1.0 - smoothstep(-aa, aa, d);
    float rr = length(p) / (uShape < 0.5 ? uR : 0.72);
    vec3 col = mix(vec3(0.05, 0.058, 0.066), vec3(0.004, 0.005, 0.006), smoothstep(0.0, 1.0, rr));
    float o = a * uOpacity;
    gl_FragColor = vec4(col * o, o);
  }
`;

const premultiplied = {
  transparent: true,
  depthWrite: false,
  depthTest: false,
  blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneMinusSrcAlphaFactor,
  blendEquation: THREE.AddEquation,
};

export class Specimen {
  constructor(canvas) {
    this.canvas = canvas;
    this.reduced = prefersReducedMotion();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
    this.camera.position.set(0, 0, 14);
    this.group = new THREE.Group();
    this.inner = new THREE.Group();
    this.group.add(this.inner);
    this.scene.add(this.group);

    this.slots = [];
    this.backdrops = [];
    this.paper = false;
    this.target = null;
    this.targetSince = 0;
    this.pos = new THREE.Vector3();
    this.scale = 1;
    this.hasPos = false;
    this.opacity = 0;
    this.targetOpacity = 0;
    this.locked = false;
    this.wave = -3;
    this.waveFrom = -3;
    this.waveTo = -3;
    this.waveT = 1;
    this.waveDur = 1.9;
    this.strain = 0.75;
    this.strainTarget = 0.75;
    this.agitate = 0;
    this.agitateTarget = 0;
    this.intro = this.reduced ? 1 : 0;
    this.introStarted = false;
    this.spin = 0.4;
    this.spinSpeed = 0.16;
    this.inertia = 0;
    this.dragTilt = 0;
    this.dragging = false;
    this.pulse = 1; // 0..1 progress of the lock "breath"
    this.glow = 0;
    this.tilt = { x: 0, y: 0, tx: 0, ty: 0 };
    this.velocityBoost = 0;
    this.onLocked = null;
    this.onSlot = null;
    this.time = 0;
    this.last = performance.now();

    this.build();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('pointermove', (e) => {
      this.tilt.tx = (e.clientY / innerHeight - 0.5) * 0.3;
      this.tilt.ty = (e.clientX / innerWidth - 0.5) * 0.4;
    });
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  build() {
    const nodes = [];
    const index = new Map();
    const key = (x, y, z) => `${x},${y},${z}`;
    const T = Math.ceil(T_CUBE);
    for (let x = -T; x <= T; x++)
      for (let y = -T; y <= T; y++)
        for (let z = -T; z <= T; z++) {
          if (!inCrystal(x, y, z)) continue;
          index.set(key(x, y, z), nodes.length);
          nodes.push({ p: [x, y, z], fill: 0 });
        }
    const cubicCount = nodes.length;
    for (let x = -T; x < T; x++)
      for (let y = -T; y < T; y++)
        for (let z = -T; z < T; z++) {
          const c = [x + 0.5, y + 0.5, z + 0.5];
          if (!inCrystal(...c)) continue;
          nodes.push({ p: c, fill: 1, cell: [x, y, z] });
        }
    this.count = nodes.length;
    this.cubicCount = cubicCount;
    this.radius = Math.max(...nodes.map((n) => Math.hypot(...n.p)));

    const rand = mulberry(7);
    for (const n of nodes) {
      n.seed = rand();
      n.byte = rand();
    }
    this.nodes = nodes;

    const edges = [];
    for (let i = 0; i < cubicCount; i++) {
      const [x, y, z] = nodes[i].p;
      for (const [dx, dy, dz] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
        const j = index.get(key(x + dx, y + dy, z + dz));
        if (j !== undefined) edges.push([i, j, 0]);
      }
    }
    for (let i = cubicCount; i < nodes.length; i++) {
      const [cx, cy, cz] = nodes[i].cell;
      for (const dx of [0, 1]) for (const dy of [0, 1]) for (const dz of [0, 1]) {
        const j = index.get(key(cx + dx, cy + dy, cz + dz));
        if (j !== undefined) edges.push([i, j, 1]);
      }
    }
    this.edges = edges;

    const tex = interferenceTable(512);
    const texData = new Uint8Array(512 * 4);
    for (let i = 0; i < 512; i++) {
      texData[i * 4] = tex[i * 3] * 255;
      texData[i * 4 + 1] = tex[i * 3 + 1] * 255;
      texData[i * 4 + 2] = tex[i * 3 + 2] * 255;
      texData[i * 4 + 3] = 255;
    }
    const dataTex = new THREE.DataTexture(texData, 512, 1, THREE.RGBAFormat);
    dataTex.magFilter = THREE.LinearFilter;
    dataTex.minFilter = THREE.LinearFilter;
    dataTex.needsUpdate = true;

    const shared = {
      uTime: { value: 0 },
      uWave: { value: -3 },
      uWaveActive: { value: 0 },
      uStrain: { value: this.strain },
      uAgitate: { value: 0 },
      uOpacity: { value: 0 },
      uCenterZ: { value: -14 },
      uDepthRange: { value: 4 },
      uIntro: { value: this.intro },
      uTex: { value: dataTex },
      uSize: { value: 3 },
      uGlow: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uLineW: { value: 1.5 },
    };
    this.uniforms = shared;

    // ---- points (+ a halo pass sharing the same geometry)
    const pg = new THREE.BufferGeometry();
    const pos = new Float32Array(nodes.length * 3);
    const seed = new Float32Array(nodes.length);
    const fill = new Float32Array(nodes.length);
    this.pDefect = new Float32Array(nodes.length);
    this.pByte = new Float32Array(nodes.length);
    nodes.forEach((n, i) => {
      pos.set(n.p, i * 3);
      seed[i] = n.seed;
      fill[i] = n.fill;
      this.pByte[i] = n.byte;
    });
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    pg.setAttribute('aFill', new THREE.BufferAttribute(fill, 1));
    pg.setAttribute('aDefect', new THREE.BufferAttribute(this.pDefect, 1));
    pg.setAttribute('aByte', new THREE.BufferAttribute(this.pByte, 1));
    this.pointGeo = pg;
    const pointMat = (halo) =>
      new THREE.ShaderMaterial({
        uniforms: { ...shared, uHalo: { value: halo ? 1 : 0 } },
        vertexShader: POINT_VS,
        fragmentShader: POINT_FS,
        ...premultiplied,
      });
    this.halo = new THREE.Points(pg, pointMat(true));
    this.points = new THREE.Points(pg, pointMat(false));
    this.halo.frustumCulled = false;
    this.points.frustumCulled = false;

    // ---- lines as instanced quads
    const E = edges.length;
    const lg = new THREE.InstancedBufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    lg.setAttribute('aQuad', new THREE.BufferAttribute(new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]), 2));
    lg.setIndex([0, 2, 1, 2, 3, 1]);
    const aA = new Float32Array(E * 3), aB = new Float32Array(E * 3);
    const sA = new Float32Array(E), sB = new Float32Array(E), dg = new Float32Array(E);
    this.lDefA = new Float32Array(E);
    this.lDefB = new Float32Array(E);
    edges.forEach(([a, b, diag], k) => {
      aA.set(nodes[a].p, k * 3);
      aB.set(nodes[b].p, k * 3);
      sA[k] = nodes[a].seed;
      sB[k] = nodes[b].seed;
      dg[k] = diag;
    });
    lg.setAttribute('aA', new THREE.InstancedBufferAttribute(aA, 3));
    lg.setAttribute('aB', new THREE.InstancedBufferAttribute(aB, 3));
    lg.setAttribute('aSeedA', new THREE.InstancedBufferAttribute(sA, 1));
    lg.setAttribute('aSeedB', new THREE.InstancedBufferAttribute(sB, 1));
    lg.setAttribute('aDiag', new THREE.InstancedBufferAttribute(dg, 1));
    lg.setAttribute('aDefA', new THREE.InstancedBufferAttribute(this.lDefA, 1));
    lg.setAttribute('aDefB', new THREE.InstancedBufferAttribute(this.lDefB, 1));
    lg.instanceCount = E;
    this.lineGeo = lg;
    this.lines = new THREE.Mesh(
      lg,
      new THREE.ShaderMaterial({ uniforms: shared, vertexShader: LINE_VS, fragmentShader: LINE_FS, ...premultiplied }),
    );
    this.lines.frustumCulled = false;

    this.inner.add(this.halo);
    this.inner.add(this.lines);
    this.inner.add(this.points);
    this.inner.rotation.set(0.55, 0.2, 0.12);
    this.setDefects(mulberry(42), 0.06);
  }

  setDefects(rand, frac) {
    this.pDefect.fill(0);
    let n = 0;
    for (let i = 0; i < this.cubicCount; i++) {
      if (rand() < frac) {
        this.pDefect[i] = 1;
        n++;
      }
    }
    this.defectCount = n;
    this.edges.forEach(([a, b], k) => {
      this.lDefA[k] = this.pDefect[a];
      this.lDefB[k] = this.pDefect[b];
    });
    this.pointGeo.attributes.aDefect.needsUpdate = true;
    this.lineGeo.attributes.aDefA.needsUpdate = true;
    this.lineGeo.attributes.aDefB.needsUpdate = true;
  }

  /** Exposure from a scan: older keys with more signatures vibrate harder and carry more defects. */
  setExposure(report) {
    const days = report ? report.days : 0;
    const sigs = report ? report.signatures : 0;
    const s = 0.55 + Math.min(0.35, Math.log10(1 + sigs) * 0.09) + Math.min(0.25, days / 3000);
    this.strainTarget = clamp(s, 0.45, 1.15);
    const frac = clamp(0.035 + Math.log10(1 + sigs) * 0.012 + days / 40000, 0.03, 0.11);
    const rand = report && report.bytes ? mulberryFromBytes(report.bytes) : mulberry(42);
    this.setDefects(rand, frac);
  }

  /** Imprints the forged public key on the crystal: node brightness follows key bytes. */
  setKeyBytes(bytes) {
    for (let i = 0; i < this.count; i++) this.pByte[i] = bytes[(i * 7) % bytes.length] / 255;
    this.pointGeo.attributes.aByte.needsUpdate = true;
  }

  lockAmount() {
    return clamp((this.wave + 3) / (this.radius + 6), 0, 1);
  }

  setAgitate(on) {
    this.agitateTarget = on ? 1 : 0;
  }

  lock() {
    this.locked = true;
    this.agitateTarget = 0;
    this.pulse = 0;
    this.animateWave(this.radius + 3, this.reduced ? 0.5 : this.waveDur);
  }

  unlock(instant = false) {
    this.locked = false;
    if (instant) this.snapWave(-3);
    else this.animateWave(-3, 0.9);
  }

  animateWave(to, dur) {
    this.waveFrom = this.wave;
    this.waveTo = to;
    this.waveT = 0;
    this.waveDur = dur;
  }

  snapWave(v) {
    this.wave = v;
    this.waveFrom = v;
    this.waveTo = v;
    this.waveT = 1;
  }

  addSlot(el) {
    this.slots.push({
      el,
      name: el.dataset.specimenSlot,
      fill: parseFloat(el.dataset.fill || '0.42'),
      corner: el.dataset.specimenSlot === 'corner',
    });
  }

  setPaper(on) {
    this.paper = !!on;
  }

  /** Paper theme: a dark window drawn under the crystal at this element. data-backdrop="circle:0.41" | "rect". */
  addBackdrop(el) {
    const [shape, r] = (el.dataset.backdrop || 'rect').split(':');
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uShape: { value: shape === 'circle' ? 0 : 1 },
        uR: { value: parseFloat(r || '0.5') },
        uOpacity: { value: 1 },
        uPx: { value: new THREE.Vector2(100, 100) },
      },
      vertexShader: BACKDROP_VS,
      fragmentShader: BACKDROP_FS,
      ...premultiplied,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.renderOrder = -10;
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.scene.add(mesh);
    this.backdrops.push({ el, mesh, follow: el.dataset.backdropFollow || null });
  }

  updateBackdrops(wpp) {
    const vh = innerHeight, vw = innerWidth;
    for (const b of this.backdrops) {
      const r = b.el.getBoundingClientRect();
      const on = this.paper && r.width > 0 && r.bottom > -20 && r.top < vh + 20;
      b.mesh.visible = on;
      if (!on) continue;
      b.mesh.position.set((r.left + r.width / 2 - vw / 2) * wpp, (vh / 2 - (r.top + r.height / 2)) * wpp, -0.01);
      b.mesh.scale.set(r.width * wpp, r.height * wpp, 1);
      const u = b.mesh.material.uniforms;
      u.uPx.value.set(r.width * this.dpr, r.height * this.dpr);
      // the corner window only exists while the crystal sits in it
      u.uOpacity.value = b.follow ? (this.target && this.target.name === b.follow ? this.opacity : 0) : 1;
    }
  }

  /** Elements that, while on screen, keep the corner companion hidden (e.g. the §1 sequence). */
  addSuppressor(el) {
    (this.suppressors ||= []).push(el);
  }

  /** Drag on this element rotates the crystal; release keeps spinning with inertia. */
  enableDrag(el) {
    let lx = 0, ly = 0, lt = 0, vx = 0;
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.dragging = true;
      lx = e.clientX; ly = e.clientY; lt = performance.now(); vx = 0;
      el.setPointerCapture(e.pointerId);
      el.classList.add('is-grabbing');
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const now = performance.now();
      const dx = e.clientX - lx, dy = e.clientY - ly;
      const dt = Math.max(8, now - lt) / 1000;
      lx = e.clientX; ly = e.clientY; lt = now;
      this.spin += dx * 0.0065;
      this.dragTilt = clamp(this.dragTilt + dy * 0.0045, -0.8, 0.8);
      vx = lerp(vx, (dx * 0.0065) / dt, 0.5);
      this.velocityBoost = Math.min(1, Math.abs(vx) / 6);
    });
    const end = (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.inertia = clamp(vx, -9, 9);
      el.classList.remove('is-grabbing');
      try { el.releasePointerCapture(e.pointerId); } catch {}
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  velocity(v) {
    this.velocityBoost = Math.max(this.velocityBoost, Math.min(1, Math.abs(v) / 40));
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, innerWidth < 760 ? 1.75 : 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.dpr = dpr;
    this.uniforms.uRes.value.set(innerWidth * dpr, innerHeight * dpr);
  }

  pickSlot() {
    const vh = innerHeight;
    let best = null, bestW = 0, bestRect = null;
    let corner = null, cornerRect = null;
    for (const s of this.slots) {
      const r = s.el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (s.corner) { corner = s; cornerRect = r; continue; }
      const visible = (Math.min(r.bottom, vh) - Math.max(r.top, 0)) / Math.min(r.height, vh);
      const w = smooth(0.1, 0.55, visible);
      if (w > bestW) { bestW = w; best = s; bestRect = r; }
    }
    // hysteresis: keep a big slot until it is clearly leaving
    const keep = this.target && !this.target.corner && best === this.target ? 0.18 : 0.42;
    if (best && bestW > keep) return { slot: best, rect: bestRect, w: Math.min(1, bestW * 1.25) };
    if (corner) {
      const suppressed = (this.suppressors || []).some((el) => {
        const r = el.getBoundingClientRect();
        return r.top < vh * 0.75 && r.bottom > vh * 0.25;
      });
      const nearTop = scrollY < vh * 0.35; // hero still owns the stage
      if (!suppressed && !nearTop) return { slot: corner, rect: cornerRect, w: 0.95 };
    }
    return null;
  }

  dock(dt, now) {
    const vh = innerHeight, vw = innerWidth;
    const pick = this.pickSlot();
    if (!pick) {
      this.targetOpacity = 0;
      if (this.target) {
        this.target = null;
        this.onSlot && this.onSlot(null);
      }
      return;
    }
    if (pick.slot !== this.target) {
      this.target = pick.slot;
      this.targetSince = now;
      this.onSlot && this.onSlot(pick.slot.name);
    }
    this.targetOpacity = pick.w;
    this.pickTarget = { x: 0, y: 0 };
    const visH = 2 * this.camera.position.z * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const wpp = visH / vh;
    const r = pick.rect;
    const tx = (r.left + r.width / 2 - vw / 2) * wpp;
    const ty = (vh / 2 - (r.top + r.height / 2)) * wpp;
    const worldR = Math.min(r.width, r.height) * pick.slot.fill * wpp;
    const ts = worldR / this.radius;
    if (!this.hasPos || this.opacity < 0.02) {
      this.pos.set(tx, ty, 0);
      this.scale = ts;
      this.hasPos = true;
    } else {
      // fly gently to a new slot, then stay glued to it while the page scrolls
      const flying = now - this.targetSince < 1100;
      const k = flying ? 5.5 : 16;
      const f = 1 - Math.exp(-dt * k);
      this.pos.x += (tx - this.pos.x) * f;
      this.pos.y += (ty - this.pos.y) * f;
      this.scale += (ts - this.scale) * f;
      // on paper the crystal is only legible inside a dark window, so it dims while in transit
      if (this.paper) {
        const d = Math.hypot(tx - this.pos.x, ty - this.pos.y) / Math.max(1e-4, this.radius * ts);
        this.targetOpacity *= clamp(1.15 - d * 0.9, 0.08, 1);
      }
    }
    this.pixelScale = this.scale / wpp;
  }

  loop(now) {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;

    if (this.waveT < 1) {
      this.waveT = Math.min(1, this.waveT + dt / this.waveDur);
      this.wave = lerp(this.waveFrom, this.waveTo, easeInOut(this.waveT));
      this.uniforms.uWaveActive.value = Math.sin(Math.PI * this.waveT) * (this.waveTo > this.waveFrom ? 1 : 0.3);
      if (this.waveT === 1 && this.waveTo > 0 && this.onLocked) this.onLocked();
    } else {
      this.uniforms.uWaveActive.value = 0;
    }
    if (this.pulse < 1) this.pulse = Math.min(1, this.pulse + dt / 1.6);

    this.dock(dt, now);
    this.opacity = lerp(this.opacity, this.targetOpacity, 1 - Math.exp(-dt * 6));
    const visH = 2 * this.camera.position.z * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.updateBackdrops(visH / innerHeight);
    const crystalOn = !(this.opacity < 0.003 && this.targetOpacity === 0);
    this.inner.visible = crystalOn;
    if (!crystalOn && !this.backdrops.some((b) => b.mesh.visible)) {
      this.renderer.clear();
      return;
    }
    // the assembly runs on wall-clock time so slow machines see the same 2.6 s intro
    if (!this.introStarted && this.opacity > 0.01) { this.introStarted = true; this.introT0 = now; }
    if (this.introStarted && this.intro < 1) this.intro = Math.min(1, (now - this.introT0) / 2600);

    const L = this.lockAmount();
    this.agitate = lerp(this.agitate, this.agitateTarget, 1 - Math.exp(-dt * 4));
    this.strain = lerp(this.strain, this.strainTarget, 1 - Math.exp(-dt * 2));
    this.velocityBoost *= Math.exp(-dt * 2.5);
    const motion = this.reduced ? 0.25 : 1;
    this.time += dt * (1 - L * 0.98) * motion * (1 + this.velocityBoost * 1.2 * (1 - L));

    // rotation: restless when exposed, near still when sealed; drag adds inertia
    const targetSpin = lerp(0.16, 0.022, L) * (this.reduced ? 0.4 : 1) * (1 + this.agitate * 2.2);
    this.spinSpeed = lerp(this.spinSpeed, targetSpin, 1 - Math.exp(-dt * 2));
    if (!this.dragging) {
      this.spin += (this.spinSpeed + this.inertia) * dt;
      this.inertia *= Math.exp(-dt * 1.6);
      this.dragTilt *= Math.exp(-dt * 0.35);
    }
    this.tilt.x = lerp(this.tilt.x, this.tilt.tx, 1 - Math.exp(-dt * 3));
    this.tilt.y = lerp(this.tilt.y, this.tilt.ty, 1 - Math.exp(-dt * 3));
    this.group.rotation.set(this.tilt.x + this.dragTilt, this.spin + this.tilt.y, 0);

    // the lock "breath": a short swell while the wave crosses
    const breath = this.pulse < 1 ? Math.sin(Math.PI * this.pulse) * 0.055 : 0;
    this.group.position.copy(this.pos);
    this.group.scale.setScalar(this.scale * (1 + breath));
    this.glow = lerp(this.glow, L, 1 - Math.exp(-dt * 1.5));

    const u = this.uniforms;
    u.uTime.value = this.time;
    u.uWave.value = this.wave;
    u.uStrain.value = this.strain * motion;
    u.uAgitate.value = this.agitate;
    u.uOpacity.value = this.opacity;
    u.uIntro.value = this.intro;
    u.uGlow.value = this.glow + breath * 6;
    const ps = this.pixelScale || 30;
    u.uSize.value = clamp(ps * 0.085, 1.6, 4.6) * this.dpr;
    u.uLineW.value = clamp(ps * 0.042, 0.75, 1.6) * this.dpr;
    const center = new THREE.Vector3();
    this.group.getWorldPosition(center);
    center.applyMatrix4(this.camera.matrixWorldInverse);
    u.uCenterZ.value = center.z;
    u.uDepthRange.value = this.radius * this.group.scale.x;

    this.renderer.render(this.scene, this.camera);
  }

  /** Rotation angle about the vertical axis, 0..180°, for the reticle readout. */
  theta() {
    const deg = ((this.group.rotation.y * 180) / Math.PI) % 180;
    return deg < 0 ? deg + 180 : deg;
  }
}

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function mulberryFromBytes(bytes) {
  let s = 0;
  for (let i = 0; i < bytes.length; i++) s = (Math.imul(s, 31) + bytes[i]) | 0;
  return mulberry(s);
}
