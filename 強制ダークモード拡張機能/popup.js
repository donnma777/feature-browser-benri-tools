(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url ?? '';

  let hostname = '';
  try { hostname = new URL(url).hostname; } catch {}

  document.getElementById('hostname-label').textContent = hostname || '(特殊ページ)';

  const data = await chrome.storage.local.get(['globalEnabled', 'siteOverrides']);
  const globalEnabled = data.globalEnabled ?? false;
  const siteOverrides = data.siteOverrides ?? {};

  const globalToggle = document.getElementById('global-toggle');
  const siteToggle = document.getElementById('site-toggle');

  globalToggle.checked = globalEnabled;
  siteToggle.checked = hostname in siteOverrides
    ? siteOverrides[hostname]
    : globalEnabled;

  async function applyToTab(enabled) {
    if (!tab?.id || !hostname) return;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'SET_DARK', enabled });
    } catch {
      // content script not ready (e.g. chrome:// page) — ignore
    }
    chrome.action.setBadgeText({ tabId: tab.id, text: enabled ? 'ON' : '' });
    chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#1a73e8' });
  }

  globalToggle.addEventListener('change', async () => {
    const enabled = globalToggle.checked;
    await chrome.storage.local.set({ globalEnabled: enabled });

    // サイト個別設定がなければグローバルに従って現在タブも更新
    const fresh = await chrome.storage.local.get('siteOverrides');
    const overrides = fresh.siteOverrides ?? {};
    if (!(hostname in overrides)) {
      siteToggle.checked = enabled;
      await applyToTab(enabled);

      // 他の全タブにも反映
      const allTabs = await chrome.tabs.query({});
      for (const t of allTabs) {
        if (t.id === tab.id || !t.url) continue;
        let h = '';
        try { h = new URL(t.url).hostname; } catch {}
        if (!(h in overrides)) {
          chrome.tabs.sendMessage(t.id, { type: 'SET_DARK', enabled }).catch(() => {});
        }
      }
    }
  });

  siteToggle.addEventListener('change', async () => {
    const enabled = siteToggle.checked;
    if (!hostname) return;

    const fresh = await chrome.storage.local.get('siteOverrides');
    const overrides = fresh.siteOverrides ?? {};

    // グローバルと同じなら個別設定を削除、異なれば保存
    if (enabled === globalToggle.checked) {
      delete overrides[hostname];
    } else {
      overrides[hostname] = enabled;
    }

    await chrome.storage.local.set({ siteOverrides: overrides });
    await applyToTab(enabled);
  });

  document.getElementById('open-options').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
})();
