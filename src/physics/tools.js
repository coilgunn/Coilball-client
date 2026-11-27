import {
  TUTORIAL_STEPS,
  PAD_DASH_DURATION,
  TOOL_EVO_META,
  state,
  mp,
  ctx,
} from '../state.js';
import { scene, players, spawnParticles } from '../render3d.js';
import { getStructureSurfaceY } from '../world.js';
import { markNavDynamicDirty } from '../nav.js';
import { sendNetMessage, broadcastToast } from '../net.js';
import { showToast } from '../ui.js';
import { markTutorialCheck } from '../modes.js';
import {
  THREE,
  activeToolBeacons,
  activeToolWalls,
  activeToolPads,
  activeSlidePatches,
} from './shared.js';
import { clampToField } from './collision.js';
import { clearAllSlidePatches, spawnSlidePatch, updateSlidePatches } from './slide_patches.js';
import { deployBeaconTool, deployWallTool, deployPadTool } from './tool_builders.js';

function pruneToolsByOwner(arr, ownerId) {
  let removed = false;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i].ownerId === ownerId) {
      if (arr[i].group) scene.remove(arr[i].group);
      arr.splice(i, 1);
      removed = true;
    }
  }
  return removed;
}

function removePlayerExistingTools(ownerId) {
  pruneToolsByOwner(activeToolBeacons, ownerId);
  const removedWall = pruneToolsByOwner(activeToolWalls, ownerId);
  pruneToolsByOwner(activeToolPads, ownerId);
  if (removedWall) markNavDynamicDirty();
}

export function clearAllDeployedTools() {
  const hadWalls = activeToolWalls.length > 0;
  while (activeToolBeacons.length > 0) {
    const b = activeToolBeacons.pop();
    if (b.group) scene.remove(b.group);
  }
  while (activeToolWalls.length > 0) {
    const w = activeToolWalls.pop();
    if (w.group) scene.remove(w.group);
  }
  while (activeToolPads.length > 0) {
    const pad = activeToolPads.pop();
    if (pad.group) scene.remove(pad.group);
  }
  if (hadWalls) markNavDynamicDirty();
}

export function serializeLateToolsAndPatches() {
  const serializeTool = (t) => ({
    ownerId: t.ownerId,
    toolKey: t.toolKey,
    ox: t.ox,
    oy: t.oy,
    oz: t.oz,
    facingAngle: t.facingAngle,
    onCanopy: !!t.onCanopy,
  });
  return {
    tools: [
      ...activeToolBeacons.map(serializeTool),
      ...activeToolWalls.map(serializeTool),
      ...activeToolPads.map(serializeTool),
    ],
    slides: activeSlidePatches.map((sp) => ({
      ownerId: sp.ownerId,
      team: sp.team,
      x: sp.x,
      y: sp.y,
      z: sp.z,
      timer: Number(sp.timer.toFixed(2)),
    })),
  };
}

export function applyLateToolsAndPatches(data) {
  if (!data) return;
  clearAllDeployedTools();
  clearAllSlidePatches();
  (data.tools || []).forEach((t) => {
    const owner = players.find((pl) => pl.id === t.ownerId);
    if (!owner) return;
    deployPlayerTool(owner, t.toolKey, {
      x: t.ox,
      y: t.oy,
      z: t.oz,
      facingAngle: t.facingAngle,
      onCanopy: !!t.onCanopy,
      fromNetwork: true,
    });
  });
  (data.slides || []).forEach((sp) => {
    spawnSlidePatch(sp.ownerId, sp.team, sp.x, sp.y, sp.z, false);
    const created = activeSlidePatches[activeSlidePatches.length - 1];
    if (created && typeof sp.timer === 'number') {
      created.timer = Math.max(0.05, sp.timer);
    }
  });
  markNavDynamicDirty();
}

export function deployPlayerTool(p, toolKey, cfg) {
  const { x: ox, y: oy, z: oz, facingAngle, onCanopy = false, fromNetwork = false } = cfg;
  if (state.vanillaMode) return false;
  if (!p || !toolKey || !TOOL_EVO_META[toolKey]) return false;
  if (!fromNetwork && p.toolCooldown > 0) {
    showToast(`⏳ <strong>Outil en recharge</strong> (${p.toolCooldown.toFixed(1)}s) !`, 1300);
    return false;
  }
  if (!fromNetwork) p.toolCooldown = 4.0;

  const dirX = Math.sin(facingAngle);
  const dirZ = Math.cos(facingAngle);
  const placeDist = toolKey === 'beacon' ? 2.5 : 2.2;
  const rawPos = new THREE.Vector3(ox + dirX * placeDist, oy, oz + dirZ * placeDist);
  clampToField(rawPos, 0.75, null, { onCanopy: !!onCanopy, isAirborne: false });
  const px = rawPos.x;
  const pz = rawPos.z;
  const py = getStructureSurfaceY(px, pz, !!onCanopy).y;

  removePlayerExistingTools(p.id);

  const accentHex = p.team === 'ally' ? 0xfacc15 : 0xc084fc;
  const group = new THREE.Group();
  group.position.set(px, py, pz);
  scene.add(group);

  const placement = { ox, oy, oz, px, py, pz, facingAngle, dirX, dirZ, onCanopy };
  if (toolKey === 'beacon') deployBeaconTool(p, placement, group, accentHex);
  else if (toolKey === 'wall') deployWallTool(p, placement, group, accentHex);
  else if (toolKey === 'pad') deployPadTool(p, placement, group, accentHex);

  spawnParticles(new THREE.Vector3(px, py + 0.5, pz), accentHex, 14);
  ctx.api.playSfx?.('tool_' + toolKey, { pos: { x: px, y: py, z: pz } });
  if (!fromNetwork) {
    const tMeta = TOOL_EVO_META[toolKey];
    broadcastToast(`${tMeta.icon} <strong>${p.role}</strong> déploie : <strong>${tMeta.shortLabel}</strong> !`, 2200);
    if (state.mode === 'tutorial' && state.tutorialStep === TUTORIAL_STEPS.TOOLS && p.team === 'ally') {
      markTutorialCheck('toolBought');
      markTutorialCheck('toolDeployed');
    }
    if (mp.enabled) {
      sendNetMessage({
        type: 'MP_TOOL_DEPLOY',
        peerId: mp.myPeerId,
        team: p.team,
        role: p.role,
        toolKey,
        x: ox,
        y: oy,
        z: oz,
        facingAngle,
        onCanopy: !!onCanopy,
      });
    }
  }
  return true;
}

function updateToolBeacons(dt) {
  for (let i = 0; i < activeToolBeacons.length; i++) {
    const b = activeToolBeacons[i];
    b.animTime += dt;
    if (b.orb) {
      b.orb.rotation.y += dt * 2.2;
      b.orb.position.y = 1.62 + Math.sin(b.animTime * 3.2) * 0.08;
    }
    if (b.radarRing) {
      const sc = 0.8 + ((b.animTime * 0.85) % 1.0) * 1.4;
      b.radarRing.scale.setScalar(sc);
      b.radarRing.material.opacity = 0.45 * (1 - ((b.animTime * 0.85) % 1.0));
    }
  }
}

function updateToolPads(dt) {
  for (let i = 0; i < activeToolPads.length; i++) {
    const pad = activeToolPads[i];
    pad.animTime += dt;
    if (pad.arrows) {
      pad.arrows.forEach((arr, idx) => {
        arr.material.opacity = 0.45 + 0.55 * Math.max(0, Math.sin(pad.animTime * 7 - idx * 1.1));
      });
    }
    for (const pid in pad.cooldownByPlayer) {
      pad.cooldownByPlayer[pid] -= dt;
      if (pad.cooldownByPlayer[pid] <= 0) delete pad.cooldownByPlayer[pid];
    }
    for (let pIdx = 0; pIdx < players.length; pIdx++) {
      const pl = players[pIdx];
      if (pl.tutorialHidden || pl.state !== 'standing') continue;
      if (pad.cooldownByPlayer[pl.id] > 0) continue;
      if (Math.abs((pl.pos.y || 0) - pad.y) > 2.2) continue;
      const dx = pl.pos.x - pad.x;
      const dz = pl.pos.z - pad.z;
      if (dx * dx + dz * dz <= pad.radius * pad.radius) {
        pad.cooldownByPlayer[pl.id] = 1.0;
        pl.padBoostTimer = PAD_DASH_DURATION;
        pl.padDirX = pad.dirX;
        pl.padDirZ = pad.dirZ;
        pl.facingAngle = Math.atan2(pad.dirX, pad.dirZ);
        spawnParticles(pl.pos, 0x38bdf8, 12);
        ctx.api.playSfx?.('pad_boost', { pos: pl.pos });
      }
    }
  }
}

export function updateDeployedToolsAndPatches(dt) {
  updateSlidePatches(dt);
  updateToolBeacons(dt);
  updateToolPads(dt);
}
