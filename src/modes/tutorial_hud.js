import {
  TUTORIAL_TOTAL_STEPS,
  TUTORIAL_STEPS,
  FIELD,
  state,
  setSafeHtml,
  ctx
} from '../state.js';
import {
  scene,
  players,
  balls,
  getPlayer
} from '../render3d.js';
import {
  lockPointerIfPlaying,
  unlockPointer,
  showToast,
  updateTopHUD
} from '../ui.js';
import { modesState } from './shared.js';
import { getTutorialStepDef } from './tutorial_defs.js';

const THREE = ctx.THREE;

export function showTutorialIntroOverlay(kind = 'welcome') {
  modesState.tutorialIntroKind = kind === 'ult' ? 'ult' : 'welcome';
  modesState.pendingTutorialIntro = false;
  state.tutorialIntroVisible = true;
  unlockPointer();

  const introEl = document.getElementById('tutorial-intro-overlay');
  const cardEl = introEl ? introEl.querySelector('.tutorial-intro-card') : null;
  const welcomePane = document.getElementById('tut-intro-pane-welcome');
  const ultPane = document.getElementById('tut-intro-pane-ult');
  const startBtn = document.getElementById('btn-tut-intro-start');

  if (welcomePane) welcomePane.classList.toggle('hidden', modesState.tutorialIntroKind !== 'welcome');
  if (ultPane) ultPane.classList.toggle('hidden', modesState.tutorialIntroKind !== 'ult');
  if (cardEl) cardEl.classList.toggle('tut-intro-ult', modesState.tutorialIntroKind === 'ult');
  if (startBtn) {
    startBtn.textContent =
      modesState.tutorialIntroKind === 'ult' ? '⚡ Essayer les 3 Ultimates !' : "▶ C'est parti !";
  }
  if (introEl) introEl.classList.remove('hidden');
}

export function dismissTutorialIntro() {
  modesState.pendingTutorialIntro = false;
  const introEl = document.getElementById('tutorial-intro-overlay');
  if (introEl) introEl.classList.add('hidden');
  const wasVisible = !!state.tutorialIntroVisible;
  state.tutorialIntroVisible = false;
  if (state.mode !== 'tutorial' || state.phase !== 'play') return;

  if (!state.mobileMode) {
    const controlsHelp = document.getElementById('controls-help');
    if (controlsHelp) controlsHelp.classList.remove('collapsed-submenu');
  }
  if (wasVisible && modesState.tutorialIntroKind === 'ult' && state.tutorialStep === TUTORIAL_STEPS.ULTIMATE) {
    showToast(
      state.mobileMode
        ? '🔥 <strong>1/3 — Ultimate Feu (Gauche G) :</strong> (Débloqué à la <strong>2e ronde</strong> en match) Maintenez <strong>⚡ Ult</strong> pour viser vers <strong>Adv D</strong> puis relâchez !'
        : '🔥 <strong>1/3 — Ultimate Feu (Gauche G) :</strong> (Débloqué à la <strong>2e ronde</strong> en match) Appuyez sur <strong>[R]</strong> pour viser le Rayon Plasma vers <strong>Adv D</strong> puis <strong>Clic Gauche</strong> !',
      5000
    );
  } else if (wasVisible && state.tutorialStep === 1) {
    showToast(
      state.mobileMode
        ? '🎓 <strong>Étape 1/8 :</strong> Avancez au stick gauche jusqu’à la balise bleue pour débloquer le <strong>Dash</strong> !'
        : '🎓 <strong>Étape 1/8 :</strong> Avancez jusqu’à la balise bleue pour débloquer le <strong>Dash</strong> !',
      3400
    );
  }
  if (!state.mobileMode && state.cameraMode === 'tps') {
    lockPointerIfPlaying(true);
    lockPointerIfPlaying();
  }
  updateTutorialSequenceHUD();
  updateTopHUD();
}

export function ensureTutorialBeacon() {
  if (modesState.tutorialBeaconGroup) return modesState.tutorialBeaconGroup;
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.1, 3.0, 40),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 2.2, 6.5, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
  );
  beam.position.y = 3.25;
  group.add(ring);
  group.add(beam);
  group.visible = false;
  scene.add(group);
  modesState.tutorialBeaconGroup = group;
  return group;
}

function setBeaconOnPlayer(beacon, teamKey, roleKey) {
  const pl = getPlayer(teamKey, roleKey);
  if (!pl) {
    beacon.visible = false;
    return;
  }
  beacon.visible = true;
  beacon.position.set(pl.pos.x, Math.max(0.1, pl.pos.y + 0.1), pl.pos.z);
}

function updateGoalStepBeacon(beacon) {
  const me = getPlayer('ally', state.controlledRole);
  beacon.visible = true;
  if (me && me.carryingBall) {
    beacon.position.set(FIELD.enemyGoalX, 0.1, 0);
    return;
  }
  const targetBall =
    balls.find((b) => !b.tutorialHidden && b.state !== 'scored' && me && b.color === me.color) ||
    balls[0];
  beacon.position.set(targetBall ? targetBall.pos.x : 0, 0.1, targetBall ? targetBall.pos.z : FIELD.laneTopZ);
}

export function updateTutorialBeaconTarget() {
  const beacon = ensureTutorialBeacon();
  if (state.mode !== 'tutorial' || state.phase !== 'play') {
    beacon.visible = false;
    return;
  }
  const cl = state.tutorialChecklist;
  const step = state.tutorialStep;
  if (step === TUTORIAL_STEPS.MOVEMENT) {
    if (!cl.movedToBeacon) {
      beacon.visible = true;
      beacon.position.set(-12, 0.1, FIELD.laneTopZ);
    } else if (cl.switchedRole && !cl.returnedToFirstRole) {
      setBeaconOnPlayer(beacon, 'ally', 'G');
    } else {
      beacon.visible = false;
    }
  } else if (step === TUTORIAL_STEPS.GOAL) {
    updateGoalStepBeacon(beacon);
  } else if (step === TUTORIAL_STEPS.PASS) {
    if (!cl.pickedPassBall) {
      beacon.visible = true;
      const targetBall = balls[0];
      beacon.position.set(targetBall ? targetBall.pos.x : -14, 0.1, targetBall ? targetBall.pos.z : FIELD.laneTopZ);
    } else if (!cl.passedBall) {
      setBeaconOnPlayer(beacon, 'ally', 'C');
    } else {
      beacon.visible = false;
    }
  } else if (step === TUTORIAL_STEPS.TRIANGLE && !cl.intercepted) {
    beacon.visible = true;
    const eTarget = getPlayer('enemy', 'D') || players.find((p) => !p.tutorialHidden && p.team === 'enemy' && p.state === 'standing');
    beacon.position.set(eTarget ? eTarget.pos.x : 12, 0.1, eTarget ? eTarget.pos.z : FIELD.laneTopZ);
  } else if (step === TUTORIAL_STEPS.RULE1) {
    if (!cl.rule1Locked) setBeaconOnPlayer(beacon, 'enemy', 'C');
    else if (!cl.rule1Switched) setBeaconOnPlayer(beacon, 'ally', 'C');
    else if (!cl.rule1Broken) setBeaconOnPlayer(beacon, 'enemy', 'C');
    else beacon.visible = false;
  } else {
    beacon.visible = false;
  }
}

function renderTutorialChecklistAndPills(step, def) {
  const pillsEl = document.getElementById('tut-steps-bar');
  if (pillsEl && pillsEl.children) {
    Array.from(pillsEl.children).forEach((pill) => {
      const pStep = Number(pill.getAttribute('data-tut-step'));
      pill.classList.toggle('active', pStep === step);
      pill.classList.toggle('completed', pStep < step);
    });
  }

  const listEl = document.getElementById('tut-checklist');
  if (!listEl) return;
  listEl.replaceChildren();
  const nextIdx = def.items.findIndex((it) => !state.tutorialChecklist[it.key]);
  def.items.forEach((item, idx) => {
    const done = !!state.tutorialChecklist[item.key];
    const isCurrent = idx === nextIdx;
    const row = document.createElement('div');
    row.className = `tut-check-item${done ? ' done' : isCurrent ? ' current' : ''}`;
    row.textContent = `${done ? '✔' : isCurrent ? '▶' : '○'} ${item.label}`;
    listEl.appendChild(row);
  });
}

function updateTutorialNavButtons(step) {
  const btnShop = document.getElementById('btn-tut-open-shop');
  const btnRefUlt = document.getElementById('btn-tut-refresh-ult');
  const btnToPractice = document.getElementById('btn-tut-to-practice');
  const btnNext = document.getElementById('btn-tut-next');

  if (btnShop) btnShop.classList.toggle('hidden', !(step === TUTORIAL_STEPS.TOOLS && !state.tutorialChecklist.toolBought));
  if (btnRefUlt) btnRefUlt.classList.toggle('hidden', step !== TUTORIAL_STEPS.ULTIMATE);
  if (btnToPractice) btnToPractice.classList.toggle('hidden', step === TUTORIAL_TOTAL_STEPS);
  if (!btnNext) return;

  const ready = !!state.tutorialAwaitingConfirm;
  btnNext.classList.toggle('tut-next-ready', ready);
  if (ready) {
    btnNext.textContent =
      step < TUTORIAL_TOTAL_STEPS
        ? state.mobileMode
          ? 'Continuer ▶'
          : 'Continuer [Espace] ▶'
        : state.mobileMode
        ? 'Mode Pratique ▶'
        : 'Mode Pratique [Espace] ▶';
  } else {
    btnNext.textContent = step < TUTORIAL_TOTAL_STEPS ? 'Suivant ▶' : '🧪 Mode Pratique ▶';
  }
}

export function updateTutorialSequenceHUD() {
  const hud = document.getElementById('tutorial-sequence-hud');
  if (!hud) return;
  const active = state.mode === 'tutorial' && state.phase === 'play';
  hud.classList.toggle('hidden', !active);
  if (!active) {
    const oh = document.getElementById('tut-overhead-objective');
    if (oh) oh.classList.add('hidden');
    return;
  }

  const step = Math.min(TUTORIAL_TOTAL_STEPS, Math.max(1, state.tutorialStep || 1));
  const def = getTutorialStepDef(step);
  const titleEl = document.getElementById('tut-step-title');
  const descEl = document.getElementById('tut-step-desc');
  const extraEl = document.getElementById('tut-step-extra');

  if (titleEl) titleEl.textContent = def.title;
  if (descEl) descEl.textContent = def.desc;
  if (extraEl) {
    if (def.extraHtml) {
      setSafeHtml(extraEl, def.extraHtml);
      extraEl.classList.remove('hidden');
    } else {
      extraEl.replaceChildren();
      extraEl.classList.add('hidden');
    }
  }

  renderTutorialChecklistAndPills(step, def);
  updateTutorialNavButtons(step);
}
