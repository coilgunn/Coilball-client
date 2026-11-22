// ============================================================================
// COILBALL 3D — ÉTAT PARTAGÉ, CONSTANTES & BUS D'ÉVÉNEMENTS
// ============================================================================

// --- CONSTANTES COULEURS & TRIANGLE ÉLÉMENTAIRE (Vert/Feuille > Bleu/Goutte > Rouge/Flamme > Vert) ---
export const COLORS = {
  green: {
    id: 'green',
    name: 'Vert',
    symbol: '🌿',
    rpsName: 'Feuille',
    hex: 0x22c55e,
    css: '#22c55e',
    beats: 'blue',
    losesTo: 'red'
  },
  blue: {
    id: 'blue',
    name: 'Bleu',
    symbol: '💧',
    rpsName: 'Goutte',
    hex: 0x3b82f6,
    css: '#3b82f6',
    beats: 'red',
    losesTo: 'green'
  },
  red: {
    id: 'red',
    name: 'Rouge',
    symbol: '🔥',
    rpsName: 'Flamme',
    hex: 0xef4444,
    css: '#ef4444',
    beats: 'green',
    losesTo: 'blue'
  }
};
export const COLOR_KEYS = ['green', 'red', 'blue'];

export const AI_DIFFICULTIES = {
  normal: {
    id: 'normal',
    icon: '🤖',
    label: 'Normale',
    shortLabel: 'IA Normale',
    desc: 'IA équilibrée : dashs et ultimates mesurés, coordination simple.'
  },
  hard: {
    id: 'hard',
    icon: '🧠',
    label: 'Difficile',
    shortLabel: 'IA Difficile',
    desc: 'IA stratège : encerclements en tenaille, dashs avancés, combos d’ultimates et achats optimisés.'
  }
};

export const TUTORIAL_TOTAL_STEPS = 8;
export const TUTORIAL_STEPS = {
  MOVEMENT: 1,
  GOAL: 2,
  PASS: 3,
  TRIANGLE: 4,
  RULE1: 5,
  TOOLS: 6,
  ULTIMATE: 7,
  MOBA: 8
};

export const DEFAULT_FIELD_CONFIG = {
  width: 210,      // X de -105 à +105
  depth: 136,      // Z de -68 à +68
  allyGoalX: -92,  // Cerceau Équipe Or (à gauche)
  allyGoalZ: 0,
  enemyGoalX: 92,  // Cerceau Équipe Violette (à droite)
  enemyGoalZ: 0,
  goalRadius: 2.85,
  laneTopZ: -50,   // Lane Haut dégagée (Z = -50, devant G Or / D Violette)
  laneBotZ: 50,    // Lane Bas dégagée (Z = +50, devant D Or / G Violette)
  ballSpawns: null,
  playerSpawns: null
};

export const TUTORIAL_FIELD_CONFIG = {
  width: 120,      // Plus petite arène d'initiation (X de -60 à +60)
  depth: 80,       // Z de -40 à +40
  allyGoalX: -52,  // Cerceau Équipe Or (à gauche)
  allyGoalZ: 0,
  enemyGoalX: 52,  // Cerceau Équipe Violette (à droite)
  enemyGoalZ: 0,
  goalRadius: 2.85,
  laneTopZ: -28,   // Lane Haut dégagée
  laneBotZ: 28,    // Lane Bas dégagée
  ballSpawns: null,
  playerSpawns: null
};

export const RIFT_FIELD_CONFIG = {
  width: 176,      // Carré type Faille de l'Invocateur : X de -88 à +88
  depth: 176,      // Z de -88 à +88
  allyGoalX: -72,  // Base Sud-Ouest (Équipe Or)
  allyGoalZ: 72,
  enemyGoalX: 72,  // Base Nord-Est (Équipe Violette)
  enemyGoalZ: -72,
  goalRadius: 2.85,
  laneTopZ: -75,
  laneBotZ: 75,
  ballSpawns: [
    { x: -68, z: -68 }, // Ballon 0 : Couloir Top (angle Nord-Ouest)
    { x: 68, z: 68 }    // Ballon 1 : Couloir Bot (angle Sud-Est)
  ],
  playerSpawns: {
    ally: {
      G: { x: -76, z: 22, facing: Math.PI },
      C: { x: -38, z: 38, facing: Math.PI * 0.75 },
      D: { x: -22, z: 76, facing: Math.PI * 0.5 }
    },
    enemy: {
      D: { x: 22, z: -76, facing: -Math.PI * 0.5 },
      C: { x: 38, z: -38, facing: -Math.PI * 0.25 },
      G: { x: 76, z: -22, facing: 0 }
    }
  }
};

// Grande arène symétrique façon MOBA (mutée dynamiquement si la carte Tutoriel est sélectionnée)
export const FIELD = { ...DEFAULT_FIELD_CONFIG };

// Paramètres du Dash & Évolutions individuelles (1 par slot par perso G/C/D)
export const DASH_DURATION = 0.225;
export const DASH_COOLDOWN = 3.0;
export const DASH_SPEED = 27.0;
export const DASH_BASE_DIST = DASH_SPEED * DASH_DURATION; // ~6.075u
export const PAD_DASH_SPEED = 38.0;
export const PAD_DASH_DURATION = (DASH_BASE_DIST * 3.0) / PAD_DASH_SPEED; // ~3x distance de dash

export const DASH_EVO_META = {
  bounce: {
    key: 'bounce',
    icon: '🏀',
    shortLabel: '🏀 Rebond',
    title: '🏀 Dash Rebondissant (Dash — 3 🪙 PO)',
    desc: 'Distance x2, vitesse x1,5 et rebondit sur les murs en réinitialisant sa distance.',
    speed: DASH_SPEED * 1.5,
    duration: (DASH_BASE_DIST * 2.0) / (DASH_SPEED * 1.5),
    cooldown: DASH_COOLDOWN,
    cost: 3
  },
  slide: {
    key: 'slide',
    icon: '🧊',
    shortLabel: '🧊 Glissant',
    title: '🧊 Dash Glissant (Dash — 3 🪙 PO)',
    desc: 'Distance x3, orientable à la caméra/curseur (pas WASD) et laisse du givre bloquant la direction des joueuses.',
    speed: DASH_SPEED * 1.2,
    duration: (DASH_BASE_DIST * 3.0) / (DASH_SPEED * 1.2),
    cooldown: DASH_COOLDOWN,
    cost: 3
  },
  boomerang: {
    key: 'boomerang',
    icon: '🪃',
    shortLabel: '🪃 Boomerang',
    title: '🪃 Dash Boomerang (Dash — 3 🪙 PO)',
    desc: 'Distance x1,5. Réactivable avec [Shift] pendant 2s pour revenir à votre emplacement.',
    speed: DASH_SPEED * 1.15,
    duration: (DASH_BASE_DIST * 1.5) / (DASH_SPEED * 1.15),
    cooldown: DASH_COOLDOWN,
    cost: 3
  }
};

export const TOOL_EVO_META = {
  beacon: {
    key: 'beacon',
    icon: '📡',
    shortLabel: '📡 Balise',
    title: '📡 Outil : Balise ([E] sans balle — 3 🪙 PO)',
    desc: 'Déploie une sonde permanente à courte distance qui partage sa vision avec votre équipe.',
    cost: 3
  },
  wall: {
    key: 'wall',
    icon: '🧱',
    shortLabel: '🧱 Mur 3m',
    title: '🧱 Outil : Mur Déployable 3 m ([E] sans balle — 3 🪙 PO)',
    desc: 'Pose une barricade permanente de 3 m de long devant vous (demeure toute la ronde).',
    cost: 3
  },
  pad: {
    key: 'pad',
    icon: '⚡',
    shortLabel: '⚡ Tapis',
    title: "⚡ Outil : Tapis d'Accélération ([E] sans balle — 3 🪙 PO)",
    desc: 'Tapis permanent qui provoque un dash fixe (~3x distance) dans la direction où il est posé.',
    cost: 3
  }
};

export const PASS_CHARGE_SPEC = {
  minR: 4.5,
  maxR: 36.0,
  chargeTime: 1.0,
  desktopSnapHalfAngle: (15 * Math.PI) / 180,
  mobileSnapHalfAngle: (30 * Math.PI) / 180,
  snapHalfAngle: (30 * Math.PI) / 180
};

export function getPassSnapHalfAngle(isMobile = !!(state && state.mobileMode)) {
  return isMobile ? PASS_CHARGE_SPEC.mobileSnapHalfAngle : PASS_CHARGE_SPEC.desktopSnapHalfAngle;
}

export const INDIVIDUAL_POWERS = [
  {
    key: 'throwBall',
    vanillaOnly: true,
    category: 'base',
    slotType: 'bool',
    icon: '🎯',
    shortLabel: '🎯 Passe',
    title: '🎯 Débloquer Passe / Tir libre (Individuel — 2 🪙 PO)',
    desc: 'Permet à cette joueuse de faire une passe chargée ou un tir libre avec [E].',
    cost: 2
  },
  {
    key: 'standUp',
    category: 'base',
    slotType: 'bool',
    icon: '⚡',
    shortLabel: '⚡ Se relever',
    title: '⚡ Se relever (Individuel — 5 🪙 PO)',
    desc: 'Usage unique : permet de se relever avec [E] après une interception.',
    cost: 5
  },
  {
    key: 'ultEvo',
    category: 'ult',
    slotType: 'ultEvo',
    icon: '🌟',
    shortLabel: '🌟 Ult Évolué',
    title: "🌟 Évolution d'Ultimate (1/perso — 4 🪙 PO)",
    desc: 'Persiste sur la joueuse quel que soit son élément (1x/ronde, sauf 🔥 évolué) :<br>• <strong>🔥 Feu :</strong> rayon plus large/rapide + <strong>2 charges/ronde</strong> (3s CD).<br>• <strong>🌿 Feuille :</strong> sprint <strong>4.2x (3.5s)</strong> → mur géant dense pendant <strong>8s</strong> qui <strong>bloque totalement la vue</strong> (même en hauteur).<br>• <strong>💧 Eau :</strong> vague <strong>360°</strong>, portée +45%, bouclier plus long &amp; <strong>rappel [R]</strong> des cibles touchées.',
    cost: 4
  },
  {
    ...DASH_EVO_META.bounce,
    key: 'dash_bounce',
    category: 'dash',
    slotType: 'dashEvo',
    slotValue: 'bounce'
  },
  {
    ...DASH_EVO_META.slide,
    key: 'dash_slide',
    category: 'dash',
    slotType: 'dashEvo',
    slotValue: 'slide'
  },
  {
    ...DASH_EVO_META.boomerang,
    key: 'dash_boomerang',
    category: 'dash',
    slotType: 'dashEvo',
    slotValue: 'boomerang'
  },
  {
    ...TOOL_EVO_META.beacon,
    key: 'tool_beacon',
    category: 'tool',
    slotType: 'toolEvo',
    slotValue: 'beacon'
  },
  {
    ...TOOL_EVO_META.wall,
    key: 'tool_wall',
    category: 'tool',
    slotType: 'toolEvo',
    slotValue: 'wall'
  },
  {
    ...TOOL_EVO_META.pad,
    key: 'tool_pad',
    category: 'tool',
    slotType: 'toolEvo',
    slotValue: 'pad'
  }
];

export function createEmptyRolePowers(isVanilla = false) {
  return {
    throwBall: !isVanilla,
    standUp: false,
    ultEvo: false,
    dashEvo: null,
    toolEvo: null
  };
}

export function canPlayerPassOrThrow(p) {
  if (!p) return false;
  if (!state.vanillaMode) return true;
  return !!state.teams[p.team]?.powers?.[p.role]?.throwBall;
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

export function createDefaultTeamMeta(isVanilla = false) {
  return {
    ally: {
      dossardStock: { green: 1, red: 1, blue: 1 },
      extraDossardBought: { green: false, red: false, blue: false },
      prepColors: { G: 'blue', C: 'green', D: 'red' },
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
    },
    enemy: {
      dossardStock: { green: 1, red: 1, blue: 1 },
      extraDossardBought: { green: false, red: false, blue: false },
      prepColors: { G: 'red', C: 'green', D: 'blue' },
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
    }
  };
}

// --- RACCOURCIS PERSONNALISABLES & CONTRÔLES ---
export const DEFAULT_CONTROLS = {
  moveForward: ['KeyW', 'KeyZ'],
  moveBackward: ['KeyS', 'ArrowDown'],
  moveLeft: ['KeyA', 'KeyQ'],
  moveRight: ['KeyD', 'ArrowRight'],
  mobaMove: ['Mouse2', null],
  recenterCam: ['Tab', 'Mouse1'],
  toggleCamLock: ['KeyY', null],
  camPanUp: ['ArrowUp', null],
  camPanDown: ['ArrowDown', null],
  camPanLeft: ['ArrowLeft', null],
  camPanRight: ['ArrowRight', null],
  dash: ['ShiftLeft', null],
  action: ['KeyE', null],
  jump: ['Space', null],
  ultimate: ['KeyR', null],
  ultConfirm: ['Mouse0', null],
  toggleCam: ['KeyM', null],
  roleG: ['Digit1', 'Numpad1'],
  roleC: ['Digit2', 'Numpad2'],
  roleD: ['Digit3', 'Numpad3'],
  cycleRoleNext: ['KeyC', null],
  openShop: ['KeyB', null],
  minimapSize: ['KeyN', null],
  minimapVision: ['KeyV', null],
  controlsHelp: ['KeyH', null],
  fullscreen: ['KeyF', null]
};

export const CONTROL_CATEGORIES = [
  { id: 'moba', label: '🦅 Caméra & Mode MOBA' },
  { id: 'tps', label: '🏃 Déplacement (Vue TPS)' },
  { id: 'actions', label: '⚡ Compétences & Actions' },
  { id: 'ui', label: '🎛️ Équipe & Interface' }
];

export const CONTROL_ACTIONS_META = [
  { key: 'mobaMove', category: 'moba', label: 'Déplacer vers le curseur (MOBA)' },
  { key: 'recenterCam', category: 'moba', label: 'Recentrer ponctuellement / Suivre (MOBA)' },
  { key: 'toggleCamLock', category: 'moba', label: 'Verrouiller / Déverrouiller caméra (MOBA)' },
  { key: 'camPanUp', category: 'moba', label: 'Caméra MOBA : Haut' },
  { key: 'camPanDown', category: 'moba', label: 'Caméra MOBA : Bas' },
  { key: 'camPanLeft', category: 'moba', label: 'Caméra MOBA : Gauche' },
  { key: 'camPanRight', category: 'moba', label: 'Caméra MOBA : Droite' },
  { key: 'toggleCam', category: 'moba', label: 'Basculer Caméra (TPS ↔ MOBA)' },

  { key: 'moveForward', category: 'tps', label: 'Avancer (TPS)' },
  { key: 'moveBackward', category: 'tps', label: 'Reculer (TPS)' },
  { key: 'moveLeft', category: 'tps', label: 'Aller à gauche (TPS)' },
  { key: 'moveRight', category: 'tps', label: 'Aller à droite (TPS)' },

  { key: 'dash', category: 'actions', label: 'Dash / Retour Boomerang' },
  { key: 'action', category: 'actions', label: 'Passe / Tir libre / Outil / Se relever' },
  { key: 'jump', category: 'actions', label: 'Sauter (si débloqué)' },
  { key: 'ultimate', category: 'actions', label: 'Viser / Réactiver l’Ultimate' },
  { key: 'ultConfirm', category: 'actions', label: 'Déclencher l’Ultimate visé' },

  { key: 'roleG', category: 'ui', label: 'Sélectionner Joueuse G' },
  { key: 'roleC', category: 'ui', label: 'Sélectionner Joueuse C' },
  { key: 'roleD', category: 'ui', label: 'Sélectionner Joueuse D' },
  { key: 'cycleRoleNext', category: 'ui', label: 'Joueuse suivante' },
  { key: 'openShop', category: 'ui', label: 'Ouvrir Boutique (Pratique / Tuto)' },
  { key: 'minimapSize', category: 'ui', label: 'Agrandir / Réduire la Minimap' },
  { key: 'minimapVision', category: 'ui', label: 'Changer Vision Minimap' },
  { key: 'controlsHelp', category: 'ui', label: 'Afficher / Masquer Aide Contrôles' },
  { key: 'fullscreen', category: 'ui', label: 'Mode Plein Écran' }
];

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

// --- ÉTAT DU JEU ---
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

// --- ÉTAT RÉSEAU MULTIJOUEUR (OPTION A : PEERJS WEBRTC + BROADCASTCHANNEL LOCAL) ---
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

export function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
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

// --- CONTEXTE PARTAGÉ & BUS D'ÉVÉNEMENTS INTER-MODULES ---
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

export function lerpAngle(a, b, t) {
  let diff = b - a;
  while (diff < -Math.PI) diff += Math.PI * 2;
  while (diff > Math.PI) diff -= Math.PI * 2;
  return a + diff * t;
}
