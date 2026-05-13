'use strict';

const domainInput = document.getElementById('domain-input');
const addBtn = document.getElementById('add-btn');
const toast = document.getElementById('toast');
const tbody = document.getElementById('exclusion-tbody');
const emptyState = document.getElementById('empty-state');
const countBadge = document.getElementById('count-badge');
const searchInput = document.getElementById('search-input');
const clearAllBtn = document.getElementById('clear-all-btn');

let exclusions = [];
let filterText = '';

function normalizeDomain(raw) {
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

function showToast(message, type) {
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.style.display = 'block';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

function render() {
  const filtered = filterText
    ? exclusions.filter((d) => d.includes(filterText))
    : exclusions;

  countBadge.textContent = exclusions.length;
  tbody.innerHTML = '';

  if (exclusions.length === 0) {
    emptyState.classList.remove('hidden');
    document.getElementById('exclusion-table').querySelector('thead').classList.add('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  document.getElementById('exclusion-table').querySelector('thead').classList.remove('hidden');

  if (filtered.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="2" style="color:#4a4a6a;text-align:center;padding:24px 0;font-size:13px;">一致するドメインがありません</td>';
    tbody.appendChild(tr);
    return;
  }

  for (const domain of filtered) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="domain-cell">${domain}</td>
      <td class="action-cell">
        <button class="remove-btn" data-domain="${domain}" title="除外を解除">×</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll('.remove-btn').forEach((btn) => {
    btn.addEventListener('click', () => removeExclusion(btn.dataset.domain));
  });
}

function addExclusion(domain) {
  chrome.runtime.sendMessage({ type: 'ADD_EXCLUSION', domain }, (res) => {
    if (res?.ok) {
      exclusions = res.exclusions;
      render();
      showToast(`${domain} を追加しました`, 'success');
      domainInput.value = '';
      domainInput.focus();
    } else {
      showToast('追加に失敗しました', 'error');
    }
  });
}

function removeExclusion(domain) {
  chrome.runtime.sendMessage({ type: 'REMOVE_EXCLUSION', domain }, (res) => {
    if (res?.ok) {
      exclusions = res.exclusions;
      render();
      showToast(`${domain} を削除しました`, 'success');
    }
  });
}

function handleAdd() {
  const domain = normalizeDomain(domainInput.value);
  if (!domain) {
    showToast('有効なドメインを入力してください（例: youtube.com）', 'error');
    return;
  }
  if (exclusions.includes(domain)) {
    showToast(`${domain} はすでに追加されています`, 'error');
    return;
  }
  addExclusion(domain);
}

// 初期ロード
chrome.runtime.sendMessage({ type: 'GET_EXCLUSIONS' }, (list) => {
  exclusions = list ?? [];
  render();
});

// イベント
addBtn.addEventListener('click', handleAdd);

domainInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleAdd();
});

searchInput.addEventListener('input', () => {
  filterText = searchInput.value.trim().toLowerCase();
  render();
});

clearAllBtn.addEventListener('click', () => {
  if (exclusions.length === 0) return;
  if (!confirm(`除外サイトを全件（${exclusions.length}件）削除しますか？`)) return;

  const removeAll = async () => {
    for (const domain of [...exclusions]) {
      await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'REMOVE_EXCLUSION', domain }, resolve);
      });
    }
    exclusions = [];
    render();
    showToast('すべての除外サイトを削除しました', 'success');
  };
  removeAll();
});
