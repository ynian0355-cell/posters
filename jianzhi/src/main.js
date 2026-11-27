// =============================================================
//  { 数字剪纸 } 掌中展开 —— 粒子版 · 单手手势 · A0 竖版
//
//  规则：所有画面永远正对观众，不倾斜不翻转；唯一的"空间"是平面往后退 / 往前来 / 往两边散开。
//
//  招式（一只手）：
//    01 举起手          粒子沿着手掌亮起
//    02 握拳            折起来的团花在拳心蓄力，几层粒子在各自平面里旋进去
//    03 猛地张开        团花一扇一扇甩开
//    04 伸手指 1→5      每多伸一根，一朵小团花从深处飞来落位
//    05 捏住            五朵往中心收，一层层往后退，叠成一摞
//    06 捏着转手腕→松开  大团花五圈从深处一圈圈往前来；松手全部到位
//    07 定格            五圈前后轻轻错开，慢慢呼吸
//    任何时候握拳停住    折回去，重新开始
//
//  没有人：自动演示；举手（离镜头够近、停留半秒）即接管。
//  计时：卡住 8 秒给提示；手离开 15 秒回到演示；有手但 60 秒没有进展回到演示。
//  键盘：D 演示 / 互动切换　H 隐藏文字　S 截图
// =============================================================
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// ---------- 可调的数字 ----------
const CFG = {
  HINT_AFTER: 8,        // 卡在一步不动多少秒后，提示亮起来
  ABSENT_TO_DEMO: 15,   // 手离开多少秒后回到自动演示
  IDLE_TO_DEMO: 60,     // 手还在、但多少秒没有任何进展，回到自动演示
  HAND_CONFIRM: 0.5,    // 手要连续出现多少秒才算"有人来玩"
  MIN_PALM: 0.07,       // 手掌（手腕到中指根）至少占画面高度多少，太远的手不算
};
const Q = new URLSearchParams(location.search);
const N = +(Q.get('n') || 100000);
const ASPECT = 848 / 600;
const SZ = 780, SEAL = 200, RR = 260, NS = 5, CAMZ = 2000, FOV = 38;
const VIS_H = 2 * CAMZ * Math.tan(FOV / 2 * Math.PI / 180), VIS_W = VIS_H / ASPECT;
const SECT = Math.PI * 2 / 12;

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = x => { x = clamp(x); return 1 - Math.pow(1 - x, 3); };
const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
let seed = 20261127;
const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;

// =============================================================
//  画布
// =============================================================
const frame = document.getElementById('frame');
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
frame.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060609);
const camera = new THREE.PerspectiveCamera(FOV, 1 / ASPECT, 1, 20000);
camera.position.set(0, 0, CAMZ);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(600, 848), 0.35, 0.7, 0.55);
composer.addPass(new OutputPass());
let PX_H = 848;
function fit() {
  const h = Math.min(window.innerHeight, window.innerWidth * ASPECT), w = h / ASPECT;
  frame.style.width = w + 'px'; frame.style.height = h + 'px';
  renderer.setSize(w, h); composer.setSize(w, h);
  PX_H = h * renderer.getPixelRatio();
  if (pmat) pmat.uniforms.k.value = PX_H / 1000;
  if (hmat) hmat.uniforms.k.value = PX_H / 1000;
}

// =============================================================
//  团花取样：每颗粒子知道自己在团花上的位置、属于哪一圈
// =============================================================
async function patternPixels(size) {
  const img = new Image();
  img.src = URL.createObjectURL(new Blob([window.Tuanhua.svg({ mode: 'mask', size })], { type: 'image/svg+xml' }));
  await img.decode();
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0, size, size);
  return x.getImageData(0, 0, size, size).data;
}
const layerOf = r => r < 0.12 ? 0 : r < 0.34 ? 1 : r < 0.45 ? 2 : r < 0.75 ? 3 : 4;

// 每颗粒子的固定属性
const SX = new Float32Array(N), SY = new Float32Array(N), SR = new Float32Array(N), SA = new Float32Array(N);
const LAY = new Uint8Array(N), EDGE = new Uint8Array(N), GRP = new Uint8Array(N);
const R1 = new Float32Array(N), R2 = new Float32Array(N), R3 = new Float32Array(N), SPD = new Float32Array(N);
// 每颗粒子此刻的状态
const POS = new Float32Array(N * 3), ALPHA = new Float32Array(N), COL = new Float32Array(N * 3), SIZE = new Float32Array(N);
const BASEA = new Float32Array(N);

async function buildParticles() {
  const PS = 1024, PIX = await patternPixels(PS);
  const on = (u, v) => (u >= 0 && v >= 0 && u < 1 && v < 1) && PIX[((v * PS | 0) * PS + (u * PS | 0)) * 4] > 128;
  const e = 2.2 / PS;
  const RED = [0.95, 0.05, 0.07], RED2 = [1.0, 0.16, 0.13], GOLD = [1.0, 0.68, 0.36], PALE = [1.0, 0.88, 0.74];
  let i = 0, tries = 0;
  while (i < N && tries < N * 40) {
    tries++;
    const u = rnd(), v = rnd();
    if (!on(u, v)) continue;
    const edge = !(on(u + e, v) && on(u - e, v) && on(u, v + e) && on(u, v - e));
    if (!edge && rnd() < 0.45) continue;
    const x = u - 0.5, y = 0.5 - v;
    SX[i] = x; SY[i] = y; SR[i] = Math.hypot(x, y) * 2;
    SA[i] = ((Math.atan2(x, y) + Math.PI * 2) % (Math.PI * 2));            // 从正上方顺时针
    LAY[i] = layerOf(SR[i]); EDGE[i] = edge ? 1 : 0; GRP[i] = i % 6;
    R1[i] = rnd(); R2[i] = rnd(); R3[i] = rnd(); SPD[i] = 2.0 + rnd() * 2.6;
    const k = rnd(), c = edge ? (rnd() < 0.08 ? GOLD : RED2) : (k < 0.8 ? RED : k < 0.97 ? RED2 : k < 0.995 ? GOLD : PALE);
    COL.set(c, i * 3);
    SIZE[i] = (edge ? 1.6 : 1.25) * (0.7 + rnd() * 0.6);
    BASEA[i] = edge ? 0.55 : 0.32;
    i++;
  }
  // 一开始：折起来的样子
  for (let j = 0; j < N; j++) { const t = foldedTarget(j); POS[j * 3] = t[0]; POS[j * 3 + 1] = t[1]; POS[j * 3 + 2] = t[2]; ALPHA[j] = 0; }
}

// =============================================================
//  粒子材质：一颗颗柔和的小点，叠在一起慢慢变亮
// =============================================================
let pmat, hmat, points, handPts;
function makePoints() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(POS, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(COL, 3));
  g.setAttribute('size', new THREE.BufferAttribute(SIZE, 1));
  g.setAttribute('alpha', new THREE.BufferAttribute(ALPHA, 1).setUsage(THREE.DynamicDrawUsage));
  pmat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { k: { value: PX_H / 1000 } },
    vertexShader: `attribute float size, alpha; attribute vec3 color; uniform float k; varying vec3 vC; varying float vA;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv;
        float ps = size * 0.85 * k * 1500. / -mv.z; gl_PointSize = max(ps, 1.0); vC = color; vA = alpha * min(1., ps * ps); }`,
    fragmentShader: `varying vec3 vC; varying float vA;
      void main(){ float d = length(gl_PointCoord - .5) * 2.; float a = smoothstep(1.0, 0.55, d) * vA * 2.0; if (a < 0.003) discard; gl_FragColor = vec4(vC, a); }`
  });
  points = new THREE.Points(g, pmat); points.frustumCulled = false; scene.add(points);
  // 手的 21 个关键点：一直淡淡地跟着你的手，让人知道"它看见我了"
  const hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(21 * 3), 3).setUsage(THREE.DynamicDrawUsage));
  hg.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(21), 1).setUsage(THREE.DynamicDrawUsage));
  hmat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { k: { value: PX_H / 1000 } },
    vertexShader: `attribute float alpha; uniform float k; varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); gl_Position = projectionMatrix * mv; gl_PointSize = 4.5 * k * 1500. / -mv.z; vA = alpha; }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - .5) * 2.; float a = exp(-d*d*4.) * vA; gl_FragColor = vec4(1.0, 0.72, 0.42, a); }`
  });
  handPts = new THREE.Points(hg, hmat); handPts.frustumCulled = false; scene.add(handPts);
}

// =============================================================
//  每一种状态下，粒子"应该在"哪
// =============================================================
const ROT0 = -SECT / 2;                                  // 折起来时，那一小角正对上方
function polar(r, th, z) { const a = th + ROT0; return [Math.sin(a) * r * SZ / 2, Math.cos(a) * r * SZ / 2, z]; }
function foldIndex(th) { return Math.floor(th / SECT); }
function foldAngle(th) { const k = foldIndex(th), f = th - k * SECT; return k % 2 ? SECT - f : f; }   // 像折扇一样来回折
function foldedTarget(i) { const th = SA[i], k = foldIndex(th), t = polar(SR[i] * 0.9, foldAngle(th), 0); t[1] -= 210; return t; }   // 折起来的一小角，放在画面正中

const S = {                                              // 整个作品此刻的状态
  mode: 'WAIT', t: 0,                                    // 当前招式、进入这一招多久
  charge: 0, open: 0, seals: 0, sealT: new Float32Array(NS), gather: 0, reveal: 0, twist: 0,
  hand: null,                                            // 手的关键点（世界坐标）
  camX: 0,
};
function setMode(m) { if (S.mode !== m) { S.mode = m; S.t = 0; } }

function target(i, out, T) {
  const m = S.mode, g = GRP[i], L = LAY[i];
  let x, y, z, a = BASEA[i];
  if (m === 'WAIT' || m === 'AWAKE' || (m === 'CHARGE' && R1[i] < 0.18)) {
    const t = foldedTarget(i); x = t[0]; y = t[1]; z = t[2];
    const br = 1 + 0.015 * Math.sin(T * 1.2);
    x *= br; y *= br;
    a *= m === 'CHARGE' ? 0.45 + 0.4 * S.charge : 0.32;
    if (false) {        // 01 觉醒：四分之一的粒子去描你的手
      const hp = handPoint(i); if (hp) { x = hp[0]; y = hp[1]; z = hp[2]; a = BASEA[i] * 0.9; }
    }
  } else if (m === 'CHARGE') {                           // 02 蓄力：四层平面旋涡，往拳心旋
    const c = S.charge, layer = Math.floor(R2[i] * 4), zs = [-700, -260, 0, 260][layer];
    const arm = Math.floor(R3[i] * 5) / 5 * Math.PI * 2 + layer * 0.7;
    const s = (R1[i] - 0.18) / 0.82, ang = arm + s * 3.2 * (0.6 + 0.8 * c) + T * (0.15 + 0.4 * c);
    const rad = 60 + (1 - s) * (440 - 140 * c) + (R2[i] - 0.5) * 18;
    x = Math.cos(ang) * rad; y = Math.sin(ang) * rad; z = zs;
    a = BASEA[i] * 0.8 * (0.25 + 0.75 * clamp((1 - s) / 0.45)) * (0.5 + 0.5 * c) * [0.55, 0.8, 1, 0.7][layer];
  } else if (m === 'BURST' || m === 'BLOOM') {           // 03 展开：一扇一扇甩开
    const A = (m === 'BLOOM' ? 1 : S.open) * Math.PI * 2, th = SA[i];
    if (th <= A) {
      const fresh = clamp(1 - (A - th) / (SECT * 1.5));  // 刚甩开的那一扇，往前飘一点
      [x, y, z] = polar(SR[i] * (1 + 0.04 * fresh), th, 120 * fresh * (R1[i] - 0.3));
    } else {
      const lead = Math.max(A, SECT);
      [x, y, z] = polar(SR[i], lead - SECT + foldAngle(th), -(foldIndex(th)) * 4);
      a *= 0.5;
    }
    if (m === 'BLOOM') { const br = 1 + 0.008 * Math.sin(T * 0.9); x *= br; y *= br; }
  } else if (m === 'SEAL' || m === 'GATHER') {
    const back = () => { const t = polar(SR[i], SA[i], 0); return [t[0] * 0.5, t[1] * 0.5, 0]; };
    if (g < NS && (m === 'GATHER' || g < S.seals)) {     // 04 结印：这一朵已经飞来落位
      const ang = Math.PI / 2 - g / NS * Math.PI * 2, X = Math.cos(ang) * RR, Y = Math.sin(ang) * RR;
      const pulse = Math.exp(-S.sealT[g] * 5) * (S.sealT[g] < 2 ? 1 : 0);
      const e = m === 'GATHER' ? S.gather : 0, sc = SEAL * (1 + 0.3 * e) * (1 + 0.06 * pulse);
      x = X * (1 - e) + SX[i] * sc; y = Y * (1 - e) + SY[i] * sc; z = -(g + 1) * 190 * e;
      a *= (m === 'GATHER' ? 0.55 + 0.45 * (1 - e) : 1) * (1 + 1.2 * pulse);
    } else if (m === 'GATHER') {                         // 05 汇聚：剩下的粒子在中心聚成一朵
      x = SX[i] * SEAL * 1.5; y = SY[i] * SEAL * 1.5; z = 120; a *= 0.6 * S.gather;
    } else { [x, y, z] = back(); a *= 0.33; }            // 还没飞来的：在深处做一朵很淡的大团花
  } else if (m === 'REVEAL' || m === 'HOLD') {           // 06 显形 / 07 定格
    const R = m === 'HOLD' ? 1 : S.reveal, k = ease((R - L * 0.13) / 0.38), sp = 1 - k;
    const r = SR[i] * SZ / 2, th0 = Math.atan2(SY[i], SX[i]);
    const th = th0 + sp * (0.9 + 0.25 * L) + sp * S.twist * 0.6;
    const rr = r * (1 + sp * 0.5) + sp * (R1[i] - 0.5) * 120;
    x = Math.cos(th) * rr; y = Math.sin(th) * rr; z = -sp * (700 + 260 * L);
    a *= 0.3 + 0.7 * k;
    if (m === 'HOLD') {
      const br = 0.6 + 0.4 * Math.sin(T * 0.5);
      z = (L - 2) * -130 * br;
    }
  }
  out[0] = x; out[1] = y; out[2] = 0; return a;              // 全部平面，不做前后
}

// 01 觉醒：手的骨头上取一个点（中线亮一点，两侧轮廓淡一点）
const BONES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
const BONE_W = [0, 34, 30, 26, 22, 26, 22, 20, 18, 27, 23, 21, 19, 26, 22, 20, 18, 22, 19, 17, 15];
function handPoint(i) {
  const h = S.hand; if (!h) return null;
  const [a, b] = BONES[Math.floor(R1[i] * BONES.length) % BONES.length];
  const A = h[a], B = h[b], t = R2[i], dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1;
  const inner = a === 0 || (a === 5 && b === 9) || (a === 9 && b === 13) || (a === 13 && b === 17);
  const w = BONE_W[b] * S.handScale * 0.5, side = R3[i] < 0.5 ? -1 : 1;
  const off = inner ? (R3[i] - 0.5) * w * 0.4 : (R3[i] < 0.3 || R3[i] > 0.7) ? side * w * 0.95 : (R3[i] - 0.5) * w * 0.5;
  return [A[0] + dx * t - dy / L * off, A[1] + dy * t + dx / L * off, 0];
}

// =============================================================
//  物理：每颗粒子追着自己的目标走（快慢不一，所以过渡像流动）
// =============================================================
const tmp = [0, 0, 0];
function physics(dt, T) {
  const fast = S.mode === 'BURST' ? 2.2 : S.mode === 'CHARGE' ? 3.2 : S.mode === 'SEAL' ? 0.8 : 1;
  const ka = 1 - Math.exp(-3 * dt);
  for (let i = 0; i < N; i++) {
    const a = target(i, tmp, T), k = 1 - Math.exp(-SPD[i] * fast * dt), j = i * 3;
    POS[j] += (tmp[0] - POS[j]) * k; POS[j + 1] += (tmp[1] - POS[j + 1]) * k; POS[j + 2] += (tmp[2] - POS[j + 2]) * k;
    ALPHA[i] += (a - ALPHA[i]) * ka;
  }
  points.geometry.attributes.position.needsUpdate = true;
  points.geometry.attributes.alpha.needsUpdate = true;
}

// =============================================================
//  摄像头 · MediaPipe（只看一只手）
// =============================================================
const CAM = { ar: 16 / 9, on: false, state: '', lm: null, video: null, lastVT: -1, raw: null, inject: undefined };
function b64(str) { const s = atob(str), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
function loadScript(src) { return new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); }); }
async function makeLandmarker() {
  const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  const online = /^https?:$/.test(location.protocol), tries = [];
  if (online) tries.push({ base: new URL('lib/mediapipe', location.href).href, model: { modelAssetPath: new URL('lib/hand_landmarker.task', location.href).href } });
  else tries.push({ offline: true });
  tries.push({ base: CDN, model: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task' } });
  let lastErr;
  for (const t of tries) {
    try {
      let vision, fs, mo = t.model;
      if (t.offline) {                                   // 双击打开（file://）也能用：识别程序和模型都在 lib 里
        for (const f of ['vision_bundle', 'wasm_loader', 'wasm_binary']) await loadScript('lib/offline/' + f + '.js');
        const blob = (d, type) => URL.createObjectURL(new Blob([d], { type }));
        vision = await import(/* @vite-ignore */ blob(window.__MP_BUNDLE, 'text/javascript'));
        fs = { wasmLoaderPath: blob(window.__MP_LOADER, 'text/javascript'), wasmBinaryPath: blob(b64(window.__MP_WASM), 'application/wasm') };
        if (!window.__HAND_MODEL) await loadScript('lib/hand_model.js');
        mo = { modelAssetBuffer: b64(window.__HAND_MODEL) };
      } else {
        vision = await import(/* @vite-ignore */ t.base + '/vision_bundle.mjs');
        fs = await vision.FilesetResolver.forVisionTasks(t.base + '/wasm');
      }
      const opts = d => ({ baseOptions: Object.assign({ delegate: d }, mo), runningMode: 'VIDEO', numHands: 1,
        minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6, minTrackingConfidence: 0.5 });
      try { return await vision.HandLandmarker.createFromOptions(fs, opts('GPU')); }
      catch (_) { return await vision.HandLandmarker.createFromOptions(fs, opts('CPU')); }
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}
async function startCamera() {
  CAM.video = document.getElementById('vid');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { CAM.state = 'none'; return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }); }
  catch (_) { CAM.state = 'denied'; return; }
  CAM.video.srcObject = stream; try { await CAM.video.play(); } catch (_) {}
  if (CAM.video.videoWidth) CAM.ar = CAM.video.videoWidth / CAM.video.videoHeight;
  CAM.state = 'loading';
  try { CAM.lm = await makeLandmarker(); CAM.on = true; CAM.state = 'on'; }
  catch (_) { CAM.state = 'fail'; }
}
function readHand() {                                    // → 镜像后的 21 个点（0..1），或 null
  if (CAM.inject !== undefined) return CAM.inject;
  if (!CAM.on) return null;
  const v = CAM.video;
  if (v.readyState < 2 || v.currentTime === CAM.lastVT) return CAM.raw;
  CAM.lastVT = v.currentTime;
  let res = null; try { res = CAM.lm.detectForVideo(v, performance.now()); } catch (_) {}
  const l = res && res.landmarks && res.landmarks[0];
  CAM.raw = l ? l.map(p => [1 - p.x, p.y, p.z || 0]) : null;
  return CAM.raw;
}

// 21 个点 → 手势
// 摄像头坐标 x、y 是分别按宽、高归一化的，算距离前把 x 拉回真实比例
const D = (P, a, b) => Math.hypot((P[a][0] - P[b][0]) * CAM.ar, P[a][1] - P[b][1]);
function analyze(P) {
  const palm = D(P, 0, 9) + 1e-6;
  const ext = [[8, 6], [12, 10], [16, 14], [20, 18]].map(([t, p]) => D(P, t, 0) > D(P, p, 0) * 1.12);
  const thumb = D(P, 4, 5) / palm > 0.45 && D(P, 4, 17) > D(P, 3, 17) * 1.05;
  const pinch = D(P, 4, 8) / palm < 0.3 && D(P, 8, 0) / palm > 1.1;     // 食指尖离手腕够远，才是捏，不是握拳
  const count = ext.filter(Boolean).length + (thumb ? 1 : 0);
  const roll = Math.atan2((P[9][0] - P[0][0]) * CAM.ar, -(P[9][1] - P[0][1]));
  return { palm, count, fist: count === 0 && !pinch, open: count >= 4 && !pinch, pinch, roll };
}
// 摄像头画面中间一块 → 海报（手不用伸到画面边上）
function toWorld(p) { return [((p[0] - 0.15) / 0.7 - 0.5) * VIS_W, -((p[1] - 0.1) / 0.8 - 0.5) * VIS_H, 0]; }

// =============================================================
//  导演：互动 / 自动演示
// =============================================================
const G = {
  demo: true, demoT: 0, handT: 0, absentT: 99, progressT: 0,
  stable: { k: '', t: 0 },                               // 手势要稳定一小会儿才算
  lastRoll: null, hint: '', hintStrong: false,
};
function progress() { G.progressT = 0; }

function gestureKey(h) { return h.pinch ? 'pinch' : h.fist ? 'fist' : 'n' + h.count; }

function interact(h, dt) {
  const key = gestureKey(h);
  if (key === G.stable.k) G.stable.t += dt; else { G.stable.k = key; G.stable.t = 0; }
  const held = (k, s) => G.stable.k === k && G.stable.t >= s;
  const m = S.mode;
  // 任何时候：握拳停住 = 折回去，重新开始（蓄力里本来就握着拳，不算）
  if (m !== 'WAIT' && m !== 'AWAKE' && m !== 'CHARGE' && m !== 'BURST' && held('fist', 0.5)) { reset(); setMode('CHARGE'); progress(); return; }
  if (m === 'WAIT' || m === 'AWAKE') {
    if (held('fist', 0.25)) { setMode('CHARGE'); S.charge = 0; progress(); }
    else if (h.count >= 3) { if (m === 'WAIT') progress(); setMode('AWAKE'); }
  } else if (m === 'CHARGE') {
    if (h.fist) S.charge = Math.min(1, S.charge + dt / 2.2);
    if (h.open) { if (S.charge > 0.12) { setMode('BURST'); S.open = 0; progress(); } else setMode('AWAKE'); }
  } else if (m === 'BLOOM' || m === 'SEAL') {
    const want = S.seals + 1;
    if (want <= NS && held('n' + want, 0.25)) { S.seals = want; S.sealT[want - 1] = 0; setMode('SEAL'); progress(); }
    if (S.seals >= 1 && held('pinch', 0.2)) {           // 宽容：没伸满五根也能直接捏
      S.seals = NS; setMode('GATHER'); S.gather = 0; S.twist = 0; G.lastRoll = h.roll; progress();
    }
  } else if (m === 'GATHER') {
    if (h.pinch) {
      if (G.lastRoll !== null) { let d = h.roll - G.lastRoll; d = Math.atan2(Math.sin(d), Math.cos(d)); S.twist += d; if (Math.abs(d) > 0.01) progress(); }
      G.lastRoll = h.roll;
      if (S.gather > 0.6 && Math.abs(S.twist) > 0.12) { setMode('REVEAL'); S.reveal = 0; }
    } else if (S.gather > 0.5 && G.stable.t > 0.2) { setMode('REVEAL'); S.reveal = Math.max(S.reveal, 0.05); G.autoReveal = true; progress(); }
  } else if (m === 'REVEAL') {
    if (h.pinch && !G.autoReveal) {
      let d = h.roll - G.lastRoll; d = Math.atan2(Math.sin(d), Math.cos(d)); S.twist += d; G.lastRoll = h.roll;
      S.reveal = Math.max(S.reveal, clamp(Math.abs(S.twist) / 1.4) * 0.7);
      if (Math.abs(d) > 0.01) progress();
    } else G.autoReveal = true;
  }
}

// 自动推进的部分（互动和演示都用）
function autoAdvance(dt) {
  const m = S.mode;
  for (let k = 0; k < NS; k++) S.sealT[k] += dt;
  if (m === 'BURST') { S.open = Math.min(1, S.open + dt / 1.5); if (S.open >= 1) setMode('BLOOM'); }
  if (m === 'GATHER') S.gather = Math.min(1, S.gather + dt / 1.3);
  if (m === 'REVEAL' && G.autoReveal) { S.reveal = Math.min(1, S.reveal + dt / 2.6); }
  if (m === 'REVEAL' && S.reveal >= 1) { setMode('HOLD'); G.autoReveal = false; progress(); }
  if (m === 'REVEAL' && !G.autoReveal) S.twist += dt * 0.15 * Math.sign(S.twist || 1);
}
function reset() { S.charge = 0; S.open = 0; S.seals = 0; S.gather = 0; S.reveal = 0; S.twist = 0; G.autoReveal = false; }

// 自动演示的分镜（秒）
const DEMO = [
  [0, 'WAIT', ''], [2.5, 'AWAKE', '举起手'], [5, 'CHARGE', '握拳'], [7.6, 'BURST', '猛地张开'], [9.4, 'BLOOM', ''],
  [10.6, 'SEAL1', '伸一根手指'], [11.8, 'SEAL2', '两根'], [13, 'SEAL3', '三根'], [14.2, 'SEAL4', '四根'], [15.4, 'SEAL5', '五根'],
  [17, 'GATHER', '捏住'], [19.4, 'REVEAL', '捏着转手腕，再松开'], [23.5, 'HOLD', ''], [31, 'END', '握拳，折回去'],
];
const DEMO_LEN = 33;
function demo(dt) {
  G.demoT = (G.demoT + dt) % DEMO_LEN;
  let cur = DEMO[0];
  for (const d of DEMO) if (G.demoT >= d[0]) cur = d;
  const [t0, key, label] = cur;
  if (key === 'END' || (key === 'WAIT' && S.mode !== 'WAIT')) { if (S.mode !== 'WAIT') { reset(); setMode('WAIT'); } }
  else if (key.startsWith('SEAL')) { const n = +key[4]; if (S.seals < n) { S.seals = n; S.sealT[n - 1] = 0; } setMode('SEAL'); }
  else if (key === 'CHARGE') { setMode('CHARGE'); S.charge = clamp((G.demoT - t0) / 2.4); }
  else if (key === 'BURST') { if (S.mode !== 'BURST' && S.mode !== 'BLOOM') { setMode('BURST'); S.open = 0; } }
  else if (key === 'BLOOM') { if (S.mode === 'BURST' && S.open < 1) {} else setMode('BLOOM'); }
  else if (key === 'GATHER') setMode('GATHER');
  else if (key === 'REVEAL') {
    if (S.mode !== 'REVEAL' && S.mode !== 'HOLD') { setMode('REVEAL'); S.twist = 0; }
    const u = (G.demoT - t0) / 4.1; S.twist = 1.6 * smooth(u); S.reveal = u < 0.55 ? 0.6 * smooth(u / 0.55) : 0.6 + 0.4 * smooth((u - 0.55) / 0.45);
  }
  else if (key === 'HOLD') setMode('HOLD');
  else if (key === 'AWAKE') setMode('AWAKE');
  // 演示里的"幽灵手"：01 觉醒时画一只张开的手
  S.hand = null;
  G.hint = label ? '演示 · ' + label : '';
}
const HAND0 = [[0,0],[-45,40],[-85,90],[-115,135],[-140,175],[-45,170],[-55,240],[-60,285],[-63,322],[-5,178],[-5,258],[-5,308],[-5,348],[32,170],[38,240],[42,285],[45,320],[62,150],[75,205],[83,240],[90,272]];
function ghostHand() { const k = 1.15; S.handScale = k; return HAND0.map(p => [p[0] * k + 30, p[1] * k - 260, 0]); }

const HINTS = {
  WAIT: '举起手，再握拳', AWAKE: '握拳，握住', BURST: '', BLOOM: '伸一根手指', GATHER: '捏着，转一转手腕', REVEAL: '松开', HOLD: '握拳，重新开始',
};
function hintFor() {
  if (S.mode === 'CHARGE') return S.charge < 0.35 ? '握住……' : '猛地张开';
  if (S.mode === 'SEAL') return S.seals < NS ? `伸 ${S.seals + 1} 根手指` : '拇指捏住食指';
  return HINTS[S.mode] || '';
}

function direct(dt) {
  const P = readHand();
  const near = P && D(P, 0, 9) > CFG.MIN_PALM;
  if (near) { G.handT += dt; G.absentT = 0; } else { G.handT = 0; G.absentT += dt; }
  // 手的点：一直淡淡跟着
  const hp = handPts.geometry.attributes.position, ha = handPts.geometry.attributes.alpha;
  if (near && !G.demo) {
    const W = P.map(toWorld);
    const palmW = Math.hypot(W[9][0] - W[0][0], W[9][1] - W[0][1]);
    S.hand = W; S.handScale = palmW / 178;
    for (let k = 0; k < 21; k++) { hp.setXYZ(k, W[k][0], W[k][1], 30); ha.setX(k, 0); }
  } else for (let k = 0; k < 21; k++) ha.setX(k, damp(ha.getX(k), 0, 4, dt));
  hp.needsUpdate = true; ha.needsUpdate = true;

  if (G.demo) {
    if (G.handT >= CFG.HAND_CONFIRM && !G.forceDemo) { G.demo = false; reset(); setMode('WAIT'); progress(); G.stable = { k: '', t: 0 }; }
    else { demo(dt); autoAdvance(dt); return; }
  }
  // 互动中
  G.progressT += dt;
  if (near) interact(analyze(P), dt);
  else S.hand = null;
  autoAdvance(dt);
  if (G.absentT > CFG.ABSENT_TO_DEMO || G.progressT > CFG.IDLE_TO_DEMO) { G.demo = true; G.demoT = 0; reset(); setMode('WAIT'); }
  G.hint = near ? hintFor() : '把手举到镜头前';
  G.hintStrong = G.progressT > CFG.HINT_AFTER;
}

// =============================================================
//  主循环
// =============================================================
const ui = { hint: document.getElementById('hint'), cam: document.getElementById('cam') };
let T = 0, last = performance.now(), lastHint = null;
function step(dt) {
  T += dt; S.t += dt; UF = damp(UF, unfold(), 4, dt);
  direct(dt);
  const cx = 0;
  S.camX = damp(S.camX, cx, 1.2, dt);
  camera.position.set(0, -27, CAMZ); camera.lookAt(0, -27, 0);   // 团花中心在海报 52% 高处（原版位置）
  physics(dt, T);
}
const STATUS = { WAIT: '● 折叠 FOLDED', AWAKE: '● 举手 READY', CHARGE: '● 蓄力 CHARGE', BURST: '● 展开中 UNFOLDING', BLOOM: '● 团花 FULL BLOOM', SEAL: '● 结印 SEAL', GATHER: '● 汇聚 GATHER', REVEAL: '● 显形 REVEAL', HOLD: '● 团花 FULL BLOOM' };
function unfold() { const m = S.mode; return m === 'WAIT' || m === 'AWAKE' ? 0.05 : m === 'CHARGE' ? 0.05 + 0.1 * S.charge : m === 'BURST' ? S.open : m === 'REVEAL' ? 0.4 + 0.6 * S.reveal : 1; }
let UF = 0.05;
function drawUI() {
  const set = (id, v) => { const e = document.getElementById(id); if (e && e.textContent !== v) e.textContent = v; };
  set('uf', UF.toFixed(2)); const bar = document.getElementById('ufbar'); if (bar) bar.setAttribute('width', (160 * Math.min(1, UF)).toFixed(1));
  set('st', (STATUS[S.mode] || '') + (S.mode === 'SEAL' ? ' ' + S.seals + '/5' : ''));
  const st = document.getElementById('st'); if (st) st.setAttribute('fill', UF > 0.85 || S.mode === 'SEAL' ? '#b6ff3c' : '#c8c8c8');
  const h = G.hint;
  if (h !== lastHint) { ui.hint.textContent = h; lastHint = h; }
  ui.hint.classList.toggle('strong', !G.demo && G.hintStrong);
  ui.cam.textContent = { on: '', loading: 'LOADING…', fail: 'NO MODEL', denied: 'NO CAMERA', none: 'NO CAMERA' }[CAM.state] ?? 'NO CAMERA';
}
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  step(dt); drawUI();
  composer.render();
  requestAnimationFrame(loop);
}

window.addEventListener('keydown', e => {
  if (e.key === 'd' || e.key === 'D') { G.forceDemo = !G.demo ? true : false; G.demo = !G.demo; G.demoT = 0; reset(); setMode('WAIT'); }
  if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('clean');
  if (e.key === 's' || e.key === 'S') { const a = document.createElement('a'); a.download = 'jianzhi.png'; a.href = renderer.domElement.toDataURL('image/png'); a.click(); }
});

// 测试接口：注入一只假手、手动快进
window.__jz = {
  S, G, CFG,
  inject(P) { CAM.inject = P; },
  analyze: P => analyze(P),
  handPose: (ext, pinch, roll = 0, cx = 0.5, cy = 0.62, size = 0.22) => {   // 造一只手（0..1 坐标，已镜像）
    const P = HAND0.map(p => p.slice()), F = [[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]];
    F.forEach((f, i) => { if (ext[i + 1]) return; const m = P[f[0]], v = [HAND0[f[1]][0] - m[0], HAND0[f[1]][1] - m[1]];
      P[f[1]] = [m[0] + v[0] * .55, m[1] + v[1] * .55]; P[f[2]] = [m[0] + v[0] * .35, m[1] + v[1] * .35 - 18]; P[f[3]] = [m[0] + v[0] * .15, m[1] - 30]; });
    if (!ext[0]) { P[2] = [-60, 95]; P[3] = [-35, 125]; P[4] = [-10, 135]; }
    if (pinch) { P[6] = [-75, 225]; P[7] = [-100, 240]; P[8] = [-112, 222]; P[3] = [-112, 165]; P[4] = [-116, 212]; }
    const s = size / 178, c = Math.cos(roll), sn = Math.sin(roll);
    return P.map(([x, y]) => { const X = x * c + y * sn, Y = -x * sn + y * c; return [cx + X * s * 0.5625, cy - Y * s, 0]; });
  },
  advance(sec, fps = 30) { for (let t = 0; t < sec - 1e-6; t += 1 / fps) step(1 / fps); drawUI(); composer.render(); },
  render() { composer.render(); },
  tick(sec, fps = 30) { for (let t = 0; t < sec - 1e-6; t += 1 / fps) step(1 / fps); },
  frame() { drawUI(); composer.render(); },
};

// =============================================================
(async function init() {
  fit(); window.addEventListener('resize', fit);
  await buildParticles();
  makePoints(); fit();
  if (Q.get('test') !== '1') { startCamera(); requestAnimationFrame(loop); }
  window.__ready = true;
})();
