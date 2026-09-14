'use strict';

const toggle = document.getElementById('toggle');
const status = document.getElementById('status');
const currentDomainEl = document.getElementById('current-domain');
const siteBtn = document.getElementById('site-btn');
const exclusionList = document.getElementById('exclusion-list');
const exclusionCount = document.getElementById('exclusion-count');

let currentDomain = null;
let exclusions = [];

function applyState(enabled) {
  toggle.checked = enabled;
  status.textContent = enabled ? '保護中' : '停止中';
  status.className = `status ${enabled ? 'active' : 'inactive'}`;
}

function normalizeDomain(hostname) {
  return hostname.replace(/^www\./, '').toLowerCase();
}

function renderExclusions() {
  exclusionList.innerHTML = '';
  exclusionCount.textContent = exclusions.length;

  for (const domain of exclusions) {
    const item = document.createElement('div');
    item.className = 'exclusion-item';
    item.innerHTML = `
      <span>${domain}</span>
      <button class="remove-btn" data-domain="${domain}" title="除外を解除">×</button>
    `;
    exclusionList.appendChild(item);
  }

  exclusionList.querySelectorAll('.remove-btn').forEach((btn) => {
    btn.addEventListener('click', () => removeExclusion(btn.dataset.domain));
  });
}

// 現在のサイトが除外リストのどの項目で除外されているかを調べる。
// 完全一致がなければ、親ドメイン一致（例: youtube.com が m.youtube.com を含む）も見る。
function findMatchingExclusion(hostname, list) {
  if (list.includes(hostname)) return hostname;
  return list.find((d) => hostname.endsWith(`.${d}`)) ?? null;
}

function updateSiteButton() {
  if (!currentDomain) return;
  const excluded = !!findMatchingExclusion(currentDomain, exclusions);
  siteBtn.textContent = excluded ? '除外を解除' : '除外する';
  siteBtn.className = `btn ${excluded ? 'btn-include' : 'btn-exclude'}`;
}

function addExclusion(domain) {
  chrome.runtime.sendMessage({ type: 'ADD_EXCLUSION', domain }, (res) => {
    if (res?.ok) {
      exclusions = res.exclusions;
      renderExclusions();
      updateSiteButton();
    }
  });
}

function removeExclusion(domain) {
  chrome.runtime.sendMessage({ type: 'REMOVE_EXCLUSION', domain }, (res) => {
    if (res?.ok) {
      exclusions = res.exclusions;
      renderExclusions();
      updateSiteButton();
    }
  });
}

// 初期化
chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
  applyState(state?.enabled ?? true);
});

chrome.runtime.sendMessage({ type: 'GET_EXCLUSIONS' }, (list) => {
  exclusions = list ?? [];
  renderExclusions();
  updateSiteButton();
});

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  if (!tab?.url) {
    currentDomainEl.textContent = '取得できません';
    siteBtn.disabled = true;
    return;
  }
  try {
    const url = new URL(tab.url);
    if (!url.hostname) throw new Error();
    currentDomain = normalizeDomain(url.hostname);
    currentDomainEl.textContent = currentDomain;
    updateSiteButton();
  } catch {
    currentDomainEl.textContent = '対応外のページ';
    siteBtn.disabled = true;
  }
});

// イベント
toggle.addEventListener('change', () => {
  chrome.runtime.sendMessage({ type: 'TOGGLE' }, (state) => {
    applyState(state?.enabled ?? true);
  });
});

document.getElementById('open-options').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

siteBtn.addEventListener('click', () => {
  if (!currentDomain) return;
  const match = findMatchingExclusion(currentDomain, exclusions);
  if (match) {
    removeExclusion(match);
  } else {
    addExclusion(currentDomain);
  }
});
