// Matériaux PBR (textures photo CC0 Poly Haven) avec UV en coordonnées monde :
// les textures gardent la même échelle quelle que soit la taille des bâtiments instanciés.
import * as THREE from 'three';

export const loadingManager = new THREE.LoadingManager();
const loader = new THREE.TextureLoader(loadingManager);
const cache = new Map();

function tex(name, srgb) {
  if (cache.has(name)) return cache.get(name);
  const t = loader.load(`assets/tex/${name}.jpg`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  cache.set(name, t);
  return t;
}

const WORLD_UV = (roofFlat) => /* glsl */`
#include <uv_vertex>
#ifdef USE_INSTANCING
  vec4 wp_ = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vec3 wn_ = normalize(mat3(modelMatrix * instanceMatrix) * normal);
#else
  vec4 wp_ = modelMatrix * vec4(position, 1.0);
  vec3 wn_ = normalize(mat3(modelMatrix) * normal);
#endif
  vec3 an_ = abs(wn_);
  vec2 tuv_ = an_.y > 0.5 ? wp_.xz : (an_.x > an_.z ? wp_.zy : wp_.xy);
  tuv_ *= texScale;
  ${roofFlat ? 'if (an_.y > 0.5) tuv_ = vec2(0.08, 0.92);' : ''}
#ifdef USE_MAP
  vMapUv = tuv_;
#endif
#ifdef USE_NORMALMAP
  vNormalMapUv = tuv_;
#endif
#ifdef USE_ROUGHNESSMAP
  vRoughnessMapUv = tuv_;
#endif
#ifdef USE_EMISSIVEMAP
  vEmissiveMapUv = tuv_;
#endif
`;

export function applyWorldUV(m, scale, roofFlat = false) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.texScale = { value: scale };
    sh.vertexShader = 'uniform float texScale;\n' + sh.vertexShader.replace('#include <uv_vertex>', WORLD_UV(roofFlat));
  };
  m.customProgramCacheKey = () => `wuv_${scale}_${roofFlat}`;
  return m;
}

export function pbr(base, { scale = 0.25, color = 0xffffff, roughness = 1, metalness = 0, normalScale = 1 } = {}) {
  const m = new THREE.MeshStandardMaterial({
    map: tex(base + '_diff', true), normalMap: tex(base + '_nor'), roughnessMap: tex(base + '_rough'),
    color, roughness, metalness,
  });
  m.normalScale.set(normalScale, normalScale);
  return applyWorldUV(m, scale);
}

// Façade d'immeuble : une fenêtre par tuile de 3,2 m, éclairée la nuit (emissiveMap).
function windowTextures() {
  const S = 128;
  const mk = (lit) => {
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    if (!lit) {
      g.fillStyle = '#f2ece2'; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 900; i++) {
        const v = 215 + Math.random() * 40 | 0;
        g.fillStyle = `rgba(${v},${v - 8},${v - 20},0.35)`;
        g.fillRect(Math.random() * S, Math.random() * S, 2, 2);
      }
      g.fillStyle = 'rgba(120,100,80,0.25)'; g.fillRect(0, S - 10, S, 10); // salissure de bas de niveau
      g.fillStyle = '#cfc6b8'; g.fillRect(28, 26, 72, 66);              // encadrement
      g.fillStyle = '#26323a'; g.fillRect(34, 32, 60, 54);              // vitre
      g.fillStyle = 'rgba(160,190,210,0.35)'; g.fillRect(34, 32, 60, 18);
      g.fillStyle = '#5a6c74'; g.fillRect(62, 32, 4, 54);               // meneau
      g.fillStyle = '#d9d0c2'; g.fillRect(24, 90, 80, 6);               // appui
    } else {
      g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
      g.fillStyle = '#ffcf88'; g.fillRect(34, 32, 60, 54);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
  };
  return { map: mk(false), emissive: mk(true) };
}

// Normal map de vaguelettes générée une fois (somme de sinus), animée par décalage d'UV.
function waterMaterial() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S);
  const h = (x, y) => {
    const u = x / S * Math.PI * 2, v = y / S * Math.PI * 2;
    return Math.sin(u * 3 + v * 2) * 0.5 + Math.sin(u * 7 - v * 5) * 0.25 + Math.sin(u * 13 + v * 11) * 0.12 + Math.sin(-u * 5 + v * 17) * 0.08;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1);
    let nx = -dx * 2, ny = -dy * 2, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * S + x) * 4;
    img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const m = new THREE.MeshStandardMaterial({ color: 0x3a4f45, roughness: 0.22, metalness: 0.05, normalMap: t });
  m.normalScale.set(0.12, 0.12);
  return m;
}

export function createMaterials() {
  const w = windowTextures();
  const imm = new THREE.MeshStandardMaterial({
    map: w.map, normalMap: tex('beige_wall_001_nor'), roughness: 0.9,
    emissiveMap: w.emissive, emissive: 0xffffff, emissiveIntensity: 0,
  });
  applyWorldUV(imm, 1 / 3.2, true);

  const std = (o) => new THREE.MeshStandardMaterial(o);
  return {
    sand: pbr('aerial_sand', { scale: 0.08, color: 0xffd7a6 }),
    laterite: pbr('brown_mud_dry', { scale: 0.12, color: 0xffb98a }),
    asphalt: pbr('asphalt_02', { scale: 0.12, color: 0xb8b4ac }),
    banco: pbr('clay_plaster', { scale: 0.3, color: 0xffffff }),
    plaster: pbr('beige_wall_001', { scale: 0.3, color: 0xffffff }),
    concrete: pbr('concrete_floor_02', { scale: 0.2, color: 0xffffff }),
    tole: pbr('box_profile_metal_sheet', { scale: 0.4, color: 0xffffff, metalness: 0.4 }),
    grass: pbr('aerial_mud_1', { scale: 0.15, color: 0x9bd35a }),
    imm,
    paint: std({ color: 0xffffff, roughness: 0.55, metalness: 0.25 }),
    dome: std({ color: 0xffffff, roughness: 0.3, metalness: 0.15 }),
    bark: pbr('brown_mud_dry', { scale: 0.6, color: 0x9a8a78 }),
    leaf: std({ color: 0xffffff, roughness: 0.85 }),
    thatch: pbr('brown_mud_dry', { scale: 0.5, color: 0xffe7a0 }),
    line: std({ color: 0xe8e4d8, roughness: 0.7 }),
    water: waterMaterial(),
    glow: new THREE.MeshBasicMaterial({ color: 0x555555, toneMapped: false }),
  };
}
