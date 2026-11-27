import { TUTORIAL_TOTAL_STEPS, mp, state, ctx } from '../state.js';
import { players } from '../render3d.js';
import { clearAllUltimates, updateUltHudWidget } from '../ultimates.js';
import { updateLobbyUI } from '../net.js';
import { attachLockFocusPrep, uiState } from './shared.js';
import { showToast } from './toast.js';
import { toggleFullscreen } from './viewport.js';
import { updateRosterHUD } from './hud_top_roster.js';
import { showOnlyModal } from './modals_core.js';
import { setAIDifficulty, setMpLobbyAiDifficulty, setMpLobbyMode, setMpLobbyVanilla } from './arena_lobby.js';
import {
  closeOptionsModal,
  openArenaModal,
  openOptionsModal,
  returnToMainMenu,
  resumeFromPauseMenu,
  syncArenaRulesetUI
} from './modals_actions.js';

function openMpLobbyModal(mode, fromPracticeBar) {
  mp.openedFromPracticeBar = !!fromPracticeBar;
  if (!mp.enabled || mp.isHost) {
    setMpLobbyMode(mode, mp.enabled && mp.isHost);
  }
  showOnlyModal('mp-modal');
  updateLobbyUI(mp.enabled ? undefined : 'Non connecté');
}

function bindOptionsAndModeButtons() {
  const btnWelcomeOptions = document.getElementById('btn-welcome-options');
  if (btnWelcomeOptions) {
    btnWelcomeOptions.onclick = () => {
      btnWelcomeOptions.blur();
      openOptionsModal('welcome-modal');
    };
  }
  const btnPauseOptions = document.getElementById('btn-pause-options');
  if (btnPauseOptions) {
    btnPauseOptions.onclick = () => {
      btnPauseOptions.blur();
      openOptionsModal('pause-modal');
    };
  }
  const btnOptionsClose = document.getElementById('btn-options-close');
  if (btnOptionsClose) {
    btnOptionsClose.onclick = () => {
      btnOptionsClose.blur();
      closeOptionsModal();
    };
  }
  const btnStartTutorial = document.getElementById('btn-start-tutorial');
  attachLockFocusPrep(btnStartTutorial);
  if (btnStartTutorial) btnStartTutorial.onclick = () => ctx.api.startNewMatch('tutorial');

  const btnStartPractice = document.getElementById('btn-start-practice');
  if (btnStartPractice) btnStartPractice.onclick = () => openArenaModal('practice', false);

  const btnStartGame = document.getElementById('btn-start-game');
  if (btnStartGame) btnStartGame.onclick = () => openArenaModal('pedagogical', false);

  const btnStartVanilla = document.getElementById('btn-start-vanilla');
  if (btnStartVanilla) btnStartVanilla.onclick = () => openArenaModal('pedagogical', true);
}

function bindArenaAndPauseButtons() {
  const btnArenaRuleStd = document.getElementById('btn-arena-rule-standard');
  if (btnArenaRuleStd) {
    btnArenaRuleStd.onclick = () => {
      uiState.pendingArenaVanilla = false;
      syncArenaRulesetUI();
    };
  }
  const btnArenaRuleVanilla = document.getElementById('btn-arena-rule-vanilla');
  if (btnArenaRuleVanilla) {
    btnArenaRuleVanilla.onclick = () => {
      uiState.pendingArenaVanilla = true;
      syncArenaRulesetUI();
    };
  }
  const btnArenaBack = document.getElementById('btn-arena-back');
  if (btnArenaBack) {
    btnArenaBack.onclick = () => {
      btnArenaBack.blur();
      showOnlyModal('welcome-modal');
    };
  }
  const btnArenaAiNormal = document.getElementById('btn-arena-ai-normal');
  if (btnArenaAiNormal) btnArenaAiNormal.onclick = () => setAIDifficulty('normal');
  const btnArenaAiHard = document.getElementById('btn-arena-ai-hard');
  if (btnArenaAiHard) btnArenaAiHard.onclick = () => setAIDifficulty('hard');

  const btnOptAiDiff = document.getElementById('btn-toggle-ai-difficulty');
  if (btnOptAiDiff) {
    btnOptAiDiff.onclick = () => {
      btnOptAiDiff.blur();
      if (mp.enabled && !mp.isHost) return;
      setAIDifficulty(state.aiDifficulty === 'hard' ? 'normal' : 'hard');
    };
  }
  const btnArenaLaunch = document.getElementById('btn-arena-launch');
  attachLockFocusPrep(btnArenaLaunch);
  if (btnArenaLaunch) {
    btnArenaLaunch.onclick = () => {
      ctx.api.startNewMatch(uiState.pendingArenaMode || 'pedagogical', {
        vanillaMode: !!uiState.pendingArenaVanilla,
        aiDifficulty: state.aiDifficulty
      });
    };
  }

  const btnPauseResume = document.getElementById('btn-pause-resume');
  attachLockFocusPrep(btnPauseResume);
  if (btnPauseResume) btnPauseResume.onclick = () => resumeFromPauseMenu();

  const btnPauseRules = document.getElementById('btn-pause-rules');
  if (btnPauseRules) {
    btnPauseRules.onclick = () => {
      btnPauseRules.blur();
      const panel = document.getElementById('pause-rules-panel');
      if (panel) {
        const nowHidden = panel.classList.toggle('hidden');
        btnPauseRules.classList.toggle('active-mode-pill', !nowHidden);
      }
    };
  }
  const btnPauseFullscreen = document.getElementById('btn-pause-fullscreen');
  if (btnPauseFullscreen) {
    btnPauseFullscreen.onclick = () => {
      btnPauseFullscreen.blur();
      toggleFullscreen();
    };
  }
  const btnPauseReturnMenu = document.getElementById('btn-pause-return-menu');
  if (btnPauseReturnMenu) {
    btnPauseReturnMenu.onclick = () => returnToMainMenu({ withCongrats: false });
  }
}

function bindMpLobbyModeButtons() {
  const btnOpenMp = document.getElementById('btn-open-mp');
  if (btnOpenMp) btnOpenMp.onclick = () => openMpLobbyModal('multiplayer', false);

  const btnOpenPracticeMp = document.getElementById('btn-open-practice-mp');
  if (btnOpenPracticeMp) btnOpenPracticeMp.onclick = () => openMpLobbyModal('practice', false);

  const hostOnlyClick = (id, fn) => {
    const el = document.getElementById(id);
    if (el) {
      el.onclick = () => {
        if (mp.enabled && !mp.isHost) return;
        fn();
      };
    }
  };
  hostOnlyClick('btn-mp-mode-match', () => setMpLobbyMode('multiplayer', true));
  hostOnlyClick('btn-mp-mode-practice', () => setMpLobbyMode('practice', true));
  hostOnlyClick('btn-mp-rule-standard', () => setMpLobbyVanilla(false, true));
  hostOnlyClick('btn-mp-rule-vanilla', () => setMpLobbyVanilla(true, true));
  hostOnlyClick('btn-mp-ai-normal', () => setMpLobbyAiDifficulty('normal', true));
  hostOnlyClick('btn-mp-ai-hard', () => setMpLobbyAiDifficulty('hard', true));
}

function bindPracticeButtons() {
  const bindPracticeBtn = (id, action) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.onclick = () => {
      el.blur();
      ctx.api.requestPracticeAction(action);
    };
  };
  bindPracticeBtn('btn-practice-refresh-ults', 'refresh_ult');
  bindPracticeBtn('btn-practice-standup', 'standup_all');
  bindPracticeBtn('btn-practice-reset', 'reset_pos');
  bindPracticeBtn('btn-practice-swap-team', 'swap_team');
  bindPracticeBtn('btn-practice-reset-powers', 'reset_powers');
  bindPracticeBtn('btn-pause-practice-ults', 'refresh_ult');
  bindPracticeBtn('btn-pause-practice-standup', 'standup_all');
  bindPracticeBtn('btn-pause-practice-reset', 'reset_pos');
  bindPracticeBtn('btn-pause-practice-swap-team', 'swap_team');
  bindPracticeBtn('btn-pause-practice-reset-powers', 'reset_powers');

  const bindPracticeShopBtn = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.onclick = () => {
      el.blur();
      ctx.api.openPracticeShop();
    };
  };
  bindPracticeShopBtn('btn-practice-open-shop');
  bindPracticeShopBtn('btn-pause-practice-shop');
  attachLockFocusPrep(document.getElementById('btn-quick-practice-shop'));
  bindPracticeShopBtn('btn-quick-practice-shop');

  const btnShopResetPowers = document.getElementById('btn-shop-reset-powers');
  if (btnShopResetPowers) {
    btnShopResetPowers.onclick = () => {
      btnShopResetPowers.blur();
      ctx.api.requestPracticeAction('reset_powers', { team: state.myTeam });
    };
  }
  ['btn-pause-practice-mp', 'btn-practice-mp'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.onclick = () => {
        el.blur();
        openMpLobbyModal('practice', true);
      };
    }
  });
}

function bindTutorialButtons() {
  const btnTutIntroStart = document.getElementById('btn-tut-intro-start');
  attachLockFocusPrep(btnTutIntroStart);
  if (btnTutIntroStart) {
    btnTutIntroStart.onclick = () => {
      btnTutIntroStart.blur();
      ctx.api.dismissTutorialIntro?.();
    };
  }
  const tutStepsBar = document.getElementById('tut-steps-bar');
  if (tutStepsBar && tutStepsBar.children) {
    Array.from(tutStepsBar.children).forEach((pill) => {
      pill.onclick = () => {
        if (state.mode !== 'tutorial') return;
        const step = Number(pill.getAttribute('data-tut-step'));
        if (step >= 1 && step <= TUTORIAL_TOTAL_STEPS) ctx.api.enterTutorialStep(step);
      };
    });
  }
  const btnTutShop = document.getElementById('btn-tut-open-shop');
  if (btnTutShop) btnTutShop.onclick = () => ctx.api.openTutorialShopStep3();
  const btnTutRefUlt = document.getElementById('btn-tut-refresh-ult');
  if (btnTutRefUlt) {
    btnTutRefUlt.onclick = () => {
      clearAllUltimates();
      players.forEach((p) => {
        p.ultUsed = false;
        p.dashCooldown = 0;
        p.carryingBall = null;
        if (p.state !== 'standing') {
          p.state = 'standing';
          p.rule1Partner = null;
        }
      });
      updateRosterHUD();
      updateUltHudWidget();
      showToast('🔄 <strong>Ultimates rechargés !</strong> Essayez les touches <strong>1 / 2 / 3</strong> + <strong>[R]</strong> !', 2600);
    };
  }
  const btnTutToPractice = document.getElementById('btn-tut-to-practice');
  if (btnTutToPractice) btnTutToPractice.onclick = () => ctx.api.completeTutorialToPractice?.(false);
  const btnTutNext = document.getElementById('btn-tut-next');
  if (btnTutNext) {
    btnTutNext.onclick = () => {
      if (state.mode === 'tutorial') ctx.api.advanceTutorialStep?.();
    };
  }
  const btnTutShopPrev = document.getElementById('btn-tut-shop-prev');
  if (btnTutShopPrev) {
    btnTutShopPrev.onclick = () => {
      if (state.mode === 'tutorial') ctx.api.setTutorialShopGuideStep?.(Math.max(1, (state.tutorialShopGuideStep || 1) - 1));
    };
  }
  const btnTutShopNext = document.getElementById('btn-tut-shop-next');
  if (btnTutShopNext) {
    btnTutShopNext.onclick = () => {
      if (state.mode !== 'tutorial') return;
      const cur = Number(state.tutorialShopGuideStep) || 1;
      ctx.api.setTutorialShopGuideStep?.(cur < 3 ? cur + 1 : 0);
    };
  }
  const btnTutShopSkip = document.getElementById('btn-tut-shop-skip');
  if (btnTutShopSkip) btnTutShopSkip.onclick = () => ctx.api.setTutorialShopGuideStep?.(0);
}

export function bindMenusUI() {
  bindOptionsAndModeButtons();
  bindArenaAndPauseButtons();
  bindMpLobbyModeButtons();
  bindPracticeButtons();
  bindTutorialButtons();
}
