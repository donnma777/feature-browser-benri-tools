'use strict';

// ============================================================
// 広告ブロック
// ============================================================

const AD_DEFAULT_STATE = { enabled: true };
const DYNAMIC_RULE_BASE_ID = 10000;
const RESOURCE_TYPES = [
  'script', 'sub_frame', 'xmlhttprequest', 'image',
  'stylesheet', 'font', 'media', 'websocket', 'other',
];

// ============================================================
// ダークモード
// ============================================================

async function updateDarkBadge(tabId) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab?.url) return;

  let hostname = '__global__';
  try { hostname = new URL(tab.url).hostname; } catch {}

  const data = await chrome.storage.local.get(['globalEnabled', 'siteOverrides']);
  const globalEnabled = data.globalEnabled ?? false;
  const siteOverrides = data.siteOverrides ?? {};

  const enabled = hostname in siteOverrides ? siteOverrides[hostname] : globalEnabled;

  chrome.action.setBadgeText({ tabId, text: enabled ? '🌙' : '' });
  chrome.action.setBadgeBackgroundColor({ tabId, color: enabled ? '#1a73e8' : '#888' });
}

chrome.tabs.onActivated.addListener(({ tabId }) => updateDarkBadge(tabId));
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'complete') updateDarkBadge(tabId);
});

// ============================================================
// 共通 onInstalled
// ============================================================

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(['state', 'exclusions']);
  if (!stored.state) {
    await chrome.storage.local.set({ state: AD_DEFAULT_STATE });
  }
  if (!stored.exclusions) {
    await chrome.storage.local.set({ exclusions: [] });
  }
  updateAdIcon(stored.state?.enabled ?? true);
  await rebuildDynamicRules(stored.exclusions ?? []);
});

// ============================================================
// メッセージハンドラ（広告ブロック）
// ============================================================

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_STATE') {
    chrome.storage.local.get('state').then((data) => {
      sendResponse(data.state ?? AD_DEFAULT_STATE);
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
      const current = data.state ?? AD_DEFAULT_STATE;
      const next = { ...current, enabled: !current.enabled };
      await chrome.storage.local.set({ state: next });
      updateAdIcon(next.enabled);

      const rulesetId = 'ruleset_main';
      if (next.enabled) {
        await chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: [rulesetId] });
      } else {
        await chrome.declarativeNetRequest.updateEnabledRulesets({ disableRulesetIds: [rulesetId] });
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

// ============================================================
// ユーティリティ（広告ブロック）
// ============================================================

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

  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: removeIds, addRules });
}

// ============================================================
// スクリーンショット
// ============================================================

let screenshotBusy = false;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'SCREENSHOT') return;

  if (screenshotBusy) {
    sendResponse({ ok: false, error: '撮影中です。しばらくお待ちください' });
    return true;
  }
  screenshotBusy = true;

  const run = message.mode === 'visible'
    ? captureVisible(message.tabId)
    : captureFullPage(message.tabId);

  run
    .then(() => sendResponse({ ok: true }))
    .catch((e) => sendResponse({ ok: false, error: e.message }))
    .finally(() => { screenshotBusy = false; });

  return true;
});

function screenshotFilename(suffix) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `screenshot-${suffix}-${ts}.png`;
}

async function captureVisible(tabId) {
  const tab = await chrome.tabs.get(tabId);
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  await chrome.downloads.download({ url: dataUrl, filename: screenshotFilename('visible'), saveAs: false });
}

async function captureFullPage(tabId) {
  // ページのスクロール量・サイズを取得
  const [{ result: dims }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      origX: window.scrollX,
      origY: window.scrollY,
      totalW: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0),
      totalH: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0),
      viewW: window.innerWidth,
      viewH: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
    }),
  });

  const { origX, origY, totalW, totalH, viewW, viewH, dpr } = dims;
  const tab = await chrome.tabs.get(tabId);
  const tiles = [];

  let fixedHidden = false;

  try {
    for (let y = 0; y < totalH; y += viewH) {
      for (let x = 0; x < totalW; x += viewW) {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: (sx, sy) => window.scrollTo(sx, sy),
          args: [x, y],
        });

        // スクロールが落ち着くのを待つ
        await new Promise((r) => setTimeout(r, 200));

        // 実際のスクロール位置（端でクランプされることがある）
        const [{ result: pos }] = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => [window.scrollX, window.scrollY],
        });

        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
        tiles.push({ dataUrl, x: pos[0], y: pos[1] });

        // 最初のタイル撮影後に fixed/sticky 要素を隠す
        if (!fixedHidden) {
          fixedHidden = true;
          await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
              const ATTR = 'data-ss-hide';
              const style = document.createElement('style');
              style.id = '__ss_hide_fixed__';
              style.textContent = `[${ATTR}] { visibility: hidden !important; }`;
              document.documentElement.appendChild(style);

              function markFixed() {
                for (const el of document.querySelectorAll('*')) {
                  if (el.hasAttribute(ATTR)) continue;
                  const pos = getComputedStyle(el).position;
                  if (pos === 'fixed' || pos === 'sticky') el.setAttribute(ATTR, '');
                }
              }
              markFixed();

              // スクロール後に動的に表示される要素（display:none→block など）も捉えるため定期再スキャン
              window.__ssInterval = setInterval(markFixed, 150);
            },
          });
        }

        // captureVisibleTab は 2回/秒の制限があるため余裕を持って待機
        await new Promise((r) => setTimeout(r, 550));
      }
    }
  } finally {
    // インターバルを止めて属性・style タグを除去して復元
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        clearInterval(window.__ssInterval);
        delete window.__ssInterval;
        for (const el of document.querySelectorAll('[data-ss-hide]')) {
          el.removeAttribute('data-ss-hide');
        }
        document.getElementById('__ss_hide_fixed__')?.remove();
      },
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (sx, sy) => window.scrollTo(sx, sy),
      args: [origX, origY],
    });
  }

  // offscreen document でタイルを合成
  await ensureOffscreen();
  const result = await chrome.runtime.sendMessage({
    type: 'STITCH_REQUEST',
    tiles, totalW, totalH, viewW, viewH, dpr,
  });

  try { await chrome.offscreen.closeDocument(); } catch (_) {}

  if (!result?.ok) throw new Error(result?.error ?? 'stitching failed');

  await chrome.downloads.download({
    url: result.dataUrl,
    filename: screenshotFilename('fullpage'),
    saveAs: false,
  });
}

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (contexts.length > 0) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['BLOBS'],
    justification: 'スクリーンショットのタイル合成',
  });
}

async function updateAdIcon(enabled) {
  const suffix = enabled ? '' : '_off';
  await chrome.action.setIcon({
    path: {
      16: `icons/icon16${suffix}.png`,
      48: `icons/icon48${suffix}.png`,
      128: `icons/icon128${suffix}.png`,
    },
  }).catch(() => {});
}
