import {
  COLORS,
  COLOR_KEYS,
  TUTORIAL_STEPS,
  DASH_EVO_META,
  TOOL_EVO_META,
  INDIVIDUAL_POWERS,
  hasRoleEvolutionItem,
  isRoleEvolutionSlotBlocked,
  grantRolePowerItem,
  state,
  getTeamPE,
  setTeamPE,
  setSafeHtml,
  ctx
} from '../state.js';
import {
  getPlayer,
  applyPlayerColor,
  syncPlayerPowerVisuals
} from '../render3d.js';
import { updateUltHudWidget } from '../ultimates.js';
import {
  updateMobileTouchHUD,
  updateTopHUD,
  updateRosterHUD,
  applyPrepShopCategoryFilter
} from '../ui.js';
import {
  isShopAvailable,
  isPowerItemAllowedInCurrentMode,
  formatRolePowerSummary
} from './shared.js';
import { renderShopEvoStatusBar } from './shop_evo_bar.js';
import { syncOrSendPrepAction } from './prep.js';
import {
  applyTeamColorChange,
  applyTeamCollectivePurchase
} from './prep_actions.js';
import { markTutorialCheck } from './tutorial_flow.js';
import { updateTutorialShopGuideUI } from './tutorial_steps.js';

export function renderPrepColorPickers() {
  const myMeta = state.teams[state.myTeam];

  ['G', 'C', 'D'].forEach((role) => {
    const containerEl =
      document.getElementById(`color-picker-${role}`) ||
      document.querySelector(`.color-picker-btns[data-role="${role}"]`);
    const buttons = containerEl ? containerEl.querySelectorAll('.color-pick-btn') : [];
    buttons.forEach((btn) => {
      const cKey = btn.getAttribute('data-color');
      btn.classList.toggle('selected', myMeta.prepColors[role] === cKey);
      btn.onclick = (e) => {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        assignPrepColor(role, cKey);
      };
    });

    const tags = formatRolePowerSummary(myMeta.powers[role]);
    const tagsEl = document.getElementById(`power-tags-${role}`);
    if (tagsEl) {
      tagsEl.textContent = tags.length ? `Équipement : ${tags.join(' • ')}` : 'Aucune évolution / pouvoir';
    }
  });

  const s = myMeta.dossardStock;
  document.getElementById('stock-warning').textContent =
    `Stock de dossards (${state.myTeam === 'ally' ? 'Équipe Or' : 'Équipe Violette'}) : ${s.green} Vert (🌿 Feuille), ${s.red} Rouge (🔥 Flamme), ${s.blue} Bleu (💧 Goutte)`;
}

export function assignPrepColor(role, newColor) {
  if (!applyTeamColorChange(state.myTeam, role, newColor)) return;
  ctx.api.playSfx?.('ui_color_pick', { color: newColor });
  if (state.mode === 'practice' && state.phase === 'play') {
    const pl = getPlayer(state.myTeam, role);
    if (pl) applyPlayerColor(pl, newColor);
    updateRosterHUD();
    updateUltHudWidget();
  }
  renderPrepColorPickers();
  syncOrSendPrepAction({ action: 'assignColor', role, newColor });
}

function createShopItemInfoEl(title, desc) {
  const info = document.createElement('div');
  info.className = 'shop-item-info';
  const h4 = document.createElement('h4');
  h4.textContent = title;
  const p = document.createElement('p');
  p.textContent = desc;
  info.append(h4, p);
  return info;
}

function renderShopHeaderBanner(shopGrid, isTutToolStep) {
  const freeBasicsNote = document.createElement('div');
  if (isTutToolStep) {
    freeBasicsNote.style.cssText =
      'grid-column:1 / -1; background:rgba(245,158,11,0.16); border:1px solid rgba(250,204,21,0.65); border-radius:10px; padding:8px 11px; font-size:0.78rem; color:#fef08a; line-height:1.35;';
    setSafeHtml(
      freeBasicsNote,
      '🛠️ <strong>Tutoriel Étape 6/8 — Outils :</strong> Suivez le guide ci-dessus puis achetez un <strong>Outil</strong> (📡 Balise, 🧱 Mur 3m ou ⚡ Tapis — 3 🪙 PO) pour <strong>Gauche (G)</strong> et déployez-le avec <strong>[E]</strong> (sans balle) !'
    );
  } else {
    freeBasicsNote.style.cssText =
      'grid-column:1 / -1; background:rgba(14,165,233,0.12); border:1px solid rgba(56,189,248,0.35); border-radius:10px; padding:7px 11px; font-size:0.75rem; color:#bae6fd; line-height:1.35;';
    setSafeHtml(
      freeBasicsNote,
      state.vanillaMode
        ? '🍦 <strong>Mode Vanille :</strong> Ultimates, évolutions de Dash, Dash+ et Outils désactivés. Débloquez 🎯 <strong>Passe</strong> (<code>[E]</code>), ⚡ <strong>Se relever</strong> (<code>[E]</code>), 🎽 <strong>Dossards</strong> et 🦘 <strong>Saut</strong> (<code>[Espace]</code>) dès la Ronde 3 !'
        : 'ℹ️ <strong>Actifs gratuitement dès la Ronde 1 :</strong> 🎯 <strong>Passe chargée / Tir libre</strong> (<code>[E]</code>) et 📝 <strong>Papier / Marqueurs</strong> (les dos adverses vus sont mémorisés automatiquement).'
    );
  }
  shopGrid.appendChild(freeBasicsNote);
}

function getBlockedRoleTitle(pw, r, rolePwr) {
  if (pw.slotType === 'dashEvo' && rolePwr.dashEvo && DASH_EVO_META[rolePwr.dashEvo]) {
    return `Joueuse ${r} possède déjà ${DASH_EVO_META[rolePwr.dashEvo].shortLabel} (1 max/perso, cumulable avec 👟 Dash+ Équipe)`;
  }
  if (pw.slotType === 'toolEvo' && rolePwr.toolEvo && TOOL_EVO_META[rolePwr.toolEvo]) {
    return `Joueuse ${r} possède déjà ${TOOL_EVO_META[rolePwr.toolEvo].shortLabel} (1 max/perso)`;
  }
  return `Joueuse ${r} a déjà une évolution dans ce slot (1 max/perso)`;
}

function buildShopPowerRoleButton(pw, r, myMeta, shopCtx) {
  const rolePwr = myMeta.powers[r];
  const owned = hasRoleEvolutionItem(rolePwr, pw);
  const blocked = !owned && isRoleEvolutionSlotBlocked(rolePwr, pw);
  const lockedByTut = shopCtx.isTutToolStep && (pw.category !== 'tool' || r !== 'G');
  const btn = document.createElement('button');
  btn.className = 'shop-role-btn' + (owned ? ' owned' : blocked ? ' blocked' : '');
  btn.setAttribute('data-power', pw.key);
  btn.setAttribute('data-role', r);
  btn.textContent = owned ? `${r} ✔` : blocked ? `${r} ✖` : r;
  btn.title = lockedByTut
    ? 'Étape Outils : achetez un Outil (📡 / 🧱 / ⚡) pour G !'
    : owned
    ? `Joueuse ${r} possède déjà ${pw.shortLabel}`
    : blocked
    ? getBlockedRoleTitle(pw, r, rolePwr)
    : `Attribuer ${pw.shortLabel} à Joueuse ${r} (${pw.cost} 🪙 PO)`;
  btn.disabled =
    lockedByTut ||
    owned ||
    blocked ||
    !shopCtx.isShopOpen ||
    (!shopCtx.unlimitedCoins && shopCtx.myPE < pw.cost);
  btn.onclick = () => buyIndividualPower(pw.key, r);
  return btn;
}

function renderShopIndividualSection(shopGrid, sec, myMeta, shopCtx) {
  const itemsInSec = INDIVIDUAL_POWERS.filter(
    (pw) => pw.category === sec.id && isPowerItemAllowedInCurrentMode(pw)
  );
  if (itemsInSec.length === 0) return;

  const hdr = document.createElement('div');
  hdr.className = 'shop-cat-header';
  hdr.setAttribute('data-shop-cat', 'individual');
  hdr.setAttribute('data-shop-section', sec.id);
  hdr.textContent = sec.label;
  shopGrid.appendChild(hdr);

  itemsInSec.forEach((pw) => {
    const div = document.createElement('div');
    div.className = 'shop-item' + (shopCtx.isTutToolStep && pw.category === 'tool' ? ' tut-shop-focus' : '');
    div.setAttribute('data-shop-cat', 'individual');
    div.appendChild(createShopItemInfoEl(pw.title, pw.desc));

    const btnWrap = document.createElement('div');
    btnWrap.className = 'shop-role-btns';
    ['G', 'C', 'D'].forEach((r) => {
      btnWrap.appendChild(buildShopPowerRoleButton(pw, r, myMeta, shopCtx));
    });
    div.appendChild(btnWrap);
    shopGrid.appendChild(div);
  });
}

function renderShopExtraDossardRow(shopGrid, myMeta, shopCtx) {
  const dossardDiv = document.createElement('div');
  dossardDiv.className = 'shop-item';
  dossardDiv.setAttribute('data-shop-cat', 'collective');
  dossardDiv.appendChild(
    createShopItemInfoEl(
      '🎽 Dossard Supplémentaire (Collectif — 1 🪙 PO)',
      'Ajoute +1 dossard de la couleur choisie (permet 2 joueuses identiques).'
    )
  );
  const dossardWrap = document.createElement('div');
  dossardWrap.className = 'shop-role-btns';
  const shortColorLabels = { green: '🌿 V', red: '🔥 R', blue: '💧 B' };
  COLOR_KEYS.forEach((cKey) => {
    const bought = !!myMeta.extraDossardBought[cKey];
    const btn = document.createElement('button');
    btn.className = `shop-role-btn dossard-${cKey}${bought ? ' owned' : ''}`;
    btn.setAttribute('data-dossard-color', cKey);
    btn.textContent = bought ? `${COLORS[cKey].symbol} ✔` : `+1 ${shortColorLabels[cKey]}`;
    btn.title = shopCtx.isTutToolStep
      ? 'Étape Outils : achetez un Outil (📡 / 🧱 / ⚡) pour G !'
      : bought
      ? `Dossard ${COLORS[cKey].name} supplémentaire déjà acquis`
      : `+1 dossard ${COLORS[cKey].name} (1 🪙 PO)`;
    btn.disabled = shopCtx.isTutToolStep || bought || !shopCtx.isShopOpen || (!shopCtx.unlimitedCoins && shopCtx.myPE < 1);
    btn.onclick = () => buyExtraDossard(cKey);
    dossardWrap.appendChild(btn);
  });
  dossardDiv.appendChild(dossardWrap);
  shopGrid.appendChild(dossardDiv);
}

function commitTeamShopPurchase(itemKey) {
  if (!applyTeamCollectivePurchase(state.myTeam, itemKey)) return;
  ctx.api.playSfx?.('shop_buy');
  renderShopItems();
  updateTopHUD();
  updateRosterHUD();
  updateMobileTouchHUD();
  syncOrSendPrepAction({ action: 'buyTeamItem', itemKey });
}

function renderShopCollectiveItems(shopGrid, myMeta, shopCtx) {
  const colHdr = document.createElement('div');
  colHdr.className = 'shop-cat-header';
  colHdr.setAttribute('data-shop-cat', 'collective');
  colHdr.textContent = "🛡️ Bonus d'Équipe & Dossards";
  shopGrid.appendChild(colHdr);

  renderShopExtraDossardRow(shopGrid, myMeta, shopCtx);

  const canAfford = (cost) => !shopCtx.isTutToolStep && shopCtx.isShopOpen && (shopCtx.unlimitedCoins || shopCtx.myPE >= cost);
  const teamItems = [
    ...(!state.vanillaMode
      ? [
          {
            title: '👟 Dash + (Équipe — 2 🪙 PO)',
            desc: '+35 % distance et +15 % vitesse de Dash pour vos 3 joueuses (cumulable avec les évolutions).',
            actionLabel: myMeta.teamDashPlus ? 'Acquis ✔' : 'Acheter (2 🪙 PO)',
            canBuy: canAfford(2) && !myMeta.teamDashPlus,
            onBuy: () => commitTeamShopPurchase('teamDashPlus')
          }
        ]
      : []),
    {
      title: '🦘 Débloquer Saut (Équipe — 3 🪙 PO)',
      desc: 'Autorise vos 3 joueuses à sauter ([Espace] / bouton Saut) pour franchir murs déployés et plaques de givre.',
      actionLabel: myMeta.teamJump ? 'Acquis ✔' : 'Acheter (3 🪙 PO)',
      canBuy: canAfford(3) && !myMeta.teamJump,
      onBuy: () => commitTeamShopPurchase('teamJump')
    }
  ];

  teamItems.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'shop-item';
    div.setAttribute('data-shop-cat', 'collective');
    div.appendChild(createShopItemInfoEl(item.title, item.desc));
    const btn = document.createElement('button');
    btn.className = 'action-btn primary';
    btn.textContent = item.actionLabel;
    btn.disabled = !item.canBuy;
    btn.onclick = item.onBuy;
    div.appendChild(btn);
    shopGrid.appendChild(div);
  });
}

export function renderShopItems() {
  const shopGrid = document.getElementById('shop-items-grid');
  const unlockNote = document.getElementById('shop-unlock-note');
  const myMeta = state.teams[state.myTeam];
  const myPE = getTeamPE(state.myTeam);
  const unlimitedCoins = state.mode === 'practice';
  const isShopOpen = isShopAvailable();
  const isTutToolStep = state.mode === 'tutorial' && state.tutorialStep === TUTORIAL_STEPS.TOOLS;

  document.getElementById('prep-pe-display').textContent = unlimitedCoins
    ? 'Or : ∞ 🪙 PO (Pratique)'
    : `Or : ${myPE} 🪙 PO`;
  unlockNote.textContent = unlimitedCoins
    ? '🧪 Mode Pratique : Pièces d’or illimitées (∞ 🪙 PO) — achetez et testez librement !'
    : isShopOpen
    ? `Magasin ouvert ! Attribuez directement à G, C ou D (${myPE} 🪙 PO disponibles)`
    : `S'ouvre à la Ronde 3 (Ronde actuelle : ${state.round}/3)`;

  const btnShopReset = document.getElementById('btn-shop-reset-powers');
  if (btnShopReset) btnShopReset.classList.toggle('hidden', state.mode !== 'practice');

  renderShopEvoStatusBar();
  shopGrid.replaceChildren();
  renderShopHeaderBanner(shopGrid, isTutToolStep);

  const shopCtx = { myPE, unlimitedCoins, isShopOpen, isTutToolStep };
  const categorySections = [
    { id: 'base', label: '🎯 Actions de Base' },
    { id: 'ult', label: "🌟 Évolution d'Ultimate (1/perso • s'applique quel que soit l'élément)" },
    { id: 'dash', label: '💨 Évolutions de Dash (1 max/perso • réachetable pour G, C, D • cumulable avec 👟 Dash+ Équipe)' },
    { id: 'tool', label: '🛠️ Outils [E sans balle] (1 max/perso • demeurent indéfiniment)' }
  ];
  categorySections.forEach((sec) => renderShopIndividualSection(shopGrid, sec, myMeta, shopCtx));
  renderShopCollectiveItems(shopGrid, myMeta, shopCtx);

  applyPrepShopCategoryFilter();
  if (state.mode === 'tutorial' && state.tutorialShopGuideStep > 0) {
    updateTutorialShopGuideUI();
  }
}

function buyIndividualPower(powerKey, targetRole = null) {
  const myMeta = state.teams[state.myTeam];
  const myPE = getTeamPE(state.myTeam);
  const unlimited = state.mode === 'practice';
  const def = INDIVIDUAL_POWERS.find((pw) => pw.key === powerKey);
  if (!def || !isPowerItemAllowedInCurrentMode(def) || (!unlimited && myPE < def.cost)) return false;

  const grantToRole = (r) => {
    if (!myMeta.powers[r] || !grantRolePowerItem(myMeta.powers[r], def)) return false;
    if (!unlimited) setTeamPE(state.myTeam, myPE - def.cost);
    const pl = getPlayer(state.myTeam, r);
    if (pl) syncPlayerPowerVisuals(pl, 0);
    renderPrepColorPickers();
    renderShopItems();
    updateTopHUD();
    updateRosterHUD();
    updateUltHudWidget();
    updateMobileTouchHUD();
    syncOrSendPrepAction({ action: 'buyPower', powerKey, cost: def.cost, targetRole: r });
    if (state.mode === 'tutorial' && state.tutorialStep === TUTORIAL_STEPS.TOOLS && def.category === 'tool' && r === 'G') {
      markTutorialCheck('toolBought');
    }
    ctx.api.playSfx?.('shop_buy');
    return true;
  };

  if (targetRole !== null) {
    return ['G', 'C', 'D'].includes(targetRole) ? grantToRole(targetRole) : false;
  }
  const preferred = ['G', 'C', 'D'].includes(state.controlledRole) ? state.controlledRole : 'G';
  const order = [preferred, ...['G', 'C', 'D'].filter((r) => r !== preferred)];
  return order.some((r) => grantToRole(r));
}

function buyExtraDossard(targetColor = null) {
  const myMeta = state.teams[state.myTeam];
  const myPE = getTeamPE(state.myTeam);
  const unlimited = state.mode === 'practice';
  if (!unlimited && myPE < 1) return false;
  const colorsToTry = targetColor && COLOR_KEYS.includes(targetColor) ? [targetColor] : COLOR_KEYS;
  const cKey = colorsToTry.find((c) => !myMeta.extraDossardBought[c]);
  if (!cKey) return false;

  if (!unlimited) setTeamPE(state.myTeam, myPE - 1);
  myMeta.extraDossardBought[cKey] = true;
  myMeta.dossardStock[cKey] += 1;
  renderPrepColorPickers();
  renderShopItems();
  updateTopHUD();
  syncOrSendPrepAction({ action: 'buyDossard', color: cKey });
  ctx.api.playSfx?.('shop_buy');
  return true;
}
