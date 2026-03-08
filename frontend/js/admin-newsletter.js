document.getElementById('year').textContent = new Date().getFullYear();

const statusEl = document.getElementById('status');
const overviewEl = document.getElementById('newsletter-overview');
const listEl = document.getElementById('newsletter-list');
const searchInput = document.getElementById('newsletter-search');
const copyBtn = document.getElementById('newsletter-copy');
const exportBtn = document.getElementById('newsletter-export');
let subscribers = [];
let visibleSubscribers = [];

function showStatus(message, type = '') {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.remove('success', 'error', 'deleted', 'show');
  if (type) statusEl.classList.add(type);
  statusEl.classList.add('show');
}

function formatDate(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function normalizeText(value) {
  return String(value || '').toLowerCase().trim();
}

function toSourceLabel(item) {
  const source = normalizeText(item?.source);
  if (source === 'homepage-footer' || source === 'home-footer') return 'Homepage footer';
  if (source === 'post-footer') return 'Post footer';
  if (source === 'author-footer') return 'Author page footer';
  if (source === 'admin-footer') return 'Admin page footer';
  if (source === 'page-footer') return 'Page footer';
  if (source === 'footer-global') return 'Footer (global)';
  return String(item?.source || 'site-footer').trim() || 'site-footer';
}

function toPostLabel(item) {
  const title = String(item?.postTitle || '').trim();
  const slug = String(item?.postSlug || '').trim();
  const id = String(item?.postId || '').trim();

  if (title) return `Post: ${title}`;
  if (slug) return `Post: ${slug}`;
  if (id) return `Post ID: ${id}`;
  return '';
}

function getFilteredSubscribers() {
  const query = normalizeText(searchInput?.value || '');
  if (!query) return [...subscribers];
  return subscribers.filter((item) => normalizeText(item?.email).includes(query));
}

function renderPage(payload) {
  subscribers = Array.isArray(payload?.items) ? payload.items : [];
  const total = Number(payload?.total || 0);

  if (overviewEl) {
    overviewEl.innerHTML = `
      <div class="post-item analytics-total-card">
        <div class="release-event-date">Total Subscribers</div>
        <div class="post-item-title analytics-total-value">${total.toLocaleString()}</div>
      </div>
      <div class="post-item analytics-total-card">
        <div class="release-event-date">Loaded</div>
        <div class="post-item-title analytics-total-value">${subscribers.length.toLocaleString()}</div>
      </div>
    `;
  }

  renderList();
}

function renderList() {
  visibleSubscribers = getFilteredSubscribers();

  listEl.innerHTML = '';
  if (!visibleSubscribers.length) {
    listEl.innerHTML = '<li class="post-item"><span class="release-event-date">No subscribers yet.</span></li>';
    return;
  }

  visibleSubscribers.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'post-item';

    const entryWrap = document.createElement('div');
    entryWrap.style.display = 'flex';
    entryWrap.style.flexDirection = 'column';
    entryWrap.style.minWidth = '0';
    entryWrap.style.gap = '2px';

    const title = document.createElement('span');
    title.className = 'post-item-title analytics-item-title';
    title.textContent = item?.email || '-';

    const meta = document.createElement('span');
    meta.className = 'release-event-date analytics-item-meta';
    meta.style.marginLeft = '0';
    meta.style.textAlign = 'left';
    const sourceLabel = toSourceLabel(item);
    const postLabel = toPostLabel(item);
    const sourceText = postLabel ? `${sourceLabel} • ${postLabel}` : sourceLabel;
    meta.textContent = `${formatDate(item?.createdAt)} • ${sourceText}`;

    entryWrap.appendChild(title);
    entryWrap.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'post-item-actions';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'secondary';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', async () => {
      const email = String(item?.email || '').trim();
      if (!email) return;

      const confirmed = window.showAppConfirm
        ? await window.showAppConfirm(`Remove ${email} from newsletter subscribers?`, {
          title: 'Confirm removal',
          confirmText: 'Remove',
          cancelText: 'Cancel',
          confirmClass: 'danger'
        })
        : window.confirm(`Remove ${email} from newsletter subscribers?`);
      if (!confirmed) return;

      removeBtn.disabled = true;
      try {
        const response = await fetch('/api/newsletter/subscribers', {
          method: 'DELETE',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          showStatus(payload?.error || 'Δεν ήταν δυνατή η αφαίρεση συνδρομητή.', 'error');
          return;
        }

        subscribers = subscribers.filter((sub) => normalizeText(sub?.email) !== normalizeText(email));
        renderList();
        showStatus('Ο συνδρομητής αφαιρέθηκε.', 'deleted');
      } catch {
        showStatus('Δεν ήταν δυνατή η επικοινωνία με τον διακομιστή.', 'error');
      } finally {
        removeBtn.disabled = false;
      }
    });

    actions.appendChild(removeBtn);
    li.appendChild(entryWrap);
    li.appendChild(actions);
    listEl.appendChild(li);
  });
}

function getEmailsText() {
  return visibleSubscribers
    .map(item => String(item?.email || '').trim())
    .filter(Boolean)
    .join('\n');
}

async function copyEmails() {
  const text = getEmailsText();
  if (!text) {
    showStatus('Δεν υπάρχουν ακόμα email για αντιγραφή.', 'error');
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    showStatus('Τα email αντιγράφηκαν στο πρόχειρο.', 'success');
  } catch {
    showStatus('Δεν ήταν δυνατή η αντιγραφή email.', 'error');
  }
}

function exportCsv() {
  if (!subscribers.length) {
    showStatus('Δεν υπάρχουν ακόμα email για εξαγωγή.', 'error');
    return;
  }

  const rows = ['email,source,sourcePath,postId,postSlug,postTitle,createdAt'];
  subscribers.forEach((item) => {
    const email = String(item?.email || '').replace(/"/g, '""');
    const source = String(item?.source || '').replace(/"/g, '""');
    const sourcePath = String(item?.sourcePath || '').replace(/"/g, '""');
    const postId = String(item?.postId || '').replace(/"/g, '""');
    const postSlug = String(item?.postSlug || '').replace(/"/g, '""');
    const postTitle = String(item?.postTitle || '').replace(/"/g, '""');
    const createdAt = String(item?.createdAt || '').replace(/"/g, '""');
    rows.push(`"${email}","${source}","${sourcePath}","${postId}","${postSlug}","${postTitle}","${createdAt}"`);
  });

  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showStatus('Το CSV εξήχθη.', 'success');
}

async function loadSubscribers() {
  try {
    const response = await fetch('/api/newsletter/subscribers?limit=1000', { credentials: 'same-origin' });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      showStatus(payload?.error || 'Δεν ήταν δυνατή η φόρτωση συνδρομητών.', 'error');
      return;
    }

    const payload = await response.json().catch(() => ({}));
    renderPage(payload);
    showStatus('Οι συνδρομητές φορτώθηκαν.', 'success');
  } catch {
    showStatus('Δεν ήταν δυνατή η επικοινωνία με τον διακομιστή.', 'error');
  }
}

copyBtn?.addEventListener('click', copyEmails);
exportBtn?.addEventListener('click', exportCsv);
searchInput?.addEventListener('input', renderList);
loadSubscribers();
