'use strict';

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

        await new Promise((r) => setTimeout(r, 200));

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
              window.__ssInterval = setInterval(markFixed, 150);
            },
          });
        }

        // captureVisibleTab は 2回/秒の制限があるため余裕を持って待機
        await new Promise((r) => setTimeout(r, 550));
      }
    }
  } finally {
    // fixed/sticky 要素を復元してスクロール位置を戻す
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
