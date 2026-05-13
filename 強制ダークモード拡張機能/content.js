const STYLE_ID = '__force_dark_mode__';

function applyDarkMode() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
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
  const el = document.getElementById(STYLE_ID);
  if (el) el.remove();
}

// 色文字列が実質的に透明かどうか
function isTransparent(color) {
  return !color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)';
}

// RGB値から輝度を計算し、暗い色かどうかを返す
function isDarkColor(color) {
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return false;
  const luminance = (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255;
  return luminance < 0.5;
}

// ページがすでにダークな背景で描画されているか確認
function siteHasNativeDarkMode() {
  // <meta name="color-scheme" content="dark"> のみを対象（"light dark" は除外）
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta?.content?.trim() === 'dark') return true;

  // body / html の実際の背景色が暗ければネイティブ対応とみなす
  const bodyBg = getComputedStyle(document.body).backgroundColor;
  const htmlBg = getComputedStyle(document.documentElement).backgroundColor;

  if (!isTransparent(bodyBg) && isDarkColor(bodyBg)) return true;
  if (!isTransparent(htmlBg) && isDarkColor(htmlBg)) return true;

  return false;
}

function getHostname() {
  try { return new URL(location.href).hostname || '__global__'; }
  catch { return '__global__'; }
}

async function init() {
  const hostname = getHostname();
  const data = await chrome.storage.local.get(['globalEnabled', 'siteOverrides']);
  const globalEnabled = data.globalEnabled ?? false;
  const siteOverrides = data.siteOverrides ?? {};

  const hasSiteOverride = hostname in siteOverrides;
  const enabled = hasSiteOverride ? siteOverrides[hostname] : globalEnabled;

  if (!enabled) return;

  const tryApply = () => {
    // サイト個別でONにした場合はネイティブ検出をスキップして強制適用
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
      // ポップアップからの手動切り替えはネイティブ対応チェックをスキップ
      applyDarkMode();
    } else {
      removeDarkMode();
    }
  }
});

init();
