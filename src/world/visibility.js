import { state, ctx } from '../state.js';
import { isPointInJungleBush } from './terrain.js';
import { VISION_SPEC, isElevatedObserver, hasClearLineOfSight } from './los.js';
import { CANOPY_SPEC, worldState } from './shared.js';

function isEntityInsideSameBushOrCanopy(obsPos, targetBush) {
  if (!obsPos || !targetBush) return false;
  if (CANOPY_SPEC.hasCanopy && (obsPos.y || 0) >= 3.8) return true;
  const revealR = targetBush.radius + 0.45;
  const dx = obsPos.x - targetBush.x;
  const dz = obsPos.z - targetBush.z;
  return dx * dx + dz * dz <= revealR * revealR;
}

export function hasAllyVisionNear(pos, maxDist = VISION_SPEC.bushSpotRange, observerTeam = state.myTeam) {
  const players = ctx.entities.players || [];
  const activeToolBeacons = ctx.entities.activeToolBeacons || [];
  const targetBush = isPointInJungleBush(pos);
  const maxDistSq = maxDist * maxDist;

  for (let i = 0; i < players.length; i++) {
    const mate = players[i];
    if (mate.tutorialHidden || mate.team !== observerTeam || mate.state === 'sitting') continue;
    if (targetBush) {
      if (isEntityInsideSameBushOrCanopy(mate.pos, targetBush) && hasClearLineOfSight(mate.pos, pos, false)) {
        return true;
      }
      continue;
    }
    const dx = mate.pos.x - pos.x;
    const dz = mate.pos.z - pos.z;
    if (dx * dx + dz * dz < maxDistSq && hasClearLineOfSight(mate.pos, pos, false)) return true;
  }

  for (let i = 0; i < activeToolBeacons.length; i++) {
    const b = activeToolBeacons[i];
    if (b.team !== observerTeam) continue;
    if (targetBush) {
      if (isEntityInsideSameBushOrCanopy(b.pos, targetBush) && hasClearLineOfSight(b.pos, pos, false)) return true;
      continue;
    }
    const dx = b.x - pos.x;
    const dz = b.z - pos.z;
    if (dx * dx + dz * dz < maxDistSq && hasClearLineOfSight(b.pos, pos, false)) return true;
  }
  return false;
}

export function canPlayerSeePoint(observer, targetPos, targetStealthBush = null) {
  if (!observer || !targetPos) return false;
  const oy = observer.pos.y || 0;
  const dx = targetPos.x - observer.pos.x;
  const dz = targetPos.z - observer.pos.z;
  const dist = Math.hypot(dx, dz);

  if (targetStealthBush) {
    if (observer.state === 'sitting') return false;
    const bushObj = typeof targetStealthBush === 'object' ? targetStealthBush : isPointInJungleBush(targetPos);
    if (bushObj) {
      return isEntityInsideSameBushOrCanopy(observer.pos, bushObj) && hasClearLineOfSight(observer.pos, targetPos, false);
    }
    return dist <= VISION_SPEC.bushSpotRange && hasClearLineOfSight(observer.pos, targetPos, false);
  }

  const maxRange =
    observer.state === 'sitting'
      ? VISION_SPEC.sittingRange
      : isElevatedObserver(oy)
      ? VISION_SPEC.canopyRange
      : VISION_SPEC.groundRange;
  if (dist > maxRange) return false;

  if (dist > VISION_SPEC.proximityRadius || observer.state === 'sitting') {
    const fx = Math.sin(observer.facingAngle || 0);
    const fz = Math.cos(observer.facingAngle || 0);
    const cosAngle = (dx * fx + dz * fz) / Math.max(0.0001, dist);
    if (cosAngle < VISION_SPEC.cosFovHalf) return false;
  }

  return hasClearLineOfSight(observer.pos, targetPos, false);
}

export function isPlayerVisibleToTeam(targetPlayer, observerTeam = state.myTeam) {
  const players = ctx.entities.players || [];
  const activeToolBeacons = ctx.entities.activeToolBeacons || [];
  if (!targetPlayer || targetPlayer.tutorialHidden) return false;
  if (targetPlayer.team === observerTeam) return true;
  if (
    targetPlayer.state === 'rule1' &&
    targetPlayer.rule1Partner &&
    targetPlayer.rule1Partner.team === observerTeam
  ) {
    return true;
  }

  const targetBush = targetPlayer.state === 'standing' ? isPointInJungleBush(targetPlayer.pos) : null;
  for (let i = 0; i < players.length; i++) {
    const obs = players[i];
    if (obs.tutorialHidden || obs.team !== observerTeam) continue;
    if (canPlayerSeePoint(obs, targetPlayer.pos, targetBush)) return true;
  }

  for (let i = 0; i < activeToolBeacons.length; i++) {
    const b = activeToolBeacons[i];
    if (b.team !== observerTeam) continue;
    if (targetBush) {
      if (isEntityInsideSameBushOrCanopy(b.pos, targetBush) && hasClearLineOfSight(b.pos, targetPlayer.pos, false)) {
        return true;
      }
      continue;
    }
    const dist = Math.hypot(targetPlayer.pos.x - b.x, targetPlayer.pos.z - b.z);
    if (dist <= b.visionRadius && hasClearLineOfSight(b.pos, targetPlayer.pos, false)) return true;
  }
  return false;
}

function checkVisionCacheChanged(force, players, balls) {
  const activeLeafWalls = ctx.entities.activeLeafWalls || [];
  const activeToolWalls = ctx.entities.activeToolWalls || [];
  const activeToolBeacons = ctx.entities.activeToolBeacons || [];
  const neededLen = players.length * 7 + balls.length * 3 + 4;
  if (worldState.visionCacheNums.length < neededLen) {
    worldState.visionCacheNums = new Float64Array(neededLen);
    worldState.visionCacheLen = -1;
  }

  let same = !force && worldState.visionCacheMapId === state.mapId && worldState.visionCacheLen === neededLen;
  let idx = 0;
  const checkWrite = (val) => {
    if (same && worldState.visionCacheNums[idx] !== val) same = false;
    worldState.visionCacheNums[idx++] = val;
  };

  checkWrite(players.length);
  checkWrite(balls.length);
  checkWrite(activeToolBeacons.length);
  checkWrite(activeLeafWalls.length + activeToolWalls.length);
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    checkWrite(p.pos.x);
    checkWrite(p.pos.y || 0);
    checkWrite(p.pos.z);
    checkWrite(p.facingAngle || 0);
    checkWrite(p.state === 'sitting' ? 1 : p.state === 'rule1' ? 2 : 0);
    checkWrite(p.rule1Partner ? players.indexOf(p.rule1Partner) : -1);
    checkWrite(p.tutorialHidden ? 1 : 0);
  }
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    checkWrite(b.state === 'carried' ? 1 : b.state === 'scored' ? 2 : 0);
    checkWrite(b.carrier ? players.indexOf(b.carrier) : -1);
    checkWrite(b.tutorialHidden ? 1 : 0);
  }
  if (same) return false;
  worldState.visionCacheMapId = state.mapId;
  worldState.visionCacheLen = neededLen;
  return true;
}

export function updateTeamVisionState(force = false) {
  const players = ctx.entities.players || [];
  const balls = ctx.entities.balls || [];
  if (!checkVisionCacheChanged(force, players, balls)) return;

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (!p.visibleTo) p.visibleTo = { ally: true, enemy: true };
    if (p.tutorialHidden) {
      p.visibleTo.ally = false;
      p.visibleTo.enemy = false;
      continue;
    }
    p.visibleTo.ally = isPlayerVisibleToTeam(p, 'ally');
    p.visibleTo.enemy = isPlayerVisibleToTeam(p, 'enemy');
  }

  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    if (!b.visibleTo) b.visibleTo = { ally: true, enemy: true };
    if (b.tutorialHidden) {
      b.visibleTo.ally = false;
      b.visibleTo.enemy = false;
      continue;
    }
    if (b.state === 'carried' && b.carrier) {
      b.visibleTo.ally = !!b.carrier.visibleTo.ally;
      b.visibleTo.enemy = !!b.carrier.visibleTo.enemy;
    } else {
      b.visibleTo.ally = true;
      b.visibleTo.enemy = true;
    }
  }
}
