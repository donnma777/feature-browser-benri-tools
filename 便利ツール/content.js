'use strict';

// ============================================================
// 広告ブロック
// ============================================================

const AD_SELECTORS = [
  'ins.adsbygoogle',
  '[data-ad-client]',
  '.adsbygoogle',
  '[id^="google_ads_iframe"]',
  'iframe[src*="doubleclick.net"]',
  'iframe[src*="googlesyndication.com"]',
  'iframe[src*="adnxs.com"]',
  'iframe[src*="facebook.com/tr"]',
  '[class*="outbrain"]',
  '[class*="taboola"]',
  '[id*="outbrain"]',
  '[id*="taboola"]',
  '.promoted-tweet',
];

function currentAdDomain() {
  return location.hostname.replace(/^www\./, '').toLowerCase();
}

function hideAdElements() {
  for (const selector of AD_SELECTORS) {
    try {
      for (const el of document.querySelectorAll(selector)) {
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
      }
    } catch (_) {}
  }
}

function collapseAdIframes() {
  for (const iframe of document.querySelectorAll('iframe')) {
    const src = iframe.src || '';
    if (
      src.includes('doubleclick.net') ||
      src.includes('googlesyndication.com') ||
      src.includes('adnxs.com') ||
      src.includes('amazon-adsystem.com') ||
      src.includes('outbrain.com') ||
      src.includes('taboola.com')
    ) {
      iframe.style.setProperty('display', 'none', 'important');
      const parent = iframe.parentElement;
      if (parent && parent.children.length === 1) {
        parent.style.setProperty('display', 'none', 'important');
      }
    }
  }
}

function startAdBlocking() {
  hideAdElements();
  collapseAdIframes();

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.addedNodes.length > 0) {
        hideAdElements();
        collapseAdIframes();
        break;
      }
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
}

chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, (config) => {
  if (chrome.runtime.lastError || !config) return;
  if (!config.enabled) return;
  if ((config.exclusions ?? []).includes(currentAdDomain())) return;
  startAdBlocking();
});

// ============================================================
// 強制ダークモード
// ============================================================

const DARK_STYLE_ID = '__force_dark_mode__';

function applyDarkMode() {
  if (document.getElementById(DARK_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = DARK_STYLE_ID;
  style.textContent = `
    html {
      filter: invert(1) hue-rotate(180deg) !important;
    }
    img, picture, video, canvas, svg, iframe,
    [style*="background-image"] {
      filter: invert(1) hue-rotate(180deg) !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function removeDarkMode() {
  const el = document.getElementById(DARK_STYLE_ID);
  if (el) el.remove();
}

function isTransparent(color) {
  return !color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)';
}

function isDarkColor(color) {
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return false;
  const luminance = (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255;
  return luminance < 0.5;
}

function siteHasNativeDarkMode() {
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta?.content?.trim() === 'dark') return true;

  const bodyBg = getComputedStyle(document.body).backgroundColor;
  const htmlBg = getComputedStyle(document.documentElement).backgroundColor;

  if (!isTransparent(bodyBg) && isDarkColor(bodyBg)) return true;
  if (!isTransparent(htmlBg) && isDarkColor(htmlBg)) return true;

  return false;
}

function getDarkHostname() {
  try { return new URL(location.href).hostname || '__global__'; }
  catch { return '__global__'; }
}

async function initDarkMode() {
  const hostname = getDarkHostname();
  const data = await chrome.storage.local.get(['globalEnabled', 'siteOverrides']);
  const globalEnabled = data.globalEnabled ?? false;
  const siteOverrides = data.siteOverrides ?? {};

  const hasSiteOverride = hostname in siteOverrides;
  const enabled = hasSiteOverride ? siteOverrides[hostname] : globalEnabled;

  if (!enabled) return;

  const tryApply = () => {
    if (hasSiteOverride || !siteHasNativeDarkMode()) applyDarkMode();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryApply);
  } else {
    tryApply();
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SET_DARK') {
    if (msg.enabled) {
      applyDarkMode();
    } else {
      removeDarkMode();
    }
  }
});

initDarkMode();
