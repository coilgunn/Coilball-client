import { COLORS, TUTORIAL_STEPS, state, ctx } from '../state.js';
import { players, spawnParticles } from '../render3d.js';
import { getStructureSurfaceY } from '../world.js';
import { isPointProtectedByWaterWave } from '../ultimates.js';
import { broadcastToast } from '../net.js';
import {
  triggerGamepadRumble,
  showToast,
  updateTopHUD,
  updateRosterHUD,
} from '../ui.js';
import { markTutorialCheck } from '../modes.js';
import { cancelPassCharge } from './pass.js';
import { sitDownPlayer, freeFromRule1 } from './round_end.js';

function scheduleTutorialRecovery(ally) {
  if (state.tutorialStep === TUTORIAL_STEPS.RULE1) {
    showToast(
      `❌ <strong>Mauvais élément !</strong> 🔥 bat 🌿 : <strong>${ally.role}</strong> s'assoit et <strong>G reste bloquée</strong> ! Seul le bon élément (<strong>💧 C</strong>, car 💧 > 🔥) peut débloquer la situation !`,
      4200
    );
  }
  setTimeout(() => {
    if (state.mode !== 'tutorial' || state.phase !== 'play' || ally.state !== 'sitting') return;
    ally.state = 'standing';
    spawnParticles(ally.pos, 0xfacc15, 12);
    updateRosterHUD();
    if (state.tutorialStep !== TUTORIAL_STEPS.RULE1) {
      showToast('💡 <strong>Astuce Triangle :</strong> Choisissez une joueuse dont l’élément bat celui de l’adversaire (🌿 > 💧 > 🔥 > 🌿) !', 3400);
    }
  }, 1500);
}

function notifyTutorialAllyInterception() {
  if (state.tutorialStep === TUTORIAL_STEPS.TRIANGLE) {
    state.allyPE = Math.max(3, state.allyPE);
    markTutorialCheck('backSeen');
    markTutorialCheck('intercepted');
    showToast(
      '💥 <strong>Superbe interception (+🪙 PO) !</strong> Vous maîtrisez le triangle élémentaire (🔥 > 🌿) !',
      4000
    );
  } else if (state.tutorialStep === TUTORIAL_STEPS.RULE1) {
    markTutorialCheck('rule1Locked');
    markTutorialCheck('rule1Switched');
    markTutorialCheck('rule1Broken');
    const r1Alert = document.getElementById('rule1-alert');
    if (r1Alert) r1Alert.classList.add('hidden');
    showToast(
      '💧⚡ <strong>Situation débloquée !</strong> Seul le bon élément (<strong>💧 > 🔥</strong>) pouvait intercepter Adv C et libérer G !',
      4800
    );
  }
}

function handleInterception(winner, loser) {
  const winnerLabel = winner.team === 'ally' ? 'Or' : 'Violette';
  const loserLabel = loser.team === 'ally' ? 'Or' : 'Violette';
  if (
    winner.color === 'red' &&
    (loser.waterShieldTimer > 0 || isPointProtectedByWaterWave(loser.pos.x, loser.pos.z, 1.35))
  ) {
    spawnParticles(loser.pos, 0x38bdf8, 16);
    ctx.api.playSfx?.('water_shield_block', { pos: loser.pos });
    broadcastToast(
      `🛡️💧 <strong>Protection d'Eau !</strong> ${loserLabel} ${loser.role} est protégée contre le Feu de ${winnerLabel} ${winner.role} !`,
      2600
    );
    return;
  }

  sitDownPlayer(loser);
  const keepTutorialLock =
    winner.team === 'enemy' && state.mode === 'tutorial' && state.tutorialStep === TUTORIAL_STEPS.RULE1;
  if (winner.state === 'rule1' && !keepTutorialLock) {
    freeFromRule1(winner);
  }
  if (winner.team === 'ally') {
    state.allyPE += 1;
    state.roundAllyKills += 1;
  } else {
    state.enemyPE += 1;
    state.roundEnemyKills += 1;
  }
  spawnParticles(loser.pos, COLORS[winner.color].hex, 22);
  ctx.api.playSfx?.(state.myTeam === winner.team ? 'intercept_ally' : 'intercept_enemy', { pos: loser.pos });
  triggerGamepadRumble(200, 0.7, 0.5);

  const icon = winner.team === 'ally' ? '💥' : '🛑';
  broadcastToast(
    `${icon} <strong>Interception !</strong> Équipe ${winnerLabel} ${winner.role} (${COLORS[winner.color].name}) fait asseoir ${loserLabel} ${loser.role} (${COLORS[loser.color].name}) → <strong>+1 🪙 PO ${winnerLabel} !</strong>`,
    4000
  );

  if (state.mode === 'tutorial') {
    if (winner.team === 'ally') notifyTutorialAllyInterception();
    else scheduleTutorialRecovery(loser);
  }
  updateTopHUD();
  updateRosterHUD();
}

function handleRule1Lock(ally, enemy) {
  ally.state = 'rule1';
  enemy.state = 'rule1';
  ally.rule1Partner = enemy;
  enemy.rule1Partner = ally;
  for (const pl of [ally, enemy]) {
    pl.vel.set(0, 0, 0);
    pl.vy = 0;
    pl.isAirborne = false;
    pl.airSource = null;
    pl.isLaunching = false;
    pl.dashTimer = 0;
    pl.leafUltTimer = 0;
    const surf = getStructureSurfaceY(pl.pos.x, pl.pos.z, !!pl.onCanopy);
    pl.onCanopy = surf.zone !== 'ground';
    pl.pos.y = surf.y;
    if (pl.team === state.myTeam && pl.role === state.controlledRole) {
      cancelPassCharge();
    }
  }
  spawnParticles(ally.pos, 0xfacc15, 16);
  ctx.api.playSfx?.('rule1_lock', { pos: ally.pos });
  broadcastToast(
    `⚡ <strong>RÈGLE 1 DE ROCKET LEAGUE !</strong> Or ${ally.role} et Violette ${enemy.role} ont toutes deux la couleur ${COLORS[ally.color].name} : elles restent bloquées jusqu'à l'intervention d'une 3e joueuse du bon élément !`,
    5000
  );
  if (state.mode === 'tutorial' && state.tutorialStep === TUTORIAL_STEPS.RULE1) {
    markTutorialCheck('rule1Locked');
    showToast(
      state.mobileMode
        ? '⚡ <strong>RÈGLE 1 !</strong> Même couleur = blocage ! 🔥 Gauche (G) et 🔥 Adv C sont bloquées face à face. <strong>Seul le bon élément (💧 > 🔥)</strong> libère G — tapez <strong>Centre (C)</strong> puis touchez Adv C !'
        : '⚡ <strong>RÈGLE 1 !</strong> Même couleur = blocage ! 🔥 Gauche (G) et 🔥 Adv C sont bloquées face à face. <strong>Seul le bon élément (💧 > 🔥)</strong> libère G — passez sur <strong>💧 Centre (C) [2]</strong> puis touchez Adv C !',
      5500
    );
  } else if (state.mode === 'tutorial') {
    setTimeout(() => {
      if (state.mode === 'tutorial' && state.phase === 'play' && ally.state === 'rule1') {
        freeFromRule1(ally);
        const r1Alert = document.getElementById('rule1-alert');
        if (r1Alert) r1Alert.classList.add('hidden');
        updateRosterHUD();
      }
    }, 1800);
  }
  updateRosterHUD();
}

export function resolveContact(ally, enemy) {
  enemy.backRevealed = true;
  ally.backRevealed = true;
  if (!enemy.revealedTo) enemy.revealedTo = { ally: false, enemy: true };
  if (!ally.revealedTo) ally.revealedTo = { ally: true, enemy: false };
  enemy.revealedTo.ally = true;
  ally.revealedTo.enemy = true;

  if (COLORS[ally.color].beats === enemy.color) {
    handleInterception(ally, enemy);
  } else if (COLORS[enemy.color].beats === ally.color) {
    handleInterception(enemy, ally);
  } else if (ally.color === enemy.color && ally.state === 'standing' && enemy.state === 'standing') {
    handleRule1Lock(ally, enemy);
  }
}

export function checkPlayerCollisions() {
  const allies = players.filter((p) => !p.tutorialHidden && p.team === 'ally' && p.state !== 'sitting');
  const enemies = players.filter((p) => !p.tutorialHidden && p.team === 'enemy' && p.state !== 'sitting');

  for (const ally of allies) {
    for (const enemy of enemies) {
      if (ally.state === 'sitting' || enemy.state === 'sitting') continue;
      if (ally.state === 'rule1' && ally.rule1Partner === enemy) continue;
      if (Math.abs(ally.pos.y - enemy.pos.y) >= 1.85) continue;
      const dist = Math.hypot(ally.pos.x - enemy.pos.x, ally.pos.z - enemy.pos.z);
      if (dist < 1.32) resolveContact(ally, enemy);
    }
  }

  const anyRule1 = players.some((p) => p.state === 'rule1');
  document.getElementById('rule1-alert').classList.toggle('hidden', !anyRule1);
}
