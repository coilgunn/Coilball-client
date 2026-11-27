import { COLORS, FIELD, state, mp, ctx } from '../state.js';
import { THREE, balls, renderState, createToonMat, addAnimeOutline } from './shared.js';
import { scene } from './scene.js';

const PARTICLE_POOL_MAX = 260;
const PARTICLE_LOW_SPEC_MAX = 70;
const _tmpParticleColor = new THREE.Color();

const PARTICLE_VERTEX_SHADER = `
  attribute vec3 aStartPos;
  attribute vec3 aVelocity;
  attribute vec2 aTiming;
  attribute vec3 aColor;
  uniform float uTime;
  varying vec3 vColor;
  varying float vAlive;
  #include <fog_pars_vertex>

  void main() {
    float age = uTime - aTiming.x;
    float dur = aTiming.y;
    if (dur <= 0.0 || age < 0.0 || age >= dur) {
      vAlive = 0.0;
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    vAlive = 1.0;
    vColor = aColor;
    float sc = max(0.1, dur - age);
    vec3 worldCenter = aStartPos + aVelocity * age + vec3(0.0, -6.0 * age * age, 0.0);
    vec3 transformed = worldCenter + position * sc;
    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const PARTICLE_FRAGMENT_SHADER = `
  varying vec3 vColor;
  varying float vAlive;
  #include <fog_pars_fragment>

  void main() {
    if (vAlive < 0.5) discard;
    gl_FragColor = vec4(vColor, 1.0);
    #include <fog_fragment>
  }
`;

export function createBallMesh(colorKey) {
  const group = new THREE.Group();
  const sphereGeo = new THREE.SphereGeometry(0.52, 24, 24);
  const sphereMat = createToonMat(COLORS[colorKey].hex);
  const sphere = new THREE.Mesh(sphereGeo, sphereMat);
  sphere.castShadow = true;
  const outlineMesh = addAnimeOutline(sphere, 1.07, 0x0f172a);
  group.add(sphere);

  const ringGeo = new THREE.RingGeometry(0.58, 0.74, 24);
  const ringMat = new THREE.MeshBasicMaterial({
    color: COLORS[colorKey].hex,
    side: THREE.DoubleSide
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.48;
  group.add(ring);

  const stealthMaterials = [
    { mat: sphereMat, baseTransparent: false, baseOpacity: 1.0, baseDepthWrite: true, isOverlay: false },
    { mat: ringMat, baseTransparent: false, baseOpacity: 1.0, baseDepthWrite: true, isOverlay: false }
  ];

  scene.add(group);
  return {
    group,
    sphere,
    sphereMat,
    ring,
    ringMat,
    outlineMesh,
    outlineMat: outlineMesh.material,
    stealthMaterials,
    stealthAlpha: 1.0,
    _lastStealthBlend: false
  };
}

export function initBalls() {
  for (let i = 0; i < 2; i++) {
    const customSpawn = Array.isArray(FIELD.ballSpawns) && FIELD.ballSpawns[i];
    const startX = customSpawn ? customSpawn.x : 0;
    const startZ = customSpawn ? customSpawn.z : i === 0 ? FIELD.laneTopZ : FIELD.laneBotZ;
    const meshData = createBallMesh('green');
    balls.push({
      id: i,
      color: 'green',
      state: 'ground',
      carrier: null,
      onCanopy: false,
      pos: new THREE.Vector3(startX, 0.52, startZ),
      targetPos: new THREE.Vector3(startX, 0.52, startZ),
      vel: new THREE.Vector3(),
      thrownByTeam: null,
      mesh: meshData
    });
  }
}

function initParticleAttributes(geo) {
  const startPosAttr = new THREE.InstancedBufferAttribute(new Float32Array(PARTICLE_POOL_MAX * 3), 3);
  const velAttr = new THREE.InstancedBufferAttribute(new Float32Array(PARTICLE_POOL_MAX * 3), 3);
  const timingAttr = new THREE.InstancedBufferAttribute(new Float32Array(PARTICLE_POOL_MAX * 2), 2);
  const colorAttr = new THREE.InstancedBufferAttribute(new Float32Array(PARTICLE_POOL_MAX * 3), 3);

  startPosAttr.setUsage(THREE.DynamicDrawUsage);
  velAttr.setUsage(THREE.DynamicDrawUsage);
  timingAttr.setUsage(THREE.DynamicDrawUsage);
  colorAttr.setUsage(THREE.DynamicDrawUsage);

  geo.setAttribute('aStartPos', startPosAttr);
  geo.setAttribute('aVelocity', velAttr);
  geo.setAttribute('aTiming', timingAttr);
  geo.setAttribute('aColor', colorAttr);

  renderState.particleStartPosAttr = startPosAttr;
  renderState.particleVelAttr = velAttr;
  renderState.particleTimingAttr = timingAttr;
  renderState.particleColorAttr = colorAttr;
}

/**
 * Initialise le système de particules instanciées sur GPU (1 seul draw call,
 * intégration balistique et échelle calculées dans le vertex shader).
 */
export function initGpuParticleSystem() {
  if (renderState.particleMesh) {
    scene.remove(renderState.particleMesh);
    if (renderState.particleInstancedGeo) renderState.particleInstancedGeo.dispose();
    if (renderState.particleMesh.material) renderState.particleMesh.material.dispose();
  }

  const baseSphere = new THREE.SphereGeometry(0.14, 6, 6);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = baseSphere.index;
  geo.attributes.position = baseSphere.attributes.position;
  geo.instanceCount = state.lowSpecMode ? PARTICLE_LOW_SPEC_MAX : PARTICLE_POOL_MAX;
  renderState.particleInstancedGeo = geo;

  initParticleAttributes(geo);

  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    { uTime: { value: renderState.particleSimTime } }
  ]);
  renderState.particleUniforms = uniforms;

  const mat = new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    vertexShader: PARTICLE_VERTEX_SHADER,
    fragmentShader: PARTICLE_FRAGMENT_SHADER
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.name = 'gpu-particles';
  scene.add(mesh);
  renderState.particleMesh = mesh;
  renderState.particleCursor = 0;
}

/** Ajuste la capacité active du buffer GPU de particules (ex. passage Low Spec). */
export function setParticlePoolLimit(limit) {
  const geo = renderState.particleInstancedGeo;
  const timingAttr = renderState.particleTimingAttr;
  if (!geo || !timingAttr) return;
  const clamped = Math.max(1, Math.min(PARTICLE_POOL_MAX, Math.floor(limit)));
  if (clamped < geo.instanceCount) {
    const arr = timingAttr.array;
    for (let i = clamped; i < PARTICLE_POOL_MAX; i++) {
      arr[i * 2] = 0;
      arr[i * 2 + 1] = 0;
    }
    timingAttr.needsUpdate = true;
  }
  geo.instanceCount = clamped;
  renderState.particleCursor = renderState.particleCursor % clamped;
}

export function spawnParticles(pos, colorHex, count = 18) {
  const geo = renderState.particleInstancedGeo;
  if (!geo || !pos) return;
  const effCount = state.lowSpecMode ? Math.max(1, Math.ceil(count * 0.3)) : count;
  const poolLimit = state.lowSpecMode ? PARTICLE_LOW_SPEC_MAX : PARTICLE_POOL_MAX;
  if (geo.instanceCount !== poolLimit) {
    setParticlePoolLimit(poolLimit);
  }
  _tmpParticleColor.setHex(colorHex);

  const startArr = renderState.particleStartPosAttr.array;
  const velArr = renderState.particleVelAttr.array;
  const timingArr = renderState.particleTimingAttr.array;
  const colorArr = renderState.particleColorAttr.array;

  for (let i = 0; i < effCount; i++) {
    const idx = renderState.particleCursor;
    renderState.particleCursor = (renderState.particleCursor + 1) % poolLimit;
    const i3 = idx * 3;
    const i2 = idx * 2;

    startArr[i3] = pos.x;
    startArr[i3 + 1] = pos.y;
    startArr[i3 + 2] = pos.z;

    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 5;
    velArr[i3] = Math.cos(angle) * speed;
    velArr[i3 + 1] = 3 + Math.random() * 5;
    velArr[i3 + 2] = Math.sin(angle) * speed;

    timingArr[i2] = renderState.particleSimTime;
    timingArr[i2 + 1] = 0.8 + Math.random() * 0.4;

    colorArr[i3] = _tmpParticleColor.r;
    colorArr[i3 + 1] = _tmpParticleColor.g;
    colorArr[i3 + 2] = _tmpParticleColor.b;
  }

  renderState.particleStartPosAttr.needsUpdate = true;
  renderState.particleVelAttr.needsUpdate = true;
  renderState.particleTimingAttr.needsUpdate = true;
  renderState.particleColorAttr.needsUpdate = true;
}

export function updateParticles(dt) {
  if (!renderState.particleUniforms) return;
  if (ctx.api.isMenuOpen && ctx.api.isMenuOpen() && !mp.enabled) return;
  renderState.particleSimTime += dt;
  renderState.particleUniforms.uTime.value = renderState.particleSimTime;
}

export function applyBallColor(ball, colorKey) {
  ball.color = colorKey;
  ball.mesh.sphereMat.color.setHex(COLORS[colorKey].hex);
  ball.mesh.ringMat.color.setHex(COLORS[colorKey].hex);
}

export function applyMeshStealthAlpha(meshData, alpha) {
  if (!meshData) return;
  const clamped = Math.max(0.05, Math.min(1.0, typeof alpha === 'number' ? alpha : 1.0));
  meshData.stealthAlpha = clamped;

  const useBlend = clamped < 0.985;
  const stateChanged = !!meshData._lastStealthBlend !== useBlend;
  meshData._lastStealthBlend = useBlend;

  const showOutline = clamped >= 0.92;
  if (meshData.outlineMat) meshData.outlineMat.visible = showOutline;
  if (meshData.outlineMesh) meshData.outlineMesh.visible = showOutline;

  const mats = meshData.stealthMaterials;
  if (Array.isArray(mats)) {
    for (let i = 0; i < mats.length; i++) {
      const ms = mats[i];
      if (!ms || !ms.mat) continue;
      if (useBlend) {
        if (stateChanged) {
          ms.mat.transparent = true;
          ms.mat.depthWrite = ms.isOverlay ? false : true;
          if (ms.isOverlay) {
            ms.mat.polygonOffset = true;
            ms.mat.polygonOffsetFactor = -1;
            ms.mat.polygonOffsetUnits = -1;
          }
          ms.mat.needsUpdate = true;
        }
        ms.mat.opacity = ms.baseOpacity * clamped;
      } else if (stateChanged) {
        ms.mat.transparent = ms.baseTransparent;
        ms.mat.opacity = ms.baseOpacity;
        ms.mat.depthWrite = ms.baseDepthWrite;
        if (ms.isOverlay) {
          ms.mat.polygonOffset = false;
          ms.mat.polygonOffsetFactor = 0;
          ms.mat.polygonOffsetUnits = 0;
        }
        ms.mat.needsUpdate = true;
      }
    }
  }

  if (stateChanged && Array.isArray(meshData.overlayMeshes)) {
    const ro = useBlend ? 2 : 0;
    for (let i = 0; i < meshData.overlayMeshes.length; i++) {
      if (meshData.overlayMeshes[i]) meshData.overlayMeshes[i].renderOrder = ro;
    }
  }
}
