'use strict';

// ============================================================
// タブ切替
// ============================================================

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`panel-${btn.dataset.tab}`).classList.add('active');
  });
});

// ============================================================
// 広告ブロック
// ============================================================

const adToggle = document.getElementById('ad-toggle');
const adStatus = document.getElementById('ad-status');
const adDomainEl = document.getElementById('ad-domain');
const adSiteBtn = document.getElementById('ad-site-btn');
const adExclusionCount = document.getElementById('ad-exclusion-count');
const adSiteStatus = document.getElementById('ad-site-status');
const adReloadHint = document.getElementById('ad-reload-hint');

function showAdReloadHint() {
  adReloadHint.hidden = false;
}

let adCurrentDomain = null;
let adExclusions = [];

function applyAdState(enabled) {
  adToggle.checked = enabled;
  adStatus.textContent = enabled ? '保護中' : '停止中';
  adStatus.className = `status ${enabled ? 'active' : 'inactive'}`;
}

function normalizeDomain(hostname) {
  return hostname.replace(/^www\./, '').toLowerCase();
}

function renderAdExclusions() {
  adExclusionCount.textContent = adExclusions.length;
}

// 現在のサイトが除外リストのどの項目で除外されているかを調べる。
// 完全一致がなければ、親ドメイン一致（例: youtube.com が m.youtube.com を含む）も見る。
function findMatchingExclusion(hostname, exclusions) {
  if (exclusions.includes(hostname)) return hostname;
  return exclusions.find((d) => hostname.endsWith(`.${d}`)) ?? null;
}

function updateAdSiteBtn() {
  if (!adCurrentDomain) return;
  const match = findMatchingExclusion(adCurrentDomain, adExclusions);
  const excluded = !!match;

  adSiteBtn.textContent = excluded ? '除外を解除' : '除外する';
  adSiteBtn.className = `btn ${excluded ? 'btn-include' : 'btn-exclude'}`;

  adSiteStatus.textContent = excluded
    ? (match === adCurrentDomain ? '🚫 このサイトは除外中（広告ブロック対象外）' : `🚫 このサイトは除外中（${match} の設定による）`)
    : '🛡 このサイトはブロック対象';
  adSiteStatus.className = `site-status ${excluded ? 'off' : 'on'}`;
}

function addAdExclusion(domain) {
  chrome.runtime.sendMessage({ type: 'ADD_EXCLUSION', domain }, (res) => {
    if (res?.ok) {
      adExclusions = res.exclusions;
      renderAdExclusions();
      updateAdSiteBtn();
      showAdReloadHint();
    }
  });
}

function removeAdExclusion(domain) {
  chrome.runtime.sendMessage({ type: 'REMOVE_EXCLUSION', domain }, (res) => {
    if (res?.ok) {
      adExclusions = res.exclusions;
      renderAdExclusions();
      updateAdSiteBtn();
      showAdReloadHint();
    }
  });
}

chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
  applyAdState(state?.enabled ?? true);
});

chrome.runtime.sendMessage({ type: 'GET_EXCLUSIONS' }, (list) => {
  adExclusions = list ?? [];
  renderAdExclusions();
  updateAdSiteBtn();
});

adToggle.addEventListener('change', () => {
  chrome.runtime.sendMessage({ type: 'TOGGLE' }, (state) => {
    applyAdState(state?.enabled ?? true);
    showAdReloadHint();
  });
});

adSiteBtn.addEventListener('click', () => {
  if (!adCurrentDomain) return;
  const match = findMatchingExclusion(adCurrentDomain, adExclusions);
  if (match) {
    removeAdExclusion(match);
  } else {
    addAdExclusion(adCurrentDomain);
  }
});

// ============================================================
// ダークモード
// ============================================================

const darkSiteToggle = document.getElementById('dark-site-toggle');
const darkGlobalToggle = document.getElementById('dark-global-toggle');
const darkHostnameEl = document.getElementById('dark-hostname');

let darkTab = null;
let darkHostname = '';

async function initDarkPopup() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  darkTab = tab;
  const url = tab?.url ?? '';

  try { darkHostname = new URL(url).hostname; } catch {}
  darkHostnameEl.textContent = darkHostname || '(特殊ページ)';

  const data = await chrome.storage.local.get(['globalEnabled', 'siteOverrides']);
  const globalEnabled = data.globalEnabled ?? false;
  const siteOverrides = data.siteOverrides ?? {};

  darkGlobalToggle.checked = globalEnabled;
  darkSiteToggle.checked = darkHostname in siteOverrides
    ? siteOverrides[darkHostname]
    : globalEnabled;
}

async function applyDarkToTab(enabled) {
  if (!darkTab?.id || !darkHostname) return;
  try {
    await chrome.tabs.sendMessage(darkTab.id, { type: 'SET_DARK', enabled });
  } catch {}
  chrome.action.setBadgeText({ tabId: darkTab.id, text: enabled ? '🌙' : '' });
  chrome.action.setBadgeBackgroundColor({ tabId: darkTab.id, color: '#1a73e8' });
}

darkGlobalToggle.addEventListener('change', async () => {
  const enabled = darkGlobalToggle.checked;
  await chrome.storage.local.set({ globalEnabled: enabled });

  const fresh = await chrome.storage.local.get('siteOverrides');
  const overrides = fresh.siteOverrides ?? {};
  if (!(darkHostname in overrides)) {
    darkSiteToggle.checked = enabled;
    await applyDarkToTab(enabled);

    const allTabs = await chrome.tabs.query({});
    for (const t of allTabs) {
      if (t.id === darkTab?.id || !t.url) continue;
      let h = '';
      try { h = new URL(t.url).hostname; } catch {}
      if (!(h in overrides)) {
        chrome.tabs.sendMessage(t.id, { type: 'SET_DARK', enabled }).catch(() => {});
      }
    }
  }
});

darkSiteToggle.addEventListener('change', async () => {
  const enabled = darkSiteToggle.checked;
  if (!darkHostname) return;

  const fresh = await chrome.storage.local.get('siteOverrides');
  const overrides = fresh.siteOverrides ?? {};

  if (enabled === darkGlobalToggle.checked) {
    delete overrides[darkHostname];
  } else {
    overrides[darkHostname] = enabled;
  }

  await chrome.storage.local.set({ siteOverrides: overrides });
  await applyDarkToTab(enabled);
});

// ============================================================
// 表示モードのシミュレート（prefers-color-scheme 偽装）
// ============================================================

const schemeButtons = {
  auto: document.getElementById('scheme-auto'),
  light: document.getElementById('scheme-light'),
  dark: document.getElementById('scheme-dark'),
};

function applySchemeButtons(scheme) {
  for (const [key, btn] of Object.entries(schemeButtons)) {
    btn.classList.toggle('active', key === scheme);
  }
}

async function initSchemeEmulation() {
  if (!darkTab?.id) return;
  chrome.runtime.sendMessage({ type: 'GET_COLOR_SCHEME', tabId: darkTab.id }, (res) => {
    applySchemeButtons(res?.scheme ?? 'auto');
  });
}

for (const [scheme, btn] of Object.entries(schemeButtons)) {
  btn.addEventListener('click', () => {
    if (!darkTab?.id) return;
    chrome.runtime.sendMessage({ type: 'SET_COLOR_SCHEME', tabId: darkTab.id, scheme }, (res) => {
      if (res?.ok) {
        applySchemeButtons(scheme);
      } else {
        applySchemeButtons('auto');
        alert(`表示モードの切り替えに失敗しました: ${res?.error ?? '不明なエラー'}`);
      }
    });
  });
}

// ============================================================
// 共通：現在のサイト取得 & オプションページ
// ============================================================

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  if (!tab?.url) {
    adDomainEl.textContent = '取得できません';
    adSiteBtn.disabled = true;
    return;
  }
  try {
    const url = new URL(tab.url);
    if (!url.hostname) throw new Error();
    adCurrentDomain = normalizeDomain(url.hostname);
    adDomainEl.textContent = adCurrentDomain;
    updateAdSiteBtn();
  } catch {
    adDomainEl.textContent = '対応外のページ';
    adSiteBtn.disabled = true;
  }
});

document.getElementById('open-options').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

initDarkPopup().then(initSchemeEmulation);

// ============================================================
// スクリーンショット
// ============================================================

const ssVisibleBtn = document.getElementById('ss-visible-btn');
const ssFullBtn = document.getElementById('ss-full-btn');
const ssStatus = document.getElementById('ss-status');
function ssSetStatus(msg, type) {
  ssStatus.textContent = msg;
  ssStatus.className = `ss-status ${type}`;
}

function ssSetBusy(busy) {
  ssVisibleBtn.disabled = busy;
  ssFullBtn.disabled = busy;
}

async function sendScreenshot(mode) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    ssSetStatus('タブを取得できませんでした', 'error');
    return;
  }

  ssSetBusy(true);
  ssSetStatus(mode === 'visible' ? '表示部分を撮影中...' : 'ページ全体を撮影中（しばらくお待ちください）...', 'info');

  chrome.runtime.sendMessage({ type: 'SCREENSHOT', mode, tabId: tab.id }, (res) => {
    ssSetBusy(false);
    if (chrome.runtime.lastError || !res?.ok) {
      ssSetStatus(`エラー: ${res?.error ?? chrome.runtime.lastError?.message ?? '不明'}`, 'error');
    } else {
      ssSetStatus('保存しました（ダウンロードフォルダを確認）', 'success');
    }
  });
}

ssVisibleBtn.addEventListener('click', () => sendScreenshot('visible'));
ssFullBtn.addEventListener('click', () => sendScreenshot('full'));
