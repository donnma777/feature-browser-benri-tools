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
// 広告ブロック — 除外サイト管理
// ============================================================

const adDomainInput = document.getElementById('ad-domain-input');
const adAddBtn = document.getElementById('ad-add-btn');
const adToast = document.getElementById('ad-toast');
const adTbody = document.getElementById('ad-exclusion-tbody');
const adEmpty = document.getElementById('ad-empty');
const adCountBadge = document.getElementById('ad-count-badge');
const adSearch = document.getElementById('ad-search');
const adClearBtn = document.getElementById('ad-clear-btn');

let adExclusions = [];
let adFilterText = '';

function adNormalizeDomain(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withScheme = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
    const host = new URL(withScheme).hostname;
    if (!host) return null;
    return host.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function showAdToast(message, type) {
  adToast.textContent = message;
  adToast.className = `toast ${type}`;
  adToast.style.display = 'block';
  clearTimeout(adToast._timer);
  adToast._timer = setTimeout(() => { adToast.style.display = 'none'; }, 3000);
}

function renderAdExclusions() {
  const filtered = adFilterText
    ? adExclusions.filter((d) => d.includes(adFilterText))
    : adExclusions;

  adCountBadge.textContent = adExclusions.length;
  adTbody.innerHTML = '';

  const thead = document.querySelector('#ad-exclusion-table thead');
  if (adExclusions.length === 0) {
    adEmpty.classList.remove('hidden');
    thead.classList.add('hidden');
    return;
  }

  adEmpty.classList.add('hidden');
  thead.classList.remove('hidden');

  if (filtered.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="2" style="color:#4a4a6a;text-align:center;padding:20px 0;font-size:13px;">一致するドメインがありません</td>';
    adTbody.appendChild(tr);
    return;
  }

  for (const domain of filtered) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="domain-cell">${domain}</td>
      <td class="action-cell">
        <button class="remove-btn-tbl" data-domain="${domain}" title="除外を解除">×</button>
      </td>
    `;
    adTbody.appendChild(tr);
  }

  adTbody.querySelectorAll('.remove-btn-tbl').forEach((btn) => {
    btn.addEventListener('click', () => removeAdExclusion(btn.dataset.domain));
  });
}

function addAdExclusion(domain) {
  chrome.runtime.sendMessage({ type: 'ADD_EXCLUSION', domain }, (res) => {
    if (res?.ok) {
      adExclusions = res.exclusions;
      renderAdExclusions();
      showAdToast(`${domain} を追加しました`, 'success');
      adDomainInput.value = '';
      adDomainInput.focus();
    } else {
      showAdToast('追加に失敗しました', 'error');
    }
  });
}

function removeAdExclusion(domain) {
  chrome.runtime.sendMessage({ type: 'REMOVE_EXCLUSION', domain }, (res) => {
    if (res?.ok) {
      adExclusions = res.exclusions;
      renderAdExclusions();
      showAdToast(`${domain} を削除しました`, 'success');
    }
  });
}

function handleAdAdd() {
  const domain = adNormalizeDomain(adDomainInput.value);
  if (!domain) {
    showAdToast('有効なドメインを入力してください（例: youtube.com）', 'error');
    return;
  }
  if (adExclusions.includes(domain)) {
    showAdToast(`${domain} はすでに追加されています`, 'error');
    return;
  }
  addAdExclusion(domain);
}

chrome.runtime.sendMessage({ type: 'GET_EXCLUSIONS' }, (list) => {
  adExclusions = list ?? [];
  renderAdExclusions();
});

adAddBtn.addEventListener('click', handleAdAdd);
adDomainInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleAdAdd(); });
adSearch.addEventListener('input', () => {
  adFilterText = adSearch.value.trim().toLowerCase();
  renderAdExclusions();
});
adClearBtn.addEventListener('click', () => {
  if (adExclusions.length === 0) return;
  if (!confirm(`除外サイトを全件（${adExclusions.length}件）削除しますか？`)) return;

  (async () => {
    for (const domain of [...adExclusions]) {
      await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'REMOVE_EXCLUSION', domain }, resolve);
      });
    }
    adExclusions = [];
    renderAdExclusions();
    showAdToast('すべての除外サイトを削除しました', 'success');
  })();
});

// ============================================================
// ダークモード — 個別設定管理
// ============================================================

const darkListEl = document.getElementById('dark-list');
const darkClearBtn = document.getElementById('dark-clear-btn');
const darkAddInput = document.getElementById('dark-add-input');
const darkAddBtn = document.getElementById('dark-add-btn');
const darkAddError = document.getElementById('dark-add-error');

async function getDarkOverrides() {
  const data = await chrome.storage.local.get('siteOverrides');
  return data.siteOverrides ?? {};
}

function renderDarkList(overrides) {
  darkListEl.innerHTML = '';
  const entries = Object.entries(overrides);

  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = '個別設定はありません';
    darkListEl.appendChild(empty);
    darkClearBtn.disabled = true;
    return;
  }

  darkClearBtn.disabled = false;
  entries.sort(([a], [b]) => a.localeCompare(b));

  for (const [hostname, enabled] of entries) {
    const row = document.createElement('div');
    row.className = 'site-row-dark';

    const name = document.createElement('span');
    name.className = 'site-name';
    name.textContent = hostname;

    const badge = document.createElement('span');
    badge.className = `dark-badge ${enabled ? 'badge-forced' : 'badge-excluded'}`;
    badge.textContent = enabled ? '強制ON' : '除外';

    const btn = document.createElement('button');
    btn.className = 'remove-btn-dark';
    btn.textContent = '削除';
    btn.addEventListener('click', async () => {
      const fresh = await getDarkOverrides();
      delete fresh[hostname];
      await chrome.storage.local.set({ siteOverrides: fresh });
      renderDarkList(fresh);
    });

    row.appendChild(name);
    row.appendChild(badge);
    row.appendChild(btn);
    darkListEl.appendChild(row);
  }
}

function parseDarkHostname(input) {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

darkClearBtn.addEventListener('click', async () => {
  await chrome.storage.local.set({ siteOverrides: {} });
  renderDarkList({});
});

darkAddBtn.addEventListener('click', async () => {
  darkAddError.textContent = '';
  const hostname = parseDarkHostname(darkAddInput.value);
  if (!hostname) {
    darkAddError.textContent = '有効なホスト名またはURLを入力してください';
    return;
  }

  const overrides = await getDarkOverrides();
  overrides[hostname] = false;
  await chrome.storage.local.set({ siteOverrides: overrides });
  darkAddInput.value = '';
  renderDarkList(overrides);
});

darkAddInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') darkAddBtn.click(); });

getDarkOverrides().then(renderDarkList);
