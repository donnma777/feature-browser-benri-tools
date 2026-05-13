const listEl = document.getElementById('list');
const clearBtn = document.getElementById('clear-btn');
const addInput = document.getElementById('add-input');
const addBtn = document.getElementById('add-btn');
const addError = document.getElementById('add-error');

async function getOverrides() {
  const data = await chrome.storage.local.get('siteOverrides');
  return data.siteOverrides ?? {};
}

function renderList(overrides) {
  listEl.innerHTML = '';
  const entries = Object.entries(overrides);

  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = '個別設定はありません';
    listEl.appendChild(empty);
    clearBtn.disabled = true;
    return;
  }

  clearBtn.disabled = false;

  entries.sort(([a], [b]) => a.localeCompare(b));

  for (const [hostname, enabled] of entries) {
    const row = document.createElement('div');
    row.className = 'site-row';

    const name = document.createElement('span');
    name.className = 'site-name';
    name.textContent = hostname;

    const badge = document.createElement('span');
    badge.className = `badge ${enabled ? 'badge-forced' : 'badge-excluded'}`;
    badge.textContent = enabled ? '強制ON' : '除外';

    const btn = document.createElement('button');
    btn.className = 'remove-btn';
    btn.textContent = '削除';
    btn.addEventListener('click', async () => {
      const fresh = await getOverrides();
      delete fresh[hostname];
      await chrome.storage.local.set({ siteOverrides: fresh });
      renderList(fresh);
    });

    row.appendChild(name);
    row.appendChild(badge);
    row.appendChild(btn);
    listEl.appendChild(row);
  }
}

clearBtn.addEventListener('click', async () => {
  await chrome.storage.local.set({ siteOverrides: {} });
  renderList({});
});

function parseHostname(input) {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    // URLとして解釈を試みる
    const url = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

addBtn.addEventListener('click', async () => {
  addError.textContent = '';
  const hostname = parseHostname(addInput.value);
  if (!hostname) {
    addError.textContent = '有効なホスト名またはURLを入力してください';
    return;
  }

  const overrides = await getOverrides();
  overrides[hostname] = false; // 除外 = false
  await chrome.storage.local.set({ siteOverrides: overrides });
  addInput.value = '';
  renderList(overrides);
});

addInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addBtn.click();
});

// 初期描画
getOverrides().then(renderList);
