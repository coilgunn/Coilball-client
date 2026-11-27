import { state, setSafeHtml } from '../state.js';
import { uiState } from './shared.js';

export function showToast(htmlText, durationMs = 4500, isPriority = false) {
  const banner = document.getElementById('banner-toast');
  if (!banner) return;
  let displayHtml = htmlText;
  let effectiveDuration = durationMs;
  if (state.mobileMode && !isPriority) {
    if (effectiveDuration > 0) {
      effectiveDuration = Math.min(effectiveDuration, 1800);
    }
    const str = String(htmlText || '');
    const strongMatch = str.match(/^([\s\S]*?<strong>[\s\S]*?<\/strong>)/i);
    if (strongMatch) {
      displayHtml = strongMatch[1].replace(/\s*[:—–]\s*<\/strong>$/i, '</strong>').trim();
    } else {
      const stripped = str.replace(/<br\s*\/?>[\s\S]*$/i, '').split(/\s+[—–]\s+|:\s+/)[0];
      displayHtml = stripped.trim() || str;
    }
  }
  setSafeHtml(banner, displayHtml);
  banner.classList.toggle('priority-toast', !!isPriority);
  banner.classList.remove('hidden');
  if (uiState.toastTimeout) clearTimeout(uiState.toastTimeout);
  if (effectiveDuration > 0) {
    uiState.toastTimeout = setTimeout(() => {
      banner.classList.add('hidden');
      banner.classList.remove('priority-toast');
    }, effectiveDuration);
  }
}
