import {
  TUTORIAL_TOTAL_STEPS,
  TUTORIAL_STEPS,
  FIELD,
  state,
  setSafeHtml
} from '../state.js';
import {
  balls,
  getPlayer,
  applyPlayerColor,
  syncPlayerPowerVisuals
} from '../render3d.js';
import { updateTeamVisionState } from '../world.js';
import {
  clearAllUltimates,
  updateUltHudWidget,
  hideUltimatePreview
} from '../ultimates.js';
import {
  unlockPointer,
  setCameraMode,
  updateMobileTouchHUD,
  selectControlledRole,
  showToast,
  updateTopHUD,
  updateRosterHUD,
  switchPrepSubmenu
} from '../ui.js';
import {
  modesState,
  clearTutorialTimers,
  placePlayerAt,
  applyRoundSetupPositions,
  syncTutorialEntityVisibility
} from './shared.js';
import {
  showTutorialIntroOverlay,
  updateTutorialBeaconTarget,
  updateTutorialSequenceHUD
} from './tutorial_hud.js';
import { evaluateTutorialStepCompletion } from './tutorial_flow.js';
import { openPrepModal } from './prep.js';

function focusTutorialRoleG(toastHtml, duration) {
  if (state.controlledRole !== 'G') {
    selectControlledRole('G', { silent: true, force: true });
  }
  state.camYaw = -Math.PI / 2;
  showToast(toastHtml, duration);
}

function setupStepPass(allyC) {
  const ball0 = balls[0];
  if (ball0) {
    ball0.state = 'ground';
    ball0.carrier = null;
    ball0.thrownByTeam = null;
    ball0.thrownById = null;
    ball0.passTargetId = null;
    ball0.passIgnoreTimer = 0;
    ball0.onCanopy = false;
    ball0.pos.set(-14, 0.52, FIELD.laneTopZ);
    ball0.targetPos.copy(ball0.pos);
    ball0.vel.set(0, 0, 0);
  }
  placePlayerAt(allyC, 8, 0, FIELD.laneTopZ + 5, -Math.PI / 2);
  focusTutorialRoleG(
    state.mobileMode
      ? '🎯 <strong>Étape 3/8 — Passes :</strong> Prenez le ballon <strong>🔥 Rouge</strong>, puis maintenez <strong>⚽ Passe</strong> et visez <strong>💧 Centre (C)</strong> !'
      : '🎯 <strong>Étape 3/8 — Passes :</strong> Prenez le ballon <strong>🔥 Rouge</strong>, puis maintenez <strong>[E]</strong> en visant <strong>💧 Centre (C)</strong> !',
    4400
  );
}

function setupStepRule1(allyG, allyC, allyD, enemyC) {
  placePlayerAt(allyG, -16, 0, FIELD.laneTopZ, Math.PI / 2);
  placePlayerAt(enemyC, -4, 0, FIELD.laneTopZ, -Math.PI / 2);
  placePlayerAt(allyC, -22, 0, FIELD.laneTopZ + 12, Math.atan2(-4 - (-22), FIELD.laneTopZ - (FIELD.laneTopZ + 12)));
  placePlayerAt(allyD, -22, 0, FIELD.laneTopZ - 8, Math.atan2(-4 - (-22), FIELD.laneTopZ - (FIELD.laneTopZ - 8)));
  focusTutorialRoleG(
    '❓ <strong>Étape 5/8 :</strong> Voyez ce qui se passe si vous touchez quelqu’un de la <strong>même couleur</strong> : allez toucher <strong>Adv C (🔥)</strong> !',
    4800
  );
}

function setupStepUltimate(allyG, allyC, allyD, enemyD) {
  clearAllUltimates();
  [allyG, allyC, allyD, enemyD].forEach((pl) => {
    if (!pl) return;
    pl.ultUsed = false;
    pl.ultCooldown = 0;
    pl.ultShotsUsed = 0;
    pl.leafUltTimer = 0;
    pl.waterShieldTimer = 0;
    pl.state = 'standing';
  });
  placePlayerAt(allyG, -12, 0, -6, Math.atan2(22, 6));
  placePlayerAt(allyC, -12, 0, 0, Math.PI / 2);
  placePlayerAt(allyD, -12, 0, 6, Math.atan2(22, -6));
  placePlayerAt(enemyD, 10, 0, 0, -Math.PI / 2);
  if (state.controlledRole !== 'G') selectControlledRole('G', { silent: true, force: true });
  state.camYaw = -Math.PI / 2;
  showTutorialIntroOverlay('ult');
}

function setupStepMoba(enemyD) {
  clearAllUltimates();
  if (state.cameraMode === 'aerial') setCameraMode('tps', true);
  placePlayerAt(enemyD, 12, 0, FIELD.laneTopZ, -Math.PI / 2);
  if (state.controlledRole !== 'G') selectControlledRole('G', { silent: true, force: true });
  state.camYaw = -Math.PI / 2;
  const moveClickLbl = state.mobaMoveButton === 'left' ? 'Clic Gauche' : 'Clic Droit';
  showToast(
    state.mobileMode
      ? '🦅 <strong>Étape 8/8 — Vue MOBA !</strong> Tapez <strong>🎥 TPS</strong> en haut puis déplacez-vous avec le <strong>stick gauche</strong> !'
      : `🦅 <strong>Étape 8/8 — Vue MOBA !</strong> Appuyez sur <strong>[M]</strong> (ou <strong>🎥 Vue</strong>) puis faites un <strong>${moveClickLbl}</strong> au sol !`,
    4200
  );
}

function applyTutorialDefaultTeamColors() {
  const allyG = getPlayer('ally', 'G');
  const allyC = getPlayer('ally', 'C');
  const allyD = getPlayer('ally', 'D');
  const enemyD = getPlayer('enemy', 'D');
  const enemyC = getPlayer('enemy', 'C');
  state.teams.ally.prepColors = { G: 'red', C: 'blue', D: 'green' };
  state.teams.enemy.prepColors = { D: 'green', G: 'blue', C: 'red' };
  if (allyG) applyPlayerColor(allyG, 'red');
  if (allyC) applyPlayerColor(allyC, 'blue');
  if (allyD) applyPlayerColor(allyD, 'green');
  if (enemyD) applyPlayerColor(enemyD, 'green');
  if (enemyC) applyPlayerColor(enemyC, 'red');
  return { allyG, allyC, allyD, enemyD, enemyC };
}

function configureTutorialStepScenario(step, actors) {
  const { allyG, allyC, allyD, enemyD, enemyC } = actors;
  if (step === TUTORIAL_STEPS.MOVEMENT) {
    selectControlledRole('G', { silent: true, force: true });
    state.camYaw = -Math.PI / 2;
    if (!state.tutorialIntroVisible) {
      showToast(
        state.mobileMode
          ? '🎓 <strong>Étape 1/8 :</strong> Avancez au stick gauche jusqu’à la balise bleue pour débloquer le <strong>Dash</strong> !'
          : '🎓 <strong>Étape 1/8 :</strong> Avancez jusqu’à la balise bleue pour débloquer le <strong>Dash</strong> !',
        3400
      );
    }
  } else if (step === TUTORIAL_STEPS.GOAL) {
    if (state.controlledRole !== 'G') selectControlledRole('G', { silent: true, force: true });
    state.camYaw = -Math.PI / 2;
    showToast('⚽ <strong>Étape 2/8 :</strong> Prenez le ballon <strong>🔥 Rouge</strong> devant vous et marquez à droite !', 3600);
  } else if (step === TUTORIAL_STEPS.PASS) {
    setupStepPass(allyC);
  } else if (step === TUTORIAL_STEPS.TRIANGLE) {
    state.allyPE = 0;
    placePlayerAt(enemyD, 12, 0, FIELD.laneTopZ, -Math.PI / 2);
    focusTutorialRoleG(
      '🔺 <strong>Étape 4/8 — Interception :</strong> Passez derrière <strong>Adv D</strong> pour voir son dos (?). Comme <strong>🔥 Feu gagne contre 🌿 Feuille</strong>, il suffit ensuite de la <strong>toucher</strong> (+1 🪙 PO) !',
      4600
    );
  } else if (step === TUTORIAL_STEPS.RULE1) {
    setupStepRule1(allyG, allyC, allyD, enemyC);
  } else if (step === TUTORIAL_STEPS.TOOLS) {
    state.teams.ally.powers.G.toolEvo = null;
    if (allyG) syncPlayerPowerVisuals(allyG, 0);
    state.allyPE = Math.max(3, state.allyPE);
    placePlayerAt(enemyD, 12, 0, FIELD.laneTopZ, -Math.PI / 2);
    focusTutorialRoleG(
      state.mobileMode
        ? '🛠️ <strong>Étape 6/8 — Outils :</strong> Ouvrez <strong>🛒 Boutique</strong> pour découvrir le magasin, achetez un outil pour <strong>Gauche (G)</strong> puis déployez-le (sans balle) !'
        : '🛠️ <strong>Étape 6/8 — Outils :</strong> Ouvrez la Boutique <strong>[B]</strong> pour suivre le guide du magasin, achetez un outil pour <strong>Gauche (G)</strong> puis déployez-le avec <strong>[E]</strong> !',
      4800
    );
  } else if (step === TUTORIAL_STEPS.ULTIMATE) {
    setupStepUltimate(allyG, allyC, allyD, enemyD);
  } else if (step === TUTORIAL_STEPS.MOBA) {
    setupStepMoba(enemyD);
  }
}

export function enterTutorialStep(stepNum) {
  clearTutorialTimers();
  const step = Math.min(TUTORIAL_TOTAL_STEPS, Math.max(1, Number(stepNum) || 1));
  state.tutorialStep = step;
  state.tutorialChecklist = {};
  state.tutorialAwaitingConfirm = false;
  state.ultPreviewActive = false;
  hideUltimatePreview();

  const r1Alert = document.getElementById('rule1-alert');
  if (r1Alert) r1Alert.classList.add('hidden');

  if (step > 1 && state.tutorialIntroVisible) {
    state.tutorialIntroVisible = false;
    modesState.pendingTutorialIntro = false;
    const introEl = document.getElementById('tutorial-intro-overlay');
    if (introEl) introEl.classList.add('hidden');
  }
  if (step < TUTORIAL_STEPS.MOBA && state.cameraMode === 'aerial') {
    setCameraMode('tps', true);
  }

  applyRoundSetupPositions();
  const actors = applyTutorialDefaultTeamColors();
  configureTutorialStepScenario(step, actors);

  syncTutorialEntityVisibility();
  updateTeamVisionState(true);
  updateTutorialSequenceHUD();
  updateTutorialBeaconTarget();
  updateTopHUD();
  updateRosterHUD();
  updateUltHudWidget();
  updateMobileTouchHUD();
}

function clearTutorialShopHighlights() {
  document.querySelectorAll('#prep-modal .tut-shop-highlight').forEach((el) => {
    el.classList.remove('tut-shop-highlight');
  });
}

function applyTutorialShopGuideHighlights(step) {
  if (step === 1) {
    const ballsBar = document.getElementById('prep-balls-preview-bar');
    if (ballsBar) ballsBar.classList.add('tut-shop-highlight');
  } else if (step === 2) {
    const tabsBar = document.getElementById('prep-submenu-tabs');
    if (tabsBar) tabsBar.classList.add('tut-shop-highlight');
  } else if (step === 3) {
    const toolHdr = document.querySelector('#shop-items-grid [data-shop-section="tool"]');
    if (toolHdr) {
      toolHdr.classList.add('tut-shop-highlight');
      setTimeout(() => {
        if (state.tutorialShopGuideStep === 3 && toolHdr.isConnected) {
          toolHdr.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 60);
    }
    document.querySelectorAll('#shop-items-grid .shop-item.tut-shop-focus').forEach((el) => {
      el.classList.add('tut-shop-highlight');
    });
  }
}

export function updateTutorialShopGuideUI() {
  const guideEl = document.getElementById('tutorial-shop-guide');
  if (!guideEl) return;
  clearTutorialShopHighlights();

  const step = state.mode === 'tutorial' ? Number(state.tutorialShopGuideStep) || 0 : 0;
  if (step < 1 || step > 3) {
    guideEl.classList.add('hidden');
    return;
  }

  guideEl.classList.remove('hidden');
  const steps = {
    1: {
      badge: '🎓 Guide du Magasin (1/3)',
      title: '⚽ Corridors des ballons',
      body: 'En haut, vous voyez la couleur des <strong>2 ballons</strong> tirés pour la ronde : le <strong>Couloir Gauche</strong> (en face de <strong>Gauche G</strong>) et le <strong>Couloir Droit</strong> (en face de <strong>Droit D</strong>). Répartissez vos dossards ci-dessous selon ces corridors !',
      nextLabel: 'Suivant (Sections) ▶'
    },
    2: {
      badge: '🎓 Guide du Magasin (2/3)',
      title: '📑 Sections du Magasin',
      body: 'Le menu est divisé en <strong>3 sections</strong> : <strong>🎽 1. Dossards (G / C / D)</strong> pour choisir vos éléments, <strong>⚡ 2. Pouvoirs Individuels</strong> (Actions de base, <strong>🌟 Ult Évolué</strong>, <strong>💨 Évos Dash</strong> et <strong>🛠️ Outils</strong>) et <strong>🛡️ 3. Bonus d’Équipe</strong> (Dossard +, Dash+, Saut).',
      nextLabel: 'Suivant (Trouver les Outils) ▶'
    },
    3: {
      badge: '🎓 Guide du Magasin (3/3)',
      title: '🛠️ Où trouver les Outils',
      body: 'Les <strong>🛠️ Outils</strong> se trouvent dans l’onglet <strong>⚡ 2. Pouvoirs Individuels</strong>, tout en bas de la liste ! Cliquez sur le bouton <strong>G</strong> d’un outil en surbrillance (<strong>📡 Balise</strong>, <strong>🧱 Mur 3m</strong> ou <strong>⚡ Tapis</strong> — 3 🪙 PO) pour l’équiper sur <strong>Gauche (G)</strong>.',
      nextLabel: 'Compris ✔'
    }
  };

  const info = steps[step];
  const badgeEl = document.getElementById('tut-shop-guide-badge');
  const titleEl = document.getElementById('tut-shop-guide-title');
  const bodyEl = document.getElementById('tut-shop-guide-body');
  const prevBtn = document.getElementById('btn-tut-shop-prev');
  const nextBtn = document.getElementById('btn-tut-shop-next');
  if (badgeEl) badgeEl.textContent = info.badge;
  if (titleEl) titleEl.textContent = info.title;
  if (bodyEl) setSafeHtml(bodyEl, info.body);
  if (prevBtn) prevBtn.classList.toggle('hidden', step <= 1);
  if (nextBtn) nextBtn.textContent = info.nextLabel;

  applyTutorialShopGuideHighlights(step);
}

export function setTutorialShopGuideStep(stepNum) {
  const step = Math.max(0, Math.min(3, Number(stepNum) || 0));
  state.tutorialShopGuideStep = step;
  if (step === 1) switchPrepSubmenu('dossards');
  else if (step === 3) switchPrepSubmenu('individual');
  updateTutorialShopGuideUI();
}

export function openTutorialShopStep3() {
  if (state.mode !== 'tutorial' || state.phase !== 'play' || state.tutorialStep !== TUTORIAL_STEPS.TOOLS) return;
  if (!state.teams.ally.powers.G.toolEvo) {
    state.allyPE = Math.max(3, state.allyPE);
  }
  state.tutorialPreserveStep = true;
  unlockPointer();
  if (!state.tutorialChecklist.toolBought) {
    state.tutorialShopGuideStep = 1;
    openPrepModal({ defaultTab: 'dossards' });
  } else {
    state.tutorialShopGuideStep = 0;
    openPrepModal({ defaultTab: 'individual' });
  }
}

export function resumeTutorialStep3AfterShop() {
  syncTutorialEntityVisibility();
  updateTeamVisionState(true);
  updateTutorialSequenceHUD();
  updateTutorialBeaconTarget();
  updateRosterHUD();
  updateMobileTouchHUD();
  evaluateTutorialStepCompletion();
  if (
    state.mode === 'tutorial' &&
    state.tutorialStep === TUTORIAL_STEPS.TOOLS &&
    state.tutorialChecklist.toolBought &&
    !state.tutorialChecklist.toolDeployed
  ) {
    showToast(
      state.mobileMode
        ? '🛠️ <strong>Outil équipé !</strong> Appuyez sur le <strong>bouton Outil (📡/🧱/⚡)</strong> sans balle pour le déployer !'
        : '🛠️ <strong>Outil équipé !</strong> Appuyez sur <strong>[E]</strong> (sans balle) pour le déployer sur le terrain !',
      4200
    );
  }
}
