import { getTeamPE, state, ctx } from '../state.js';

export function switchWelcomeSubmenu(tabId = 'play') {
  const valid = ['play', 'rules'];
  const target = valid.includes(tabId) ? tabId : 'play';
  state.welcomeTab = target;

  valid.forEach((id) => {
    const pane = document.getElementById(`welcome-pane-${id}`);
    if (pane) pane.classList.toggle('hidden', id !== target);
  });

  const tabBar = document.getElementById('welcome-submenu-tabs');
  if (tabBar && tabBar.children) {
    Array.from(tabBar.children).forEach((btn) => {
      const bTab = btn.getAttribute && btn.getAttribute('data-welcome-tab');
      if (bTab) btn.classList.toggle('active', bTab === target);
    });
  }
}

export function applyPrepShopCategoryFilter() {
  const tab = state.prepTab || 'dossards';
  const dossardsEl = document.getElementById('prep-dossards-section');
  const shopEl = document.getElementById('shop-container');
  const evoStatusBar = document.getElementById('shop-evo-status-bar');
  const headingEl = document.getElementById('shop-category-heading');
  const shopGrid = document.getElementById('shop-items-grid');
  const openShopBtn = document.getElementById('btn-prep-open-shop');

  if (dossardsEl) {
    dossardsEl.classList.toggle('hidden', tab === 'individual' || tab === 'collective');
  }
  if (shopEl) {
    shopEl.classList.toggle('hidden', tab === 'dossards');
  }
  if (evoStatusBar) {
    evoStatusBar.style.display = tab === 'collective' ? 'none' : 'grid';
  }
  if (headingEl) {
    headingEl.textContent =
      tab === 'individual'
        ? '⚡ Pouvoirs Individuels (Attribution à G, C ou D)'
        : tab === 'collective'
        ? "🛡️ Bonus Collectifs d'Équipe & Dossards"
        : '🛒 Magasin Complet (Individuels & Équipe)';
  }
  if (shopGrid && shopGrid.children) {
    Array.from(shopGrid.children).forEach((itemEl) => {
      const cat = itemEl.getAttribute && itemEl.getAttribute('data-shop-cat');
      const hide =
        (tab === 'individual' && cat === 'collective') ||
        (tab === 'collective' && cat === 'individual');
      itemEl.classList.toggle('hidden-by-tab', !!hide);
    });
  }
  if (openShopBtn) {
    if (tab === 'dossards') {
      openShopBtn.textContent =
        state.mode === 'practice'
          ? '🛒 Ouvrir le Magasin (🪙 ∞) →'
          : ctx.api.isShopAvailable()
          ? `🛒 Ouvrir le Magasin (${getTeamPE(state.myTeam)} 🪙 PO) →`
          : '🛒 Aperçu du Magasin (Ronde 3) →';
    } else if (tab === 'individual') {
      openShopBtn.textContent = "🛡️ Voir Bonus d'Équipe →";
    } else {
      openShopBtn.textContent = '🎽 Retour aux Dossards (G / C / D)';
    }
  }
}

export function switchPrepSubmenu(tabId = 'dossards') {
  const valid = ['dossards', 'individual', 'collective', 'all'];
  const target = valid.includes(tabId) ? tabId : 'dossards';
  state.prepTab = target;

  const tabBar = document.getElementById('prep-submenu-tabs');
  if (tabBar && tabBar.children) {
    Array.from(tabBar.children).forEach((btn) => {
      const bTab = btn.getAttribute && btn.getAttribute('data-prep-tab');
      if (bTab) btn.classList.toggle('active', bTab === target);
    });
  }
  applyPrepShopCategoryFilter();
}

export function switchHudLeftSubmenu(tabId = 'roster') {
  const target = tabId === 'rps' ? 'rps' : 'roster';
  state.hudLeftTab = target;
  state.hudLeftCollapsed = false;

  const rosterPanel = document.getElementById('roster-panel');
  const leftBody = document.getElementById('hud-left-body');
  const rosterPane = document.getElementById('hud-pane-roster');
  const rpsPane = document.getElementById('rps-widget');
  const btnRoster = document.getElementById('btn-hud-tab-roster');
  const btnRps = document.getElementById('btn-hud-tab-rps');
  const btnCollapse = document.getElementById('btn-hud-collapse-left');

  if (rosterPanel) rosterPanel.classList.remove('hud-collapsed');
  if (leftBody) leftBody.classList.remove('hidden');
  if (rosterPane) rosterPane.classList.toggle('hidden', target !== 'roster');
  if (rpsPane) rpsPane.classList.toggle('hidden', target !== 'rps');
  if (btnRoster) btnRoster.classList.toggle('active', target === 'roster');
  if (btnRps) btnRps.classList.toggle('active', target === 'rps');
  if (btnCollapse) btnCollapse.textContent = '▾';
}

export function toggleHudLeftCollapse() {
  state.hudLeftCollapsed = !state.hudLeftCollapsed;
  const rosterPanel = document.getElementById('roster-panel');
  const leftBody = document.getElementById('hud-left-body');
  const btnCollapse = document.getElementById('btn-hud-collapse-left');
  if (rosterPanel) rosterPanel.classList.toggle('hud-collapsed', state.hudLeftCollapsed);
  if (leftBody) leftBody.classList.toggle('hidden', state.hudLeftCollapsed);
  if (btnCollapse) btnCollapse.textContent = state.hudLeftCollapsed ? '▸' : '▾';
}

export function toggleControlsHelpSubmenu() {
  const el = document.getElementById('controls-help');
  if (!el) return;
  el.classList.toggle('collapsed-submenu');
}
