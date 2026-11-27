import { PASS_CHARGE_SPEC, DEFAULT_CONTROLS } from './constants.js';

export function createEmptyRolePowers(isVanilla = false) {
  return {
    throwBall: !isVanilla,
    standUp: false,
    ultEvo: false,
    dashEvo: null,
    toolEvo: null
  };
}

export function hasRoleEvolutionItem(rolePowers, itemDef) {
  if (!rolePowers || !itemDef) return false;
  if (itemDef.slotType === 'bool') return !!rolePowers[itemDef.key];
  if (itemDef.slotType === 'ultEvo') return !!rolePowers.ultEvo;
  if (itemDef.slotType === 'dashEvo') return rolePowers.dashEvo === itemDef.slotValue;
  if (itemDef.slotType === 'toolEvo') return rolePowers.toolEvo === itemDef.slotValue;
  return false;
}

export function isRoleEvolutionSlotBlocked(rolePowers, itemDef) {
  if (!rolePowers || !itemDef) return false;
  if (itemDef.slotType === 'dashEvo') {
    return !!rolePowers.dashEvo && rolePowers.dashEvo !== itemDef.slotValue;
  }
  if (itemDef.slotType === 'toolEvo') {
    return !!rolePowers.toolEvo && rolePowers.toolEvo !== itemDef.slotValue;
  }
  return false;
}

export function grantRolePowerItem(rolePowers, itemDef) {
  if (!rolePowers || !itemDef) return false;
  if (hasRoleEvolutionItem(rolePowers, itemDef) || isRoleEvolutionSlotBlocked(rolePowers, itemDef)) {
    return false;
  }
  if (itemDef.slotType === 'bool') rolePowers[itemDef.key] = true;
  else if (itemDef.slotType === 'ultEvo') rolePowers.ultEvo = true;
  else if (itemDef.slotType === 'dashEvo') rolePowers.dashEvo = itemDef.slotValue;
  else if (itemDef.slotType === 'toolEvo') rolePowers.toolEvo = itemDef.slotValue;
  else return false;
  return true;
}

function createSingleTeamMeta(prepColors, isVanilla) {
  return {
    dossardStock: { green: 1, red: 1, blue: 1 },
    extraDossardBought: { green: false, red: false, blue: false },
    prepColors,
    hasNotebook: true,
    teamDashPlus: false,
    teamJump: false,
    pauseUsedThisRound: false,
    activeBountyPE: false,
    activeBountyPV: false,
    prepReady: false,
    powers: {
      G: createEmptyRolePowers(isVanilla),
      C: createEmptyRolePowers(isVanilla),
      D: createEmptyRolePowers(isVanilla)
    }
  };
}

export function createDefaultTeamMeta(isVanilla = false) {
  return {
    ally: createSingleTeamMeta({ G: 'blue', C: 'green', D: 'red' }, isVanilla),
    enemy: createSingleTeamMeta({ G: 'red', C: 'green', D: 'blue' }, isVanilla)
  };
}

export function cloneDefaultControls() {
  const out = {};
  for (const key in DEFAULT_CONTROLS) {
    out[key] = [...DEFAULT_CONTROLS[key]];
  }
  return out;
}

export function formatInputCode(code) {
  if (!code) return '—';
  switch (code) {
    case 'Space': return 'Espace';
    case 'Mouse0': return 'Clic Gauche';
    case 'Mouse1': return 'Clic Milieu';
    case 'Mouse2': return 'Clic Droit';
    case 'Mouse3': return 'Souris 4';
    case 'Mouse4': return 'Souris 5';
    case 'ShiftLeft':
    case 'ShiftRight': return 'Shift';
    case 'ControlLeft':
    case 'ControlRight': return 'Ctrl';
    case 'AltLeft':
    case 'AltRight': return 'Alt';
    case 'Tab': return 'Tab';
    case 'Enter': return 'Entrée';
    case 'Backspace': return 'Retour';
    case 'ArrowUp': return '↑';
    case 'ArrowDown': return '↓';
    case 'ArrowLeft': return '←';
    case 'ArrowRight': return '→';
    default: break;
  }
  if (code.startsWith('Mouse')) {
    const n = Number(code.slice(5));
    return Number.isFinite(n) ? `Souris ${n + 1}` : code;
  }
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Pav. ${code.slice(6)}`;
  return code;
}

export const state = {
  mode: 'pedagogical', // 'tutorial' | 'pedagogical' | 'practice' | 'multiplayer'
  round: 1,
  phase: 'menu',       // 'menu' | 'prep' | 'play' | 'round_end' | 'game_over'
  tutorialStep: 1,
  tutorialChecklist: {},
  tutorialAwaitingConfirm: false,
  tutorialPreserveStep: false,
  tutorialIntroVisible: false,
  tutorialShopGuideStep: 0,
  practiceCursorFree: false,
  preTutorialMapId: 'classic',
  restoreMapAfterTutorial: false,

  // Équipe et rôle du joueur local ('ally' = Or à gauche, 'enemy' = Violette à droite)
  myTeam: 'ally',
  myLockedRole: null,  // null = Capitaine (peut changer G/C/D au clic), ou 'G'/'C'/'D' fixe
  prepShopTargetRole: 'G', // Destinataire actif dans le Magasin ('G' | 'C' | 'D')

  allyPV: 0,
  allyPE: 0,
  enemyPV: 0,
  enemyPE: 0,

  // Points marqués durant la ronde courante (pour évaluer les Bounties)
  roundAllyGoals: 0,
  roundEnemyGoals: 0,
  roundAllyKills: 0,
  roundEnemyKills: 0,

  teams: createDefaultTeamMeta(false),

  // Couleurs des 2 ballons tirés au centre pour la ronde
  drawnBalls: ['green', 'red'],

  // Joueuse actuellement contrôlée par l'utilisateur ('G', 'C' ou 'D')
  controlledRole: 'G',

  // Caméra : 'tps' (3e personne derrière la joueuse) ou 'aerial' (MOBA en surplomb)
  cameraMode: 'tps',
  defaultCameraMode: 'tps',
  mobaMoveButton: 'right',
  camYaw: -Math.PI / 2, // Regarde vers +X pour 'ally', +Math.PI/2 vers -X pour 'enemy'
  camPitch: 0.38,
  aerialZoom: 1.0,
  mobaCamX: 0,
  mobaCamY: 0,
  mobaCamZ: 0,
  mobaCamInitialized: false,
  mobaCamLocked: false,
  mobaEdgePan: true,
  mobaCursorLock: true,
  mobaCamSpeed: 1.0,
  mobaCursorSensitivity: 1.0,
  tpsSensitivity: 1.0,
  mouseInWindow: true,
  controls: cloneDefaultControls(),
  rebindingState: null,
  mobaMoveTarget: null,
  mobaPath: [],
  mobaPathIndex: 0,
  mobaPathGoal: null,
  mobaPathLastPlanMs: 0,
  mobaPathStuckTimer: 0,
  mobaPathLastPos: null,
  mobaTargetOnCanopy: false,
  mobaAimWorld: null,
  mobaRightMouseDown: false,
  mouseClientX: null,
  mouseClientY: null,
  passCharge: { active: false, elapsed: 0, radius: 4.5, targetRole: null, aimAngle: null, source: null },

  // Carte active & sous-menus UI
  mapId: 'classic',
  minimapVisionMode: 'both', // 'both' (visions des 2 équipes) | 'myTeam' (mon équipe) | 'omniscient' (tous les cônes)
  minimapExpanded: false,
  welcomeTab: 'play',        // 'play' | 'rules' | 'controls'
  prepTab: 'dossards',       // 'dossards' | 'individual' | 'collective' | 'all'
  practiceShopPreservePlay: false,
  hudLeftTab: 'roster',      // 'roster' | 'rps'
  hudLeftCollapsed: false,

  // Ultimates (utilisables 1x/ronde dès la Ronde 2, sans ballon : touche R pour preview + Clic Gauche pour confirmer)
  ultPreviewActive: false,
  ultPreviewAimAngle: 0,
  roundPlayTime: 0,

  // Accessibilité / Performance / Règles (Menu & Pause)
  lowSpecMode: false,
  mobileMode: false,
  vanillaMode: false,
  aiDifficulty: 'normal', // 'normal' | 'hard'

  prepTimer: 30,
  prepInterval: null
};

export const mp = {
  enabled: false,
  isHost: false,
  lobbyMode: 'multiplayer', // 'multiplayer' | 'practice'
  lobbyVanilla: false,
  lobbyAiDifficulty: 'normal', // 'normal' | 'hard'
  roomCode: '',
  myPeerId: 'p_' + Math.random().toString(36).slice(2, 9),
  myName: 'Joueuse 1',
  peer: null,
  ws: null,
  wsReady: false,
  transport: 'none', // 'ws' | 'peerjs' | 'local' | 'none'
  connections: [], // Connexions PeerJS (Hôte -> Clients ou Client -> Hôte)
  bc: null,        // BroadcastChannel local (pour tester entre 2 onglets sans latence !)
  seenMsgIds: new Set(),
  members: [],     // [{ peerId, name, team: 'ally'|'enemy', slot: 'ALL'|'G'|'C'|'D', activeRole, prepReady }]
  remoteInputs: {}, // peerId -> { team, role, x, y, z, vx, vy, vz, oc, facingAngle, moveForward, moveRight, camYaw, seq, lastSeen }
  syncAccumulator: 0,
  inputSeq: 0,
  worldSeq: 0,
  lastHostWorldSeq: 0,
  joinedAcked: false,
  joinTimeoutId: null,
  heartbeatTimerId: null,
  hostReconnectTimerId: null,
  openedFromPracticeBar: false,
  hostRetries: 0,
  pingMs: null,
  pingTimerId: null
};

export const ctx = {
  THREE: globalThis.THREE,
  Peer: globalThis.Peer,
  state,
  mp,
  scene: null,
  camera: null,
  renderer: null,
  dom: {},
  world: {},
  net: {},
  entities: {},
  input: {},
  api: {}
};

export const bus = {
  _listeners: new Map(),
  on(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(fn);
    return () => this.off(type, fn);
  },
  off(type, fn) {
    const set = this._listeners.get(type);
    if (set) set.delete(fn);
  },
  emit(type, ...args) {
    const set = this._listeners.get(type);
    if (!set) return;
    for (const fn of set) fn(...args);
  }
};

export function getPassSnapHalfAngle(isMobile = !!(state && state.mobileMode)) {
  return isMobile ? PASS_CHARGE_SPEC.mobileSnapHalfAngle : PASS_CHARGE_SPEC.desktopSnapHalfAngle;
}

export function canPlayerPassOrThrow(p) {
  if (!p) return false;
  if (!state.vanillaMode) return true;
  return !!state.teams[p.team]?.powers?.[p.role]?.throwBall;
}

export function matchesControl(actionKey, code) {
  if (!code) return false;
  const slots = (state.controls && state.controls[actionKey]) || DEFAULT_CONTROLS[actionKey];
  if (!Array.isArray(slots)) return false;
  for (let i = 0; i < slots.length; i++) {
    const bound = slots[i];
    if (!bound) continue;
    if (bound === code) return true;
    if (
      (bound === 'ShiftLeft' || bound === 'ShiftRight') &&
      (code === 'ShiftLeft' || code === 'ShiftRight')
    ) {
      return true;
    }
  }
  return false;
}

export function getTeamPE(team) {
  return team === 'ally' ? state.allyPE : state.enemyPE;
}

export function setTeamPE(team, val) {
  if (team === 'ally') state.allyPE = val;
  else state.enemyPE = val;
}

export function getTeamPV(team) {
  return team === 'ally' ? state.allyPV : state.enemyPV;
}

export function setTeamPV(team, val) {
  if (team === 'ally') state.allyPV = val;
  else state.enemyPV = val;
}

export function lerpAngle(a, b, t) {
  let diff = b - a;
  while (diff < -Math.PI) diff += Math.PI * 2;
  while (diff > Math.PI) diff -= Math.PI * 2;
  return a + diff * t;
}
