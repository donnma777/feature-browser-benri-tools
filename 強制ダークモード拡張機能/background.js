chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.setDefaults?.({ globalEnabled: false, siteOverrides: {} });
});

async function updateBadge(tabId) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab?.url) return;

  let hostname = '__global__';
  try { hostname = new URL(tab.url).hostname; } catch {}

  const data = await chrome.storage.local.get(['globalEnabled', 'siteOverrides']);
  const globalEnabled = data.globalEnabled ?? false;
  const siteOverrides = data.siteOverrides ?? {};

  const enabled = hostname in siteOverrides
    ? siteOverrides[hostname]
    : globalEnabled;

  chrome.action.setBadgeText({ tabId, text: enabled ? 'ON' : '' });
  chrome.action.setBadgeBackgroundColor({ tabId, color: enabled ? '#1a73e8' : '#888' });
}

chrome.tabs.onActivated.addListener(({ tabId }) => updateBadge(tabId));
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'complete') updateBadge(tabId);
});

// ============================================================
// 表示モードのシミュレート（prefers-color-scheme 偽装）
// ============================================================
// chrome://flags や OS 設定は拡張機能から変更できないため、
// DevTools Protocol の Emulation.setEmulatedMedia を使い、
// 対象タブだけ prefers-color-scheme を偽装する。デバッグ用APIのため
// 有効化中はタブ上部に黄色い「デバッグされています」バーが出る。

const colorSchemeTabs = new Map(); // tabId -> 'light' | 'dark'

async function setColorSchemeEmulation(tabId, scheme) {
  if (scheme === 'auto') {
    if (!colorSchemeTabs.has(tabId)) return { ok: true };
    try {
      await chrome.debugger.sendCommand({ tabId }, 'Emulation.setEmulatedMedia', { features: [] });
    } catch (_) {}
    try {
      await chrome.debugger.detach({ tabId });
    } catch (_) {}
    colorSchemeTabs.delete(tabId);
    return { ok: true };
  }

  try {
    if (!colorSchemeTabs.has(tabId)) {
      await chrome.debugger.attach({ tabId }, '1.3');
    }
    await chrome.debugger.sendCommand({ tabId }, 'Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: scheme }],
    });
    colorSchemeTabs.set(tabId, scheme);
    return { ok: true };
  } catch (e) {
    colorSchemeTabs.delete(tabId);
    return { ok: false, error: e.message };
  }
}

chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId) colorSchemeTabs.delete(source.tabId);
});
chrome.tabs.onRemoved.addListener((tabId) => colorSchemeTabs.delete(tabId));

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_COLOR_SCHEME') {
    sendResponse({ scheme: colorSchemeTabs.get(message.tabId) ?? 'auto' });
    return true;
  }

  if (message.type === 'SET_COLOR_SCHEME') {
    setColorSchemeEmulation(message.tabId, message.scheme).then(sendResponse);
    return true;
  }
});
