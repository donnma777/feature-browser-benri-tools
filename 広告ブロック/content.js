'use strict';

const AD_CSS = `
/* Google AdSense */
ins.adsbygoogle,
.adsbygoogle,
[data-ad-client] {
  display: none !important;
  visibility: hidden !important;
  height: 0 !important;
  overflow: hidden !important;
}

/* 一般的な広告クラス */
.advertisement, .advertise, .advertising,
.ad-banner, .ad-block, .ad-container, .ad-content,
.ad-frame, .ad-placeholder, .ad-unit, .ad-wrapper,
.ads-container, .ads-wrapper,
[class^="ad-"], [id^="ad-"] {
  display: none !important;
}

/* バナー広告 */
.banner-ad, .banner_ad, .top-banner-ad, .sidebar-ad,
[class*="banner-ad"], [class*="banner_ad"] {
  display: none !important;
}

/* スポンサーコンテンツ */
[data-sponsor], .sponsored, .sponsored-content,
.sponsored-post, .promoted, .promoted-content {
  display: none !important;
}

/* Taboola / Outbrain */
.taboola, .outbrain,
[id^="taboola-"], [id^="outbrain-"],
[class^="taboola"], [class^="outbrain"],
#RC_WIDGET {
  display: none !important;
}

/* YouTube広告（プレーヤー外のみ） */
ytd-promoted-video-renderer,
ytd-display-ad-renderer,
#masthead-ad,
ytd-in-feed-ad-layout-renderer,
ytd-banner-promo-renderer {
  display: none !important;
}

/* ポップアップ・浮動広告 */
[class*="popup-ad"], [class*="ad-popup"],
[class*="floating-ad"], [class*="sticky-ad"] {
  display: none !important;
}
`;

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

function currentDomain() {
  return location.hostname.replace(/^www\./, '').toLowerCase();
}

function injectCSS() {
  if (document.getElementById('__adblocker_styles__')) return;
  const style = document.createElement('style');
  style.id = '__adblocker_styles__';
  style.textContent = AD_CSS;
  (document.head || document.documentElement).appendChild(style);
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

function startBlocking() {
  injectCSS();
  hideAdElements();
  collapseAdIframes();

  const observer = new MutationObserver((mutations) => {
    let hasNew = false;
    for (const m of mutations) {
      if (m.addedNodes.length > 0) { hasNew = true; break; }
    }
    if (hasNew) {
      hideAdElements();
      collapseAdIframes();
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
}

// 有効状態 + 除外リストをまとめて取得してから判断
chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, (config) => {
  if (chrome.runtime.lastError || !config) return;
  if (!config.enabled) return;
  if ((config.exclusions ?? []).includes(currentDomain())) return;
  startBlocking();
});
