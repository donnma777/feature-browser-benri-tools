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
