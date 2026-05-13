'use strict';

// スクリーンショットのタイル画像を OffscreenCanvas で合成し、data URL を返す
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'STITCH_REQUEST') return;

  const { tiles, totalW, totalH, viewW, viewH, dpr } = msg;

  (async () => {
    try {
      const canvas = new OffscreenCanvas(
        Math.round(totalW * dpr),
        Math.round(totalH * dpr),
      );
      const ctx = canvas.getContext('2d');

      for (const tile of tiles) {
        const resp = await fetch(tile.dataUrl);
        const blob = await resp.blob();
        const img = await createImageBitmap(blob);

        // ページ端でタイルがはみ出す場合はクリップして描画
        const srcW = Math.min(viewW * dpr, totalW * dpr - tile.x * dpr);
        const srcH = Math.min(viewH * dpr, totalH * dpr - tile.y * dpr);

        ctx.drawImage(
          img,
          0, 0, srcW, srcH,
          Math.round(tile.x * dpr), Math.round(tile.y * dpr), srcW, srcH,
        );
      }

      const outBlob = await canvas.convertToBlob({ type: 'image/png' });
      const reader = new FileReader();
      reader.onload = () => sendResponse({ ok: true, dataUrl: reader.result });
      reader.readAsDataURL(outBlob);
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();

  return true; // 非同期 sendResponse のためチャンネルを保持
});
