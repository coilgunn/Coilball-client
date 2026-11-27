import {
  COLORS,
  COLOR_KEYS,
  INDIVIDUAL_POWERS,
  grantRolePowerItem,
  state,
  getTeamPE,
  setTeamPE
} from '../state.js';
import { isPowerItemAllowedInCurrentMode } from './shared.js';

export function chooseAIPrepColors(teamKey) {
  const meta = state.teams[teamKey];
  const stock = (meta && meta.dossardStock) || { green: 1, red: 1, blue: 1 };
  const isHard = state.aiDifficulty === 'hard';

  const makeRandomPick = () => {
    const bag = ['green', 'red', 'blue'];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    return { G: bag[0], C: bag[1], D: bag[2] };
  };

  if (!isHard || !Array.isArray(state.drawnBalls) || state.drawnBalls.length < 2) {
    return makeRandomPick();
  }

  const topRole = teamKey === 'ally' ? 'G' : 'D';
  const botRole = teamKey === 'ally' ? 'D' : 'G';
  const topBall = state.drawnBalls[0];
  const botBall = state.drawnBalls[1];
  const remaining = { ...stock };
  const out = {};

  const takeColor = (preferred) => {
    if (preferred && (remaining[preferred] || 0) > 0) {
      remaining[preferred] -= 1;
      return preferred;
    }
    const fallback = COLOR_KEYS.find((c) => (remaining[c] || 0) > 0) || 'green';
    remaining[fallback] = Math.max(0, (remaining[fallback] || 0) - 1);
    return fallback;
  };

  const ambushTop = Math.random() < 0.18;
  const ambushBot = !ambushTop && Math.random() < 0.15;
  out[topRole] = takeColor(ambushTop ? COLORS[topBall].losesTo : topBall);
  out[botRole] = takeColor(ambushBot ? COLORS[botBall].losesTo : botBall);

  const missingBallColor = [topBall, botBall].find((c) => c !== out[topRole] && c !== out[botRole]);
  const thirdColor = COLOR_KEYS.find((c) => c !== out[topRole] && c !== out[botRole]);
  out.C = takeColor(missingBallColor || thirdColor);
  return out;
}

function getAIShopPlan(isHard) {
  if (state.vanillaMode) {
    return {
      maxPurchases: isHard ? 5 : 2,
      candidates: isHard
        ? [
            { key: 'throwBall', roles: ['C', 'G', 'D'] },
            { teamItem: 'teamJump', cost: 3 },
            { key: 'standUp', roles: ['C', 'G', 'D'] },
            { extraDossard: true, cost: 1 }
          ]
        : [
            { key: 'throwBall', roles: ['C', 'G', 'D'] },
            { key: 'standUp', roles: ['G', 'C', 'D'] },
            { teamItem: 'teamJump', cost: 3 }
          ]
    };
  }
  if (isHard) {
    return {
      maxPurchases: 6,
      candidates: [
        { teamItem: 'teamDashPlus', cost: 2 },
        { key: 'ultEvo', roles: ['C', 'G', 'D'] },
        { key: 'dash_slide', roles: ['C', 'G'] },
        { key: 'dash_bounce', roles: ['G', 'D'] },
        { key: 'dash_boomerang', roles: ['D', 'C', 'G'] },
        { key: 'tool_wall', roles: ['C', 'D'] },
        { teamItem: 'teamJump', cost: 3 },
        { key: 'tool_beacon', roles: ['G', 'C'] },
        { key: 'tool_pad', roles: ['D', 'G'] },
        { key: 'standUp', roles: ['C', 'G', 'D'] },
        { extraDossard: true, cost: 1 }
      ]
    };
  }
  const candidates = [
    { key: 'ultEvo', roles: ['G', 'C', 'D'] },
    { key: 'dash_bounce', roles: ['G', 'D', 'C'] },
    { key: 'dash_slide', roles: ['C', 'G', 'D'] },
    { key: 'dash_boomerang', roles: ['D', 'C', 'G'] },
    { key: 'tool_beacon', roles: ['C', 'G'] },
    { key: 'tool_wall', roles: ['C', 'D'] },
    { key: 'tool_pad', roles: ['G', 'D'] },
    { key: 'standUp', roles: ['G', 'C', 'D'] },
    { teamItem: 'teamDashPlus', cost: 2 },
    { teamItem: 'teamJump', cost: 3 }
  ];
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  return { maxPurchases: 2, candidates };
}

function tryBuyAIExtraDossard(meta, spendPE) {
  const prefColors = Array.isArray(state.drawnBalls)
    ? [...state.drawnBalls, ...COLOR_KEYS]
    : COLOR_KEYS;
  const pick = prefColors.find((c) => COLOR_KEYS.includes(c) && !meta.extraDossardBought[c]);
  if (!pick) return false;
  meta.extraDossardBought[pick] = true;
  meta.dossardStock[pick] += 1;
  spendPE(1);
  return true;
}

function tryBuyAICandidate(cand, meta, teamKey, spendPE) {
  const pe = getTeamPE(teamKey);
  if (cand.teamItem) {
    if (meta[cand.teamItem] || pe < cand.cost) return false;
    meta[cand.teamItem] = true;
    spendPE(cand.cost);
    return true;
  }
  if (cand.extraDossard) {
    return pe === 1 ? tryBuyAIExtraDossard(meta, spendPE) : false;
  }
  const def = INDIVIDUAL_POWERS.find((pw) => pw.key === cand.key);
  if (!def || !isPowerItemAllowedInCurrentMode(def) || pe < def.cost) return false;
  for (const r of cand.roles) {
    if (grantRolePowerItem(meta.powers[r], def)) {
      spendPE(def.cost);
      return true;
    }
  }
  return false;
}

export function runTeamAIShopPurchases(teamKey = 'enemy') {
  const meta = state.teams[teamKey];
  if (!meta || !meta.powers) return;

  const spendPE = (amount) => setTeamPE(teamKey, Math.max(0, getTeamPE(teamKey) - amount));
  const { candidates, maxPurchases } = getAIShopPlan(state.aiDifficulty === 'hard');

  let guard = 0;
  while (getTeamPE(teamKey) >= 1 && guard < maxPurchases) {
    guard++;
    const bought = candidates.some((cand) => tryBuyAICandidate(cand, meta, teamKey, spendPE));
    if (!bought) break;
  }
}
