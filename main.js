import * as THREE from 'three';

// ─── Config ───
const PARTICLE_COUNT = 12000;
const FIELD_SIZE = 8;
const TRAIL_LENGTH = 80;

// ─── Time-of-day color palette ───
function getTimeColors() {
  const hour = new Date().getHours();
  // 5-8 dawn, 8-16 day, 16-19 dusk, 19-5 night
  if (hour >= 5 && hour < 8) {
    // Dawn - warm amber/rose
    return {
      warm: new THREE.Vector3(1.0, 0.78, 0.55),
      cool: new THREE.Vector3(0.85, 0.6, 0.75),
      glow: new THREE.Vector3(1.0, 0.85, 0.65),
    };
  } else if (hour >= 8 && hour < 16) {
    // Day - bright white-gold
    return {
      warm: new THREE.Vector3(1.0, 0.92, 0.75),
      cool: new THREE.Vector3(0.7, 0.82, 1.0),
      glow: new THREE.Vector3(1.0, 0.95, 0.88),
    };
  } else if (hour >= 16 && hour < 19) {
    // Dusk - deep amber/purple
    return {
      warm: new THREE.Vector3(1.0, 0.75, 0.5),
      cool: new THREE.Vector3(0.6, 0.5, 0.85),
      glow: new THREE.Vector3(1.0, 0.8, 0.6),
    };
  } else {
    // Night - deep blue/violet
    return {
      warm: new THREE.Vector3(0.7, 0.75, 1.0),
      cool: new THREE.Vector3(0.4, 0.45, 0.8),
      glow: new THREE.Vector3(0.75, 0.8, 1.0),
    };
  }
}

const timeColors = getTimeColors();

// ─── Setup ───
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.z = 5;

// ─── Mouse tracking & reveal state ───
const mouse = new THREE.Vector2(0, 0);
const mouseSmooth = new THREE.Vector2(0, 0);
let mouseActive = false;

const content = document.getElementById('content');
const hint = document.getElementById('hint');
const verse = document.getElementById('verse');
let revealed = false;
let moveCount = 0;
let hideTimer = null;
let hintShown = false;
let verseShown = false;

function revealContent() {
  if (revealed) return;
  revealed = true;
  hint.classList.remove('visible');
  hint.classList.add('hidden');

  // Start ambient sound on first reveal
  initAudio();

  if (!verseShown) {
    // First time: ghostly Arabic glimpse, then English
    verseShown = true;
    // Brief glimpse of Arabic - barely visible, blurred
    verse.classList.add('glimpse');
    setTimeout(() => {
      verse.classList.remove('glimpse');
      verse.classList.add('vanish');
    }, 1000);
    setTimeout(() => {
      content.classList.add('revealed');
    }, 1100);
  } else {
    content.classList.add('revealed');
  }
}

function hideContent() {
  if (!revealed) return;
  revealed = false;
  content.classList.remove('revealed');
}

function resetHideTimer() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(hideContent, 4000);
}

// Show hint after 3s of inactivity
setTimeout(() => {
  if (!revealed && !hintShown) {
    hint.classList.add('visible');
    hintShown = true;
  }
}, 3000);

// ─── Ambient Sound Design (Web Audio API) ───
let audioStarted = false;

function initAudio() {
  if (audioStarted) return;
  audioStarted = true;

  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 4);
  master.connect(ctx.destination);

  // Deep fundamental drone
  const drone1 = ctx.createOscillator();
  drone1.type = 'sine';
  drone1.frequency.value = 55; // A1
  const drone1Gain = ctx.createGain();
  drone1Gain.gain.value = 0.4;
  drone1.connect(drone1Gain).connect(master);
  drone1.start();

  // Slightly detuned second voice
  const drone2 = ctx.createOscillator();
  drone2.type = 'sine';
  drone2.frequency.value = 55.3;
  const drone2Gain = ctx.createGain();
  drone2Gain.gain.value = 0.3;
  drone2.connect(drone2Gain).connect(master);
  drone2.start();

  // Fifth harmonic - ethereal
  const drone3 = ctx.createOscillator();
  drone3.type = 'sine';
  drone3.frequency.value = 82.4; // E2 (perfect fifth)
  const drone3Gain = ctx.createGain();
  drone3Gain.gain.value = 0.15;
  drone3.connect(drone3Gain).connect(master);
  drone3.start();

  // High shimmer
  const shimmer = ctx.createOscillator();
  shimmer.type = 'sine';
  shimmer.frequency.value = 220;
  const shimmerGain = ctx.createGain();
  shimmerGain.gain.value = 0.03;
  const shimmerFilter = ctx.createBiquadFilter();
  shimmerFilter.type = 'lowpass';
  shimmerFilter.frequency.value = 300;
  shimmer.connect(shimmerFilter).connect(shimmerGain).connect(master);
  shimmer.start();

  // Slow LFO modulating shimmer volume for breathing
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.08;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.015;
  lfo.connect(lfoGain).connect(shimmerGain.gain);
  lfo.start();
}

// ─── Gyroscope / Device Orientation ───
const deviceTilt = new THREE.Vector2(0, 0);
let hasGyro = false;

window.addEventListener('deviceorientation', (e) => {
  if (e.gamma !== null && e.beta !== null) {
    hasGyro = true;
    deviceTilt.x = (e.gamma / 45) * 0.5;  // left/right tilt, clamped
    deviceTilt.y = ((e.beta - 45) / 45) * 0.5; // forward/back tilt
  }
}, { passive: true });

// ─── Cursor Trail ───
const trailPositions = new Float32Array(TRAIL_LENGTH * 3);
const trailAlphas = new Float32Array(TRAIL_LENGTH);
const trailGeometry = new THREE.BufferGeometry();
trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
trailGeometry.setAttribute('alpha', new THREE.BufferAttribute(trailAlphas, 1));

const trailMaterial = new THREE.ShaderMaterial({
  vertexShader: /* glsl */ `
    uniform float uTime;
    attribute float alpha;
    varying float vAlpha;
    void main() {
      vAlpha = alpha;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      // Jiggly bubble wobble - each point gets unique phase from position
      float phase = position.x * 13.7 + position.y * 7.3;
      float wobbleX = sin(uTime * 3.0 + phase) * 0.012 * alpha;
      float wobbleY = cos(uTime * 2.5 + phase * 1.3) * 0.012 * alpha;
      mvPosition.xy += vec2(wobbleX, wobbleY);
      gl_Position = projectionMatrix * mvPosition;
      // Gentle size pulse like a breathing bubble
      float sizePulse = 1.0 + sin(uTime * 2.0 + phase * 0.7) * 0.25;
      gl_PointSize = alpha * 1.35 * sizePulse * (200.0 / -mvPosition.z);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uTrailColor;
    varying float vAlpha;
    void main() {
      vec2 center = gl_PointCoord - 0.5;
      float dist = length(center);
      // Soft gaussian glow - gentle touch of hidayah
      float a = exp(-dist * dist * 12.0) * vAlpha * 0.35;
      gl_FragColor = vec4(uTrailColor, a);
    }
  `,
  uniforms: {
    uTrailColor: { value: timeColors.warm },
    uTime: { value: 0 },
  },
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

const trailPoints = new THREE.Points(trailGeometry, trailMaterial);
scene.add(trailPoints);

let trailIndex = 0;
const mouseWorld3D = new THREE.Vector3();

function updateTrail() {
  // Convert smooth mouse to world position
  mouseWorld3D.set(mouseSmooth.x * 3.0, mouseSmooth.y * 3.0, 0);

  const i3 = trailIndex * 3;
  trailPositions[i3] = mouseWorld3D.x;
  trailPositions[i3 + 1] = mouseWorld3D.y;
  trailPositions[i3 + 2] = mouseWorld3D.z;

  // Update all alphas - fade from newest to oldest
  for (let i = 0; i < TRAIL_LENGTH; i++) {
    const age = (trailIndex - i + TRAIL_LENGTH) % TRAIL_LENGTH;
    const life = Math.max(0, 1 - age / TRAIL_LENGTH);
    trailAlphas[i] = life * life * (mouseActive ? 1 : 0);
  }

  trailIndex = (trailIndex + 1) % TRAIL_LENGTH;
  trailGeometry.attributes.position.needsUpdate = true;
  trailGeometry.attributes.alpha.needsUpdate = true;
}

// ─── Input handlers ───
window.addEventListener('mousemove', (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  mouseActive = true;

  moveCount++;
  if (moveCount > 15 && !revealed) {
    revealContent();
  }
  if (revealed) resetHideTimer();
});

window.addEventListener('touchstart', () => {
  if (!revealed) {
    revealContent();
    resetHideTimer();
  }
}, { passive: true });

window.addEventListener('touchmove', (e) => {
  const touch = e.touches[0];
  mouse.x = (touch.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(touch.clientY / window.innerHeight) * 2 + 1;
  mouseActive = true;
  if (revealed) resetHideTimer();
}, { passive: true });

// ─── Click/Tap Ripple ───
let rippleTime = -10; // time of last ripple (negative = no active ripple)
const rippleOrigin = new THREE.Vector2(0, 0);

window.addEventListener('click', (e) => {
  rippleOrigin.x = (e.clientX / window.innerWidth) * 2 - 1;
  rippleOrigin.y = -(e.clientY / window.innerHeight) * 2 + 1;
  rippleTime = performance.now() / 1000;
});

window.addEventListener('touchstart', (e) => {
  if (e.touches.length > 0) {
    const t = e.touches[0];
    rippleOrigin.x = (t.clientX / window.innerWidth) * 2 - 1;
    rippleOrigin.y = -(t.clientY / window.innerHeight) * 2 + 1;
    rippleTime = performance.now() / 1000;
  }
}, { passive: true });

// ─── Vertex Shader ───
const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform vec2 uMouse;
  uniform float uMouseActive;
  uniform float uReveal;
  uniform vec2 uRippleOrigin;
  uniform float uRippleAge;

  attribute vec3 aVelocity;
  attribute float aPhase;
  attribute float aSize;

  varying float vAlpha;
  varying float vDistance;

  // Simplex-like noise
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  void main() {
    vec3 pos = position;
    float t = uTime * 0.15;

    // Curl-noise-like flow field
    float noiseScale = 0.6;
    float nx = snoise(vec3(pos.x * noiseScale, pos.y * noiseScale, t + aPhase));
    float ny = snoise(vec3(pos.y * noiseScale + 100.0, pos.z * noiseScale, t + aPhase * 0.7));
    float nz = snoise(vec3(pos.z * noiseScale + 200.0, pos.x * noiseScale, t + aPhase * 1.3));

    pos += vec3(nx, ny, nz) * 0.8;

    // Gentle attraction toward center (seeking truth)
    float distFromCenter = length(pos.xy);
    vec2 toCenter = -normalize(pos.xy + 0.001) * 0.15;
    float breathe = sin(uTime * 0.3 + aPhase * 6.28) * 0.5 + 0.5;
    pos.xy += toCenter * breathe * 0.3;

    // Mouse repulsion/attraction
    vec3 mouseWorld = vec3(uMouse * 3.0, 0.0);
    vec3 toMouse = pos - mouseWorld;
    float mouseDist = length(toMouse);
    float mouseInfluence = smoothstep(2.5, 0.0, mouseDist) * uMouseActive;
    // Particles spiral around cursor
    vec2 perpendicular = vec2(-toMouse.y, toMouse.x);
    pos.xy += normalize(perpendicular + 0.001) * mouseInfluence * 0.4;
    pos.xy += normalize(toMouse.xy + 0.001) * mouseInfluence * 0.15;

    // Push particles away from center when text is revealed
    float centerDist = length(pos.xy);
    float clearRadius = 3.5 * uReveal;
    float pushStrength = smoothstep(clearRadius, clearRadius * 0.05, centerDist) * uReveal;
    vec2 pushDir = normalize(pos.xy + 0.001);
    pos.xy += pushDir * pushStrength * 3.5;

    // Ripple wave from click/tap — gentle, like a breath
    if (uRippleAge < 6.0) {
      vec3 rippleWorld = vec3(uRippleOrigin * 3.0, 0.0);
      float rippleDist = length(pos.xy - rippleWorld.xy);
      float rippleRadius = uRippleAge * 1.8;
      float rippleWidth = 3.0;
      float rippleWave = exp(-pow(rippleDist - rippleRadius, 2.0) / rippleWidth);
      float rippleFade = exp(-uRippleAge * 0.4);
      vec2 rippleDir = normalize(pos.xy - rippleWorld.xy + 0.001);
      pos.xy += rippleDir * rippleWave * rippleFade * 0.6;
    }

    // Orbital motion
    float angle = uTime * 0.08 * (0.5 + aPhase * 0.5);
    float cosA = cos(angle);
    float sinA = sin(angle);
    pos.xz = mat2(cosA, -sinA, sinA, cosA) * pos.xz;

    vDistance = length(pos.xy);
    vAlpha = smoothstep(6.0, 0.0, vDistance) * (0.4 + breathe * 0.6);
    // Fully clear particles in center zone when revealed
    vAlpha *= 1.0 - smoothstep(clearRadius * 1.2, 0.0, vDistance) * uReveal;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = aSize * (200.0 / -mvPosition.z) * (0.5 + breathe * 0.5);
  }
`;

// ─── Fragment Shader (with time-of-day colors) ───
const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uWarmColor;
  uniform vec3 uCoolColor;
  uniform vec3 uGlowColor;

  varying float vAlpha;
  varying float vDistance;

  void main() {
    // Soft circular particle
    vec2 center = gl_PointCoord - 0.5;
    float dist = length(center);
    float alpha = smoothstep(0.5, 0.1, dist);

    // Color gradient: warm near center, cool at edges
    float colorMix = smoothstep(0.0, 4.0, vDistance);
    vec3 color = mix(uWarmColor, uCoolColor, colorMix);

    // Central glow
    float centerGlow = exp(-vDistance * 0.6) * 0.3;
    color += uGlowColor * centerGlow;

    gl_FragColor = vec4(color, alpha * vAlpha * 0.7);
  }
`;

// ─── Particles ───
const geometry = new THREE.BufferGeometry();
const positions = new Float32Array(PARTICLE_COUNT * 3);
const velocities = new Float32Array(PARTICLE_COUNT * 3);
const phases = new Float32Array(PARTICLE_COUNT);
const sizes = new Float32Array(PARTICLE_COUNT);

for (let i = 0; i < PARTICLE_COUNT; i++) {
  const i3 = i * 3;

  // Distribute in a sphere with density toward center
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  const r = Math.pow(Math.random(), 0.5) * FIELD_SIZE;

  positions[i3] = r * Math.sin(phi) * Math.cos(theta);
  positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
  positions[i3 + 2] = r * Math.cos(phi);

  velocities[i3] = (Math.random() - 0.5) * 0.02;
  velocities[i3 + 1] = (Math.random() - 0.5) * 0.02;
  velocities[i3 + 2] = (Math.random() - 0.5) * 0.02;

  phases[i] = Math.random();
  sizes[i] = Math.random() * 2.5 + 0.5;
}

geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 3));
geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

const material = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms: {
    uTime: { value: 0 },
    uMouse: { value: new THREE.Vector2(0, 0) },
    uMouseActive: { value: 0 },
    uReveal: { value: 0 },
    uRippleOrigin: { value: new THREE.Vector2(0, 0) },
    uRippleAge: { value: 10 },
    uWarmColor: { value: timeColors.warm },
    uCoolColor: { value: timeColors.cool },
    uGlowColor: { value: timeColors.glow },
  },
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

const particles = new THREE.Points(geometry, material);
scene.add(particles);

// ─── Constellation Threads ───
const CONSTELLATION_SAMPLE = 150;
const MAX_LINES = 200;
const THREAD_DIST = 1.2;

// Sample a fixed subset of particle indices
const constellationIndices = [];
const step = Math.floor(PARTICLE_COUNT / CONSTELLATION_SAMPLE);
for (let i = 0; i < CONSTELLATION_SAMPLE; i++) {
  constellationIndices.push(i * step);
}

const linePositions = new Float32Array(MAX_LINES * 6); // 2 vertices per line, 3 coords each
const lineAlphas = new Float32Array(MAX_LINES * 2);
const lineGeometry = new THREE.BufferGeometry();
lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
lineGeometry.setAttribute('alpha', new THREE.BufferAttribute(lineAlphas, 1));

const lineMaterial = new THREE.ShaderMaterial({
  vertexShader: /* glsl */ `
    attribute float alpha;
    varying float vAlpha;
    void main() {
      vAlpha = alpha;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uLineColor;
    varying float vAlpha;
    void main() {
      gl_FragColor = vec4(uLineColor, vAlpha);
    }
  `,
  uniforms: {
    uLineColor: { value: timeColors.warm },
  },
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

const constellationLines = new THREE.LineSegments(lineGeometry, lineMaterial);
scene.add(constellationLines);

// Approximate particle world position on CPU (simplified version of shader logic)
const _approxPos = new THREE.Vector3();
function approxParticlePos(idx, time) {
  const i3 = idx * 3;
  const px = positions[i3], py = positions[i3 + 1], pz = positions[i3 + 2];
  const phase = phases[idx];
  const t = time * 0.15;

  // Simplified noise approximation using sin/cos
  const nx = Math.sin(px * 0.6 + t + phase * 6.28) * 0.8;
  const ny = Math.sin(py * 0.6 + t + phase * 4.4) * 0.8;
  const nz = Math.sin(pz * 0.6 + t + phase * 8.2) * 0.8;

  let x = px + nx, y = py + ny, z = pz + nz;

  // Orbital rotation
  const angle = time * 0.08 * (0.5 + phase * 0.5);
  const cosA = Math.cos(angle), sinA = Math.sin(angle);
  const rx = x * cosA - z * sinA;
  const rz = x * sinA + z * cosA;

  _approxPos.set(rx, y, rz);
  return _approxPos;
}

function updateConstellations(time) {
  let lineCount = 0;

  for (let i = 0; i < CONSTELLATION_SAMPLE && lineCount < MAX_LINES; i++) {
    const a = approxParticlePos(constellationIndices[i], time);
    const ax = a.x, ay = a.y, az = a.z;

    for (let j = i + 1; j < CONSTELLATION_SAMPLE && lineCount < MAX_LINES; j++) {
      const b = approxParticlePos(constellationIndices[j], time);
      const dx = ax - b.x, dy = ay - b.y, dz = az - b.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist < THREAD_DIST) {
        const idx = lineCount * 6;
        linePositions[idx] = ax;
        linePositions[idx + 1] = ay;
        linePositions[idx + 2] = az;
        linePositions[idx + 3] = b.x;
        linePositions[idx + 4] = b.y;
        linePositions[idx + 5] = b.z;

        const fade = 1.0 - dist / THREAD_DIST;
        const aidx = lineCount * 2;
        lineAlphas[aidx] = fade * 0.12;
        lineAlphas[aidx + 1] = fade * 0.12;

        lineCount++;
      }
    }
  }

  // Zero out remaining lines
  for (let i = lineCount * 6; i < MAX_LINES * 6; i++) linePositions[i] = 0;
  for (let i = lineCount * 2; i < MAX_LINES * 2; i++) lineAlphas[i] = 0;

  lineGeometry.attributes.position.needsUpdate = true;
  lineGeometry.attributes.alpha.needsUpdate = true;
  lineGeometry.setDrawRange(0, lineCount * 2);
}

// ─── Central glow (the "truth" at the center) ───
const glowGeometry = new THREE.PlaneGeometry(6, 6);
const glowMaterial = new THREE.ShaderMaterial({
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform vec3 uGlowColor;
    varying vec2 vUv;
    void main() {
      vec2 center = vUv - 0.5;
      float dist = length(center);

      float glow = exp(-dist * 5.0) * 0.12;
      float pulse = sin(uTime * 0.5) * 0.02 + 1.0;
      glow *= pulse;

      vec3 color = uGlowColor * glow;
      gl_FragColor = vec4(color, glow);
    }
  `,
  uniforms: {
    uTime: { value: 0 },
    uGlowColor: { value: timeColors.glow },
  },
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
glowMesh.position.z = -1;
scene.add(glowMesh);

// ─── Animation loop ───
const clock = new THREE.Clock();
const baseCamPos = new THREE.Vector3(0, 0, 5);

function animate() {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();

  // Smooth mouse
  mouseSmooth.x += (mouse.x - mouseSmooth.x) * 0.05;
  mouseSmooth.y += (mouse.y - mouseSmooth.y) * 0.05;

  // Update trail and constellations
  updateTrail();
  updateConstellations(elapsed);

  // Update uniforms
  material.uniforms.uTime.value = elapsed;
  material.uniforms.uMouse.value.copy(mouseSmooth);
  material.uniforms.uMouseActive.value += ((mouseActive ? 1 : 0) - material.uniforms.uMouseActive.value) * 0.02;
  const targetReveal = revealed ? 1 : 0;
  material.uniforms.uReveal.value += (targetReveal - material.uniforms.uReveal.value) * 0.03;
  glowMaterial.uniforms.uTime.value = elapsed;
  trailMaterial.uniforms.uTime.value = elapsed;

  // Update ripple
  const now = performance.now() / 1000;
  material.uniforms.uRippleAge.value = now - rippleTime;
  material.uniforms.uRippleOrigin.value.copy(rippleOrigin);

  // Camera: base sway + parallax from mouse/gyro
  const swayX = Math.sin(elapsed * 0.1) * 0.3;
  const swayY = Math.cos(elapsed * 0.12) * 0.2;

  // Gyro on mobile, mouse parallax on desktop
  let parallaxX = 0;
  let parallaxY = 0;
  if (hasGyro) {
    parallaxX = deviceTilt.x * 0.8;
    parallaxY = deviceTilt.y * 0.5;
  } else {
    parallaxX = mouseSmooth.x * 0.4;
    parallaxY = mouseSmooth.y * 0.25;
  }

  camera.position.x = swayX + parallaxX;
  camera.position.y = swayY + parallaxY;
  camera.position.z = baseCamPos.z;
  camera.lookAt(0, 0, 0);

  renderer.render(scene, camera);
}

animate();

// ─── Resize ───
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
