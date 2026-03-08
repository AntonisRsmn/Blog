// Theme switcher for blog
const themeToggle = document.getElementById('theme-toggle');
const mobileThemeToggle = document.getElementById('mobile-theme-toggle');
const COOKIE_PREFERENCES_KEY = 'cookie-preferences-v1';
const CONTACT_POPUP_DISMISSED_KEY = 'contact-popup-dismissed-v1';
const DEFAULT_COOKIE_PREFERENCES = {
  essential: true,
  analytics: false,
  ads: false
};

const BRAND_NAME = 'ΕΚΔΟΣΕΙΣ ΤΣΟΤΡΑΣ';
const INITIAL_I18N_HOLD_CLASS = 'i18n-initializing';
let initialI18nHoldStyle = null;

function holdInitialI18nPaint() {
  if (initialI18nHoldStyle) return;
  if (!document.head || !document.documentElement) return;

  document.documentElement.classList.add(INITIAL_I18N_HOLD_CLASS);

  initialI18nHoldStyle = document.createElement('style');
  initialI18nHoldStyle.setAttribute('data-i18n-hold-style', '1');
  initialI18nHoldStyle.textContent = `html.${INITIAL_I18N_HOLD_CLASS} body { visibility: hidden; }`;
  document.head.appendChild(initialI18nHoldStyle);
}

function releaseInitialI18nPaint() {
  if (document.documentElement) {
    document.documentElement.classList.remove(INITIAL_I18N_HOLD_CLASS);
  }

  if (initialI18nHoldStyle?.parentNode) {
    initialI18nHoldStyle.parentNode.removeChild(initialI18nHoldStyle);
  }
  initialI18nHoldStyle = null;
}

holdInitialI18nPaint();

function ensureBrandAccessibilityCopy() {
  const logoImages = document.querySelectorAll('.logo img');
  logoImages.forEach((image) => {
    const currentAlt = String(image.getAttribute('alt') || '').trim();
    const isBrokenEncoding = currentAlt.includes('?') || currentAlt.length < 3;
    if (!currentAlt || isBrokenEncoding) {
      image.setAttribute('alt', BRAND_NAME);
    }

    if (!image.hasAttribute('width') || !image.hasAttribute('height')) {
      image.setAttribute('width', '320');
      image.setAttribute('height', '54');
    }
  });
}

function ensurePageSeoMeta() {
  const pathname = String(window.location.pathname || '/');
  const pageTitleByPath = {
    '/': `${BRAND_NAME} | Ιστολόγιο`,
    '/post': `Άρθρο | ${BRAND_NAME}`,
    '/author': `Συγγραφέας | ${BRAND_NAME}`,
    '/privacy': `Πολιτική Απορρήτου | ${BRAND_NAME}`,
    '/cookies': `Πολιτική Cookies | ${BRAND_NAME}`,
    '/tos': `Όροι Χρήσης | ${BRAND_NAME}`,
    '/404': `Η σελίδα δεν βρέθηκε | ${BRAND_NAME}`,
    '/no-access': `Δεν επιτρέπεται πρόσβαση | ${BRAND_NAME}`,
    '/admin/login': `Σύνδεση διαχειριστή | ${BRAND_NAME}`,
    '/admin/signup': `Εγγραφή διαχειριστή | ${BRAND_NAME}`,
    '/admin/dashboard': `Πίνακας διαχείρισης | ${BRAND_NAME}`
  };

  const pageDescriptionByPath = {
    '/': `Τελευταία άρθρα και ενημερώσεις από το ${BRAND_NAME}.`,
    '/post': `Διαβάστε το πιο πρόσφατο άρθρο στο ${BRAND_NAME}.`,
    '/author': `Δείτε όλα τα άρθρα αυτού του συγγραφέα στο ${BRAND_NAME}.`,
    '/privacy': `Μάθετε πώς το ${BRAND_NAME} επεξεργάζεται και προστατεύει τα προσωπικά σας δεδομένα.`,
    '/cookies': `Δείτε ποια cookies και παρόμοιες τεχνολογίες χρησιμοποιεί το ${BRAND_NAME} και πώς τα διαχειρίζεστε.`,
    '/tos': `Διαβάστε τους Όρους Χρήσης του ${BRAND_NAME}.`,
    '/404': `Η σελίδα που ζητήσατε δεν βρέθηκε.`,
    '/no-access': `Δεν έχετε πρόσβαση σε αυτή τη σελίδα.`,
    '/admin/login': `Ασφαλής σύνδεση για διαχειριστές του ${BRAND_NAME}.`,
    '/admin/signup': `Δημιουργήστε λογαριασμό διαχειριστή για το ${BRAND_NAME}.`,
    '/admin/dashboard': `Διαχειριστείτε αναρτήσεις και περιεχόμενο από τον πίνακα του ${BRAND_NAME}.`
  };

  const normalizedPathname = pathname.endsWith('.html') ? pathname.slice(0, -5) : pathname;
  const normalizedTitle = String(document.title || '').trim();
  if (!normalizedTitle || !normalizedTitle.includes('|')) {
    document.title = pageTitleByPath[normalizedPathname] || `${normalizedTitle || 'Page'} | ${BRAND_NAME}`;
  }

  const desiredDescription = pageDescriptionByPath[normalizedPathname] || `Επίσημη σελίδα του ${BRAND_NAME}.`;
  let descriptionTag = document.head.querySelector('meta[name="description"]');
  if (!descriptionTag) {
    descriptionTag = document.createElement('meta');
    descriptionTag.setAttribute('name', 'description');
    document.head.appendChild(descriptionTag);
  }
  if (!String(descriptionTag.getAttribute('content') || '').trim()) {
    descriptionTag.setAttribute('content', desiredDescription);
  }

  const canonicalValue = `${window.location.origin}${pathname}${window.location.search || ''}`;
  let canonicalTag = document.head.querySelector('link[rel="canonical"]');
  if (!canonicalTag) {
    canonicalTag = document.createElement('link');
    canonicalTag.setAttribute('rel', 'canonical');
    document.head.appendChild(canonicalTag);
  }
  canonicalTag.setAttribute('href', canonicalValue);
}

function normalizeAdDisclosureText() {
  const labels = document.querySelectorAll('.ad-label');
  labels.forEach((label) => {
    label.textContent = 'Διαφήμιση • Χορηγούμενο περιεχόμενο';
  });

  const adBlocks = document.querySelectorAll('.ad-block');
  adBlocks.forEach((block) => {
    block.setAttribute('aria-label', 'Διαφήμιση - Χορηγούμενο περιεχόμενο');
  });
}

function ensureFooterComplianceLinks() {
  const footerNavs = document.querySelectorAll('.footer-nav');
  footerNavs.forEach((nav) => {
    const hasTerms = Boolean(nav.querySelector('a[href="/tos"], a[href="/tos.html"]'));
    const hasPrivacy = Boolean(nav.querySelector('a[href="/privacy"], a[href="/privacy.html"]'));

    if (!hasTerms) {
      const termsLink = document.createElement('a');
      termsLink.href = '/tos';
      termsLink.textContent = 'Όροι Χρήσης';
      nav.appendChild(termsLink);
    }

    if (!hasPrivacy) {
      const privacyLink = document.createElement('a');
      privacyLink.href = '/privacy';
      privacyLink.textContent = 'Πολιτική Απορρήτου';
      nav.appendChild(privacyLink);
    }
  });
}

function enforceAllRightsReservedEnglish() {
  const footerNotes = document.querySelectorAll('.site-footer .muted.small');
  footerNotes.forEach((node) => {
    if (!node) return;
    const html = String(node.innerHTML || '');
    const normalized = html
      .replace(/Με επιφύλαξη παντός δικαιώματος\./g, 'All rights reserved.')
      .replace(/[ΟοΌό]λες rights reserved\./g, 'All rights reserved.')
      .replace(/—\s*All rights reserved\./g, '— All rights reserved.');

    if (normalized !== html) {
      node.innerHTML = normalized;
    }
  });
}

function optimizeImageLoadingStrategy() {
  const images = document.querySelectorAll('img');
  images.forEach((image, index) => {
    const isCritical = image.closest('header') || image.closest('.logo') || index === 0;
    if (!image.hasAttribute('decoding')) {
      image.setAttribute('decoding', 'async');
    }
    if (!image.hasAttribute('loading')) {
      image.setAttribute('loading', isCritical ? 'eager' : 'lazy');
    }
  });
}

function ensureGlobalBackToTopButton() {
  const existing = document.getElementById('back-to-top');
  const button = existing || (() => {
    const created = document.createElement('button');
    created.type = 'button';
    created.id = 'back-to-top';
    created.className = 'back-to-top';
    created.setAttribute('aria-label', 'Επιστροφή στην κορυφή');
    created.setAttribute('aria-hidden', 'true');
    created.innerHTML = '<span class="back-to-top-icon" aria-hidden="true">↑</span>';
    document.body.appendChild(created);
    return created;
  })();

  if (!button || button.dataset.bound === '1') return;
  button.dataset.bound = '1';

  const updateVisibility = () => {
    const isVisible = window.scrollY > 320;
    button.classList.toggle('is-visible', isVisible);
    button.setAttribute('aria-hidden', String(!isVisible));
  };

  button.addEventListener('click', () => {
    const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  });

  window.addEventListener('scroll', updateVisibility, { passive: true });
  updateVisibility();
}

function logout() {
  document.cookie = 'token=; Max-Age=0; path=/';
  window.location.href = '/admin/login';
}

window.logout = logout;
let todayEventsRotationTimer = null;
const TODAY_EVENTS_ROTATION_MS = 5000;

function normalizeCookiePreferences(value) {
  const input = value && typeof value === 'object' ? value : {};
  return {
    consentSet: Boolean(input.consentSet || input.updatedAt),
    essential: true,
    analytics: Boolean(input.analytics),
    ads: Boolean(input.ads)
  };
}

function readStoredCookiePreferences() {
  try {
    const raw = localStorage.getItem(COOKIE_PREFERENCES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeCookiePreferences(parsed);
  } catch {
    return null;
  }
}

function saveCookiePreferences(preferences) {
  const normalized = normalizeCookiePreferences(preferences);
  try {
    localStorage.setItem(COOKIE_PREFERENCES_KEY, JSON.stringify({
      ...normalized,
      consentSet: true,
      updatedAt: new Date().toISOString()
    }));
  } catch {
  }

  window.dispatchEvent(new CustomEvent('cookiePreferencesChanged', {
    detail: normalized
  }));

  return normalized;
}

window.getCookiePreferences = function getCookiePreferencesPublic() {
  return readStoredCookiePreferences() || { ...DEFAULT_COOKIE_PREFERENCES };
};

function ensureCookieSettingsButton() {
  let link = document.getElementById('cookie-settings-link');
  if (link) return link;

  const footerNav = document.querySelector('.footer-nav');
  if (!footerNav) return null;

  link = document.createElement('a');
  link.id = 'cookie-settings-link';
  link.href = '#';
  link.textContent = typeof localizeTextValue === 'function'
    ? localizeTextValue('Cookie Settings', currentUiLanguage)
    : 'Ρυθμίσεις cookies';

  const termsLink = footerNav.querySelector('a[href="/tos"], a[href="/tos.html"]');
  const privacyLink = footerNav.querySelector('a[href="/privacy"], a[href="/privacy.html"]');

  if (termsLink && privacyLink && termsLink.nextSibling === privacyLink) {
    footerNav.insertBefore(link, privacyLink);
  } else if (termsLink?.nextSibling) {
    footerNav.insertBefore(link, termsLink.nextSibling);
  } else if (privacyLink) {
    footerNav.insertBefore(link, privacyLink);
  } else {
    footerNav.appendChild(link);
  }

  return link;
}

function ensureCookieBanner() {
  let banner = document.getElementById('cookie-consent-banner');
  if (banner) return banner;

  banner = document.createElement('section');
  banner.id = 'cookie-consent-banner';
  banner.className = 'cookie-consent-banner';
  banner.hidden = true;
  banner.innerHTML = `
    <div class="cookie-consent-mini" role="dialog" aria-live="polite" aria-label="Συναίνεση cookies">
      <p>Χρησιμοποιούμε cookies για βασική λειτουργία, αναλύσεις και διαφημίσεις.</p>
      <div class="cookie-consent-mini-actions">
        <button type="button" id="cookie-consent-accept-all">Αποδοχή cookies</button>
        <button type="button" id="cookie-consent-open-manage" class="secondary">Διαχείριση προτιμήσεων</button>
      </div>
    </div>
  `;

  document.body.appendChild(banner);
  return banner;
}

function ensureCookieManageModal() {
  let overlay = document.getElementById('cookie-manage-overlay');
  if (overlay) return overlay;

  overlay = document.createElement('section');
  overlay.id = 'cookie-manage-overlay';
  overlay.className = 'cookie-manage-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="cookie-manage-card" role="dialog" aria-modal="true" aria-labelledby="cookie-manage-title">
      <div class="cookie-manage-head">
        <h3 id="cookie-manage-title">Διαχείριση προτιμήσεων cookies</h3>
        <button type="button" id="cookie-manage-close" class="secondary" aria-label="Κλείσιμο">Κλείσιμο</button>
      </div>
      <p>Επιλέξτε τι επιτρέπετε. Τα απαραίτητα cookies είναι πάντα ενεργά.</p>
      <p><a href="/cookies">Διαβάστε την πλήρη Πολιτική Cookies</a></p>

      <div class="cookie-consent-grid">
        <label class="cookie-consent-item">
          <input type="checkbox" checked disabled>
          <span><strong>Απαραίτητα</strong><small>Πάντα ενεργά</small></span>
        </label>
        <label class="cookie-consent-item">
          <input type="checkbox" id="cookie-manage-analytics">
          <span><strong>Αναλυτικά</strong><small>Μας βοηθούν να μετράμε την απόδοση της σελίδας</small></span>
        </label>
        <label class="cookie-consent-item">
          <input type="checkbox" id="cookie-manage-ads">
          <span><strong>Διαφημίσεις</strong><small>Επιτρέπει εξατομικευμένη προβολή διαφημίσεων</small></span>
        </label>
      </div>

      <div class="cookie-consent-actions">
        <button type="button" id="cookie-manage-essential" class="secondary">Μόνο απαραίτητα</button>
        <button type="button" id="cookie-manage-save">Αποθήκευση προτιμήσεων</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  return overlay;
}

function applyCookieUiVisibility(hasSavedPreferences) {
  const banner = document.getElementById('cookie-consent-banner');
  const settingsButton = ensureCookieSettingsButton();
  if (banner) banner.hidden = Boolean(hasSavedPreferences);
  if (settingsButton) settingsButton.hidden = false;
}

function openCookiePreferences() {
  const overlay = ensureCookieManageModal();
  const current = readStoredCookiePreferences() || DEFAULT_COOKIE_PREFERENCES;

  const analyticsInput = overlay.querySelector('#cookie-manage-analytics');
  const adsInput = overlay.querySelector('#cookie-manage-ads');
  if (analyticsInput) analyticsInput.checked = Boolean(current.analytics);
  if (adsInput) adsInput.checked = Boolean(current.ads);

  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeCookiePreferences() {
  const overlay = document.getElementById('cookie-manage-overlay');
  if (!overlay) return;
  overlay.hidden = true;
  document.body.style.overflow = '';
}

window.openCookiePreferences = openCookiePreferences;

function initializeCookiePreferences() {
  const banner = ensureCookieBanner();
  const modal = ensureCookieManageModal();
  const settingsButton = ensureCookieSettingsButton();
  const saved = readStoredCookiePreferences();
  const hasConsent = Boolean(saved?.consentSet);

  applyCookieUiVisibility(hasConsent);

  if (saved?.consentSet && !saved.analytics) {
    if (settingsButton) settingsButton.title = 'Η παρακολούθηση αναλυτικών είναι απενεργοποιημένη';
  } else {
    if (settingsButton) settingsButton.title = '';
  }

  settingsButton?.addEventListener('click', event => {
    event.preventDefault();
    openCookiePreferences();
  });

  const acceptAllButton = banner.querySelector('#cookie-consent-accept-all');
  const openManageButton = banner.querySelector('#cookie-consent-open-manage');
  const analyticsInput = modal.querySelector('#cookie-manage-analytics');
  const adsInput = modal.querySelector('#cookie-manage-ads');
  const essentialOnlyButton = modal.querySelector('#cookie-manage-essential');
  const saveButton = modal.querySelector('#cookie-manage-save');
  const closeButton = modal.querySelector('#cookie-manage-close');

  acceptAllButton?.addEventListener('click', () => {
    saveCookiePreferences({ essential: true, analytics: true, ads: true });
    if (settingsButton) settingsButton.title = '';
    banner.hidden = true;
  });

  openManageButton?.addEventListener('click', openCookiePreferences);

  essentialOnlyButton?.addEventListener('click', () => {
    saveCookiePreferences({ essential: true, analytics: false, ads: false });
    if (settingsButton) settingsButton.title = 'Η παρακολούθηση αναλυτικών είναι απενεργοποιημένη';
    banner.hidden = true;
    closeCookiePreferences();
  });

  saveButton?.addEventListener('click', () => {
    saveCookiePreferences({
      essential: true,
      analytics: Boolean(analyticsInput?.checked),
      ads: Boolean(adsInput?.checked)
    });
    if (settingsButton) {
      settingsButton.title = analyticsInput?.checked ? '' : 'Η παρακολούθηση αναλυτικών είναι απενεργοποιημένη';
    }
    banner.hidden = true;
    closeCookiePreferences();
  });

  closeButton?.addEventListener('click', closeCookiePreferences);
  modal.addEventListener('click', event => {
    if (event.target === modal) {
      closeCookiePreferences();
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !modal.hidden) {
      closeCookiePreferences();
    }
  });
}

function ensureDeleteConfirmModal() {
  let overlay = document.getElementById('app-delete-confirm-overlay');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'app-delete-confirm-overlay';
  overlay.className = 'app-delete-confirm-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="app-delete-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="app-delete-confirm-title">
      <h3 id="app-delete-confirm-title" class="app-delete-confirm-title">Confirm deletion</h3>
      <p id="app-delete-confirm-message" class="app-delete-confirm-message">Are you sure you want to delete this?</p>
      <div class="app-delete-confirm-actions">
        <button type="button" id="app-delete-confirm-accept" class="danger">Delete</button>
        <button type="button" id="app-delete-confirm-cancel" class="secondary">Cancel</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  return overlay;
}

function ensureAppInputModal() {
  let overlay = document.getElementById('app-input-modal-overlay');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'app-input-modal-overlay';
  overlay.className = 'app-input-modal-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="app-input-modal" role="dialog" aria-modal="true" aria-labelledby="app-input-modal-title">
      <h3 id="app-input-modal-title" class="app-input-modal-title">Input required</h3>
      <p id="app-input-modal-message" class="app-input-modal-message">Please enter a value.</p>
      <textarea id="app-input-modal-field" class="app-input-modal-field" rows="3" maxlength="600"></textarea>
      <div class="app-input-modal-actions">
        <button type="button" id="app-input-modal-accept">OK</button>
        <button type="button" id="app-input-modal-cancel" class="secondary">Cancel</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  return overlay;
}

window.showAppConfirm = function showAppConfirm(message = 'Are you sure?', options = {}) {
  const overlay = ensureDeleteConfirmModal();
  const titleEl = overlay.querySelector('#app-delete-confirm-title');
  const messageEl = overlay.querySelector('#app-delete-confirm-message');
  const acceptButton = overlay.querySelector('#app-delete-confirm-accept');
  const cancelButton = overlay.querySelector('#app-delete-confirm-cancel');

  if (!titleEl || !messageEl || !acceptButton || !cancelButton) {
    return Promise.resolve(window.confirm(message));
  }

  const {
    title = 'Please confirm',
    confirmText = 'OK',
    cancelText = 'Cancel',
    confirmClass = ''
  } = options || {};

  titleEl.textContent = title;
  messageEl.textContent = message;
  acceptButton.textContent = confirmText;
  cancelButton.textContent = cancelText;
  acceptButton.className = confirmClass ? String(confirmClass) : '';

  return new Promise(resolve => {
    const previousOverflow = document.body.style.overflow;

    const cleanup = (result) => {
      overlay.hidden = true;
      document.body.style.overflow = previousOverflow;
      overlay.removeEventListener('click', handleOverlayClick);
      document.removeEventListener('keydown', handleKeyDown);
      acceptButton.removeEventListener('click', onAccept);
      cancelButton.removeEventListener('click', onCancel);
      resolve(result);
    };

    const onAccept = () => cleanup(true);
    const onCancel = () => cleanup(false);

    const handleOverlayClick = (event) => {
      if (event.target === overlay) {
        cleanup(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        cleanup(false);
      }
    };

    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    acceptButton.focus();

    overlay.addEventListener('click', handleOverlayClick);
    document.addEventListener('keydown', handleKeyDown);
    acceptButton.addEventListener('click', onAccept);
    cancelButton.addEventListener('click', onCancel);
  });
};

window.showDeleteConfirm = function showDeleteConfirm(message = 'Are you sure you want to delete this?') {
  return window.showAppConfirm(message, {
    title: 'Confirm deletion',
    confirmText: 'Delete',
    cancelText: 'Cancel',
    confirmClass: 'danger'
  });
};

window.showAppPrompt = function showAppPrompt(message = 'Please enter a value', options = {}) {
  const overlay = ensureAppInputModal();
  const titleEl = overlay.querySelector('#app-input-modal-title');
  const messageEl = overlay.querySelector('#app-input-modal-message');
  const inputEl = overlay.querySelector('#app-input-modal-field');
  const acceptButton = overlay.querySelector('#app-input-modal-accept');
  const cancelButton = overlay.querySelector('#app-input-modal-cancel');

  if (!titleEl || !messageEl || !inputEl || !acceptButton || !cancelButton) {
    const fallback = window.prompt(message, String(options?.defaultValue || ''));
    return Promise.resolve(fallback === null ? null : String(fallback).trim());
  }

  const {
    title = 'Input required',
    placeholder = '',
    defaultValue = '',
    confirmText = 'OK',
    cancelText = 'Cancel',
    confirmClass = ''
  } = options || {};

  titleEl.textContent = title;
  messageEl.textContent = message;
  inputEl.placeholder = String(placeholder || '');
  inputEl.value = String(defaultValue || '');
  acceptButton.textContent = confirmText;
  cancelButton.textContent = cancelText;
  acceptButton.className = confirmClass ? String(confirmClass) : '';

  return new Promise(resolve => {
    const previousOverflow = document.body.style.overflow;

    const cleanup = (result) => {
      overlay.hidden = true;
      document.body.style.overflow = previousOverflow;
      overlay.removeEventListener('click', handleOverlayClick);
      document.removeEventListener('keydown', handleKeyDown);
      acceptButton.removeEventListener('click', onAccept);
      cancelButton.removeEventListener('click', onCancel);
      inputEl.removeEventListener('keydown', onInputKeyDown);
      resolve(result);
    };

    const onAccept = () => cleanup(String(inputEl.value || '').trim());
    const onCancel = () => cleanup(null);

    const handleOverlayClick = (event) => {
      if (event.target === overlay) {
        cleanup(null);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        cleanup(null);
      }
    };

    const onInputKeyDown = (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        onAccept();
      }
    };

    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    inputEl.focus();
    inputEl.select();

    overlay.addEventListener('click', handleOverlayClick);
    document.addEventListener('keydown', handleKeyDown);
    acceptButton.addEventListener('click', onAccept);
    cancelButton.addEventListener('click', onCancel);
    inputEl.addEventListener('keydown', onInputKeyDown);
  });
};

function clearTodayEventsRotationTimer() {
  if (!todayEventsRotationTimer) return;
  clearInterval(todayEventsRotationTimer);
  todayEventsRotationTimer = null;
}

function setTheme(mode) {
  document.documentElement.setAttribute('data-theme', 'light');
  localStorage.setItem('theme', 'light');
  updateThemeLabel();
}

function toggleTheme() {
  setTheme('light');
}

if (themeToggle) {
  themeToggle.onclick = toggleTheme;
}

if (mobileThemeToggle) {
  mobileThemeToggle.onclick = toggleTheme;
}

function updateThemeLabel() {
  const label = document.getElementById('theme-label');
  const mobileSwitch = document.getElementById('mobile-theme-toggle');
  const mode = 'light';

  if (label) {
    label.textContent = mode === 'dark' ? 'Dark' : 'Light';
  }

  if (mobileSwitch) {
    mobileSwitch.setAttribute('aria-label', mode === 'dark' ? 'Theme: Dark' : 'Theme: Light');
  }
}

function getBrandLogoPath() {
  const path = window.location.pathname || '';
  return path.startsWith('/admin/') ? '../assets/tsotras-logo.jpg' : '/assets/tsotras-logo.jpg';
}

function injectBrandLogo() {
  const logos = document.querySelectorAll('a.logo');
  if (!logos.length) return;

  const src = getBrandLogoPath();
  logos.forEach((logo) => {
    if (logo.dataset.brandLogoInjected === '1') return;

    logo.textContent = '';

    const img = document.createElement('img');
    img.src = src;
    img.alt = 'Εκδόσεις Τσότρας';
    img.loading = 'eager';
    img.decoding = 'async';

    logo.appendChild(img);
    logo.dataset.brandLogoInjected = '1';
  });
}

function ensureFavicon() {
  const head = document.head;
  if (!head) return;

  const href = '/favicon.png';

  const setIcon = (rel, type) => {
    let link = head.querySelector(`link[rel="${rel}"]`);
    if (!link) {
      link = document.createElement('link');
      link.rel = rel;
      head.appendChild(link);
    }
    if (type) link.type = type;
    link.href = href;
  };

  setIcon('icon', 'image/png');
  setIcon('shortcut icon', 'image/png');
  setIcon('apple-touch-icon', 'image/png');
}

function normalizeLegacyUiText() {
  const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
  if (mobileMenuToggle) mobileMenuToggle.textContent = '☰';

  const mobileMenuClose = document.getElementById('mobile-sidebar-close');
  if (mobileMenuClose) mobileMenuClose.textContent = '✕';

  const backToTopIcon = document.querySelector('.back-to-top-icon');
  if (backToTopIcon) backToTopIcon.textContent = '↑';

  const footerCopy = document.querySelectorAll('.site-footer .muted.small');
  footerCopy.forEach((node) => {
    node.innerHTML = `© <span id="year"></span> ΕΚΔΟΣΕΙΣ ΤΣΟΤΡΑΣ — All rights reserved.<br>Website by <a href="https://rusman.gr" target="_blank" rel="noopener">Antonios Rusman</a>`;
  });

  const brandLabels = document.querySelectorAll('.site-footer .brand-small');
  brandLabels.forEach((node) => {
    node.innerHTML = '<img class="footer-brand-icon" src="/favicon.png" alt="ΕΚΔΟΣΕΙΣ ΤΣΟΤΡΑΣ" loading="lazy" decoding="async">ΕΚΔΟΣΕΙΣ <span style="color:var(--accent)">ΤΣΟΤΡΑΣ</span>';
  });

  const footerRightBlocks = document.querySelectorAll('.site-footer .footer-right');
  footerRightBlocks.forEach((node) => {
    node.setAttribute('aria-hidden', 'false');
    node.innerHTML = `
      <div class="footer-contact" aria-label="Contact details">
        <div class="footer-contact-title">Contact</div>
        <a class="footer-contact-item" href="tel:+302107470789">Phone: 210 7470 789</a>
        <a class="footer-contact-item" href="mailto:info@ekdoseis-tsotras.gr">Email: info@ekdoseis-tsotras.gr</a>
      </div>
    `;
  });
}

function normalizeTeacherLabelsInUi() {
  if (!document.body) return;

  const replaceTerms = (value) => String(value || "")
    .replace(/\b(?:Staff|Teacher)\s+Access\b/g, "Access")
    .replace(/\b(?:staff|teacher)\s+access\b/g, "access");

  const shouldSkipNode = (node) => {
    const parent = node?.parentElement;
    if (!parent) return true;
    const tag = parent.tagName;
    return tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "TEXTAREA";
  };

  const normalizeTextNode = (node) => {
    if (!node || shouldSkipNode(node)) return;
    const current = node.nodeValue;
    const next = replaceTerms(current);
    if (next !== current) {
      node.nodeValue = next;
    }
  };

  const normalizeSubtree = (root) => {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      normalizeTextNode(root);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      normalizeTextNode(walker.currentNode);
    }
  };

  normalizeSubtree(document.body);
}

const UI_LANGUAGE_KEY = 'ui-language';
const UI_LANGUAGE_COOKIE_KEY = 'ui_language';
const UI_LANGUAGES = new Set(['en', 'el']);
const ENABLE_UI_TRANSLATION = true;
let currentUiLanguage = 'el';
let languageObserverInitialized = false;
let languageApplyInProgress = false;
let languageToggleFeatureEnabled = true;
let languageObserverApplying = false;
let languageMutationFlushScheduled = false;
const pendingLanguageNodes = new Set();
const originalTextByNode = new WeakMap();
const originalPlaceholderByElement = new WeakMap();
const originalDocumentTitle = String(document.title || '');

const GREEK_TEXT_MAP = new Map([
  ['Home', 'Αρχική'],
  ['Dashboard', 'Πίνακας'],
  ['Admin Dashboard', 'Πίνακας Διαχειριστή'],
  ['Teacher Dashboard', 'Πίνακας Καθηγητή'],
  ['Access', 'Πρόσβαση'],
  ['Profile', 'Προφίλ'],
  ['Login', 'Σύνδεση'],
  ['Logout', 'Αποσύνδεση'],
  ['Menu', 'Μενού'],
  ['Theme', 'Θέμα'],
  ['Search', 'Αναζήτηση'],
  ['Posts', 'Αναρτήσεις'],
  ['Latest Posts', 'Τελευταίες Αναρτήσεις'],
  ['Latest 7 posts', 'Τελευταίες 7 αναρτήσεις'],
  ['Pending Posts', 'Εκκρεμείς Αναρτήσεις'],
  ['Pending Approvals', 'Εκκρεμείς Εγκρίσεις'],
  ['Awaiting Approval', 'Αναμονή Έγκρισης'],
  ['All Pending Approvals', 'Όλες οι Εκκρεμείς Εγκρίσεις'],
  ['All Published Posts', 'Όλες οι Δημοσιευμένες Αναρτήσεις'],
  ['New Post', 'Νέα Ανάρτηση'],
  ['Back to dashboard', 'Επιστροφή στον πίνακα'],
  ['Approve', 'Έγκριση'],
  ['Reject', 'Απόρριψη'],
  ['Edit', 'Επεξεργασία'],
  ['Delete', 'Διαγραφή'],
  ['Review/Edit', 'Έλεγχος/Επεξεργασία'],
  ['Grant Access', 'Παραχώρηση Πρόσβασης'],
  ['Remove Access', 'Αφαίρεση Πρόσβασης'],
  ['No pending posts', 'Δεν υπάρχουν εκκρεμείς αναρτήσεις'],
  ['No posts match your search', 'Καμία ανάρτηση δεν ταιριάζει με την αναζήτηση'],
  ['No approved posts yet', 'Δεν υπάρχουν εγκεκριμένες αναρτήσεις ακόμα'],
  ['Search by title or slug...', 'Αναζήτηση με τίτλο ή slug...'],
  ['Search by title, author, or slug...', 'Αναζήτηση με τίτλο, συγγραφέα ή slug...'],
  ['Search by name or email...', 'Αναζήτηση με όνομα ή email...'],
  ['Search by name or email', 'Αναζήτηση με όνομα ή email'],
  ['Oldest pending posts appear first.', 'Οι παλαιότερες εκκρεμείς αναρτήσεις εμφανίζονται πρώτες.'],
  ['Newest pending posts appear first.', 'Οι νεότερες εκκρεμείς αναρτήσεις εμφανίζονται πρώτες.'],
  ['Search and manage all posts in one place.', 'Αναζήτηση και διαχείριση όλων των αναρτήσεων σε ένα σημείο.'],
  ['Search and manage approved posts in one place.', 'Αναζήτηση και διαχείριση εγκεκριμένων αναρτήσεων σε ένα σημείο.'],
  ['Create, edit, and manage posts in one place.', 'Δημιουργήστε, επεξεργαστείτε και διαχειριστείτε αναρτήσεις σε ένα σημείο.'],
  ['Showing the 10 most recent approved posts.', 'Εμφάνιση των 10 πιο πρόσφατων εγκεκριμένων αναρτήσεων.'],
  ['Review posts submitted by staff.', 'Ελέγξτε αναρτήσεις που υποβλήθηκαν από συντάκτες.'],
  ['Your posts waiting for admin approval.', 'Οι αναρτήσεις σας περιμένουν έγκριση διαχειριστή.'],
  ['See all posts', 'Δείτε όλες τις αναρτήσεις'],
  ['Add existing account emails to staff list. New entries start with no post/dashboard access.', 'Προσθέστε υπάρχοντα email λογαριασμών στη λίστα πρόσβασης. Οι νέες εγγραφές ξεκινούν χωρίς πρόσβαση δημοσίευσης/πίνακα.'],
  ['Review every post waiting for admin approval.', 'Ελέγξτε κάθε ανάρτηση που περιμένει έγκριση διαχειριστή.'],
  ['Advertisement', 'Διαφήμιση'],
  ['Loading articles...', 'Φόρτωση άρθρων...'],
  ['Loading article...', 'Φόρτωση άρθρου...'],
  ['Terms of Service', 'Όροι Χρήσης'],
  ['Privacy Policy', 'Πολιτική Απορρήτου'],
  ['No Access', 'Δεν επιτρέπεται πρόσβαση'],
  ['Access denied', 'Δεν έχετε πρόσβαση'],
  ['This account does not have permission to view the page.', 'Αυτός ο λογαριασμός δεν έχει δικαίωμα προβολής της σελίδας.'],
  ['Go back home', 'Επιστροφή στην αρχική'],
  ['Comments', 'Σχόλια'],
  ['Sort', 'Ταξινόμηση'],
  ['Newest', 'Νεότερα'],
  ['Oldest', 'Παλαιότερα'],
  ['Top', 'Κορυφαία'],
  ['Post Comment', 'Δημοσίευση σχολίου'],
  ['Create Account', 'Δημιουργία λογαριασμού'],
  ['Sign Up', 'Εγγραφή'],
  ['Sign in', 'Σύνδεση'],
  ['Admin Sign In', 'Σύνδεση Διαχειριστή'],
  ['Account', 'Λογαριασμός'],
  ['Email', 'Email'],
  ['Password', 'Κωδικός'],
  ['Confirm Password', 'Επιβεβαίωση κωδικού'],
  ['Create', 'Δημιουργία'],
  ["Don't have an account?", 'Δεν έχετε λογαριασμό;'],
  ['Must be 8+ characters with letters, numbers, and symbols', 'Πρέπει να έχει 8+ χαρακτήρες με γράμματα, αριθμούς και σύμβολα'],
  ['First Name', 'Όνομα'],
  ['Last Name', 'Επώνυμο'],
  ['Save Profile', 'Αποθήκευση προφίλ'],
  ['Log out', 'Αποσύνδεση'],
  ['Change Password', 'Αλλαγή κωδικού'],
  ['Change Password', 'Αλλαγή Κωδικού'],
  ['Current Password', 'Τρέχων κωδικός'],
  ['Current Password', 'Τρέχων Κωδικός'],
  ['New Password', 'Νέος κωδικός'],
  ['New Password', 'Νέος Κωδικός'],
  ['Confirm New Password', 'Επιβεβαίωση νέου κωδικού'],
  ['Confirm New Password', 'Επιβεβαίωση Νέου Κωδικού'],
  ['Update Password', 'Ενημέρωση κωδικού'],
  ['Update Password', 'Ενημέρωση Κωδικού'],
  ['Add Email Access', 'Προσθήκη Email Πρόσβασης'],
  ['Current Access Emails', 'Τρέχοντα Email Πρόσβασης'],
  ['Administrator Accounts', 'Λογαριασμοί Διαχειριστών'],
  ['Search articles by title, category, or author...', 'Αναζήτηση άρθρων με τίτλο, κατηγορία ή συγγραφέα...'],
  ['Title', 'Τίτλος'],
  ['Slug', 'Slug'],
  ['Categories', 'Κατηγορίες'],
  ['Content', 'Περιεχόμενο'],
  ['Internal link suggestions', 'Προτάσεις εσωτερικών συνδέσμων'],
  ['Suggested existing posts to link from this article.', 'Προτεινόμενες υπάρχουσες αναρτήσεις για σύνδεση από αυτό το άρθρο.'],
  ['Create Post', 'Δημιουργία ανάρτησης'],
  ['Cancel', 'Ακύρωση'],
  ['Close', 'Κλείσιμο'],
  ['Could not load posts.', 'Δεν ήταν δυνατή η φόρτωση των αναρτήσεων.'],
  ['Could not update approval status.', 'Δεν ήταν δυνατή η ενημέρωση της κατάστασης έγκρισης.'],
  ['Post approved.', 'Η ανάρτηση εγκρίθηκε.'],
  ['Post rejected.', 'Η ανάρτηση απορρίφθηκε.'],
  ['No matching staff entries.', 'Δεν βρέθηκαν αντίστοιχες εγγραφές πρόσβασης.'],
  ['Unable to load staff list.', 'Δεν ήταν δυνατή η φόρτωση της λίστας πρόσβασης.'],
  ['No staff emails configured.', 'Δεν έχουν ρυθμιστεί email πρόσβασης.'],
  ['Could not add staff entry.', 'Δεν ήταν δυνατή η προσθήκη εγγραφής πρόσβασης.'],
  ['No account found for this email. Ask them to sign up first.', 'Δεν βρέθηκε λογαριασμός για αυτό το email. Ζητήστε να γίνει πρώτα εγγραφή.'],
  ['Email is required.', 'Το email είναι υποχρεωτικό.'],
  ['Invalid email format.', 'Μη έγκυρη μορφή email.'],
  ['This email is managed by STAFF_EMAILS and cannot be removed here.', 'Αυτό το email διαχειρίζεται από το STAFF_EMAILS και δεν μπορεί να αφαιρεθεί από εδώ.'],
  ['This email is managed by STAFF_EMAILS and post access cannot be changed here.', 'Αυτό το email διαχειρίζεται από το STAFF_EMAILS και η πρόσβαση δημοσίευσης δεν μπορεί να αλλάξει από εδώ.'],
  ['Staff entry not found.', 'Δεν βρέθηκε εγγραφή πρόσβασης.'],
  ['User not found', 'Ο χρήστης δεν βρέθηκε'],
  ['Invalid password', 'Μη έγκυρος κωδικός'],
  ['Invalid credentials', 'Μη έγκυρα στοιχεία σύνδεσης'],
  ['Invalid token', 'Μη έγκυρο token'],
  ['Unauthorized', 'Μη εξουσιοδοτημένη πρόσβαση'],
  ['Forbidden', 'Απαγορευμένη πρόσβαση'],
  ['Not found', 'Δεν βρέθηκε'],
  ['Internal server error', 'Εσωτερικό σφάλμα διακομιστή'],
  ['Too many auth attempts. Try again later.', 'Πάρα πολλές προσπάθειες ταυτοποίησης. Δοκιμάστε ξανά αργότερα.'],
  ['Too many failed login attempts. Try again later', 'Πάρα πολλές αποτυχημένες προσπάθειες σύνδεσης. Δοκιμάστε ξανά αργότερα.'],
  ['Could not remove email.', 'Δεν ήταν δυνατή η αφαίρεση email.'],
  ['Could not update post access.', 'Δεν ήταν δυνατή η ενημέρωση της πρόσβασης.'],
  ['Staff email removed.', 'Το email πρόσβασης αφαιρέθηκε.'],
  ['Staff entry added. Post access is OFF by default.', 'Η εγγραφή πρόσβασης προστέθηκε. Η πρόσβαση δημοσίευσης είναι απενεργοποιημένη από προεπιλογή.'],
  ['Access granted.', 'Η πρόσβαση παραχωρήθηκε.'],
  ['Access removed.', 'Η πρόσβαση αφαιρέθηκε.'],
  ['Are you sure you want to remove this staff email?', 'Είστε σίγουροι ότι θέλετε να αφαιρέσετε αυτό το email πρόσβασης;'],
  ['Grant access for this account?', 'Να παραχωρηθεί πρόσβαση σε αυτόν τον λογαριασμό;'],
  ['Remove access for this account?', 'Να αφαιρεθεί η πρόσβαση από αυτόν τον λογαριασμό;'],
  ['Grant access', 'Παραχώρηση πρόσβασης'],
  ['Remove access', 'Αφαίρεση πρόσβασης'],
  ['Save Access', 'Αποθήκευση πρόσβασης'],
  ['All rights reserved.', 'All rights reserved.'],
  ['Back to top', 'Επιστροφή στην κορυφή'],
  ['Sort comments', 'Ταξινόμηση σχολίων'],
  ['Please log in to leave a comment.', 'Παρακαλώ συνδεθείτε για να αφήσετε σχόλιο.'],
  ['Author', 'Συγγραφέας'],
  ['All rights reserved.', 'All rights reserved.'],
  ['Loading author profile…', 'Φόρτωση προφίλ συγγραφέα…'],
  ['Loading posts…', 'Φόρτωση αναρτήσεων…'],
  ['Admin Sign Up', 'Εγγραφή Διαχειριστή'],
  ['Sign up failed. Try again.', 'Η εγγραφή απέτυχε. Δοκιμάστε ξανά.'],
  ['Create Account', 'Δημιουργία λογαριασμού'],
  ['Already have an account?', 'Έχετε ήδη λογαριασμό;'],
  ['Avatar uploaded. Save profile to apply.', 'Το avatar ανέβηκε. Αποθηκεύστε το προφίλ για εφαρμογή.'],
  ['Profile update failed.', 'Η ενημέρωση προφίλ απέτυχε.'],
  ['Profile updated.', 'Το προφίλ ενημερώθηκε.'],
  ['Password updated.', 'Ο κωδικός ενημερώθηκε.'],
  ['Reason for rejection (optional):', 'Αιτία απόρριψης (προαιρετικό):'],
  ['Feedback for staff...', 'Σχόλια για τον συντάκτη...'],
  ['All Posts', 'Όλες οι Αναρτήσεις'],
  ['Post', 'Ανάρτηση'],
  ['Contact', 'Επικοινωνία'],
  ['Phone: 210 7470 789', 'Τηλ: 210 7470 789'],
  ['No posts yet', 'Δεν υπάρχουν αναρτήσεις ακόμα'],
  ['Review every post waiting for admin approval.', 'Ελέγξτε κάθε ανάρτηση που περιμένει έγκριση διαχειριστή.'],
  ['Could not delete the post. Please try again.', 'Δεν ήταν δυνατή η διαγραφή της ανάρτησης. Δοκιμάστε ξανά.'],
  ['Post deleted.', 'Η ανάρτηση διαγράφηκε.'],
  ['Could not load post for editing.', 'Δεν ήταν δυνατή η φόρτωση της ανάρτησης για επεξεργασία.'],
  ['Editor content is invalid. Please review the post content and try again.', 'Το περιεχόμενο του editor δεν είναι έγκυρο. Ελέγξτε το και δοκιμάστε ξανά.'],
  ['Add alt text to image blocks before publishing.', 'Προσθέστε alt text στις εικόνες πριν τη δημοσίευση.'],
  ['Could not save post changes.', 'Δεν ήταν δυνατή η αποθήκευση αλλαγών της ανάρτησης.'],
  ['Could not create post.', 'Δεν ήταν δυνατή η δημιουργία ανάρτησης.'],
  ['A post with this slug already exists. Please choose a different slug.', 'Υπάρχει ήδη ανάρτηση με αυτό το slug. Επιλέξτε ένα διαφορετικό slug.'],
  ['Post submitted for admin approval.', 'Η ανάρτηση υποβλήθηκε για έγκριση διαχειριστή.'],
  ['Post updated and resubmitted for admin approval.', 'Η ανάρτηση ενημερώθηκε και υποβλήθηκε ξανά για έγκριση.'],
  ['Post updated successfully.', 'Η ανάρτηση ενημερώθηκε επιτυχώς.'],
  ['Post created successfully.', 'Η ανάρτηση δημιουργήθηκε επιτυχώς.'],
  ['Start typing title/categories to get suggestions.', 'Ξεκινήστε να πληκτρολογείτε τίτλο/κατηγορίες για προτάσεις.'],
  ['No strong matches yet.', 'Δεν υπάρχουν ακόμα ισχυρές αντιστοιχίσεις.'],
  ['Open menu', 'Άνοιγμα μενού'],
  ['Close menu', 'Κλείσιμο μενού'],
  ['Toggle theme', 'Εναλλαγή θέματος'],
  ['Search published posts', 'Αναζήτηση δημοσιευμένων αναρτήσεων'],
  ['Role', 'Ρόλος'],
  ['Staff', 'Συντάκτης'],
  ['Admin', 'Διαχειριστής'],
  ['Remove', 'Αφαίρεση'],
  ['Published', 'Δημοσιευμένο'],
  ['Analytics - Authors', 'Αναλυτικά - Συγγραφείς'],
  ['All Ranked Authors', 'Κατάταξη Συγγραφέων'],
  ['Full authors ranking. Rank numbers stay fixed to original order.', 'Πλήρης κατάταξη συγγραφέων. Οι αριθμοί κατάταξης παραμένουν σταθεροί στην αρχική σειρά.'],
  ['Analytics - Missing Searches', 'Αναλυτικά - Αναζητήσεις χωρίς αποτελέσματα'],
  ['Missing Searches', 'Αναζητήσεις χωρίς αποτελέσματα'],
  ['Back to analytics dashboard', 'Επιστροφή στον πίνακα αναλυτικών'],
  ['Passwords are stored as hashes, not plain text.', 'Οι κωδικοί αποθηκεύονται ως hashes, όχι ως απλό κείμενο.'],
  ['Password must be at least 8 characters and include letters, numbers, and symbols (e.g., !@#$%^&*).', 'Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες και να περιλαμβάνει γράμματα, αριθμούς και σύμβολα (π.χ. !@#$%^&*).'],
  ['Passwords do not match.', 'Οι κωδικοί δεν ταιριάζουν.'],
  ['Newsletter', 'Newsletter'],
  ['Subscribe', 'Εγγραφή'],
  ['Your email...', 'Το email σας...'],
  ['Thank you for subscribing!', 'Ευχαριστούμε για την εγγραφή σας!'],
  ['You are already subscribed!', 'Είστε ήδη εγγεγραμμένοι!'],
  ['Something went wrong. Try again.', 'Κάτι πήγε στραβά. Δοκιμάστε ξανά.'],
  ['Could not connect. Try again.', 'Δεν ήταν δυνατή η σύνδεση. Δοκιμάστε ξανά.'],
  ['Visit our website', 'Επισκεφθείτε την ιστοσελίδα μας'],
  ['Cookie Settings', 'Ρυθμίσεις cookies'],
  ['Accept cookies', 'Αποδοχή cookies'],
  ['Manage preferences', 'Διαχείριση προτιμήσεων'],
  ['Manage cookie preferences', 'Διαχείριση προτιμήσεων cookies'],
  ['We use cookies for basic functionality, analytics, and ads.', 'Χρησιμοποιούμε cookies για βασική λειτουργία, αναλύσεις και διαφημίσεις.'],
  ['Choose what you allow. Essential cookies are always active.', 'Επιλέξτε τι επιτρέπετε. Τα απαραίτητα cookies είναι πάντα ενεργά.'],
  ['Read the full Cookie Policy', 'Διαβάστε την πλήρη Πολιτική Cookies'],
  ['Essential', 'Απαραίτητα'],
  ['Always active', 'Πάντα ενεργά'],
  ['Analytics', 'Αναλυτικά'],
  ['Help us measure site performance', 'Μας βοηθούν να μετράμε την απόδοση της σελίδας'],
  ['Ads', 'Διαφημίσεις'],
  ['Allows personalized ad display', 'Επιτρέπει εξατομικευμένη προβολή διαφημίσεων'],
  ['Essential only', 'Μόνο απαραίτητα'],
  ['Save preferences', 'Αποθήκευση προτιμήσεων'],
  ['Analytics tracking is disabled', 'Η παρακολούθηση αναλυτικών είναι απενεργοποιημένη'],
  ['About Me', 'Σχετικά με εμένα'],
  ['A few words about you…', 'Λίγα λόγια για εσένα…'],
  ['This author has not added a bio yet.', 'Ο συγγραφέας δεν έχει προσθέσει βιογραφικό ακόμα.'],
  ['Contact Us', 'Επικοινωνήστε μαζί μας'],
  ['Want to publish or buy a book?', 'Θέλετε να εκδώσετε ή να αγοράσετε κάποιο βιβλίο;'],
  ['Phone', 'Τηλέφωνο'],
  ['Website', 'Ιστοσελίδα'],
  ['Visit website', 'Επίσκεψη ιστοσελίδας'],
  ['Terms of Service | ΕΚΔΟΣΕΙΣ ΤΣΟΤΡΑΣ', 'Όροι Χρήσης | ΕΚΔΟΣΕΙΣ ΤΣΟΤΡΑΣ'],
  ['Privacy Policy | ΕΚΔΟΣΕΙΣ ΤΣΟΤΡΑΣ', 'Πολιτική Απορρήτου | ΕΚΔΟΣΕΙΣ ΤΣΟΤΡΑΣ'],
  ['Cookie Policy | ΕΚΔΟΣΕΙΣ ΤΣΟΤΡΑΣ', 'Πολιτική Cookies | ΕΚΔΟΣΕΙΣ ΤΣΟΤΡΑΣ'],
  ['Cookie Policy', 'Πολιτική Cookies'],
  ['Effective date', 'Ημερομηνία ισχύος'],
  ['Related Posts', 'Σχετικές αναρτήσεις'],
  ['More articles you might like', 'Περισσότερα άρθρα που ίσως σας αρέσουν'],
  ['article', 'άρθρο'],
  ['articles', 'άρθρα'],
  ['found', 'βρέθηκαν'],
  ['Related posts', 'Σχετικές αναρτήσεις'],
  ['No image', 'Χωρίς εικόνα'],
  ['Back to articles', 'Επιστροφή στα άρθρα'],
  ['← Back to articles', '← Επιστροφή στα άρθρα'],
  ['On this page', 'Σε αυτή τη σελίδα'],
  ['Generate Summary', 'Δημιουργία σύνοψης'],
  ['AI Summary', 'Σύνοψη AI'],
  ['Summary Generated', 'Η σύνοψη δημιουργήθηκε'],
  ['Generating...', 'Δημιουργία...'],
  ["Can't generate summary right now.", 'Δεν είναι δυνατή η δημιουργία σύνοψης τώρα.'],

  // ── Admin page titles & subtitles ──
  ['My Pending Posts', 'Οι Εκκρεμείς Αναρτήσεις μου'],
  ['Only your posts waiting for admin approval.', 'Μόνο οι αναρτήσεις σας που περιμένουν έγκριση διαχειριστή.'],
  ['These are your submissions currently pending review.', 'Αυτές είναι οι υποβολές σας που εκκρεμούν προς αξιολόγηση.'],
  ['All Categories', 'Όλες οι Κατηγορίες'],
  ['Create, search, and delete categories in one place.', 'Δημιουργήστε, αναζητήστε και διαγράψτε κατηγορίες σε ένα σημείο.'],
  ['Staff can create categories and delete only the ones they created.', 'Οι συντάκτες μπορούν να δημιουργήσουν κατηγορίες και να διαγράψουν μόνο αυτές που δημιούργησαν.'],
  ['All Calendar Events', 'Όλα τα Ημερολογιακά Γεγονότα'],
  ['Filter and manage events by date, month, and year.', 'Φιλτράρισμα και διαχείριση γεγονότων κατά ημερομηνία, μήνα και έτος.'],
  ['Manage all calendar events in one place.', 'Διαχείριση όλων των ημερολογιακών γεγονότων σε ένα σημείο.'],
  ['Newsletter Subscribers', 'Συνδρομητές Newsletter'],
  ['Simple email list captured from your blog footer.', 'Απλή λίστα email που συλλέχθηκε από το footer του blog.'],
  ['Manage subscriber emails collected from the site footer.', 'Διαχείριση email συνδρομητών που συλλέχθηκαν από το footer.'],
  ['All Ranked Posts', 'Κατάταξη Αναρτήσεων'],
  ['All Ranked Categories', 'Κατάταξη Κατηγοριών'],
  ['Full categories ranking. Rank numbers stay fixed to original order.', 'Πλήρης κατάταξη κατηγοριών. Οι αριθμοί κατάταξης παραμένουν σταθεροί στην αρχική σειρά.'],
  ['Full posts ranking. Rank numbers stay fixed to original order.', 'Πλήρης κατάταξη αναρτήσεων. Οι αριθμοί κατάταξης παραμένουν σταθεροί στην αρχική σειρά.'],
  ['Broken-link Checker', 'Έλεγχος Σπασμένων Συνδέσμων'],
  ['Crawl your posts and flag dead internal/outbound links.', 'Σάρωση αναρτήσεων και εντοπισμός νεκρών εσωτερικών/εξωτερικών συνδέσμων.'],
  ['Includes source post and failed target URL.', 'Περιλαμβάνει πηγή ανάρτησης και αποτυχημένη διεύθυνση URL.'],
  ['See what readers search for but don\'t find, so you can plan next posts.', 'Δείτε τι αναζητούν οι αναγνώστες χωρίς αποτέλεσμα, για να σχεδιάσετε τις επόμενες αναρτήσεις.'],
  ['Most frequent zero-result searches in the selected window.', 'Οι πιο συχνές αναζητήσεις χωρίς αποτελέσματα στο επιλεγμένο διάστημα.'],
  ['Latest raw search events with path and timestamp.', 'Τελευταία ακατέργαστα γεγονότα αναζήτησης με διαδρομή και χρονοσφραγίδα.'],
  ['← Back to analytics dashboard', '← Επιστροφή στον πίνακα αναλυτικών'],
  ['Newest first.', 'Νεότερα πρώτα.'],

  // ── Admin dynamic / JS-generated strings ──
  ['No posts awaiting approval', 'Δεν υπάρχουν αναρτήσεις σε αναμονή έγκρισης'],
  ['No pending posts found', 'Δεν βρέθηκαν εκκρεμείς αναρτήσεις'],
  ['No approved or rejected posts yet', 'Δεν υπάρχουν εγκεκριμένες ή απορριφθείσες αναρτήσεις ακόμα'],
  ['Edited post waiting for admin approval', 'Ανάρτηση σε αναμονή έγκρισης μετά από επεξεργασία'],
  ['Approved by admin', 'Εγκρίθηκε από διαχειριστή'],
  ['Rejected by admin', 'Απορρίφθηκε από διαχειριστή'],
  ['No categories found.', 'Δεν βρέθηκαν κατηγορίες.'],
  ['Category name is required.', 'Το όνομα κατηγορίας είναι υποχρεωτικό.'],
  ['Category added.', 'Η κατηγορία προστέθηκε.'],
  ['Are you sure you want to delete this category?', 'Είστε σίγουροι ότι θέλετε να διαγράψετε αυτή την κατηγορία;'],
  ['You can only delete categories created by your account.', 'Μπορείτε να διαγράψετε μόνο κατηγορίες που δημιουργήθηκαν από τον λογαριασμό σας.'],
  ['Category deleted.', 'Η κατηγορία διαγράφηκε.'],
  ['Staff access required.', 'Απαιτείται πρόσβαση συντάκτη.'],
  ['No admin accounts found.', 'Δεν βρέθηκαν λογαριασμοί διαχειριστών.'],
  ['No subscribers yet.', 'Δεν υπάρχουν συνδρομητές ακόμα.'],
  ['Total Subscribers', 'Σύνολο Συνδρομητών'],
  ['No data found.', 'Δεν βρέθηκαν δεδομένα.'],
  ['Untitled', 'Χωρίς τίτλο'],

  // ── Admin UI elements ──
  ['New Category', 'Νέα Κατηγορία'],
  ['New category', 'Νέα κατηγορία'],
  ['Category Name', 'Όνομα Κατηγορίας'],
  ['Add Category', 'Προσθήκη Κατηγορίας'],
  ['Events', 'Γεγονότα'],
  ['New Event', 'Νέο Γεγονός'],
  ['Date', 'Ημερομηνία'],
  ['Month', 'Μήνας'],
  ['Year', 'Έτος'],
  ['Release Date', 'Ημερομηνία Δημοσίευσης'],
  ['Overview', 'Επισκόπηση'],
  ['Scan', 'Σάρωση'],
  ['Run Checker', 'Εκτέλεση Ελέγχου'],
  ['Broken Links', 'Σπασμένοι Σύνδεσμοι'],
  ['Top Missing Queries', 'Κορυφαίες Αναζητήσεις χωρίς Αποτελέσματα'],
  ['Recent Misses', 'Πρόσφατες Αστοχίες'],
  ['Copy Emails', 'Αντιγραφή Emails'],
  ['Export CSV', 'Εξαγωγή CSV'],
  ['Edit Pending Post', 'Επεξεργασία Εκκρεμούς Ανάρτησης'],
  ['Review / Edit Pending Post', 'Έλεγχος / Επεξεργασία Εκκρεμούς Ανάρτησης'],
  ['Pending post editor', 'Επεξεργαστής εκκρεμούς ανάρτησης'],
  ['Post title', 'Τίτλος ανάρτησης'],
  ['Post Title', 'Τίτλος Ανάρτησης'],
  ['Slug (URL)', 'Slug (URL)'],
  ['Slug ( Auto Generated)', 'Slug (Αυτόματη Δημιουργία)'],
  ['Select category', 'Επιλέξτε κατηγορία'],
  ['SEO Meta Description', 'SEO Meta Περιγραφή'],
  ['Short search/snippet description (max 220 characters)', 'Σύντομη περιγραφή αναζήτησης/αποσπάσματος (μέγ. 220 χαρακτήρες)'],
  ['↑ Back to Top', '↑ Επιστροφή στην κορυφή'],
  ['Loaded', 'Φορτώθηκαν'],
  ['Post image', 'Εικόνα ανάρτησης'],

  // ── Month names ──
  ['January', 'Ιανουάριος'],
  ['February', 'Φεβρουάριος'],
  ['March', 'Μάρτιος'],
  ['April', 'Απρίλιος'],
  ['May', 'Μάιος'],
  ['June', 'Ιούνιος'],
  ['July', 'Ιούλιος'],
  ['August', 'Αύγουστος'],
  ['September', 'Σεπτέμβριος'],
  ['October', 'Οκτώβριος'],
  ['November', 'Νοέμβριος'],
  ['December', 'Δεκέμβριος'],

  // ── Newsletter source labels ──
  ['Homepage footer', 'Footer αρχικής σελίδας'],
  ['Post footer', 'Footer ανάρτησης'],
  ['Author page footer', 'Footer σελίδας συγγραφέα'],
  ['Admin page footer', 'Footer σελίδας διαχειριστή'],
  ['Page footer', 'Footer σελίδας'],
  ['Footer (global)', 'Footer (γενικό)']
]);

const GREEK_WORD_REPLACEMENTS = [
  [/\bsearch\b/gi, 'αναζήτηση'],
  [/\bname\b/gi, 'όνομα'],
  [/\bemail\b/gi, 'Email'],
  [/\bprofile\b/gi, 'προφίλ'],
  [/\bdashboard\b/gi, 'πίνακας'],
  [/\bhome\b/gi, 'αρχική'],
  [/\bposts?\b/gi, 'αναρτήσεις'],
  [/\bpost\b/gi, 'ανάρτηση'],
  [/\bpending\b/gi, 'εκκρεμείς'],
  [/\bapproval\b/gi, 'έγκριση'],
  [/\baccess\b/gi, 'πρόσβαση'],
  [/\bnew\b/gi, 'νέα'],
  [/\bcreate\b/gi, 'δημιουργία'],
  [/\bedit\b/gi, 'επεξεργασία'],
  [/\bdelete\b/gi, 'διαγραφή'],
  [/\bapprove\b/gi, 'έγκριση'],
  [/\breject\b/gi, 'απόρριψη'],
  [/\bremove\b/gi, 'αφαίρεση'],
  [/\bgrant\b/gi, 'παραχώρηση'],
  [/\bsave\b/gi, 'αποθήκευση'],
  [/\bupdate\b/gi, 'ενημέρωση'],
  [/\bcancel\b/gi, 'ακύρωση'],
  [/\bclose\b/gi, 'κλείσιμο'],
  [/\blogin\b/gi, 'σύνδεση'],
  [/\blog out\b/gi, 'αποσύνδεση'],
  [/\blogout\b/gi, 'αποσύνδεση'],
  [/\bcomments\b/gi, 'σχόλια'],
  [/\bcomment\b/gi, 'σχόλιο'],
  [/\bsort\b/gi, 'ταξινόμηση'],
  [/\bnewest\b/gi, 'νεότερα'],
  [/\boldest\b/gi, 'παλαιότερα'],
  [/\btop\b/gi, 'κορυφαία'],
  [/\badvertisement\b/gi, 'διαφήμιση'],
  [/\bprivacy policy\b/gi, 'πολιτική απορρήτου'],
  [/\bterms of service\b/gi, 'όροι χρήσης'],
  [/\bloading\b/gi, 'φόρτωση'],
  [/\ball\b/gi, 'όλες'],
  [/\blatest\b/gi, 'τελευταίες'],
  [/\bby\b/gi, 'Απο'],
  [/\band\b/gi, 'και'],
  [/\bor\b/gi, 'ή']
];

const GREEK_PATTERN_REPLACEMENTS = [
  [/Συγγραφέαςs/g, 'Συγγραφείς'],
  [/Αναζήτησηes/g, 'Αναζητήσεις'],
  [/Κωδικόςs/g, 'Κωδικοί'],
  [/Κωδικός\b/g, 'Κωδικός'],
  [/Missing Searches/g, 'Αναζητήσεις χωρίς αποτελέσματα'],
  [/Analytics - Missing Searches/g, 'Αναλυτικά - Αναζητήσεις χωρίς αποτελέσματα'],
  [/Analytics - Authors/g, 'Αναλυτικά - Συγγραφείς'],
  [/All Ranked Authors/g, 'Κατάταξη Συγγραφέων'],
  [/Back to analytics dashboard/g, 'Επιστροφή στον πίνακα αναλυτικών'],
  [/Password must be at least 8 characters and include letters, numbers, and symbols \(e\.g\., !@#\$%\^&\*\)\./g, 'Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες και να περιλαμβάνει γράμματα, αριθμούς και σύμβολα (π.χ. !@#$%^&*).'],
  [/Passwords do not match\./g, 'Οι κωδικοί δεν ταιριάζουν.'],
  [/Passwords are stored as hashes, not plain text\./g, 'Οι κωδικοί αποθηκεύονται ως hashes, όχι ως απλό κείμενο.'],
  [/\bStaff Access\b/g, 'Πρόσβαση'],
  [/\bTeacher Access\b/g, 'Πρόσβαση'],
  [/\bAll Posts\b/g, 'Όλες οι Αναρτήσεις'],
  [/\bPending approval\b/g, 'Σε αναμονή έγκρισης'],
  [/\bApproved by admin\b/g, 'Εγκρίθηκε από διαχειριστή'],
  [/\bRejected by admin\b/g, 'Απορρίφθηκε από διαχειριστή'],
  [/\bApproved\b/g, 'Εγκεκριμένο'],
  [/\bRejected\b/g, 'Απορρίφθηκε'],
  [/\bEdited post waiting for admin approval\b/g, 'Ανάρτηση σε αναμονή έγκρισης μετά από επεξεργασία'],
  [/\bWaiting for admin approval\b/g, 'Αναμονή για έγκριση διαχειριστή'],
  [/\bCould not ([^.]+)\./g, 'Δεν ήταν δυνατή η ενέργεια: $1.'],
  [/\bBack to dashboard\b/g, 'Επιστροφή στον πίνακα'],
  [/\bSave Access\b/g, 'Αποθήκευση πρόσβασης'],
  [/\bAdd Staff Email\b/g, 'Προσθήκη email πρόσβασης'],
  [/\bCurrent Staff Emails\b/g, 'Τρέχοντα email πρόσβασης'],
  [/\bSearch and manage all posts in one place\./g, 'Αναζήτηση και διαχείριση όλων των αναρτήσεων σε ένα σημείο.'],
  [/\bSearch and manage approved posts in one place\./g, 'Αναζήτηση και διαχείριση εγκεκριμένων αναρτήσεων σε ένα σημείο.'],
  [/\bNo posts awaiting approval\b/g, 'Δεν υπάρχουν αναρτήσεις σε αναμονή έγκρισης'],
  [/\bNo pending posts found\b/g, 'Δεν βρέθηκαν εκκρεμείς αναρτήσεις'],
  [/\bNo pending posts\b/g, 'Δεν υπάρχουν εκκρεμείς αναρτήσεις'],
  [/\bNo matching staff entries\.?/g, 'Δεν βρέθηκαν αντίστοιχες εγγραφές πρόσβασης.'],
  [/\bAre you sure you want to delete this post\?/g, 'Είστε σίγουροι ότι θέλετε να διαγράψετε αυτή την ανάρτηση;'],
  [/\bSwitch language to English\b/g, 'Αλλαγή γλώσσας στα Αγγλικά'],
  [/\bSwitch language to Greek\b/g, 'Αλλαγή γλώσσας στα Ελληνικά'],

  // ── Admin dynamic strings ──
  [/\bNo approved or rejected posts yet\b/g, 'Δεν υπάρχουν εγκεκριμένες ή απορριφθείσες αναρτήσεις ακόμα'],
  [/\bRejected:\s/g, 'Απορρίφθηκε: '],
  [/\bNo categories found\.?/g, 'Δεν βρέθηκαν κατηγορίες.'],
  [/\bCategory name is required\.?/g, 'Το όνομα κατηγορίας είναι υποχρεωτικό.'],
  [/\bCategory added\.?/g, 'Η κατηγορία προστέθηκε.'],
  [/\bCategory deleted\.?/g, 'Η κατηγορία διαγράφηκε.'],
  [/\bAre you sure you want to delete this category\?/g, 'Είστε σίγουροι ότι θέλετε να διαγράψετε αυτή την κατηγορία;'],
  [/\bStaff access required\.?/g, 'Απαιτείται πρόσβαση συντάκτη.'],
  [/\bNo admin accounts found\.?/g, 'Δεν βρέθηκαν λογαριασμοί διαχειριστών.'],
  [/\bNo subscribers yet\.?/g, 'Δεν υπάρχουν συνδρομητές ακόμα.'],
  [/\bTotal Subscribers\b/g, 'Σύνολο Συνδρομητών'],
  [/\bNo data found\.?/g, 'Δεν βρέθηκαν δεδομένα.'],
  [/\bMy Pending Posts\b/g, 'Οι Εκκρεμείς Αναρτήσεις μου']
];

const ENGLISH_TEXT_MAP = new Map(
  Array.from(GREEK_TEXT_MAP.entries()).map(([englishText, greekText]) => [greekText, englishText])
);

const ENGLISH_WORD_REPLACEMENTS = [
  [/αναζήτηση/gi, 'search'],
  [/όνομα/gi, 'name'],
  [/προφίλ/gi, 'profile'],
  [/πίνακας/gi, 'dashboard'],
  [/αρχική/gi, 'home'],
  [/αναρτήσεις/gi, 'posts'],
  [/ανάρτηση/gi, 'post'],
  [/εκκρεμείς/gi, 'pending'],
  [/έγκριση/gi, 'approval'],
  [/πρόσβαση(?![Α-Ωα-ωΆ-Ώά-ώ])/gi, 'access'],
  [/δημιουργία/gi, 'create'],
  [/επεξεργασία/gi, 'edit'],
  [/διαγραφή/gi, 'delete'],
  [/σύνδεση/gi, 'login'],
  [/αποσύνδεση/gi, 'logout'],
  [/σχόλια/gi, 'comments'],
  [/ταξινόμηση/gi, 'sort'],
  [/διαφήμιση/gi, 'advertisement'],
  [/πολιτική απορρήτου/gi, 'privacy policy'],
  [/όροι χρήσης/gi, 'terms of service'],
  [/φόρτωση/gi, 'loading']
];

const ENGLISH_PATTERN_REPLACEMENTS = [
  [/Συγγραφέαςs/g, 'Authors'],
  [/Αναζήτησηes/g, 'Searches'],
  [/Κωδικόςs/g, 'Passwords'],
  [/Αναζητήσεις χωρίς αποτελέσματα/g, 'Missing Searches'],
  [/Αναλυτικά - Αναζητήσεις χωρίς αποτελέσματα/g, 'Analytics - Missing Searches'],
  [/Αναλυτικά - Συγγραφείς/g, 'Analytics - Authors'],
  [/Κατάταξη Συγγραφέων/g, 'All Ranked Authors'],
  [/Επιστροφή στον πίνακα αναλυτικών/g, 'Back to analytics dashboard'],
  [/Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες και να περιλαμβάνει γράμματα, αριθμούς και σύμβολα \(π\.χ\. !@#\$%\^&\*\)\./g, 'Password must be at least 8 characters and include letters, numbers, and symbols (e.g., !@#$%^&*).'],
  [/Οι κωδικοί δεν ταιριάζουν\./g, 'Passwords do not match.'],
  [/Οι κωδικοί αποθηκεύονται ως hashes, όχι ως απλό κείμενο\./g, 'Passwords are stored as hashes, not plain text.'],
  [/Πρόσβαση/g, 'Access'],
  [/Ηλεκτρονικό ταχυδρομείο/g, 'Email'],
  [/Αποθήκευση Προφίλ/g, 'Save Profile'],
  [/Αποθήκευση προφίλ/g, 'Save Profile'],
  [/Όλες οι Αναρτήσεις/g, 'All Posts'],
  [/Σε αναμονή έγκρισης/g, 'Pending approval'],
  [/Εγκρίθηκε από διαχειριστή/g, 'Approved by admin'],
  [/Απορρίφθηκε από διαχειριστή/g, 'Rejected by admin'],
  [/Ανάρτηση σε αναμονή έγκρισης μετά από επεξεργασία/g, 'Edited post waiting for admin approval'],
  [/Αναμονή για έγκριση διαχειριστή/g, 'Waiting for admin approval'],
  [/Εγκεκριμένο/g, 'Approved'],
  [/Απορρίφθηκε/g, 'Rejected'],
  [/Επιστροφή στον πίνακα/g, 'Back to dashboard'],
  [/Αποθήκευση πρόσβασης/g, 'Save Access'],
  [/Προσθήκη email πρόσβασης/g, 'Add Staff Email'],
  [/Τρέχοντα email πρόσβασης/g, 'Current Staff Emails'],
  [/Προσθήκη Email Πρόσβασης/g, 'Add Email Access'],
  [/Τρέχοντα Email Πρόσβασης/g, 'Current Access Emails'],
  [/Αποθήκευση Πρόσβασης/g, 'Save Access'],
  [/Λογαριασμοί Διαχειριστών/g, 'Administrator Accounts'],
  [/Αλλαγή Κωδικού/g, 'Change Password'],
  [/Τρέχων Κωδικός/g, 'Current Password'],
  [/Νέος Κωδικός/g, 'New Password'],
  [/Επιβεβαίωση Νέου Κωδικού/g, 'Confirm New Password'],
  [/Ενημέρωση Κωδικού/g, 'Update Password'],
  [/Αναζήτηση άρθρων με τίτλο, κατηγορία ή συγγραφέα\.\.\./g, 'Search articles by title, category, or author...'],
  [/Αναζήτηση με όνομα ή Email\.\.\./g, 'Search by name or email...'],
  [/search με name ή Email\.\.\./gi, 'Search by name or email...'],
  [/byθήκευση Accessς/g, 'Save Access'],
  [/Αποθήκευση Accessς/g, 'Save Access'],
  [/Προσθήκη Email Accessς/g, 'Add Email Access'],
  [/Τρέχοντα Email Accessς/g, 'Current Access Emails'],
  [/(^|\s)Απο(?=\s|$)/g, '$1by'],
  [/(^|\s)από(?=\s|$)/g, '$1by'],
  [/Δεν υπάρχουν εκκρεμείς αναρτήσεις/g, 'No pending posts'],
  [/Δεν βρέθηκαν αντίστοιχες εγγραφές πρόσβασης\.?/g, 'No matching staff entries.'],
  [/Είστε σίγουροι ότι θέλετε να διαγράψετε αυτή την ανάρτηση;/g, 'Are you sure you want to delete this post?'],
  [/Αλλαγή γλώσσας στα Αγγλικά/g, 'Switch language to English'],
  [/Αλλαγή γλώσσας στα Ελληνικά/g, 'Switch language to Greek'],

  // ── Reverse of admin dynamic strings ──
  [/Δεν υπάρχουν αναρτήσεις σε αναμονή έγκρισης/g, 'No posts awaiting approval'],
  [/Δεν βρέθηκαν εκκρεμείς αναρτήσεις/g, 'No pending posts found'],
  [/Δεν υπάρχουν εγκεκριμένες ή απορριφθείσες αναρτήσεις ακόμα/g, 'No approved or rejected posts yet'],
  [/Ανάρτηση σε αναμονή έγκρισης μετά από επεξεργασία/g, 'Edited post waiting for admin approval'],
  [/Απορρίφθηκε από διαχειριστή/g, 'Rejected by admin'],
  [/Απορρίφθηκε:\s/g, 'Rejected: '],
  [/Δεν βρέθηκαν κατηγορίες\.?/g, 'No categories found.'],
  [/Το όνομα κατηγορίας είναι υποχρεωτικό\.?/g, 'Category name is required.'],
  [/Η κατηγορία προστέθηκε\.?/g, 'Category added.'],
  [/Η κατηγορία διαγράφηκε\.?/g, 'Category deleted.'],
  [/Είστε σίγουροι ότι θέλετε να διαγράψετε αυτή την κατηγορία;/g, 'Are you sure you want to delete this category?'],
  [/Απαιτείται πρόσβαση συντάκτη\.?/g, 'Staff access required.'],
  [/Δεν βρέθηκαν λογαριασμοί διαχειριστών\.?/g, 'No admin accounts found.'],
  [/Δεν υπάρχουν συνδρομητές ακόμα\.?/g, 'No subscribers yet.'],
  [/Σύνολο Συνδρομητών/g, 'Total Subscribers'],
  [/Δεν βρέθηκαν δεδομένα\.?/g, 'No data found.'],
  [/Οι Εκκρεμείς Αναρτήσεις μου/g, 'My Pending Posts'],
  [/Κατάταξη Αναρτήσεων/g, 'All Ranked Posts'],
  [/Κατάταξη Κατηγοριών/g, 'All Ranked Categories'],
  [/Πλήρης κατάταξη κατηγοριών\./g, 'Full categories ranking.'],
  [/Πλήρης κατάταξη αναρτήσεων\./g, 'Full posts ranking.'],
  [/Έλεγχος Σπασμένων Συνδέσμων/g, 'Broken-link Checker'],
  [/Σπασμένοι Σύνδεσμοι/g, 'Broken Links'],
  [/Κορυφαίες Αναζητήσεις χωρίς Αποτελέσματα/g, 'Top Missing Queries'],
  [/Πρόσφατες Αστοχίες/g, 'Recent Misses'],
  [/Συνδρομητές Newsletter/g, 'Newsletter Subscribers'],
  [/Σύνολο Συνδρομητών/g, 'Total Subscribers'],
  [/Αντιγραφή Emails/g, 'Copy Emails'],
  [/Εξαγωγή CSV/g, 'Export CSV'],
  [/Όλες οι Κατηγορίες/g, 'All Categories'],
  [/Όλα τα Ημερολογιακά Γεγονότα/g, 'All Calendar Events'],
  [/Γεγονότα/g, 'Events'],
  [/Επισκόπηση/g, 'Overview']
];

function resolveInitialUiLanguage() {
  try {
    const saved = String(localStorage.getItem(UI_LANGUAGE_KEY) || '').trim().toLowerCase();
    if (UI_LANGUAGES.has(saved)) return saved;
  } catch {
  }

  try {
    const sessionSaved = String(sessionStorage.getItem(UI_LANGUAGE_KEY) || '').trim().toLowerCase();
    if (UI_LANGUAGES.has(sessionSaved)) return sessionSaved;
  } catch {
  }

  try {
    const cookieMatch = String(document.cookie || '')
      .split(';')
      .map(entry => entry.trim())
      .find(entry => entry.startsWith(`${UI_LANGUAGE_COOKIE_KEY}=`));
    if (cookieMatch) {
      const cookieValue = decodeURIComponent(cookieMatch.split('=').slice(1).join('='));
      const normalized = String(cookieValue || '').trim().toLowerCase();
      if (UI_LANGUAGES.has(normalized)) return normalized;
    }
  } catch {
  }

  const htmlLang = String(document.documentElement.getAttribute('lang') || '').trim().toLowerCase();
  if (UI_LANGUAGES.has(htmlLang)) return htmlLang;
  return 'el';
}

function persistUiLanguagePreference(language) {
  const normalized = UI_LANGUAGES.has(language) ? language : 'el';

  try {
    localStorage.setItem(UI_LANGUAGE_KEY, normalized);
  } catch {
  }

  try {
    sessionStorage.setItem(UI_LANGUAGE_KEY, normalized);
  } catch {
  }

  try {
    const oneYear = 60 * 60 * 24 * 365;
    document.cookie = `${UI_LANGUAGE_COOKIE_KEY}=${encodeURIComponent(normalized)}; Max-Age=${oneYear}; Path=/; SameSite=Lax`;
  } catch {
  }
}

function localizeTextValue(value, lang = currentUiLanguage) {
  const source = String(value || '');
  if (!ENABLE_UI_TRANSLATION) return source;
  if (!source) return source;

  const parts = source.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const leading = parts ? parts[1] : '';
  const core = parts ? parts[2] : source;
  const trailing = parts ? parts[3] : '';

  let translated = core;

  if (lang === 'el') {
    translated = GREEK_TEXT_MAP.get(core) || core;
    GREEK_PATTERN_REPLACEMENTS.forEach(([pattern, replacement]) => {
      translated = translated.replace(pattern, replacement);
    });

    if (translated.trim().toLowerCase() === 'all rights reserved.') {
      return `${leading}All rights reserved.${trailing}`;
    }

    const looksLikePlainUiText = /[A-Za-z]/.test(translated)
      && !/^https?:\/\//i.test(translated)
      && !/^\/?[\w\-./]+\.(?:png|jpg|jpeg|gif|svg|webp|ico)$/i.test(translated)
      && !/^\/?[\w\-./]+\.html(?:\?.*)?$/i.test(translated)
      && !/^[A-Z0-9_\-]+$/.test(translated.trim());

    if (looksLikePlainUiText) {
      GREEK_WORD_REPLACEMENTS.forEach(([pattern, replacement]) => {
        translated = translated.replace(pattern, replacement);
      });
    }
  }

  if (lang === 'en') {
    translated = ENGLISH_TEXT_MAP.get(core) || core;
    ENGLISH_PATTERN_REPLACEMENTS.forEach(([pattern, replacement]) => {
      translated = translated.replace(pattern, replacement);
    });

    const looksLikePlainGreekUiText = /[Α-Ωα-ωΆ-Ώά-ώ]/.test(translated)
      && !/^https?:\/\//i.test(translated)
      && !/^\/?[\w\-./]+\.(?:png|jpg|jpeg|gif|svg|webp|ico)$/i.test(translated)
      && !/^\/?[\w\-./]+\.html(?:\?.*)?$/i.test(translated);

    if (looksLikePlainGreekUiText) {
      ENGLISH_WORD_REPLACEMENTS.forEach(([pattern, replacement]) => {
        translated = translated.replace(pattern, replacement);
      });
    }
  }

  return `${leading}${translated}${trailing}`;
}

function translateAttributeValue(value) {
  const source = String(value || '');
  if (!source) return source;
  return localizeTextValue(source, currentUiLanguage);
}

function isEditableLanguageContext(element) {
  if (!(element instanceof Element)) return false;
  if (element.matches?.('[contenteditable="true"], [contenteditable=""]')) return true;
  return Boolean(element.closest?.(
    '[contenteditable="true"], [contenteditable=""], #posts-editor, .codex-editor, .ce-block, .ce-paragraph, .ce-header, .ce-quote, .ce-code'
  ));
}

function isNoTranslateLanguageContext(element) {
  if (!(element instanceof Element)) return false;

  // Keep authored content in its original language (about/profile text and posts).
  const noTranslateSelector = [
    '[data-no-translate]',
    '[data-i18n="off"]',
    '#author-hero-name',
    '#author-hero-subtitle',
    '#author-hero-bio',
    '.post-card',
    '.related-post-card',
    '.featured-rotator-slide',
    '.article-title',
    '.article-content',
    '#post'
  ].join(', ');

  if (element.matches?.(noTranslateSelector)) return true;
  return Boolean(element.closest?.(noTranslateSelector));
}

function shouldSkipLanguageNode(node) {
  const parent = node?.parentElement;
  if (!parent) return true;
  if (isEditableLanguageContext(parent)) return true;
  if (isNoTranslateLanguageContext(parent)) return true;
  const tag = parent.tagName;
  return tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEXTAREA';
}

function applyLanguageToTextNode(node) {
  if (!node || shouldSkipLanguageNode(node)) return;
  if (!originalTextByNode.has(node)) {
    originalTextByNode.set(node, String(node.nodeValue || ''));
  }
  const original = originalTextByNode.get(node) || '';
  const localized = localizeTextValue(original, currentUiLanguage);
  if (node.nodeValue !== localized) {
    node.nodeValue = localized;
  }
}

function applyLanguageToNode(root) {
  if (!root) return;

  if (root.nodeType === Node.TEXT_NODE) {
    applyLanguageToTextNode(root);
    return;
  }

  if (root.nodeType !== Node.ELEMENT_NODE) return;

  if (root instanceof Element && isEditableLanguageContext(root)) {
    return;
  }

  if (root instanceof Element && isNoTranslateLanguageContext(root)) {
    return;
  }

  if (root instanceof Element && root.hasAttribute('placeholder')) {
    if (!originalPlaceholderByElement.has(root)) {
      originalPlaceholderByElement.set(root, String(root.getAttribute('placeholder') || ''));
    }
    const placeholder = originalPlaceholderByElement.get(root) || '';
    const localizedPlaceholder = localizeTextValue(placeholder, currentUiLanguage);
    if (root.getAttribute('placeholder') !== localizedPlaceholder) {
      root.setAttribute('placeholder', localizedPlaceholder);
    }
  }

  const translatableAttributes = ['title', 'aria-label', 'alt', 'value'];
  translatableAttributes.forEach((attributeName) => {
    if (!(root instanceof Element) || !root.hasAttribute(attributeName)) return;
    const cacheAttr = `data-i18n-orig-${attributeName}`;
    if (!root.hasAttribute(cacheAttr)) {
      root.setAttribute(cacheAttr, String(root.getAttribute(attributeName) || ''));
    }
    const originalValue = String(root.getAttribute(cacheAttr) || '');
    const translatedValue = translateAttributeValue(originalValue);
    if (root.getAttribute(attributeName) !== translatedValue) {
      root.setAttribute(attributeName, translatedValue);
    }
  });

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    applyLanguageToTextNode(walker.currentNode);
  }

  const placeholders = root.querySelectorAll?.('[placeholder]') || [];
  placeholders.forEach((element) => {
    if (isNoTranslateLanguageContext(element)) return;
    if (!originalPlaceholderByElement.has(element)) {
      originalPlaceholderByElement.set(element, String(element.getAttribute('placeholder') || ''));
    }
    const placeholder = originalPlaceholderByElement.get(element) || '';
    const localizedPlaceholder = localizeTextValue(placeholder, currentUiLanguage);
    if (element.getAttribute('placeholder') !== localizedPlaceholder) {
      element.setAttribute('placeholder', localizedPlaceholder);
    }
  });

  const withAttributes = root.querySelectorAll?.('[title], [aria-label], img[alt], input[value], button[value]') || [];
  withAttributes.forEach((element) => {
    if (isNoTranslateLanguageContext(element)) return;
    translatableAttributes.forEach((attributeName) => {
      if (!element.hasAttribute(attributeName)) return;
      const cacheAttr = `data-i18n-orig-${attributeName}`;
      if (!element.hasAttribute(cacheAttr)) {
        element.setAttribute(cacheAttr, String(element.getAttribute(attributeName) || ''));
      }
      const originalValue = String(element.getAttribute(cacheAttr) || '');
      const translatedValue = translateAttributeValue(originalValue);
      if (element.getAttribute(attributeName) !== translatedValue) {
        element.setAttribute(attributeName, translatedValue);
      }
    });
  });
}

function updateLanguageToggleLabels() {
  const toggles = document.querySelectorAll('[data-language-toggle]');
  if (!toggles.length) return;

  const nextLabel = currentUiLanguage === 'el' ? 'EN' : 'ΕΛ';
  const ariaLabel = currentUiLanguage === 'el'
    ? 'Αλλαγή γλώσσας στα Αγγλικά'
    : 'Switch language to Greek';

  toggles.forEach((button) => {
    if (button.textContent !== nextLabel) {
      button.textContent = nextLabel;
    }
    if (button.getAttribute('aria-label') !== ariaLabel) {
      button.setAttribute('aria-label', ariaLabel);
    }
    if (button.getAttribute('title') !== ariaLabel) {
      button.setAttribute('title', ariaLabel);
    }
  });
}

function removeLanguageToggleButtons() {
  document.querySelectorAll('[data-language-toggle]').forEach((button) => button.remove());
}

async function loadPublicFeatureConfig() {
  try {
    const response = await fetch('/api/public-config', { cache: 'no-store' });
    if (!response.ok) return;
    const config = await response.json();
    languageToggleFeatureEnabled = config?.features?.languageToggle !== false;
  } catch {
    languageToggleFeatureEnabled = true;
  }
}
function applyDataLanguageSectionVisibility() {
  const languageSections = document.querySelectorAll('[data-lang]');
  languageSections.forEach((section) => {
    const sectionLang = String(section.getAttribute('data-lang') || '').trim().toLowerCase();
    if (!sectionLang) return;
    const isActiveLanguage = sectionLang === currentUiLanguage;
    section.hidden = !isActiveLanguage;
    section.setAttribute('aria-hidden', String(!isActiveLanguage));
  });
}

function applyLanguageNow() {
  if (languageApplyInProgress) return;
  languageApplyInProgress = true;
  try {
    const localizedTitle = localizeTextValue(originalDocumentTitle, currentUiLanguage);
    if (document.title !== localizedTitle) {
      document.title = localizedTitle;
    }
    applyDataLanguageSectionVisibility();
    applyLanguageToNode(document.body);
    enforceAllRightsReservedEnglish();
    updateLanguageToggleLabels();
  } finally {
    languageApplyInProgress = false;
  }
}

function setUiLanguage(nextLanguage) {
  currentUiLanguage = UI_LANGUAGES.has(nextLanguage) ? nextLanguage : 'el';
  document.documentElement.setAttribute('lang', currentUiLanguage);

  persistUiLanguagePreference(currentUiLanguage);

  applyLanguageNow();

  window.dispatchEvent(new CustomEvent('ui-language-changed', {
    detail: { language: currentUiLanguage }
  }));
}

function queueLanguageNodeForApply(node) {
  if (!node) return;
  pendingLanguageNodes.add(node);
  if (languageMutationFlushScheduled) return;

  languageMutationFlushScheduled = true;
  window.requestAnimationFrame(() => {
    languageMutationFlushScheduled = false;
    if (languageApplyInProgress || languageObserverApplying) {
      pendingLanguageNodes.clear();
      return;
    }

    languageObserverApplying = true;
    try {
      pendingLanguageNodes.forEach((queuedNode) => {
        applyLanguageToNode(queuedNode);
      });
    } finally {
      pendingLanguageNodes.clear();
      languageObserverApplying = false;
    }
  });
}

function initializeLanguageObserver() {
  if (languageObserverInitialized || !document.body) return;
  languageObserverInitialized = true;

  const observer = new MutationObserver((mutations) => {
    if (languageApplyInProgress || languageObserverApplying) return;

    mutations.forEach((mutation) => {
      if (mutation.type === 'characterData') {
        queueLanguageNodeForApply(mutation.target);
        return;
      }

      if (mutation.type === 'attributes') {
        queueLanguageNodeForApply(mutation.target);
        return;
      }

      mutation.addedNodes.forEach((node) => {
        queueLanguageNodeForApply(node);
      });
    });
  });

  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['placeholder', 'title', 'aria-label', 'alt', 'value']
  });
}

function ensureLanguageToggleButtons() {
  if (!languageToggleFeatureEnabled) {
    removeLanguageToggleButtons();
    return;
  }

  const createToggleButton = () => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nav-link nav-language-toggle';
    button.setAttribute('data-language-toggle', '1');
    button.addEventListener('click', () => {
      setUiLanguage(currentUiLanguage === 'el' ? 'en' : 'el');
    });
    return button;
  };

  const desktopNav = document.querySelector('header .header-inner nav');
  if (desktopNav && !desktopNav.querySelector('[data-language-toggle]')) {
    const button = createToggleButton();
    const profileLink = desktopNav.querySelector('a[href="/admin/profile"], a[href="/admin/profile.html"], a[data-auth-link]');
    if (profileLink && profileLink.parentNode === desktopNav) {
      desktopNav.insertBefore(button, profileLink.nextSibling);
    } else {
      desktopNav.appendChild(button);
    }
  }

  const mobileNav = document.querySelector('#mobile-sidebar .mobile-sidebar-nav');
  if (mobileNav && !mobileNav.querySelector('[data-language-toggle]')) {
    const button = createToggleButton();
    const themeRow = mobileNav.querySelector('.mobile-theme-row');
    if (themeRow) {
      mobileNav.insertBefore(button, themeRow);
    } else {
      mobileNav.appendChild(button);
    }
  }

  updateLanguageToggleLabels();
}

async function initializeLanguageToggle() {
  if (!ENABLE_UI_TRANSLATION) {
    currentUiLanguage = 'el';
    document.documentElement.setAttribute('lang', 'el');
    removeLanguageToggleButtons();
    releaseInitialI18nPaint();
    return;
  }

  currentUiLanguage = resolveInitialUiLanguage();
  document.documentElement.setAttribute('lang', currentUiLanguage);
  persistUiLanguagePreference(currentUiLanguage);
  applyLanguageNow();
  releaseInitialI18nPaint();

  await loadPublicFeatureConfig();
  ensureLanguageToggleButtons();
  initializeLanguageObserver();
}

// On load
setTheme('light');

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectBrandLogo, { once: true });
} else {
  injectBrandLogo();
}

ensureFavicon();
normalizeLegacyUiText();
normalizeTeacherLabelsInUi();
ensureBrandAccessibilityCopy();
ensurePageSeoMeta();
normalizeAdDisclosureText();
ensureFooterComplianceLinks();
enforceAllRightsReservedEnglish();
optimizeImageLoadingStrategy();
ensureGlobalBackToTopButton();
initializeLanguageToggle();

let cachedProfile;
let profileRequestPromise = null;
let pendingBadgeRefreshTimer = null;
let pendingBadgeRequestPromise = null;
let pendingBadgeEventsBound = false;
const PENDING_BADGE_REFRESH_MS = 15000;

async function getProfile() {
  if (cachedProfile !== undefined) return cachedProfile;

  if (!profileRequestPromise) {
    profileRequestPromise = fetch('/api/auth/profile')
      .then(async (res) => {
        if (!res.ok) {
          cachedProfile = null;
          return null;
        }

        cachedProfile = await res.json();
        return cachedProfile;
      })
      .catch(() => {
        cachedProfile = null;
        return null;
      })
      .finally(() => {
        profileRequestPromise = null;
      });
  }

  return profileRequestPromise;
}

async function updateAuthLinks() {
  const authLinks = document.querySelectorAll('[data-auth-link]');
  if (!authLinks.length) return;

  const profile = await getProfile();
  authLinks.forEach(link => {
    if (profile) {
      link.textContent = localizeTextValue('Profile', currentUiLanguage);
      link.href = '/admin/profile';
    } else {
      link.textContent = localizeTextValue('Login', currentUiLanguage);
      link.href = '/admin/login';
    }
  });
}

async function updateStaffLinks() {
  const staffLinks = document.querySelectorAll('[data-staff-only]');
  if (!staffLinks.length) return;

  staffLinks.forEach(link => {
    link.hidden = true;
  });

  const profile = await getProfile();
  staffLinks.forEach(link => {
    const href = String(link.getAttribute('href') || '');
    const isStaffManagementLink = href.includes('/admin/staff');
    const isAdminOrStaff = profile && (profile.role === 'admin' || profile.role === 'staff');
    const isAdmin = profile && profile.role === 'admin';

    if (isStaffManagementLink) {
      link.hidden = !isAdmin;
      return;
    }

    link.hidden = !isAdminOrStaff;
  });

  await updateDashboardPendingBadge({ force: true });
  initializeDashboardPendingBadgeLiveRefresh();
}

function removeDashboardPendingBadges() {
  const badges = document.querySelectorAll('[data-dashboard-pending-badge="1"]');
  badges.forEach((badge) => badge.remove());
}

function applyDashboardPendingBadge(pendingCount) {
  const dashboardLinks = document.querySelectorAll('a[data-staff-only][href="/admin/dashboard"], a[data-staff-only][href="/admin/dashboard.html"]');
  if (!dashboardLinks.length) return;

  const normalizedCount = Number.isFinite(Number(pendingCount))
    ? Math.max(0, Number(pendingCount))
    : 0;
  const showBadge = normalizedCount > 0;
  const badgeLabel = normalizedCount > 99 ? '99+' : String(normalizedCount);

  dashboardLinks.forEach((link) => {
    const existing = link.querySelector('[data-dashboard-pending-badge="1"]');
    if (!showBadge) {
      if (existing) existing.remove();
      link.classList.remove('has-dashboard-badge');
      return;
    }

    if (existing) {
      link.classList.add('has-dashboard-badge');
      existing.textContent = badgeLabel;
      existing.setAttribute('aria-label', `${badgeLabel} posts awaiting approval`);
      return;
    }

    const badge = document.createElement('span');
    badge.setAttribute('data-dashboard-pending-badge', '1');
    badge.setAttribute('aria-label', `${badgeLabel} posts awaiting approval`);
    badge.className = 'dashboard-pending-badge';
    badge.textContent = badgeLabel;
    link.classList.add('has-dashboard-badge');
    link.appendChild(badge);
  });
}

function clearPendingBadgeRefreshTimer() {
  if (pendingBadgeRefreshTimer) {
    window.clearInterval(pendingBadgeRefreshTimer);
    pendingBadgeRefreshTimer = null;
  }
}

function initializeDashboardPendingBadgeLiveRefresh() {
  if (pendingBadgeRefreshTimer) return;

  const refreshIfVisible = () => {
    if (document.hidden) return;
    updateDashboardPendingBadge();
  };

  pendingBadgeRefreshTimer = window.setInterval(refreshIfVisible, PENDING_BADGE_REFRESH_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    updateDashboardPendingBadge({ force: true });
  });

  window.addEventListener('focus', () => {
    updateDashboardPendingBadge({ force: true });
  });

  if (!pendingBadgeEventsBound) {
    pendingBadgeEventsBound = true;
    window.addEventListener('dashboard-pending-count-changed', () => {
      updateDashboardPendingBadge({ force: true });
    });
  }
}

async function updateDashboardPendingBadge(options = {}) {
  const force = Boolean(options.force);
  if (pendingBadgeRequestPromise && !force) {
    return pendingBadgeRequestPromise;
  }

  const profile = await getProfile();
  const isAdmin = profile && profile.role === 'admin';
  if (!isAdmin) {
    clearPendingBadgeRefreshTimer();
    removeDashboardPendingBadges();
    return;
  }

  pendingBadgeRequestPromise = (async () => {
    try {
      const response = await fetch('/api/posts/manage/pending-count', { cache: 'no-store' });
      if (!response.ok) {
        removeDashboardPendingBadges();
        return;
      }

      const payload = await response.json().catch(() => ({}));
      const pendingCount = Number(payload?.pendingCount || 0);
      applyDashboardPendingBadge(pendingCount);
    } catch {
      removeDashboardPendingBadges();
    }
  })();

  try {
    await pendingBadgeRequestPromise;
  } finally {
    pendingBadgeRequestPromise = null;
  }
}

async function updateGuestLinks() {
  const guestLinks = document.querySelectorAll('[data-guest-only]');
  if (!guestLinks.length) return;

  const profile = await getProfile();
  guestLinks.forEach(link => {
    if (profile) {
      link.style.display = 'none';
    } else {
      link.style.display = '';
    }
  });
}

function initializeAdminSessionGuard() {
  const path = String(window.location.pathname || "");
  const isAdminArea = path.startsWith('/admin/');
  const cleanPath = path.endsWith('.html') ? path.slice(0, -5) : path;
  const isPublicAdminPage = cleanPath === '/admin/login' || cleanPath === '/admin/signup';
  if (!isAdminArea || isPublicAdminPage) return;

  const checkSession = async () => {
    try {
      const response = await fetch('/api/auth/profile', { cache: 'no-store' });
      if (!response.ok) {
        document.cookie = 'token=; Max-Age=0; path=/';
        window.location.href = '/admin/login';
      }
    } catch {
    }
  };

  checkSession();
  window.setInterval(checkSession, 60 * 1000);
}

function initializeMobileSidebar() {
  const sidebar = document.getElementById('mobile-sidebar');
  const backdrop = document.getElementById('mobile-sidebar-backdrop');
  const openButton = document.getElementById('mobile-menu-toggle');
  const closeButton = document.getElementById('mobile-sidebar-close');
  if (!sidebar || !backdrop || !openButton || !closeButton) return;
  if (openButton.dataset.sidebarBound === 'true') return;
  openButton.dataset.sidebarBound = 'true';

  const mobileQuery = window.matchMedia('(max-width: 768px)');

  const closeSidebar = () => {
    sidebar.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    backdrop.hidden = true;
    openButton.setAttribute('aria-expanded', 'false');
    sidebar.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };

  const openSidebar = () => {
    if (!mobileQuery.matches) return;
    sidebar.classList.add('is-open');
    backdrop.hidden = false;
    backdrop.classList.add('is-open');
    openButton.setAttribute('aria-expanded', 'true');
    sidebar.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };

  openButton.addEventListener('click', () => {
    if (sidebar.classList.contains('is-open')) {
      closeSidebar();
      return;
    }
    openSidebar();
  });

  closeButton.addEventListener('click', closeSidebar);
  backdrop.addEventListener('click', closeSidebar);

  if (typeof mobileQuery.addEventListener === 'function') {
    mobileQuery.addEventListener('change', closeSidebar);
  } else if (typeof mobileQuery.addListener === 'function') {
    mobileQuery.addListener(closeSidebar);
  }

  closeSidebar();
}

function toDateKey(dateValue) {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, '0');
  const day = String(dateValue.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey) {
  const text = String(dateKey || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [yearRaw, monthRaw, dayRaw] = text.split('-');
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;
  const day = Number(dayRaw);
  const parsed = new Date(year, monthIndex, day);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getFullYear() !== year || parsed.getMonth() !== monthIndex || parsed.getDate() !== day) return null;
  return parsed;
}

function createTodayEventsBanner() {
  const banner = document.createElement('section');
  banner.id = 'today-events-banner';
  banner.className = 'today-events-banner';
  banner.setAttribute('aria-live', 'polite');
  banner.hidden = true;
  banner.innerHTML = `
    <div class="today-events-banner-inner">
      <span class="today-events-label">Today</span>
      <div class="today-events-content" id="today-events-content"></div>
    </div>
  `;
  return banner;
}

function createEventLink(eventItem) {
  const slug = String(eventItem?.slug || '').trim();
  if (!slug) return null;
  const anchor = document.createElement('a');
  anchor.className = 'today-events-item';
  anchor.href = `/post?slug=${encodeURIComponent(slug)}`;
  anchor.textContent = String(eventItem?.title || 'Untitled event');
  return anchor;
}

function createEventChip(eventItem) {
  const type = String(eventItem?.type || '').trim();
  const chip = document.createElement('span');
  chip.className = 'today-events-chip';
  chip.textContent = type || 'Event';
  return chip;
}

function formatEventDateText(dateKey) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return '';
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function updateReleaseCalendarTopOffset() {
  const calendar = document.getElementById('release-calendar');
  if (!calendar) return;

  const header = document.querySelector('body > header');
  const banner = document.getElementById('today-events-banner');

  let topOffset = 96;

  if (header) {
    const headerRect = header.getBoundingClientRect();
    topOffset = Math.max(topOffset, Math.round(headerRect.bottom + 6));
  }

  if (banner && !banner.hidden) {
    const bannerRect = banner.getBoundingClientRect();
    if (bannerRect.bottom > 0) {
      topOffset = Math.max(topOffset, Math.round(bannerRect.bottom + 6));
    }
  }

  const nextValue = `${topOffset}px`;
  if (document.documentElement.style.getPropertyValue('--release-calendar-top') !== nextValue) {
    document.documentElement.style.setProperty('--release-calendar-top', nextValue);
  }
}

let releaseCalendarTopOffsetFrame = null;
function scheduleReleaseCalendarTopOffsetUpdate() {
  if (releaseCalendarTopOffsetFrame !== null) return;
  releaseCalendarTopOffsetFrame = requestAnimationFrame(() => {
    releaseCalendarTopOffsetFrame = null;
    updateReleaseCalendarTopOffset();
  });
}

function renderTodayEventsBanner(events) {
  const header = document.querySelector('body > header');
  if (!header) return;

  clearTodayEventsRotationTimer();

  let banner = document.getElementById('today-events-banner');
  if (!banner) {
    banner = createTodayEventsBanner();
    header.insertAdjacentElement('afterend', banner);
  }

  const content = banner.querySelector('#today-events-content');
  const bannerLabel = banner.querySelector('.today-events-label');
  if (!content) return;

  const list = Array.isArray(events) ? events : [];
  const now = new Date();
  const todayKey = toDateKey(now);
  const todayDate = parseDateKey(todayKey);

  const normalized = list
    .map(item => ({
      title: String(item?.title || '').trim(),
      slug: String(item?.slug || '').trim(),
      type: String(item?.type || '').trim(),
      date: String(item?.date || '').trim()
    }))
    .filter(item => item.title && item.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const todaysEvents = normalized.filter(item => item.date === todayKey);
  const nextEvent = normalized.find(item => {
    const parsed = parseDateKey(item.date);
    return parsed && todayDate && parsed > todayDate;
  });

  content.innerHTML = '';

  if (todaysEvents.length) {
    if (bannerLabel) bannerLabel.textContent = 'Today';
    const intro = document.createElement('span');
    intro.className = 'today-events-intro';
    intro.textContent = `${todaysEvents.length} upcoming ${todaysEvents.length === 1 ? 'event' : 'events'}:`;
    content.appendChild(intro);

    const eventWrap = document.createElement('span');
    eventWrap.className = 'today-events-entry';
    content.appendChild(eventWrap);

    const dateHint = document.createElement('span');
    dateHint.className = 'today-events-date';
    content.appendChild(dateHint);

    const setActiveEvent = (eventItem) => {
      eventWrap.innerHTML = '';
      const eventLink = createEventLink(eventItem);

      if (eventLink) {
        eventWrap.appendChild(eventLink);
      } else {
        const label = document.createElement('span');
        label.className = 'today-events-item';
        label.textContent = eventItem.title;
        eventWrap.appendChild(label);
      }

      eventWrap.appendChild(createEventChip(eventItem));

      const formattedDate = formatEventDateText(eventItem.date);
      dateHint.textContent = formattedDate;
      dateHint.hidden = !formattedDate;
    };

    let activeEventIndex = 0;
    setActiveEvent(todaysEvents[activeEventIndex]);

    if (todaysEvents.length > 1) {
      todayEventsRotationTimer = setInterval(() => {
        const isConnected = document.body.contains(eventWrap);
        if (!isConnected) {
          clearTodayEventsRotationTimer();
          return;
        }

        activeEventIndex = (activeEventIndex + 1) % todaysEvents.length;
        setActiveEvent(todaysEvents[activeEventIndex]);
      }, TODAY_EVENTS_ROTATION_MS);
    }

    banner.hidden = false;
    scheduleReleaseCalendarTopOffsetUpdate();
    return;
  }

  if (nextEvent) {
    if (bannerLabel) bannerLabel.textContent = 'Upcoming';
    const intro = document.createElement('span');
    intro.className = 'today-events-intro';
    intro.textContent = 'Upcoming event:';
    content.appendChild(intro);

    const nextWrap = document.createElement('span');
    nextWrap.className = 'today-events-entry';
    const link = createEventLink(nextEvent);
    if (link) {
      nextWrap.appendChild(link);
    } else {
      const text = document.createElement('span');
      text.className = 'today-events-item';
      text.textContent = nextEvent.title;
      nextWrap.appendChild(text);
    }
    nextWrap.appendChild(createEventChip(nextEvent));
    content.appendChild(nextWrap);

    const formattedNextDate = formatEventDateText(nextEvent.date);
    if (formattedNextDate) {
      const dateHint = document.createElement('span');
      dateHint.className = 'today-events-date';
      dateHint.textContent = formattedNextDate;
      content.appendChild(dateHint);
    }

    banner.hidden = false;
    scheduleReleaseCalendarTopOffsetUpdate();
    return;
  }

  if (bannerLabel) bannerLabel.textContent = 'Upcoming';
  const intro = document.createElement('span');
  intro.className = 'today-events-intro';
  intro.textContent = 'No upcoming events right now.';
  content.appendChild(intro);

  banner.hidden = false;
  scheduleReleaseCalendarTopOffsetUpdate();
}

async function initializeTodayEventsBanner() {
  clearTodayEventsRotationTimer();
  const existingBanner = document.getElementById('today-events-banner');
  if (existingBanner) {
    existingBanner.remove();
  }
  scheduleReleaseCalendarTopOffsetUpdate();
}

function ensureFooterNewsletterBlock() {
  // Place newsletter as a standalone section just above the footer
  if (document.getElementById('newsletter-section')) return;

  const footer = document.querySelector('.site-footer');
  if (!footer) return;

  var isEnglish = currentUiLanguage === 'en';
  var titleText = '📬 Newsletter';
  var placeholder = isEnglish ? 'Your email...' : 'Το email σας...';
  var btnText = isEnglish ? 'Subscribe' : 'Εγγραφή';
  var linkText = isEnglish ? 'Visit our website' : 'Επισκεφθείτε την ιστοσελίδα μας';
  var arrowSvg = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.22 14.78a.75.75 0 0 0 1.06 0l7.22-7.22v5.69a.75.75 0 0 0 1.5 0v-7.5a.75.75 0 0 0-.75-.75h-7.5a.75.75 0 0 0 0 1.5h5.69l-7.22 7.22a.75.75 0 0 0 0 1.06z" clip-rule="evenodd"/></svg>';

  const section = document.createElement('section');
  section.className = 'newsletter-section';
  section.id = 'newsletter-section';
  section.innerHTML =
    '<div class="newsletter-inner">' +
      '<span class="newsletter-title">' + titleText + '</span>' +
      '<form class="newsletter-form" id="newsletter-form">' +
        '<input type="email" name="email" placeholder="' + placeholder + '" required autocomplete="email" />' +
        '<button type="submit">' + btnText + '</button>' +
      '</form>' +
      '<span class="newsletter-status" id="newsletter-status"></span>' +
    '</div>' +
    '<a class="newsletter-website-link" href="https://www.ekdoseis-tsotras.gr/" target="_blank" rel="noopener noreferrer">' + linkText + ' ' + arrowSvg + '</a>';
  footer.parentNode.insertBefore(section, footer);

  // Remove any leftover newsletter block inside the footer
  footer.querySelectorAll('.footer-newsletter').forEach(function (el) { el.remove(); });
}

function initializeGlobalNewsletterCapture() {
  ensureFooterNewsletterBlock();

  const form = document.getElementById('newsletter-form');
  const statusEl = document.getElementById('newsletter-status');
  if (!form || !statusEl) return;

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
        var errMsg = currentUiLanguage === 'en'
          ? (data.error || 'Something went wrong. Try again.')
          : (data.error || 'Κάτι πήγε στραβά. Δοκιμάστε ξανά.');
        statusEl.textContent = errMsg;
        statusEl.classList.add('is-error');
        return;
      }

      if (data.alreadySubscribed) {
        statusEl.textContent = currentUiLanguage === 'en' ? 'You are already subscribed!' : 'Είστε ήδη εγγεγραμμένοι!';
        statusEl.classList.add('is-success');
      } else {
        statusEl.textContent = currentUiLanguage === 'en' ? 'Thank you for subscribing!' : 'Ευχαριστούμε για την εγγραφή σας!';
        statusEl.classList.add('is-success');
        form.reset();
      }
    } catch (_) {
      statusEl.textContent = currentUiLanguage === 'en' ? 'Could not connect. Try again.' : 'Δεν ήταν δυνατή η σύνδεση. Δοκιμάστε ξανά.';
      statusEl.classList.add('is-error');
    }
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  const host = String(window.location.hostname || '').toLowerCase();
  const isIpv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
  const isPrivateIpv4 = isIpv4 && (
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    host === '127.0.0.1'
  );
  const isDevelopmentHost = host === 'localhost' || host.endsWith('.local') || isPrivateIpv4;

  if (isDevelopmentHost) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.getRegistrations()
        .then(registrations => Promise.all(registrations.map(reg => reg.unregister())))
        .catch(() => {});

      if (window.caches?.keys) {
        window.caches.keys()
          .then(keys => Promise.all(keys.map(key => window.caches.delete(key))))
          .catch(() => {});
      }
    });
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

function parseDataClickExpression(expression) {
  const raw = String(expression || '').trim().replace(/;$/, '');
  if (!raw) return null;

  const noArgMatch = raw.match(/^([A-Za-z_$][\w$]*)\(\)$/);
  if (noArgMatch) {
    return { fnName: noArgMatch[1], arg: undefined };
  }

  const decodeArgMatch = raw.match(/^([A-Za-z_$][\w$]*)\(\s*decodeURIComponent\(\s*(['"])([\s\S]*)\2\s*\)\s*\)$/);
  if (decodeArgMatch) {
    try {
      return {
        fnName: decodeArgMatch[1],
        arg: decodeURIComponent(decodeArgMatch[3])
      };
    } catch {
      return null;
    }
  }

  const simpleArgMatch = raw.match(/^([A-Za-z_$][\w$]*)\(\s*(['"])([\s\S]*)\2\s*\)$/);
  if (simpleArgMatch) {
    return { fnName: simpleArgMatch[1], arg: simpleArgMatch[3] };
  }

  return null;
}

function initializeDataClickDelegation() {
  document.addEventListener('click', async (event) => {
    const target = event.target && event.target.closest ? event.target.closest('[data-click]') : null;
    if (!target) return;

    const parsed = parseDataClickExpression(target.getAttribute('data-click'));
    if (!parsed?.fnName) return;

    const handler = window[parsed.fnName];
    if (typeof handler !== 'function') return;

    event.preventDefault();
    if (parsed.arg === undefined) {
      await handler.call(window);
      return;
    }

    await handler.call(window, parsed.arg);
  });
}

function initializeContactPopup() {
  if (document.getElementById('contact-fab')) return;

  function isContactPopupDismissed() {
    try {
      return localStorage.getItem(CONTACT_POPUP_DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  }

  function markContactPopupDismissed() {
    try {
      localStorage.setItem(CONTACT_POPUP_DISMISSED_KEY, '1');
    } catch {
    }
  }

  // Floating Action Button
  const fab = document.createElement('button');
  fab.id = 'contact-fab';
  fab.className = 'contact-fab';
  fab.type = 'button';
  fab.setAttribute('aria-label', 'Επικοινωνία');
  fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" width="26" height="26" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  document.body.appendChild(fab);

  // Popup overlay
  const overlay = document.createElement('div');
  overlay.id = 'contact-popup-overlay';
  overlay.className = 'contact-popup-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="contact-popup" role="dialog" aria-modal="true" aria-labelledby="contact-popup-title">
      <button type="button" class="contact-popup-close" id="contact-popup-close" aria-label="Κλείσιμο">&times;</button>
      <div class="contact-popup-header">
        <img src="/assets/tsotras-logo.jpg" alt="ΕΚΔΟΣΕΙΣ ΤΣΟΤΡΑΣ" class="contact-popup-logo" />
        <h3 id="contact-popup-title">Επικοινωνήστε μαζί μας</h3>
      </div>
      <p class="contact-popup-message">Θέλετε να εκδώσετε ή να αγοράσετε κάποιο βιβλίο;</p>
      <div class="contact-popup-items">
        <a href="tel:+302107470789" class="contact-popup-item">
          <span class="contact-popup-icon">
            <svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
          <span class="contact-popup-detail">
            <small>Τηλέφωνο</small>
            <strong>210 7470 789</strong>
          </span>
        </a>
        <a href="mailto:info@ekdoseis-tsotras.gr" class="contact-popup-item">
          <span class="contact-popup-icon">
            <svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M3 6.5h18v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-11z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 6.5L12 13 3 6.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
          <span class="contact-popup-detail">
            <small>Email</small>
            <strong>info@ekdoseis-tsotras.gr</strong>
          </span>
        </a>
        <a href="https://www.ekdoseis-tsotras.gr/" target="_blank" rel="noopener noreferrer" class="contact-popup-item">
          <span class="contact-popup-icon">
            <svg viewBox="0 0 24 24" fill="none" width="20" height="20"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
          <span class="contact-popup-detail">
            <small>Ιστοσελίδα</small>
            <strong>www.ekdoseis-tsotras.gr</strong>
          </span>
        </a>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  function openContactPopup() {
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeContactPopup() {
    overlay.hidden = true;
    document.body.style.overflow = '';
    markContactPopupDismissed();
  }

  fab.addEventListener('click', openContactPopup);
  overlay.querySelector('#contact-popup-close').addEventListener('click', closeContactPopup);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeContactPopup();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) closeContactPopup();
  });

  if (!isContactPopupDismissed()) {
    openContactPopup();
  }
}

[
  updateAuthLinks,
  updateStaffLinks,
  updateGuestLinks,
  initializeAdminSessionGuard,
  initializeMobileSidebar,
  initializeTodayEventsBanner,
  scheduleReleaseCalendarTopOffsetUpdate,
  initializeCookiePreferences,
  initializeGlobalNewsletterCapture,
  registerServiceWorker,
  initializeDataClickDelegation,
  initializeContactPopup,
].forEach(function (fn) {
  try { fn(); } catch (e) { console.error('[theme] ' + fn.name + ' failed:', e); }
});
