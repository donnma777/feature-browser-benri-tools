'use strict';

const DEFAULT_STATE = { enabled: true };
const DYNAMIC_RULE_BASE_ID = 10000;
const RESOURCE_TYPES = [
  'script', 'sub_frame', 'xmlhttprequest', 'image',
  'stylesheet', 'font', 'media', 'websocket', 'other',
];

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(['state', 'exclusions']);
  if (!stored.state) {
    await chrome.storage.local.set({ state: DEFAULT_STATE });
  }
  if (!stored.exclusions) {
    await chrome.storage.local.set({ exclusions: [] });
  }
  updateIcon(stored.state?.enabled ?? true);
  await rebuildDynamicRules(stored.exclusions ?? []);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_STATE') {
    chrome.storage.local.get('state').then((data) => {
      sendResponse(data.state ?? DEFAULT_STATE);
    });
    return true;
  }

  if (message.type === 'GET_CONFIG') {
    chrome.storage.local.get(['state', 'exclusions']).then((data) => {
      sendResponse({
        enabled: data.state?.enabled ?? true,
        exclusions: data.exclusions ?? [],
      });
    });
    return true;
  }

  if (message.type === 'TOGGLE') {
    chrome.storage.local.get('state').then(async (data) => {
      const current = data.state ?? DEFAULT_STATE;
      const next = { ...current, enabled: !current.enabled };
      await chrome.storage.local.set({ state: next });
      updateIcon(next.enabled);

      const rulesetId = 'ruleset_main';
      if (next.enabled) {
        await chrome.declarativeNetRequest.updateEnabledRulesets({
          enableRulesetIds: [rulesetId],
        });
      } else {
        await chrome.declarativeNetRequest.updateEnabledRulesets({
          disableRulesetIds: [rulesetId],
        });
      }

      sendResponse(next);
    });
    return true;
  }

  if (message.type === 'GET_EXCLUSIONS') {
    chrome.storage.local.get('exclusions').then((data) => {
      sendResponse(data.exclusions ?? []);
    });
    return true;
  }

  if (message.type === 'ADD_EXCLUSION') {
    const domain = normalizeDomain(message.domain);
    if (!domain) { sendResponse({ ok: false }); return true; }

    chrome.storage.local.get('exclusions').then(async (data) => {
      const list = data.exclusions ?? [];
      if (list.includes(domain)) { sendResponse({ ok: true, exclusions: list }); return; }
      const next = [...list, domain];
      await chrome.storage.local.set({ exclusions: next });
      await rebuildDynamicRules(next);
      sendResponse({ ok: true, exclusions: next });
    });
    return true;
  }

  if (message.type === 'REMOVE_EXCLUSION') {
    const domain = normalizeDomain(message.domain);
    chrome.storage.local.get('exclusions').then(async (data) => {
      const next = (data.exclusions ?? []).filter((d) => d !== domain);
      await chrome.storage.local.set({ exclusions: next });
      await rebuildDynamicRules(next);
      sendResponse({ ok: true, exclusions: next });
    });
    return true;
  }
});

function normalizeDomain(raw) {
  if (!raw) return null;
  try {
    const host = raw.includes('://') ? new URL(raw).hostname : raw;
    return host.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

async function rebuildDynamicRules(exclusions) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existing.map((r) => r.id);

  const addRules = exclusions.map((domain, i) => ({
    id: DYNAMIC_RULE_BASE_ID + i,
    priority: 10,
    action: { type: 'allow' },
    condition: {
      initiatorDomains: [domain],
      resourceTypes: RESOURCE_TYPES,
    },
  }));

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: removeIds,
    addRules,
  });
}

async function updateIcon(enabled) {
  const suffix = enabled ? '' : '_off';
  await chrome.action.setIcon({
    path: {
      16: `icons/icon16${suffix}.png`,
      48: `icons/icon48${suffix}.png`,
      128: `icons/icon128${suffix}.png`,
    },
  }).catch(() => {});
}
