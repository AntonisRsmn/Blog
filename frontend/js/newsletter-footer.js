(function () {
  /* Fallback newsletter handler — theme.js handles this globally.
     This script only acts if theme.js did not bind the form yet. */
  var form = document.getElementById('newsletter-form');
  var statusEl = document.getElementById('newsletter-status');
  if (!form || !statusEl) return;
  if (form.dataset.bound === '1') return;
  form.dataset.bound = '1';

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var emailInput = form.querySelector('input[name="email"]');
    var email = (emailInput.value || '').trim();
    if (!email) return;

    statusEl.textContent = '';
    statusEl.className = 'newsletter-status';

    try {
      var res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          source: 'footer-global',
          sourcePath: window.location.pathname
        })
      });

      var data = await res.json().catch(function () { return {}; });

      if (!res.ok) {
        statusEl.textContent = data.error || 'Κάτι πήγε στραβά. Δοκιμάστε ξανά.';
        statusEl.classList.add('is-error');
        return;
      }

      if (data.alreadySubscribed) {
        statusEl.textContent = 'Είστε ήδη εγγεγραμμένοι!';
        statusEl.classList.add('is-success');
      } else {
        statusEl.textContent = 'Ευχαριστούμε για την εγγραφή σας!';
        statusEl.classList.add('is-success');
        form.reset();
      }
    } catch (_) {
      statusEl.textContent = 'Δεν ήταν δυνατή η σύνδεση. Δοκιμάστε ξανά.';
      statusEl.classList.add('is-error');
    }
  });
})();
