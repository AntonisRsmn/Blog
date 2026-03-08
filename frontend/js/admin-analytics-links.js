document.getElementById('year').textContent = new Date().getFullYear();

const statusEl = document.getElementById('status');
const runButton = document.getElementById('run-link-check');
const overviewEl = document.getElementById('link-check-overview');
const listEl = document.getElementById('link-check-results');

function showStatus(message, type = '') {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.remove('success', 'error', 'deleted', 'show');
  if (type) statusEl.classList.add(type);
  statusEl.classList.add('show');
}

function renderResults(payload) {
  const totals = payload?.totals || {};
  if (overviewEl) {
    overviewEl.innerHTML = `
      <div class="post-item analytics-total-card"><div class="release-event-date">Posts Checked</div><div class="post-item-title analytics-total-value">${Number(totals.posts || 0).toLocaleString()}</div></div>
      <div class="post-item analytics-total-card"><div class="release-event-date">Unique Links</div><div class="post-item-title analytics-total-value">${Number(totals.uniqueLinksChecked || 0).toLocaleString()}</div></div>
      <div class="post-item analytics-total-card"><div class="release-event-date">Broken (Total)</div><div class="post-item-title analytics-total-value">${Number(totals.broken || 0).toLocaleString()}</div></div>
      <div class="post-item analytics-total-card"><div class="release-event-date">Internal / Outbound</div><div class="post-item-title analytics-total-value">${Number(totals.internalBroken || 0)} / ${Number(totals.outboundBroken || 0)}</div></div>
    `;
  }

  const broken = Array.isArray(payload?.broken) ? payload.broken : [];
  listEl.innerHTML = '';
  if (!broken.length) {
    listEl.innerHTML = '<li class="post-item"><span class="release-event-date">No broken links found.</span></li>';
    return;
  }

  broken.forEach(item => {
    const li = document.createElement('li');
    li.className = 'post-item';
    const safePostId = encodeURIComponent(item?.postId || '');
    const safeSlug = encodeURIComponent(item?.slug || '');
    const postHref = `/post.html?id=${safePostId}${safeSlug ? `&slug=${safeSlug}` : ''}`;
    const targetUrl = String(item?.url || '').trim();
    const typeLabel = String(item?.type || '').toUpperCase();
    li.innerHTML = `
      <a class="post-item-title analytics-item-title" href="${postHref}" target="_blank" rel="noopener">${item?.title || 'Untitled'}</a>
      <span class="release-event-date analytics-item-meta">${typeLabel} • ${item?.status || 0} • ${item?.reason || 'failed'}</span>
      <a class="release-event-date" href="${targetUrl}" target="_blank" rel="noopener">${targetUrl}</a>
    `;
    listEl.appendChild(li);
  });
}

async function runChecker() {
  try {
    if (runButton) {
      runButton.disabled = true;
      runButton.textContent = 'Checking...';
    }

    showStatus('Running link checker...', 'success');
    const response = await fetch('/api/posts/manage/analytics/link_health', { credentials: 'same-origin' });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      showStatus(payload?.error || 'Δεν ήταν δυνατή η εκτέλεση του ελέγχου συνδέσμων.', 'error');
      return;
    }

    const payload = await response.json().catch(() => ({}));
    renderResults(payload);
    showStatus('Link check complete.', 'success');
  } catch {
    showStatus('Δεν ήταν δυνατή η επικοινωνία με τον διακομιστή για τον έλεγχο συνδέσμων.', 'error');
  } finally {
    if (runButton) {
      runButton.disabled = false;
      runButton.textContent = 'Run Checker';
    }
  }
}

runButton?.addEventListener('click', runChecker);
runChecker();
