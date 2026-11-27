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

function createDashEvo(spec) {
  const speed = DASH_SPEED * spec.speedMult;
  return {
    key: spec.key,
    icon: spec.icon,
    shortLabel: spec.shortLabel,
    title: spec.title,
    desc: spec.desc,
    speed,
    duration: (DASH_BASE_DIST * spec.distMult) / speed,
    cooldown: DASH_COOLDOWN,
    cost: 3
  };
}

export const DASH_EVO_META = {
  bounce: createDashEvo({
    key: 'bounce',
    icon: '🏀',
    shortLabel: '🏀 Rebond',
    title: '🏀 Dash Rebondissant (Dash — 3 🪙 PO)',
    desc: 'Distance x2, vitesse x1,5 et rebondit sur les murs en réinitialisant sa distance.',
    speedMult: 1.5,
    distMult: 2.0
  }),
  slide: createDashEvo({
    key: 'slide',
    icon: '🧊',
    shortLabel: '🧊 Glissant',
    title: '🧊 Dash Glissant (Dash — 3 🪙 PO)',
    desc: 'Distance x3, orientable à la caméra/curseur (pas WASD) et laisse du givre bloquant la direction des joueuses.',
    speedMult: 1.2,
    distMult: 3.0
  }),
  boomerang: createDashEvo({
    key: 'boomerang',
    icon: '🪃',
    shortLabel: '🪃 Boomerang',
    title: '🪃 Dash Boomerang (Dash — 3 🪙 PO)',
    desc: 'Distance x1,5. Réactivable avec [Shift] pendant 2s pour revenir à votre emplacement.',
    speedMult: 1.15,
    distMult: 1.5
  })
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
