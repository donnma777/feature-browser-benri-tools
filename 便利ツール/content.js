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

// 除外ドメインは、サブドメイン（例: m.youtube.com, music.youtube.com）も
// まとめて対象にするため、完全一致だけでなく親ドメイン一致も見る。
function isExcludedDomain(hostname, exclusions) {
  return exclusions.some((d) => hostname === d || hostname.endsWith(`.${d}`));
}

// もともと manifest.json の content_scripts.css として静的注入していたが、
// ON/OFF・除外設定と連動しないため、JS側で <style> の挿入/削除を管理する形に変更。
// また、[class^="ad-"] のような汎用ワイルドカードは、YouTube が広告再生中に
// プレイヤー本体へ付与する "ad-showing" 等のクラスにも誤爆し、プレイヤーごと
// 非表示にしてしまうため、具体的なクラス名のみに絞っている。
const AD_CSS_ID = '__ad_block_css__';
const AD_CSS_TEXT = `
.adsbygoogle,
ins.adsbygoogle,
[id^="google_ads_"],
[id^="google-ad-"],
[data-ad-client],
[data-ad-slot] {
  display: none !important;
  visibility: hidden !important;
  height: 0 !important;
  overflow: hidden !important;
}

.advertisement,
.advertise,
.advertising,
.ad-banner,
.ad-block,
.ad-container,
.ad-content,
.ad-frame,
.ad-placeholder,
.ad-slot,
.ad-unit,
.ad-wrapper,
.ads-container,
.ads-wrapper {
  display: none !important;
}

.banner-ad,
.banner_ad,
.top-banner-ad,
.sidebar-ad {
  display: none !important;
}

[class*="sponsor"],
[id*="sponsor"],
[data-sponsor],
.sponsored,
.sponsored-content,
.sponsored-post,
.promoted,
.promoted-content {
  display: none !important;
}

.taboola,
.outbrain,
[id^="taboola-"],
[id^="outbrain-"],
[class^="taboola"],
[class^="outbrain"],
#taboola-below-article-thumbnails,
#RC_WIDGET {
  display: none !important;
}

ytd-promoted-video-renderer,
ytd-display-ad-renderer,
ytd-promoted-sparkles-web-renderer,
ytd-ad-slot-renderer,
#player-ads,
#masthead-ad {
  display: none !important;
}

[class*="popup-ad"],
[class*="ad-popup"],
[id*="popup-ad"],
[class*="interstitial"],
[id*="interstitial"] {
  display: none !important;
}

[class*="floating-ad"],
[class*="sticky-ad"],
[id*="floating-ad"],
[id*="sticky-ad"] {
  display: none !important;
}
`;

function injectAdCss() {
  if (document.getElementById(AD_CSS_ID)) return;
  const style = document.createElement('style');
  style.id = AD_CSS_ID;
  style.textContent = AD_CSS_TEXT;
  (document.head || document.documentElement).appendChild(style);
}

function removeAdCss() {
  document.getElementById(AD_CSS_ID)?.remove();
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

let adObserver = null;

function startAdBlocking() {
  injectAdCss();
  if (adObserver) return;
  hideAdElements();
  collapseAdIframes();

  adObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.addedNodes.length > 0) {
        hideAdElements();
        collapseAdIframes();
        break;
      }
    }
  });

  adObserver.observe(document.documentElement, { childList: true, subtree: true });
}

function stopAdBlocking() {
  removeAdCss();
  if (adObserver) {
    adObserver.disconnect();
    adObserver = null;
  }
  for (const selector of AD_SELECTORS) {
    try {
      for (const el of document.querySelectorAll(selector)) {
        el.style.removeProperty('display');
        el.style.removeProperty('visibility');
      }
    } catch (_) {}
  }
  for (const iframe of document.querySelectorAll('iframe')) {
    iframe.style.removeProperty('display');
    const parent = iframe.parentElement;
    if (parent) parent.style.removeProperty('display');
  }
}

function applyAdConfig(config) {
  const shouldBlock = !!config?.enabled && !isExcludedDomain(currentAdDomain(), config.exclusions ?? []);
  if (shouldBlock) {
    startAdBlocking();
  } else {
    stopAdBlocking();
  }
}

chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, (config) => {
  if (chrome.runtime.lastError || !config) return;
  applyAdConfig(config);
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

  if (msg.type === 'AD_CONFIG_CHANGED') {
    applyAdConfig(msg.config);
  }
});

initDarkMode();
