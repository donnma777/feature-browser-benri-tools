'use strict';

const visibleBtn = document.getElementById('ss-visible-btn');
const fullBtn    = document.getElementById('ss-full-btn');
const statusEl   = document.getElementById('status');

function setStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = `status ${type}`;
}

function setBusy(busy) {
  visibleBtn.disabled = busy;
  fullBtn.disabled    = busy;
}

async function shoot(mode) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setStatus('タブを取得できませんでした', 'error');
    return;
  }

  setBusy(true);
  setStatus(
    mode === 'visible'
      ? '表示部分を撮影中...'
      : 'ページ全体を撮影中（しばらくお待ちください）...',
    'info',
  );

  chrome.runtime.sendMessage({ type: 'SCREENSHOT', mode, tabId: tab.id }, (res) => {
    setBusy(false);
    if (chrome.runtime.lastError || !res?.ok) {
      setStatus(`エラー: ${res?.error ?? chrome.runtime.lastError?.message ?? '不明'}`, 'error');
    } else {
      setStatus('保存しました（ダウンロードフォルダを確認）', 'success');
    }
  });
}

visibleBtn.addEventListener('click', () => shoot('visible'));
fullBtn.addEventListener('click',    () => shoot('full'));
