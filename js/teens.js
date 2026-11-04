/* TREV AI Teens Scholarship sign-up: places counter, checks and submission. */
(() => {
  'use strict';

  const config = window.TREV_CONFIG;
  const form = document.getElementById('teensForm');
  if (!config || !config.teens || !form) return;

  const teens = config.teens;
  const message = document.getElementById('teensMessage');
  const submitButton = document.getElementById('teensSubmit');
  const placesBox = document.getElementById('teensPlaces');
  const placesText = document.getElementById('teensPlacesText');
  const success = document.getElementById('teensSuccess');
  let requestPending = false;
  let lastAttempt = null;
  let placesLeft = null;

  const closesAt = new Date(teens.closesAt).getTime();
  const firstClass = new Date(teens.firstClass);

  const setState = (open, reason) => {
    document.querySelectorAll('[data-teens-open]').forEach((el) => { el.hidden = !open; });
    document.querySelectorAll('[data-teens-closed]').forEach((el) => { el.hidden = open; });
    if (!open && reason === 'closed') {
      document.getElementById('teensClosedTag').textContent = 'Registration closed';
      document.getElementById('teensClosedTitle').textContent = 'Registration for this Teens class has closed.';
      document.getElementById('teensClosedText').textContent = 'Message us to join the list for the next Teens class. Please do not make a transfer.';
    }
  };

  const showPlaces = (left, open) => {
    placesLeft = left;
    placesBox.classList.toggle('is-full', !open);
    placesBox.classList.toggle('is-low', open && left <= 5);
    placesText.textContent = !open
      ? (left <= 0 ? 'All 20 places are taken' : 'Registration has closed')
      : `${left} of ${teens.capacity} places left · first come, first served`;
  };

  // JSONP: the Apps Script web app does not send CORS headers.
  const loadPlaces = () => new Promise((resolve) => {
    const callback = `teensPlaces_${Date.now()}`;
    const script = document.createElement('script');
    const timer = window.setTimeout(() => finish(null), 12000);
    function finish(data) {
      window.clearTimeout(timer);
      delete window[callback];
      script.remove();
      resolve(data);
    }
    window[callback] = (data) => finish(data);
    script.onerror = () => finish(null);
    script.src = `${config.appsScriptUrl}?action=teensplaces&callback=${callback}`;
    document.head.appendChild(script);
  });

  const refreshPlaces = async () => {
    if (Date.now() > closesAt) { showPlaces(0, false); setState(false, 'closed'); return; }
    const data = await loadPlaces();
    if (!data || data.ok !== true) {
      placesText.textContent = `Only ${teens.capacity} places · first come, first served`;
      setState(true);
      return;
    }
    showPlaces(Number(data.left) || 0, data.open === true);
    setState(data.open === true, Number(data.left) > 0 ? 'closed' : 'full');
  };

  // Bank details from config, with copy button.
  const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  setText('bankName', config.bank.name);
  setText('accountName', config.bank.accountName);
  setText('accountNumber', config.bank.accountNumber);
  document.querySelectorAll('[data-copy]').forEach((button) => {
    button.dataset.copy = config.bank.accountNumber;
    button.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(button.dataset.copy); } catch (_) { /* older browsers */ }
      const original = button.textContent;
      button.textContent = 'Copied';
      window.setTimeout(() => { button.textContent = original; }, 1500);
    });
  });

  const text = (value, max) => String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);
  const phone = (value) => value.replace(/[^0-9+]/g, '').slice(0, 20);

  const ageOn = (dob, date) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob || '');
    if (!match) return null;
    let age = date.getFullYear() - Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (date.getMonth() + 1 < month || (date.getMonth() + 1 === month && date.getDate() < day)) age -= 1;
    return age;
  };

  const rules = {
    parentName: (v) => (text(v, 100).length >= 2 && /\p{L}/u.test(v) ? '' : 'Enter your full name.'),
    email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text(v, 120).toLowerCase()) ? '' : 'Enter a complete email address. The access code is sent here.'),
    whatsapp: (v) => {
      const digits = phone(v).replace(/\D/g, '');
      return digits.length >= 7 && digits.length <= 15 ? '' : 'Enter your WhatsApp number with the country code, for example +234 801 234 5678.';
    },
    childName: (v) => (text(v, 100).length >= 2 && /\p{L}/u.test(v) ? '' : 'Enter your child\'s full name as it should appear on the certificate.'),
    childDob: (v) => {
      const age = ageOn(v, firstClass);
      if (age === null) return 'Enter your child\'s date of birth.';
      if (age < teens.minAge || age > teens.maxAge) return `The scholarship is for ages ${teens.minAge} to ${teens.maxAge} on 14 November 2026. Your child will be ${age}.`;
      return '';
    },
    schoolClass: (v) => (v ? '' : 'Choose your child\'s school class.'),
    paymentReference: (v) => (text(v, 120).length >= 3 ? '' : 'Enter the transfer reference or the name on the sending account.'),
    aiConsent: (_, el) => (el.checked ? '' : 'Tick this box to give permission for your child to take part.'),
    consent: (_, el) => (el.checked ? '' : 'Tick this box to confirm your details and accept the policies.')
  };

  const setFieldError = (el, msg) => {
    const slot = el.closest('.form-group') || el.closest('label') || el.parentElement;
    const id = `${el.id}-error`;
    let error = document.getElementById(id);
    if (!msg) { el.removeAttribute('aria-invalid'); if (error) error.remove(); return; }
    el.setAttribute('aria-invalid', 'true');
    if (!error) {
      error = document.createElement('span');
      error.id = id;
      error.className = 'field-error';
      slot.insertAdjacentElement(slot.tagName === 'LABEL' ? 'afterend' : 'beforeend', error);
      el.setAttribute('aria-describedby', id);
    }
    error.textContent = msg;
  };

  const check = (name) => {
    const el = document.getElementById(name);
    const msg = rules[name](el.value, el);
    setFieldError(el, msg);
    return !msg;
  };

  Object.keys(rules).forEach((name) => {
    const el = document.getElementById(name);
    el.addEventListener('blur', () => { if (el.value || el.type === 'checkbox') check(name); });
    el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => {
      if (el.getAttribute('aria-invalid') === 'true') check(name);
    });
  });

  const showMessage = (msg, type = 'error') => {
    message.textContent = msg;
    message.className = `form-message ${type}`;
    message.hidden = false;
  };

  const registrationId = () => {
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    return `TREV-${stamp}-${values[0].toString(36).toUpperCase().slice(-5).padStart(5, '0')}`;
  };

  const setLoading = (loading) => {
    requestPending = loading;
    Array.from(form.elements).forEach((el) => { el.disabled = loading; });
    submitButton.innerHTML = loading
      ? '<span class="spinner" aria-hidden="true"></span><span>Sending…</span>'
      : '<span>Register my child</span><span aria-hidden="true">→</span>';
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.hidden = true;
    if (requestPending) return;

    const invalid = Object.keys(rules).filter((name) => !check(name));
    if (invalid.length) {
      showMessage(invalid.length === 1 ? 'Please fix the highlighted field.' : `Please fix the ${invalid.length} highlighted fields.`);
      document.getElementById(invalid[0]).focus();
      return;
    }
    if (placesLeft === 0 || Date.now() > closesAt) {
      showMessage('Sorry, there are no places left. Please do not make a transfer.');
      return;
    }

    const details = {
      parentName: text(document.getElementById('parentName').value, 100),
      email: text(document.getElementById('email').value, 120).toLowerCase(),
      whatsapp: phone(document.getElementById('whatsapp').value),
      childName: text(document.getElementById('childName').value, 100),
      childDob: document.getElementById('childDob').value,
      schoolClass: document.getElementById('schoolClass').value,
      country: 'Nigeria',
      packageKey: teens.key,
      paymentReference: text(document.getElementById('paymentReference').value, 120),
      aiConsent: document.getElementById('aiConsent').checked ? 'true' : 'false',
      photoConsent: document.getElementById('photoConsent').checked ? 'true' : 'false',
      consent: document.getElementById('consent').checked ? 'true' : 'false',
      website: text(document.getElementById('website').value, 200)
    };
    // Reuse the same reference if the parent presses Submit twice with the same details.
    const fingerprint = new URLSearchParams(details).toString();
    if (!lastAttempt || lastAttempt.fingerprint !== fingerprint) lastAttempt = { fingerprint, id: registrationId() };

    setLoading(true);
    showMessage('Sending your registration securely…', 'success');
    try {
      await fetch(config.appsScriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({ action: 'register', registrationId: lastAttempt.id, ...details }).toString()
      });
      document.getElementById('teensReference').textContent = lastAttempt.id;
      document.getElementById('teensSupportLink').href = `https://wa.me/${config.supportWhatsApp}?text=${encodeURIComponent(
        `Hello TREV AI. I registered ${details.childName} for the Teens Scholarship. Reference ${lastAttempt.id}, payment reference ${details.paymentReference}.`)}`;
      form.hidden = true;
      form.removeAttribute('data-teens-open');
      const heading = document.getElementById('teensFormHeading');
      heading.hidden = true;
      heading.removeAttribute('data-teens-open');
      success.hidden = false;
      success.focus();
      window.scrollTo({ top: success.getBoundingClientRect().top + window.scrollY - 120, behavior: 'smooth' });
    } catch (_) {
      showMessage(navigator.onLine === false
        ? 'You appear to be offline, so the registration was not sent. Reconnect and press the button again. Do not pay again.'
        : 'We could not send your registration. Press the button again in a moment. If it still fails, message us on WhatsApp. Do not pay again.');
      setLoading(false);
    }
  });

  refreshPlaces();
})();
