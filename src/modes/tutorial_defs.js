import {
  TUTORIAL_TOTAL_STEPS,
  TUTORIAL_STEPS,
  state
} from '../state.js';

export function isDashUnlocked() {
  if (state.mode !== 'tutorial') return true;
  return state.tutorialStep >= 2 || !!state.tutorialChecklist.movedToBeacon;
}

export function isTutorialRoleSwitchAllowed() {
  if (state.mode !== 'tutorial') return true;
  if (state.tutorialStep === TUTORIAL_STEPS.MOVEMENT) return !!state.tutorialChecklist.dashed;
  if (state.tutorialStep === TUTORIAL_STEPS.RULE1) return !!state.tutorialChecklist.rule1Locked;
  if (state.tutorialStep === TUTORIAL_STEPS.ULTIMATE) return true;
  return false;
}

function modeText(isMob, isMoba, mob, moba, tps) {
  return isMob ? mob : isMoba ? moba : tps;
}

function tutRow(key, label, overhead) {
  return { key, label, overhead };
}

function tutModeItem(key, isMob, isMoba, labels, overheads) {
  return {
    key,
    label: modeText(isMob, isMoba, labels[0], labels[1], labels[2]),
    overhead: modeText(isMob, isMoba, overheads[0], overheads[1], overheads[2])
  };
}

function tutMobItem(key, isMob, labels, overheads) {
  return {
    key,
    label: isMob ? labels[0] : labels[1],
    overhead: isMob ? overheads[0] : overheads[1]
  };
}

function buildUltTutorialItem(key, role, label, sw, act, flags) {
  const overhead =
    state.controlledRole !== role
      ? modeText(flags.isMob, flags.isMoba, sw[0], sw[1], sw[2])
      : flags.isMob
      ? act[0]
      : act[1];
  return { key, label, overhead };
}

function buildStep1Def(isMob, isMoba) {
  return {
    title: '1/8 — Mouvement',
    desc: modeText(
      isMob,
      isMoba,
      'Stick gauche vers la balise → Dash → changer de position (Gauche G · Centre C · Droit D) puis revenir sur G.',
      'Déplacez-vous vers la balise → Dash [Shift] → changer de position ([2]/[3] sans clic : Gauche G · Centre C · Droit D) puis revenir sur G [1].',
      'Bougez vers la balise → Dash [Shift] → changer de position (Gauche G [1] · Centre C [2] · Droit D [3]) puis revenir sur G.'
    ),
    items: [
      tutRow('movedToBeacon', 'Rejoindre la balise', '🎯 Rejoindre la balise bleue'),
      tutMobItem(
        'dashed',
        isMob,
        ['Faire un Dash (💨 Dash)', 'Dash ([Shift])'],
        ['🎯 Appuyer sur 💨 Dash', '🎯 Faire un Dash [Shift]']
      ),
      tutModeItem(
        'switchedRole',
        isMob,
        isMoba,
        ['Changer de position (Taper C ou D)', 'Changer de position ([2] Centre C ou [3] Droit D)', 'Changer de position ([2 / 3] ou Clic)'],
        ['🎯 Taper Centre (C) ou Droit (D) en bas', '🎯 Changer de position : [2] (C) ou [3] (D)', '🎯 Changer de position [2 / 3 ou Clic]']
      ),
      tutModeItem(
        'returnedToFirstRole',
        isMob,
        isMoba,
        ['Revenir à Gauche (G) 🔥 (Taper G en bas)', 'Revenir à Gauche (G) 🔥 ([1])', 'Revenir à Gauche (G) 🔥 ([1] ou Clic)'],
        ['🎯 Revenir à Gauche (G) 🔥 (Taper G en bas)', '🎯 Revenir à Gauche (G) 🔥 [1]', '🎯 Revenir à Gauche (G) 🔥 [1 ou Clic]']
      )
    ]
  };
}

function buildStep3Def(isMob) {
  return {
    title: '3/8 — Passes 🎯',
    desc: isMob
      ? 'Prenez le ballon 🔥 Rouge, maintenez ⚽ Passe et visez 💧 Centre (C) (même d’une autre couleur) !'
      : 'Prenez le ballon 🔥 Rouge, maintenez [E] pour charger la portée et passez à 💧 Centre (C) (même d’une autre couleur) !',
    items: [
      tutRow('pickedPassBall', 'Prendre le ballon 🔥 Rouge', '🎯 Prendre le ballon 🔥 Rouge'),
      tutMobItem(
        'passedBall',
        isMob,
        ['Passer à 💧 Centre (C) (Maintenir ⚽ Passe)', 'Passer à 💧 Centre (C) (Maintenir [E])'],
        ['🎯 Maintenir ⚽ Passe et viser 💧 Centre (C)', '🎯 Viser 💧 Centre (C) et maintenir [E] pour passer']
      )
    ]
  };
}

function buildStep5Def(isMob, isMoba) {
  const r1Locked = !!state.tutorialChecklist.rule1Locked;
  return {
    title: r1Locked ? '5/8 — Règle 1 ⚡' : '5/8 — Même couleur ? ⚡',
    desc: !r1Locked
      ? 'Voyez ce qui se passe si vous touchez quelqu’un de la même couleur : allez toucher Adv C (🔥) !'
      : isMob
      ? 'Règle 1 ! Même couleur = blocage face à face. Seul le bon élément (💧 > 🔥) libère Gauche (G) : tapez Centre (C) puis touchez Adv C.'
      : 'Règle 1 ! Même couleur = blocage face à face. Seul le bon élément (💧 > 🔥) libère Gauche (G) : passez sur Centre (C) [2] puis touchez Adv C.',
    items: [
      tutRow('rule1Locked', 'Toucher Adv C (🔥 = 🔥) — même couleur', '🎯 Voyez ce qui se passe si vous touchez Adv C (🔥) !'),
      tutModeItem(
        'rule1Switched',
        isMob,
        isMoba,
        ['Prendre Centre (C) 💧 (Taper C)', 'Prendre Centre (C) 💧 ([2])', 'Prendre Centre (C) 💧 ([2] ou Clic)'],
        isMob
          ? ['🎯 Seule 💧 > 🔥 libère G ! Tapez Centre (C)', '🎯 Seule 💧 > 🔥 libère G ! Touche [2] (Centre C)', '🎯 Seule 💧 > 🔥 libère G ! Touche [2] (Centre C)']
          : ['🎯 Seule 💧 > 🔥 libère G ! Tapez Centre (C)', '🎯 Seule 💧 > 🔥 libère G ! Touche [2] (Centre C)', '🎯 Seule 💧 > 🔥 libère G ! Touche [2] (Centre C)']
      ),
      tutRow('rule1Broken', 'Touchez Adv C avec 💧 Centre (C) pour libérer G', '🎯 💧 bat 🔥 : touchez Adv C pour libérer G !')
    ]
  };
}

function buildMobStepDef(title, descs, specs, isMob) {
  return {
    title,
    desc: isMob ? descs[0] : descs[1],
    items: specs.map(([key, labels, overheads]) => tutMobItem(key, isMob, labels, overheads))
  };
}

const STEP6_TOOL_SPECS = [
  {
    key: 'toolBought',
    mobLabel: 'Acheter un Outil pour Gauche (G) (🛒 Boutique)',
    pcLabel: 'Acheter un Outil pour Gauche (G) (Boutique [B])',
    mobOver: '🎯 Taper 🛒 Boutique : guide + Outil pour G',
    pcOver: '🎯 Boutique [B] : guide + Outil pour Gauche (G)'
  },
  {
    key: 'toolDeployed',
    mobLabel: 'Déployer l’outil (Bouton 📡/🧱/⚡)',
    pcLabel: 'Déployer l’outil ([E] sans balle)',
    mobOver: '🎯 Taper le bouton Outil (📡/🧱/⚡) !',
    pcOver: '🎯 Appuyer sur [E] (sans balle) pour déployer !'
  }
];

function buildStep6Def(isMob) {
  const items = [];
  for (let i = 0; i < STEP6_TOOL_SPECS.length; i++) {
    const row = STEP6_TOOL_SPECS[i];
    items.push({
      key: row.key,
      label: isMob ? row.mobLabel : row.pcLabel,
      overhead: isMob ? row.mobOver : row.pcOver
    });
  }
  return {
    title: '6/8 — Outils 🛠️',
    desc: isMob
      ? 'Ouvrez 🛒 Boutique, suivez le guide (corridors, sections, outils), achetez un outil pour Gauche (G) puis déployez-le (sans balle) !'
      : 'Ouvrez Boutique [B] pour suivre le guide (corridors, sections, outils), achetez un outil pour Gauche (G) puis déployez-le avec [E] (sans balle) !',
    items
  };
}

function buildStep7Def(flags) {
  return {
    title: '7/8 — Les 3 Ultimates (2e Ronde) ⚡',
    desc: flags.isMob
      ? 'Débloqués à la 2e ronde en match normal (1x/ronde, sauf 🔥 évolué : 2 charges, sans ballon). Essayez les 3 éléments : 🔥 G, 💧 C et 🌿 D !'
      : 'Débloqués à la 2e ronde en match normal (1x/ronde, sauf 🔥 évolué : 2 charges, sans ballon). Essayez les 3 éléments : 🔥 Gauche (G), 💧 Centre (C) et 🌿 Droit (D) !',
    extraHtml:
      '<div><strong>🔥 Feu :</strong> Laser plasma sniper (0.5s). <em>🌟 Évo :</em> +large/rapide + <strong>2 charges/ronde</strong> (3s CD).</div>' +
      '<div><strong>🌿 Feuille :</strong> Sprint 3x (2s) + mur de branches (4s). <em>🌟 Évo :</em> sprint <strong>4.2x (3.5s)</strong> + mur géant <strong>8s</strong> qui <strong>bloque totalement la vue</strong>.</div>' +
      '<div><strong>💧 Eau :</strong> Vague frontale (repousse + bouclier Feu). <em>🌟 Évo :</em> <strong>360°</strong>, portée +45% + <strong>rappel [R]</strong>.</div>',
    items: [
      buildUltTutorialItem(
        'ultFireFired',
        'G',
        '🔥 Feu : Rayon Plasma (Gauche G · [1])',
        ['Tapez Gauche (G) pour 🔥 Feu', 'Appuyez sur [1] pour 🔥 Gauche (G)', 'Prenez 🔥 Gauche (G · [1])'],
        ['Maintenez ⚡ Ult et visez Adv D', '🔥 Feu : [R] puis Clic Gauche vers Adv D'],
        flags
      ),
      buildUltTutorialItem(
        'ultWaterFired',
        'C',
        '💧 Eau : Vague Déferlante (Centre C · [2])',
        ['Tapez Centre (C) pour 💧 Eau', 'Appuyez sur [2] pour 💧 Centre (C)', 'Prenez 💧 Centre (C · [2])'],
        ['Maintenez ⚡ Ult et visez Adv D', '💧 Eau : [R] puis Clic Gauche (Vague)'],
        flags
      ),
      buildUltTutorialItem(
        'ultLeafFired',
        'D',
        '🌿 Feuille : Sprint + Mur (Droit D · [3])',
        ['Tapez Droit (D) pour 🌿 Feuille', 'Appuyez sur [3] pour 🌿 Droit (D)', 'Prenez 🌿 Droit (D · [3])'],
        ['Lancez ⚡ Ult puis courez pour tracer un mur !', '🌿 Feuille : [R] + Clic G puis bougez pour tracer un mur !'],
        flags
      )
    ]
  };
}

function buildStep8Def(isMob) {
  const moveClickLbl = state.mobaMoveButton === 'left' ? 'Clic Gauche' : 'Clic Droit';
  return buildMobStepDef(
    '8/8 — Vue MOBA 🦅',
    [
      'Basculez en vue MOBA (🎥 TPS → 🦅 MOBA) puis utilisez le stick gauche pour bouger !',
      `Basculez en vue MOBA [M] (ou 🎥 Vue), déplacez-vous au ${moveClickLbl} — et utilisez [1/2/3] (sans clic) pour Gauche / Centre / Droit !`
    ],
    [
      ['mobaToggled', ['Activer Vue MOBA (🎥 TPS)', 'Activer Vue MOBA ([M] / 🎥 Vue)'], ['🎯 Taper 🎥 TPS pour passer en 🦅 MOBA', '🎯 Activer la Vue MOBA [M] ou [🎥 Vue]']],
      ['mobaMoved', ['Déplacer au stick gauche', `Se déplacer au [${moveClickLbl}]`], ['🎯 Utiliser le stick gauche pour bouger !', `🎯 ${moveClickLbl} au sol pour vous déplacer !`]]
    ],
    isMob
  );
}

export function getTutorialStepDef(stepNum) {
  const step = Math.min(TUTORIAL_TOTAL_STEPS, Math.max(1, Number(stepNum) || 1));
  const isMob = !!state.mobileMode;
  const isMoba = state.cameraMode === 'aerial';
  const flags = { isMob, isMoba };

  const builders = {
    1: () => buildStep1Def(isMob, isMoba),
    2: () => ({
      title: '2/8 — But du jeu',
      desc: 'Prenez le ballon 🔥 Rouge et marquez au cerceau droit (+1 pt de victoire).',
      items: [
        tutRow('pickedBall', 'Prendre le ballon 🔥 Rouge', '🎯 Prendre le ballon 🔥 Rouge'),
        tutRow('scoredGoal', 'Marquer au cerceau droit', '🎯 Marquer au cerceau droit')
      ]
    }),
    3: () => buildStep3Def(isMob),
    4: () => ({
      title: '4/8 — Triangle & 🪙 PO',
      desc: '🔥 Feu gagne contre 🌿 Feuille (🌿 > 💧 > 🔥 > 🌿). Passez derrière Adv D pour voir son dos (?), puis touchez-la avec le bon élément pour l’intercepter (+🪙 PO) !',
      items: [
        tutRow('backSeen', 'Contourner Adv D pour voir son dos (?)', '🎯 Passez derrière Adv D pour voir son dos (?)'),
        tutRow('intercepted', 'Touchez Adv D pour l’intercepter (🔥 gagne contre 🌿)', '🎯 🔥 bat 🌿 : touchez-la pour l’intercepter !')
      ]
    }),
    5: () => buildStep5Def(isMob, isMoba),
    6: () => buildStep6Def(isMob),
    7: () => buildStep7Def(flags),
    8: () => buildStep8Def(isMob)
  };
  return builders[step]();
}

export function getNextTutorialObjectiveItem() {
  if (state.mode !== 'tutorial' || state.phase !== 'play' || state.tutorialIntroVisible) return null;
  const step = Math.min(TUTORIAL_TOTAL_STEPS, Math.max(1, state.tutorialStep || 1));
  const def = getTutorialStepDef(step);
  if (!def) return null;
  const next = def.items.find((it) => !state.tutorialChecklist[it.key]);
  return next ? { ...next, stepTitle: def.title } : null;
}
