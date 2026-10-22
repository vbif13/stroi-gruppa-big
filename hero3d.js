// Первый экран: здание «раскрывается» при прокрутке. Всё построено кодом в реальном времени (three.js r160).
// Этапы: чертёж -> разрез с подземным паркингом -> монолитный каркас и кран -> фасад и стекло -> вечер, свет в окнах.
import * as THREE from './lib-three.module.js';
import { EffectComposer } from './lib-EffectComposer.js';
import { RenderPass } from './lib-RenderPass.js';
import { UnrealBloomPass } from './lib-UnrealBloomPass.js';
import { OutputPass } from './lib-OutputPass.js';
import { ShaderPass } from './lib-ShaderPass.js';
import { RoundedBoxGeometry } from './lib-RoundedBoxGeometry.js';

const TAU = Math.PI * 2;
const hero = document.getElementById('hero'), canvas = document.getElementById('cv');
const mobile = matchMedia('(max-width: 800px)').matches || matchMedia('(hover: none)').matches;
const Q = new URLSearchParams(location.search);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

/* ---------------- рендер ---------------- */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const DPR0 = window.devicePixelRatio || 1;
let DPR = mobile ? Math.min(DPR0, 1.75) : Math.min(2, Math.max(1.5, DPR0));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;
const maxAniso = renderer.capabilities.getMaxAnisotropy();
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.5, 2000);

/* ---------------- небо в сумерках и окружение для отражений ---------------- */
function skyTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 1024; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 1024);
  gr.addColorStop(0.0, '#05070d'); gr.addColorStop(0.28, '#0c1526'); gr.addColorStop(0.42, '#1e2c45'); gr.addColorStop(0.485, '#6b5a57');
  gr.addColorStop(0.5, '#c98d5c'); gr.addColorStop(0.512, '#3a3029'); gr.addColorStop(0.6, '#15120f'); gr.addColorStop(1, '#0b0a09');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 1024);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 64, 32), new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }));
scene.add(sky);
{ // окружение: то же небо + тёплое солнце у горизонта + мягкие полосы света
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(50, 64, 32), new THREE.MeshBasicMaterial({ map: sky.material.map, side: THREE.BackSide })));
  const sun = new THREE.Mesh(new THREE.SphereGeometry(4, 32, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.62, 0.32).multiplyScalar(30) })); sun.position.set(38, 3, -28); env.add(sun);
  const strip = (w, h, power, color, pos) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), side: THREE.DoubleSide })); m.position.set(...pos); m.lookAt(0, 0, 0); env.add(m); };
  strip(60, 8, 0.9, '#9fb6dd', [0, 40, 10]); strip(10, 30, 1.6, '#ffd2a6', [44, 6, 10]);
  const cubeRT = new THREE.WebGLCubeRenderTarget(mobile ? 512 : 1024, { type: THREE.HalfFloatType, generateMipmaps: false });
  new THREE.CubeCamera(0.1, 200, cubeRT).update(renderer, env);
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromCubemap(cubeRT.texture).texture; pm.dispose(); cubeRT.dispose();
}
scene.fog = new THREE.FogExp2(0x1a1612, 0.0058);
const sunLight = new THREE.DirectionalLight(0xffd2a8, 3.0); sunLight.position.set(60, 26, -40);
sunLight.castShadow = true; sunLight.shadow.mapSize.set(mobile ? 2048 : 4096, mobile ? 2048 : 4096);
Object.assign(sunLight.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 10, far: 200 });
sunLight.shadow.bias = -0.0004; sunLight.shadow.normalBias = 0.04; scene.add(sunLight);
const sky2 = new THREE.HemisphereLight(0x8da2c8, 0x3a2c20, 0.9); scene.add(sky2);

/* ---------------- текстуры, нарисованные кодом ---------------- */
function canvasTex(size, draw, srgb, repeat) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); } return t;
}
function normalFromHeight(size, draw, strength, repeat) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); draw(g, size);
  const src = g.getImageData(0, 0, size, size).data, out = g.createImageData(size, size), d = out.data;
  const h = (x, y) => src[((((y + size) % size) * size) + ((x + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (h(x + 1, y) - h(x - 1, y)) * strength, dy = (h(x, y + 1) - h(x, y - 1)) * strength, l = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
    d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (-dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(out, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = maxAniso; return t;
}
const noiseH = (g, s, n, r0, r1, a) => { g.fillStyle = '#808080'; g.fillRect(0, 0, s, s); for (let i = 0; i < n; i++) { const x = Math.random() * s, y = Math.random() * s, r = r0 + Math.random() * (r1 - r0), v = Math.random() > 0.5 ? 255 : 0; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${v},${v},${v},${a})`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); } };
const concreteN = normalFromHeight(512, (g, s) => { noiseH(g, s, 5000, 1, 4, 0.25); noiseH(g, s, 160, 20, 60, 0.08); g.fillStyle = 'rgba(0,0,0,.35)'; for (let i = 0; i < 40; i++) g.fillRect(Math.random() * s, Math.random() * s, 3, 3); }, 2.2, 1);
const asphaltN = normalFromHeight(512, (g, s) => noiseH(g, s, 12000, 0.6, 2.2, 0.5), 2.5, 60);
const parkingTex = canvasTex(2048, (g, s) => {
  g.fillStyle = '#6d6e70'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},0.02)`; g.fillRect(Math.random() * s, Math.random() * s, 20, 20); }
  const X = (x) => ((x + 15.5) / 31) * s, Z = (z) => ((z + 12.5) / 25) * s;
  g.strokeStyle = 'rgba(240,240,236,.9)'; g.lineWidth = 6;
  for (let x = -13.5; x <= 13.6; x += 2.7) { g.beginPath(); g.moveTo(X(x), Z(-12.3)); g.lineTo(X(x), Z(-7.0)); g.stroke(); g.beginPath(); g.moveTo(X(x), Z(-5.6)); g.lineTo(X(x), Z(-0.4)); g.stroke(); }
  g.strokeStyle = 'rgba(232,190,80,.85)'; g.lineWidth = 8; g.setLineDash([60, 40]); g.beginPath(); g.moveTo(X(-14.5), Z(4)); g.lineTo(X(14.5), Z(4)); g.stroke(); g.setLineDash([]);
  g.fillStyle = 'rgba(240,240,236,.8)';
  for (const x of [-9, 0, 9]) { g.save(); g.translate(X(x), Z(6.5)); g.beginPath(); g.moveTo(-60, -20); g.lineTo(40, -20); g.lineTo(40, -50); g.lineTo(100, 0); g.lineTo(40, 50); g.lineTo(40, 20); g.lineTo(-60, 20); g.closePath(); g.fill(); g.restore(); }
  g.font = 'bold 90px Jost, sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(240,240,236,.75)'; g.fillText('P-1', X(12.5), Z(9.5));
}, true);
const gridTex = canvasTex(1024, (g, s) => {
  g.clearRect(0, 0, s, s);
  for (let i = 0; i <= 64; i++) { const p = (i / 64) * s; g.strokeStyle = i % 8 === 0 ? 'rgba(120,180,255,.55)' : 'rgba(120,180,255,.16)'; g.lineWidth = i % 8 === 0 ? 2 : 1; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, s); g.stroke(); g.beginPath(); g.moveTo(0, p); g.lineTo(s, p); g.stroke(); }
}, true, [6, 6]);
const soilTex = canvasTex(1024, (g, s) => {
  const bands = ['#3a2c22', '#4a3829', '#33271f', '#56422f', '#2c221b'];
  let y = 0; while (y < s) { const h = 60 + Math.random() * 140; g.fillStyle = bands[(Math.random() * bands.length) | 0]; g.fillRect(0, y, s, h); y += h; }
  for (let i = 0; i < 9000; i++) { const v = Math.random() * 60 | 0; g.fillStyle = `rgba(${v + 60},${v + 45},${v + 30},.35)`; g.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 5, 2 + Math.random() * 4); }
}, true, [3, 1]);
const roomTex = canvasTex(512, (g, s) => { // тёплая гостиная: свет с потолка, диван, торшер, картина
  const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, '#fff1d6'); gr.addColorStop(0.1, '#f2c48c'); gr.addColorStop(0.55, '#8c6140'); gr.addColorStop(1, '#2c1d12'); g.fillStyle = gr; g.fillRect(0, 0, s, s);
  const lg = g.createRadialGradient(s * 0.78, s * 0.45, 0, s * 0.78, s * 0.45, s * 0.3); lg.addColorStop(0, 'rgba(255,220,160,.8)'); lg.addColorStop(1, 'rgba(255,220,160,0)'); g.fillStyle = lg; g.fillRect(0, 0, s, s);
  g.fillStyle = 'rgba(35,22,12,.7)'; g.fillRect(s * 0.1, s * 0.66, s * 0.42, s * 0.2); g.fillRect(s * 0.1, s * 0.58, s * 0.08, s * 0.28); g.fillRect(s * 0.77, s * 0.5, s * 0.02, s * 0.5);
  g.fillStyle = 'rgba(60,40,25,.45)'; g.fillRect(s * 0.22, s * 0.28, s * 0.22, s * 0.16);
}, true);
const roomTex2 = canvasTex(512, (g, s) => { // нейтральный свет, жалюзи опущены наполовину
  const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, '#f6f1e6'); gr.addColorStop(0.5, '#b9ab94'); gr.addColorStop(1, '#3b3328'); g.fillStyle = gr; g.fillRect(0, 0, s, s);
  for (let y = 0; y < s * 0.46; y += 9) { g.fillStyle = 'rgba(230,222,205,.9)'; g.fillRect(0, y, s, 6); g.fillStyle = 'rgba(120,108,90,.6)'; g.fillRect(0, y + 6, s, 3); }
  g.fillStyle = 'rgba(40,32,24,.6)'; g.fillRect(s * 0.55, s * 0.62, s * 0.3, s * 0.06); g.fillRect(s * 0.58, s * 0.68, s * 0.03, s * 0.32);
}, true);
const roomTex3 = canvasTex(512, (g, s) => { // полутёмная комната, горит одна лампа
  g.fillStyle = '#1a120c'; g.fillRect(0, 0, s, s);
  const lg = g.createRadialGradient(s * 0.3, s * 0.62, 0, s * 0.3, s * 0.62, s * 0.45); lg.addColorStop(0, 'rgba(255,190,120,.95)'); lg.addColorStop(0.4, 'rgba(160,100,55,.5)'); lg.addColorStop(1, 'rgba(40,25,15,0)'); g.fillStyle = lg; g.fillRect(0, 0, s, s);
  g.fillStyle = 'rgba(15,10,6,.8)'; g.fillRect(s * 0.4, s * 0.7, s * 0.5, s * 0.3);
}, true);

// бетон после опалубки: щиты 1.2 x 2.4 м, стыки, отверстия от стяжек, пятна (текстура 4.8 x 4.8 м)
const concreteCol = canvasTex(1024, (g, s) => {
  g.fillStyle = '#b4b0a8'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 260; i++) { const x = Math.random() * s, y = Math.random() * s, r = 20 + Math.random() * 90, v = Math.random() > 0.5 ? 255 : 0; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${v},${v},${v},.07)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
  for (let i = 0; i < 18000; i++) { const v = (Math.random() * 255) | 0; g.fillStyle = `rgba(${v},${v},${v},.06)`; g.fillRect(Math.random() * s, Math.random() * s, 1.5, 1.5); }
  const pw = s / 4, ph = s / 2; g.strokeStyle = 'rgba(70,66,60,.45)'; g.lineWidth = 2.2;
  for (let x = 0; x <= s; x += pw) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, s); g.stroke(); }
  for (let y = 0; y <= s; y += ph) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
  g.fillStyle = 'rgba(55,50,45,.7)'; for (let x = pw / 2; x < s; x += pw) for (let y = ph / 4; y < s; y += ph / 2) { g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); }
  for (let i = 0; i < 14; i++) { const x = Math.random() * s; const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, 'rgba(60,55,48,.12)'); gr.addColorStop(1, 'rgba(60,55,48,0)'); g.fillStyle = gr; g.fillRect(x, Math.random() * s * 0.5, 6 + Math.random() * 14, s * 0.5); }
}, true, [1, 1]);
const concreteNW = normalFromHeight(1024, (g, s) => { noiseH(g, s, 9000, 1, 3, 0.25); g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 2; for (let x = 0; x <= s; x += s / 4) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, s); g.stroke(); } for (let y = 0; y <= s; y += s / 2) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); } g.fillStyle = 'rgba(0,0,0,.8)'; for (let x = s / 8; x < s; x += s / 4) for (let y = s / 8; y < s; y += s / 4) { g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); } }, 2.4, 1);
// UV из мировых координат: фактура не растягивается на длинных плитах и колоннах
function worldUV(mat, scale = 1 / 4.8) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      {
        vec4 wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        wp = modelMatrix * wp;
        mat3 nm = mat3(modelMatrix);
        #ifdef USE_INSTANCING
          nm = nm * mat3(instanceMatrix);
        #endif
        vec3 wn = normalize(nm * objectNormal);
        vec2 tuv = abs(wn.y) > 0.6 ? wp.xz : (abs(wn.x) > 0.6 ? wp.zy : wp.xy);
        tuv *= ${scale.toFixed(5)};
        #ifdef USE_MAP
          vMapUv = tuv;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv = tuv;
        #endif
      }`);
  };
  mat.customProgramCacheKey = () => 'worldUV' + scale;
  return mat;
}
/* ---------------- материалы ---------------- */
const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1000);
const M = {
  concrete: worldUV(new THREE.MeshPhysicalMaterial({ map: concreteCol, roughness: 0.84, normalMap: concreteNW, normalScale: new THREE.Vector2(0.8, 0.8) })),
  concreteClip: worldUV(new THREE.MeshPhysicalMaterial({ map: concreteCol, color: 0xe2ded8, roughness: 0.84, normalMap: concreteNW, normalScale: new THREE.Vector2(0.8, 0.8), clippingPlanes: [clipPlane], clipShadows: true })),
  parkFloor: new THREE.MeshPhysicalMaterial({ map: parkingTex, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2, clippingPlanes: [clipPlane] }),
  soil: new THREE.MeshStandardMaterial({ map: soilTex, roughness: 1, clippingPlanes: [clipPlane] }),
  soilCap: new THREE.MeshStandardMaterial({ map: soilTex, roughness: 1, side: THREE.DoubleSide }),
  ground: new THREE.MeshPhysicalMaterial({ color: 0x2a2826, roughness: 0.9, normalMap: asphaltN, normalScale: new THREE.Vector2(0.6, 0.6), clippingPlanes: [clipPlane] }),
  paving: new THREE.MeshPhysicalMaterial({ color: 0x77726b, roughness: 0.75, normalMap: concreteN, clippingPlanes: [clipPlane] }),
  frame: new THREE.MeshPhysicalMaterial({ color: 0x2b2a28, metalness: 0.85, roughness: 0.32 }),
  bronze: new THREE.MeshPhysicalMaterial({ color: 0x7a5d3c, metalness: 1, roughness: 0.38 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.03, ior: 1.52, envMapIntensity: 1.6, clearcoat: 1, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  room: new THREE.MeshBasicMaterial({ map: roomTex }), room2: new THREE.MeshBasicMaterial({ map: roomTex2 }), room3: new THREE.MeshBasicMaterial({ map: roomTex3 }),
  rebar: new THREE.MeshPhysicalMaterial({ color: 0x6e3c24, metalness: 0.7, roughness: 0.55 }),
  crane: new THREE.MeshPhysicalMaterial({ color: 0xe9e6df, metalness: 0.25, roughness: 0.45, clearcoat: 0.3 }),
  dark: new THREE.MeshPhysicalMaterial({ color: 0x1a1a1b, metalness: 0.2, roughness: 0.6 }),
  led: new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.98, 0.92).multiplyScalar(2.4), clippingPlanes: [clipPlane] }),
  lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.8, 0.55).multiplyScalar(8) }),
  red: new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.1, 0.05).multiplyScalar(10) }),
  line: new THREE.LineBasicMaterial({ color: new THREE.Color(0.35, 0.72, 1.6), transparent: true, depthWrite: false, toneMapped: false, fog: false }),
  grid: new THREE.MeshBasicMaterial({ map: gridTex, transparent: true, depthWrite: false, toneMapped: false, fog: false, color: new THREE.Color(1.4, 1.4, 1.4) })
};

/* ---------------- размеры здания ---------------- */
const NF = 9, H = 3.3, HW = 12, HD = 9; // этажей, высота этажа, полуширина, полуглубина
const colX = [-12, -6, 0, 6, 12], colZ = [-9, -3, 3, 9];

// инстансы: каждый элемент знает свой этаж и «растёт», когда до него дошла стройка
class Inst {
  constructor(geo, mat, max, cast = true) { this.m = new THREE.InstancedMesh(geo, mat, max); this.m.count = 0; this.m.castShadow = cast; this.m.receiveShadow = true; this.m.frustumCulled = false; this.items = []; scene.add(this.m); this.last = -1; }
  add(x, y, z, sx, sy, sz, floor = 0, ry = 0, grow = 'y', color) { this.items.push({ x, y, z, sx, sy, sz, floor, ry, grow }); if (color) { this.m.setColorAt(this.items.length - 1, color); } this.m.count = this.items.length; }
  update(fn, force) {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    let sig = 0; const ks = this.items.map((it) => { const k = clamp(fn(it)); sig += k * (sig % 7 + 1); return k; });
    if (!force && sig === this.last) return; this.last = sig;
    this.items.forEach((it, i) => {
      const k = ks[i], kk = k <= 0.001 ? 0 : k;
      e.set(0, it.ry, 0); q.setFromEuler(e);
      if (it.grow === 'y') { s.set(kk ? it.sx : 0, it.sy * kk, kk ? it.sz : 0); p.set(it.x, it.y - it.sy / 2 + (it.sy * kk) / 2, it.z); }
      else { s.set(it.sx * kk, it.sy * kk, it.sz * kk); p.set(it.x, it.y, it.z); }
      m4.compose(p, q, s); this.m.setMatrixAt(i, m4);
    });
    this.m.instanceMatrix.needsUpdate = true;
  }
}
const box = new THREE.BoxGeometry(1, 1, 1);
const tone = () => new THREE.Color().setScalar(0.88 + Math.random() * 0.14);

/* ---------------- земля, разрез, подземный паркинг ---------------- */
const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), M.ground); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
{ // дыра под котлован не нужна: земля разрезается плоскостью вместе с паркингом
  scene.add(ground);
}
const paving = new THREE.Mesh(new THREE.BoxGeometry(46, 0.1, 40), M.paving); paving.position.set(0, 0.03, 2); paving.receiveShadow = true; scene.add(paving);
const road = new THREE.Mesh(new THREE.PlaneGeometry(600, 12), new THREE.MeshPhysicalMaterial({ color: 0x141415, roughness: 0.42, normalMap: asphaltN, normalScale: new THREE.Vector2(0.4, 0.4), clearcoat: 1, clearcoatRoughness: 0.08, clippingPlanes: [clipPlane] }));
road.rotation.x = -Math.PI / 2; road.position.set(0, 0.02, 30); road.receiveShadow = true; scene.add(road);
const earth = new THREE.Group(); scene.add(earth);
for (const [x0, x1, z0, z1] of [[-60, -15.5, -40, 40], [15.5, 60, -40, 40], [-15.5, 15.5, -40, -12.5], [-15.5, 15.5, 12.5, 40]]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 6, z1 - z0), M.soil); m.position.set((x0 + x1) / 2, -3.05, (z0 + z1) / 2); earth.add(m);
}
{ const m = new THREE.Mesh(new THREE.BoxGeometry(31, 1.8, 25), M.soil); m.position.set(0, -5.15, 0); earth.add(m); }
const capShape = new THREE.Shape(); capShape.moveTo(-60, -6.1); capShape.lineTo(60, -6.1); capShape.lineTo(60, -0.05); capShape.lineTo(-60, -0.05); capShape.closePath();
{ const h = new THREE.Path(); h.moveTo(-15.5, -4.25); h.lineTo(15.5, -4.25); h.lineTo(15.5, -0.05); h.lineTo(-15.5, -0.05); h.closePath(); capShape.holes.push(h); }
const soilCap = new THREE.Mesh(new THREE.ShapeGeometry(capShape), M.soilCap); scene.add(soilCap);
const park = new THREE.Group(); scene.add(park);
{
  const fl = new THREE.Mesh(new THREE.BoxGeometry(31, 0.3, 25), [M.concreteClip, M.concreteClip, M.parkFloor, M.concreteClip, M.concreteClip, M.concreteClip]); fl.position.y = -4.1; fl.receiveShadow = true; park.add(fl);
  for (const [w, d, x, z] of [[31, 0.5, 0, -12.25], [31, 0.5, 0, 12.25], [0.5, 25, -15.25, 0], [0.5, 25, 15.25, 0]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 3.95, d), M.concreteClip); m.position.set(x, -2.0, z); m.castShadow = m.receiveShadow = true; park.add(m); }
  for (const x of colX) for (const z of colZ) { const c = new THREE.Mesh(new RoundedBoxGeometry(0.55, 3.95, 0.55, 2, 0.04), M.concreteClip); c.position.set(x, -2.0, z); c.castShadow = c.receiveShadow = true; park.add(c); }
  for (let i = -3; i <= 3; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(28, 0.04, 0.14), M.led); l.position.set(0, -0.36, i * 3.4); park.add(l); }
  // машины
  const paints = [0x1c1d20, 0xd9d9d6, 0x223047, 0x6a6c70, 0x3b2a22, 0x0e0e0f, 0x9a9da3];
  const carGlass = new THREE.MeshPhysicalMaterial({ color: 0x0a0c10, metalness: 0.4, roughness: 0.04, clearcoat: 1 });
  const tyre = new THREE.MeshPhysicalMaterial({ color: 0x111111, roughness: 0.8 }), rim = new THREE.MeshPhysicalMaterial({ color: 0xbfc2c7, metalness: 1, roughness: 0.25 });
  const bodyG = new RoundedBoxGeometry(1.86, 0.62, 4.55, 4, 0.24), cabG = new RoundedBoxGeometry(1.62, 0.52, 2.45, 4, 0.22), wheelG = new THREE.CylinderGeometry(0.35, 0.35, 0.24, 28), rimG = new THREE.CylinderGeometry(0.22, 0.22, 0.25, 24);
  const lightG = new THREE.BoxGeometry(1.5, 0.06, 0.04);
  let n = 0;
  const car = (x, z, ry) => {
    const g = new THREE.Group(), paint = new THREE.MeshPhysicalMaterial({ color: paints[n++ % paints.length], metalness: 0.6, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.03 });
    const b = new THREE.Mesh(bodyG, paint); b.position.y = 0.66; g.add(b);
    const c = new THREE.Mesh(cabG, carGlass); c.position.set(0, 1.18, -0.2); g.add(c);
    for (const [wx, wz] of [[-0.86, 1.45], [0.86, 1.45], [-0.86, -1.5], [0.86, -1.5]]) { const w = new THREE.Mesh(wheelG, tyre); w.rotation.z = Math.PI / 2; w.position.set(wx, 0.35, wz); g.add(w); const r = new THREE.Mesh(rimG, rim); r.rotation.z = Math.PI / 2; r.position.set(wx, 0.35, wz); g.add(r); }
    const tl = new THREE.Mesh(lightG, M.red); tl.position.set(0, 0.8, -2.27); g.add(tl);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.position.set(x, -3.95, z); g.rotation.y = ry; park.add(g);
  };
  [-12.15, -9.45, -6.75, -1.35, 1.35, 6.75, 9.45, 12.15].forEach((x) => car(x, -9.7, 0));
  [-10.8, -5.4, 4.05, 10.8].forEach((x) => car(x, -3.0, Math.PI));
}
const parkLights = [];
for (const x of [-7, 7]) { const l = new THREE.PointLight(0xfff1df, 120, 30, 2); l.position.set(x, -1.0, -4); scene.add(l); parkLights.push(l); }

/* ---------------- здание: каркас ---------------- */
const slabs = new Inst(box, M.concrete, NF + 2), cols = new Inst(new RoundedBoxGeometry(1, 1, 1, 1, 0.06), M.concrete, NF * 20), cores = new Inst(box, M.concrete, NF * 4), balc = new Inst(box, M.concrete, NF);
for (let f = 1; f <= NF; f++) slabs.add(0, f * H - 0.15, 0, 24.6, 0.3, 18.6, f, 0, 'y', tone());
const gslab = new THREE.Mesh(new THREE.BoxGeometry(31, 0.3, 25), M.concreteClip); gslab.position.y = -0.15; gslab.castShadow = gslab.receiveShadow = true; scene.add(gslab);
for (let f = 0; f < NF; f++) {
  for (const x of colX) for (const z of colZ) cols.add(x, f * H + (H - 0.3) / 2, z, 0.5, H - 0.3, 0.5, f, 0, 'y', tone());
  for (const [w, d, x, z] of [[6, 0.3, 0, -3], [6, 0.3, 0, 3], [0.3, 6, -3, 0], [0.3, 6, 3, 0]]) cores.add(x, f * H + (H - 0.3) / 2, z, w, H - 0.3, d, f, 0, 'y', tone());
  if (f >= 1) balc.add(0, f * H - 0.13, 10.1, 24.4, 0.26, 1.9, f, 0, 'y', tone());
}
// арматура, торчащая из колонн текущего верхнего этажа
const rebar = new Inst(new THREE.CylinderGeometry(0.018, 0.018, 1, 6), M.rebar, 20 * 6, false);
for (const x of colX) for (const z of colZ) for (const [dx, dz] of [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16], [0, -0.16], [0, 0.16]]) rebar.add(x + dx, 0, z + dz, 1, 1.1, 1, 0);

/* ---------------- фасад ---------------- */
const glassI = new Inst(new THREE.PlaneGeometry(1, 1), M.glass, NF * 28 + NF * 2, false);
const roomSets = [new Inst(new THREE.PlaneGeometry(1, 1), M.room, NF * 28, false), new Inst(new THREE.PlaneGeometry(1, 1), M.room2, NF * 28, false), new Inst(new THREE.PlaneGeometry(1, 1), M.room3, NF * 28, false)];
const mull = new Inst(box, M.frame, NF * 60), spand = new Inst(box, M.frame, (NF + 1) * 4), fins = new Inst(box, M.bronze, NF * 24), rail = new Inst(box, M.frame, NF * 2);
const roomItems = [];
for (let f = 0; f < NF; f++) {
  const y0 = f * H + 0.35, gh = H - 0.7, yc = y0 + gh / 2;
  const sides = [ // [нормаль, ширина стороны, длина вдоль]
    { nx: 0, nz: 1, len: 24, off: HD + 0.42 }, { nx: 0, nz: -1, len: 24, off: HD + 0.42 }, { nx: 1, nz: 0, len: 18, off: HW + 0.42 }, { nx: -1, nz: 0, len: 18, off: HW + 0.42 }];
  for (const sd of sides) {
    const bays = sd.len / 3, ry = Math.atan2(sd.nx, sd.nz);
    for (let b = 0; b < bays; b++) {
      const u = -sd.len / 2 + 1.5 + b * 3, x = sd.nz !== 0 ? u : sd.nx * sd.off, z = sd.nz !== 0 ? sd.nz * sd.off : u;
      glassI.add(x, yc, z, 2.96, gh, 1, f, ry, 'y');
      const ix = x - sd.nx * 2.4, iz = z - sd.nz * 2.4, kind = f === 0 ? 0 : (Math.random() * 3) | 0, set = roomSets[kind]; set.add(ix, yc, iz, 2.96, gh, 1, f, ry, 'y'); roomItems.push({ set, i: set.items.length - 1, f, on: f === 0 ? 0 : Math.random() * 0.95, warm: f === 0 ? 1.15 : 0.55 + Math.random() * 0.5 });
      mull.add(x + sd.nx * 0.04, f * H + H / 2, z + sd.nz * 0.04, sd.nz !== 0 ? 0.05 : 0.12, H - 0.6, sd.nz !== 0 ? 0.12 : 0.05, f);
      const ex = sd.nz !== 0 ? u - 1.5 : x, ez = sd.nz !== 0 ? z : u - 1.5;
      mull.add(ex + sd.nx * 0.05, f * H + H / 2, ez + sd.nz * 0.05, sd.nz !== 0 ? 0.09 : 0.2, H, sd.nz !== 0 ? 0.2 : 0.09, f);
      if (sd.nz <= 0) fins.add(ex + sd.nx * 0.42, f * H + H / 2, ez + sd.nz * 0.42, sd.nz !== 0 ? 0.14 : 0.75, H, sd.nz !== 0 ? 0.75 : 0.14, f);
    }
  }
  // полоса перекрытия по периметру (тёмный металл)
  spand.add(0, f * H, HD + 0.45, 24.9, 0.7, 0.12, f); spand.add(0, f * H, -HD - 0.45, 24.9, 0.7, 0.12, f); spand.add(HW + 0.45, f * H, 0, 0.12, 0.7, 18.9, f); spand.add(-HW - 0.45, f * H, 0, 0.12, 0.7, 18.9, f);
  if (f >= 1) { glassI.add(0, f * H + 0.55, 11.03, 24.3, 1.05, 1, f, 0, 'y'); rail.add(0, f * H + 1.1, 11.03, 24.4, 0.06, 0.08, f); }
}
// крыша: парапет и машинное помещение
const roof = new THREE.Group(); scene.add(roof);
{ const p = new THREE.Mesh(new THREE.BoxGeometry(25, 1.0, 19), M.frame); p.position.y = NF * H + 0.5; roof.add(p);
  const mr = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 6), M.concrete); mr.position.set(-2, NF * H + 1.5, -2); roof.add(mr);
  roof.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } }); }
const roofLed = new THREE.Group(); scene.add(roofLed);
for (const [w, d, x, z] of [[24.9, 0.06, 0, HD + 0.56], [24.9, 0.06, 0, -HD - 0.56], [0.06, 18.9, HW + 0.56, 0], [0.06, 18.9, -HW - 0.56, 0]]) { const s = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), M.lamp); s.position.set(x, NF * H - 0.05, z); roofLed.add(s); }
{ const can = new THREE.Mesh(new THREE.BoxGeometry(9, 0.25, 3.2), M.frame); can.position.set(0, 3.0, 11.0); can.castShadow = true; roof.parent.add(can); window.__canopy = can;
  for (const x of [-3, 0, 3]) { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 16), M.lamp); d.position.set(x, 2.86, 11.2); can.parent.add(d); window.__canopyLights = (window.__canopyLights || []).concat(d); } }
// фонари вдоль улицы
const lamps = new THREE.Group(); scene.add(lamps);
for (let i = -3; i <= 3; i++) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 6, 12), M.frame); pole.position.set(i * 9, 3, 24); pole.castShadow = true; lamps.add(pole); const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.3), M.lamp); head.position.set(i * 9 + 0.35, 6, 24); lamps.add(head); }

/* ---------------- башенный кран ---------------- */
const crane = new THREE.Group(); scene.add(crane);
const jib = new THREE.Group();
{ const L = new Inst(box, M.crane, 2000); scene.remove(L.m); crane.add(L.m);
  const chord = (x, y, z, sx, sy, sz) => L.add(x, y, z, sx, sy, sz, 0, 0, 's');
  const mastH = 46, w = 1.6;
  for (const [x, z] of [[-w / 2, -w / 2], [w / 2, -w / 2], [-w / 2, w / 2], [w / 2, w / 2]]) chord(x, mastH / 2, z, 0.16, mastH, 0.16);
  const brace = new Inst(box, M.crane, 400); scene.remove(brace.m); crane.add(brace.m);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  let bi = 0; const diag = (x, y, z, rx, rz, len, ry = 0) => { e.set(rx, ry, rz); q.setFromEuler(e); s.set(0.08, len, 0.08); p.set(x, y, z); m4.compose(p, q, s); brace.m.setMatrixAt(bi++, m4); };
  for (let y = 0; y < mastH; y += w) { const a = Math.atan2(w, w); for (const sz of [-1, 1]) diag(0, y + w / 2, sz * w / 2, 0, (y / w) % 2 ? a : -a, w * Math.SQRT2); for (const sx of [-1, 1]) diag(sx * w / 2, y + w / 2, 0, (y / w) % 2 ? -a : a, 0, w * Math.SQRT2); }
  // стрела и противовесная консоль
  const jl = 38, cl = 12, jh = 1.4;
  const J = new Inst(box, M.crane, 600); scene.remove(J.m); jib.add(J.m);
  J.add(jl / 2 - 2, 0, -0.6, jl, 0.14, 0.14, 0, 0, 's'); J.add(jl / 2 - 2, 0, 0.6, jl, 0.14, 0.14, 0, 0, 's'); J.add(jl / 2 - 2, jh, 0, jl, 0.14, 0.14, 0, 0, 's');
  J.add(-cl / 2, 0.3, 0, cl, 0.5, 1.6, 0, 0, 's');
  for (let i = 0; i < 4; i++) J.add(-cl + 1 + i * 0.9, -0.6, 0, 0.8, 1.6, 1.9, 0, 0, 's');
  J.update(() => 1, true);
  const jb = new Inst(box, M.crane, 300); scene.remove(jb.m); jib.add(jb.m); let ji = 0;
  for (let x = -2; x < jl - 2; x += 1.5) for (const sz of [-1, 1]) { e.set(sz * 0.45, 0, (ji % 2 ? 0.75 : -0.75)); q.setFromEuler(e); s.set(0.06, 1.75, 0.06); p.set(x + 0.75, jh / 2, sz * 0.3); m4.compose(p, q, s); jb.m.setMatrixAt(ji++, m4); }
  jb.m.count = ji; jb.m.instanceMatrix.needsUpdate = true;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 2.2), M.crane); cab.position.set(0.9, -1.2, 1.6); jib.add(cab);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.9, 5, 4), M.crane); tip.position.set(0, 3, 0); tip.rotation.y = Math.PI / 4; jib.add(tip);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), M.red); light.position.set(0, 5.6, 0); jib.add(light);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 6), M.dark); cable.name = 'cable'; jib.add(cable);
  const hook = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.5), new THREE.MeshPhysicalMaterial({ color: 0xd9a21b, roughness: 0.4, metalness: 0.3 })); hook.name = 'hook'; jib.add(hook);
  jib.position.y = mastH + 0.6; crane.add(jib);
  L.update(() => 1, true); brace.m.count = bi; brace.m.instanceMatrix.needsUpdate = true;
  crane.position.set(-21, 0, -2);
  crane.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
}

/* ---------------- чертёж: светящиеся линии будущего здания ---------------- */
const bp = new THREE.Group(); scene.add(bp);
{
  const v = [], L = (a, b) => v.push(...a, ...b);
  const rect = (y, hw, hd) => { L([-hw, y, -hd], [hw, y, -hd]); L([hw, y, -hd], [hw, y, hd]); L([hw, y, hd], [-hw, y, hd]); L([-hw, y, hd], [-hw, y, -hd]); };
  for (let f = 0; f <= NF; f++) rect(f * H, HW + 0.42, HD + 0.42);
  for (let x = -HW; x <= HW; x += 3) { L([x, 0, HD + 0.42], [x, NF * H, HD + 0.42]); L([x, 0, -HD - 0.42], [x, NF * H, -HD - 0.42]); }
  for (let z = -HD; z <= HD; z += 3) { L([HW + 0.42, 0, z], [HW + 0.42, NF * H, z]); L([-HW - 0.42, 0, z], [-HW - 0.42, NF * H, z]); }
  rect(-4.2, 15.5, 12.5); rect(-0.1, 15.5, 12.5); for (const [x, z] of [[-15.5, -12.5], [15.5, -12.5], [15.5, 12.5], [-15.5, 12.5]]) L([x, -4.2, z], [x, -0.1, z]);
  for (const x of colX) for (const z of colZ) { rect(0.02, 0.25, 0.25); v.splice(v.length - 24, 24); const s = 0.3; L([x - s, 0.02, z - s], [x + s, 0.02, z - s]); L([x + s, 0.02, z - s], [x + s, 0.02, z + s]); L([x + s, 0.02, z + s], [x - s, 0.02, z + s]); L([x - s, 0.02, z + s], [x - s, 0.02, z - s]); }
  // размерные линии
  const dz = HD + 4; L([-HW, 0.02, dz], [HW, 0.02, dz]); for (let x = -HW; x <= HW; x += 6) L([x, 0.02, dz - 0.6], [x, 0.02, dz + 0.6]);
  const dx = HW + 4; L([dx, 0.02, -HD], [dx, 0.02, HD]); for (let z = -HD; z <= HD; z += 6) L([dx - 0.6, 0.02, z], [dx + 0.6, 0.02, z]);
  L([dx, 0, HD + 4], [dx, NF * H, HD + 4]); for (let f = 0; f <= NF; f++) L([dx - 0.5, f * H, HD + 4], [dx + 0.5, f * H, HD + 4]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  bp.add(new THREE.LineSegments(g, M.line));
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), M.grid); grid.rotation.x = -Math.PI / 2; grid.position.y = 0.05; bp.add(grid);
}

/* ---------------- постобработка ---------------- */
const rt = new THREE.WebGLRenderTarget(innerWidth * DPR, innerHeight * DPR, { type: THREE.HalfFloatType, samples: mobile ? 2 : 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.42, 0.55, 0.95); composer.addPass(bloom);
composer.addPass(new OutputPass());
const sharpen = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, px: { value: new THREE.Vector2() }, k: { value: 0.28 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform sampler2D tDiffuse; uniform vec2 px; uniform float k; varying vec2 vUv; void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; vec3 a = texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb, b = texture2D(tDiffuse, vUv - vec2(0.0, px.y)).rgb, d = texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb, e = texture2D(tDiffuse, vUv - vec2(px.x, 0.0)).rgb; vec3 mn = min(c, min(min(a, b), min(d, e))), mx = max(c, max(max(a, b), max(d, e))); gl_FragColor = vec4(clamp(c + k * (4.0 * c - a - b - d - e), mn * 0.85, mx * 1.15 + 0.02), 1.0); }'
});
composer.addPass(sharpen);
function resize() {
  const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
  renderer.setPixelRatio(DPR); renderer.setSize(w, h, false); composer.setPixelRatio(DPR); composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix(); sharpen.uniforms.px.value.set(1 / (w * DPR), 1 / (h * DPR));
}
addEventListener('resize', resize); resize();

/* ---------------- сценарий прокрутки ---------------- */
const CAM = [ // азимут, высота угла, дистанция, цель по Y
  { p: 0.00, az: 0.62, el: 0.62, d: 92, ty: 6 },
  { p: 0.12, az: 0.5, el: 0.5, d: 86, ty: 4 },
  { p: 0.22, az: 0.24, el: 0.17, d: 48, ty: -2.2 },
  { p: 0.34, az: 0.12, el: 0.13, d: 45, ty: -2.2 },
  { p: 0.48, az: 0.72, el: 0.36, d: 84, ty: 10 },
  { p: 0.66, az: 1.0, el: 0.2, d: 80, ty: 13 },
  { p: 0.84, az: 0.52, el: 0.14, d: 72, ty: 15 },
  { p: 1.00, az: 0.38, el: 0.08, d: 68, ty: 16 }
];
function camAt(p) {
  let i = 0; while (i < CAM.length - 2 && p > CAM[i + 1].p) i++;
  const a = CAM[i], b = CAM[i + 1], t = smooth(0, 1, (p - a.p) / (b.p - a.p));
  return { az: lerp(a.az, b.az, t), el: lerp(a.el, b.el, t), d: lerp(a.d, b.d, t), ty: lerp(a.ty, b.ty, t) };
}
const STAGES = ['Проект', 'Паркинг и фундамент', 'Каркас', 'Фасад и стекло', 'Объект сдан'], SB = [0, 0.15, 0.36, 0.6, 0.86];
const pg = document.getElementById('pg'), sn = document.getElementById('sn'), st = document.getElementById('st'), ht = document.getElementById('ht');
let pT = 0, pS = 0, mx = 0, my = 0, mxS = 0, myS = 0, lastStage = -1, sxS = 1;
const HC = [['hc1', 0.15, 0.31], ['hc2', 0.38, 0.56], ['hc3', 0.62, 0.8], ['hc4', 0.88, 1.05]].map(([id, a, b]) => ({ el: document.getElementById(id), a, b })).filter((c) => c.el);
const readP = () => { const r = hero.getBoundingClientRect(), tot = hero.offsetHeight - innerHeight; pT = clamp(-r.top / tot); };
addEventListener('scroll', readP, { passive: true }); readP(); pS = pT;
addEventListener('pointermove', (e) => { mx = (e.clientX / innerWidth) * 2 - 1; my = (e.clientY / innerHeight) * 2 - 1; }, { passive: true });
const roomCol = new THREE.Color();

const clock = new THREE.Clock(); let frames = 0, acc = 0, tuned = false, first = true;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  const r = hero.getBoundingClientRect(); if (r.bottom < -50 || document.hidden) return; // экран героя ушёл, не рисуем
  pS += (pT - pS) * (1 - Math.exp(-dt * 5)); if (Q.has('p')) pS = +Q.get('p');
  const p = pS;
  mxS += (mx - mxS) * (1 - Math.exp(-dt * 2.5)); myS += (my - myS) * (1 - Math.exp(-dt * 2.5));
  // этапы
  const bpK = 1 - smooth(0.07, 0.2, p), sec = smooth(0.13, 0.24, p) * (1 - smooth(0.4, 0.47, p));
  const bf = smooth(0.3, 0.62, p), ff = smooth(0.52, 0.86, p), lights = smooth(0.7, 0.97, p), craneK = (p > 0.17 && p < 0.9) ? 1 : 0;
  M.line.opacity = bpK; M.grid.opacity = bpK * 0.9; bp.visible = bpK > 0.01;
  const solid = 1 - smooth(0.05, 0.16, p) * 0 - 0; ground.visible = paving.visible = road.visible = bpK < 0.85; earth.visible = ground.visible;
  renderer.toneMappingExposure = lerp(0.62, 1.0, 1 - bpK);
  clipPlane.constant = lerp(80, 0.6, sec); soilCap.position.z = clipPlane.constant; soilCap.visible = sec > 0.01;
  park.visible = sec > 0.01;
  // каркас растёт этаж за этажом
  const fb = bf * (NF + 0.999); // сколько этажей построено (дробно)
  const fFac0 = ff * (NF + 0.999);
  slabs.update((it) => clamp((fb - it.floor + 1) * 4)); gslab.visible = bpK < 0.85;
  cols.update((it) => clamp(fb - it.floor));
  cores.update((it) => clamp(fb - it.floor));
  balc.update((it) => clamp((fb - it.floor) * 3));
  const top = Math.floor(fb), building = bf > 0.001 && bf < 0.999;
  rebar.items.forEach((it) => { it.y = top * H + 0.55; }); rebar.update(() => (building ? 1 : 0), true);
  roof.visible = fb >= NF; window.__canopy.visible = fFac0 > 0.5; window.__canopyLights.forEach((d) => (d.visible = fFac0 > 0.5)); roof.scale.y = clamp((fb - NF + 0.3) * 3) || 0.0001;
  // фасад закрывается снизу вверх
  const fFac = ff * (NF + 0.999);
  glassI.update((it) => clamp(fFac - it.floor)); mull.update((it) => clamp(fFac - it.floor)); spand.update((it) => clamp((fFac - it.floor + 0.4) * 2));
  fins.update((it) => clamp(fFac - it.floor)); rail.update((it) => clamp(fFac - it.floor));
  roomSets.forEach((rs) => rs.update((it) => clamp(fFac - it.floor)));
  roomItems.forEach((ri) => { const on = lights > ri.on ? ri.warm : 0.025; roomCol.setRGB(on * 1.25, on * 1.18, on * 1.1); ri.set.m.setColorAt(ri.i, roomCol); });
  roomSets.forEach((rs) => { if (rs.m.instanceColor) rs.m.instanceColor.needsUpdate = true; });
  roofLed.visible = lights > 0.3; parkLights.forEach((l) => (l.visible = park.visible));
  // кран
  crane.visible = craneK > 0.5 && ground.visible; crane.position.y = 0;
  jib.rotation.y = -0.6 + p * 2.2 + Math.sin(t * 0.2) * 0.05;
  const cab = jib.getObjectByName('cable'), hk = jib.getObjectByName('hook'), hx = 22 - p * 8, hd = 18 + Math.sin(t * 0.5) * 2;
  cab.scale.y = hd; cab.position.set(hx, -hd / 2, 0); hk.position.set(hx, -hd - 0.4, 0);
  lamps.visible = ground.visible && sec < 0.05;
  // камера
  const c = camAt(p), portrait = camera.aspect < 1, fit = portrait ? Math.max(1, 0.85 / camera.aspect) : Math.max(1, 1.45 / camera.aspect);
  const az = c.az + mxS * 0.06 + Math.sin(t * 0.08) * 0.02, el = clamp(c.el - myS * 0.03, 0.03, 1.2), d = c.d * fit;
  camera.position.set(Math.sin(az) * Math.cos(el) * d, c.ty + Math.sin(el) * d, Math.cos(az) * Math.cos(el) * d);
  camera.lookAt(0, c.ty + (portrait ? 13 * bpK : 0), 0);
  // подписи этапов
  let si = 0; for (let i = 0; i < SB.length; i++) if (p >= SB[i]) si = i;
  if (si !== lastStage) { lastStage = si; sn.textContent = '0' + (si + 1); st.textContent = STAGES[si]; }
  pg.style.transform = `scaleX(${p.toFixed(4)})`; const op = Math.round(Math.max(0, 1 - p / 0.12) * 50) / 50; ht.style.opacity = op; ht.style.pointerEvents = op < 0.1 ? 'none' : 'auto';
  // подписи этапов: плавно появляются и исчезают
  for (const c of HC) { const o = Math.min(clamp((p - c.a) / 0.035), clamp((c.b - p) / 0.035)); c.el.style.opacity = o.toFixed(3); c.el.style.transform = `translateY(${((1 - o) * 18).toFixed(1)}px)`; c.el.classList.toggle('on', o > 0.5); }
  // здание уходит в сторону, противоположную тексту (на телефоне текст сверху, сдвига нет)
  const sxT = p < 0.34 ? 1 : p < 0.59 ? -1 : p < 0.85 ? 1 : 0; sxS += (sxT - sxS) * (1 - Math.exp(-dt * 3));
  const W = canvas.clientWidth || innerWidth, Hh = canvas.clientHeight || innerHeight;
  if (!portrait && Math.abs(sxS) > 0.002) { const k = 0.34 * Math.abs(sxS); camera.setViewOffset(W * (1 + k), Hh, sxS > 0 ? 0 : W * k, 0, W, Hh); } else camera.clearViewOffset();
  composer.render();
  if (first) { first = false; window.__hero3dReady = true; window.__ready = true; }
  if (!tuned) { frames++; if (frames > 120) acc += dt; if (frames === 300) { const ms = (acc / 180) * 1000; tuned = true; if (ms > 30) { DPR = Math.max(1, DPR - 0.5); resize(); } if (ms > 45) { DPR = 1; bloom.enabled = false; resize(); } } }
}
frame();
