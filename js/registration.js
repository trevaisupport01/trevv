(() => {
  'use strict';

  const config = window.TREV_CONFIG;
  const form = document.getElementById('registrationForm');
  const packageSelect = document.getElementById('package');
  const packageName = document.getElementById('selectedPackageName');
  const packagePrice = document.getElementById('selectedPackagePrice');
  const amountDue = document.getElementById('amountDue');
  const formMessage = document.getElementById('registrationMessage');
  const submitButton = document.getElementById('registrationSubmit');
  const successPanel = document.getElementById('registrationSuccess');
  const successReference = document.getElementById('successReference');
  const supportLink = document.getElementById('registrationSupportLink');

  if (!config || !form || !packageSelect) return;

  const cohort = config.cohort || {};
  const closesAt = new Date(cohort.closesAt || '2026-11-06T23:59:59.999+01:00').getTime();
  let requestPending = false;
  let requestSent = false;
  let lastAttempt = null;
  const isEnrollmentOpen = () => window.TREV_ENROLLMENT
    ? window.TREV_ENROLLMENT.isOpen()
    : Date.now() <= closesAt;

  const applyEnrollmentState = () => {
    const open = isEnrollmentOpen();
    if (window.TREV_ENROLLMENT) {
      window.TREV_ENROLLMENT.apply(document);
    } else {
      document.querySelectorAll('[data-enrollment-open]').forEach((element) => { element.hidden = !open; });
      document.querySelectorAll('[data-enrollment-closed]').forEach((element) => { element.hidden = open; });
    }
    if (requestSent) form.hidden = true;
    Array.from(form.elements).forEach((element) => { element.disabled = !open || requestPending || requestSent; });
    return open;
  };

  const endpointIsConfigured = () =>
    /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(config.appsScriptUrl);

  const isEarlyBird = () => config.pricing.earlyBirdEnabled === true && Date.now() <= new Date(config.pricing.earlyBirdEnds).getTime();
  const getPackage = () => {
    const base = config.packages[packageSelect.value] || config.packages.professional;
    const early = isEarlyBird();
    return { ...base, price: early ? base.earlyPrice : base.normalPrice, usd: early ? base.earlyUsd : base.normalUsd, early };
  };

  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };

  const updatePackageSummary = () => {
    const selected = getPackage();
    packageName.textContent = selected.label;
    packagePrice.textContent = selected.price;
    amountDue.textContent = selected.price;
    document.querySelectorAll('[data-pricing-phase]').forEach((element) => {
      element.textContent = selected.early ? 'Early-bird price' : 'Standard price';
    });
  };

  const updatePackageOptions = () => {
    const early = isEarlyBird();
    Object.entries(config.packages).forEach(([value, item]) => {
      const option = packageSelect.querySelector(`option[value="${value}"]`);
      if (option) option.textContent = `${item.label} — ${early ? item.earlyPrice : item.normalPrice}`;
    });
  };

  const selectPackageFromUrl = () => {
    const requested = new URLSearchParams(window.location.search).get('package');
    const aliases = { vip: 'vip-seat', starter: 'starter', professional: 'professional' };
    const value = aliases[requested] || requested;
    if (value && config.packages[value]) packageSelect.value = value;
    updatePackageSummary();
  };

  const copyText = async (value, button) => {
    const original = button.textContent;
    try {
      await navigator.clipboard.writeText(value);
      button.textContent = 'Copied';
    } catch (_) {
      const temporary = document.createElement('textarea');
      temporary.value = value;
      temporary.setAttribute('readonly', '');
      temporary.style.position = 'fixed';
      temporary.style.opacity = '0';
      document.body.appendChild(temporary);
      temporary.select();
      document.execCommand('copy');
      temporary.remove();
      button.textContent = 'Copied';
    }
    window.setTimeout(() => { button.textContent = original; }, 1500);
  };

  document.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', () => copyText(button.dataset.copy, button));
  });

  setText('bankName', config.bank.name);
  setText('accountName', config.bank.accountName);
  setText('accountNumber', config.bank.accountNumber);
  document.querySelectorAll('[data-account-number]').forEach((button) => {
    button.dataset.copy = config.bank.accountNumber;
  });

  const showMessage = (message, type = 'error') => {
    formMessage.textContent = message;
    formMessage.className = `form-message ${type}`;
    formMessage.hidden = false;
  };

  const createRegistrationId = () => {
    const date = new Date();
    const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    let random = '';
    if (window.crypto && window.crypto.getRandomValues) {
      const values = new Uint32Array(1);
      window.crypto.getRandomValues(values);
      random = values[0].toString(36).toUpperCase().slice(-5).padStart(5, '0');
    } else {
      random = Math.random().toString(36).slice(2, 7).toUpperCase();
    }
    return `TREV-${stamp}-${random}`;
  };

  const normalizePhone = (value) => value.replace(/[^0-9+]/g, '').slice(0, 20);
  const normalizeText = (value, maxLength) => String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, maxLength);

  // Field-by-field rules. Each returns an error message, or '' when valid.
  const rules = {
    fullName: (value) => {
      const name = normalizeText(value, 100);
      if (!name) return 'Enter your full name.';
      if (name.length < 2 || !/\p{L}/u.test(name)) return 'Enter your full name using letters, as it appears on your bank transfer.';
      return '';
    },
    country: (value) => (normalizeText(value, 60) ? '' : 'Enter your country.'),
    email: (value) => {
      const email = normalizeText(value, 120).toLowerCase();
      if (!email) return 'Enter your email address. Your access code will be sent here.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return 'Enter a complete email address, such as you@example.com.';
      return '';
    },
    whatsapp: (value) => {
      const digits = normalizePhone(value).replace(/\D/g, '');
      if (!digits) return 'Enter your WhatsApp number. We send your access code here too.';
      if (digits.length < 7 || digits.length > 15) return 'Enter a WhatsApp number with 7 to 15 digits, including your country code (for example +234 801 234 5678).';
      return '';
    },
    paymentReference: (value) => (normalizeText(value, 120).length >= 3
      ? ''
      : 'Enter the transfer reference or the name on the sending account, so we can match your payment.'),
    consent: (_, element) => (element.checked ? '' : 'Tick this box to confirm your details and accept the policies.')
  };

  // Common misspellings of popular email providers.
  const domainFixes = {
    'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmail.co': 'gmail.com',
    'gmail.con': 'gmail.com', 'gmaill.com': 'gmail.com', 'gnail.com': 'gmail.com', 'yaho.com': 'yahoo.com',
    'yahoo.co': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'hotmial.com': 'hotmail.com', 'hotmail.co': 'hotmail.com',
    'outlok.com': 'outlook.com', 'outlook.co': 'outlook.com', 'iclod.com': 'icloud.com'
  };

  const errorSlot = (element) => element.closest('.form-group') || element.closest('label') || element.parentElement;

  const setFieldError = (element, message) => {
    const slot = errorSlot(element);
    const id = `${element.id}-error`;
    let error = document.getElementById(id);
    if (!message) {
      element.removeAttribute('aria-invalid');
      if (error) error.remove();
      element.setAttribute('aria-describedby', (element.getAttribute('aria-describedby') || '').replace(id, '').trim());
      if (!element.getAttribute('aria-describedby')) element.removeAttribute('aria-describedby');
      return;
    }
    element.setAttribute('aria-invalid', 'true');
    if (!error) {
      error = document.createElement('span');
      error.id = id;
      error.className = 'field-error';
      slot.insertAdjacentElement(slot.tagName === 'LABEL' ? 'afterend' : 'beforeend', error);
      const described = element.getAttribute('aria-describedby') || '';
      if (!described.includes(id)) element.setAttribute('aria-describedby', `${described} ${id}`.trim());
    }
    error.textContent = message;
  };

  const showEmailSuggestion = () => {
    const input = document.getElementById('email');
    const id = 'email-hint';
    const existing = document.getElementById(id);
    if (existing) existing.remove();
    const value = normalizeText(input.value, 120).toLowerCase();
    const at = value.lastIndexOf('@');
    if (at < 1) return;
    const fix = domainFixes[value.slice(at + 1)];
    if (!fix) return;
    const suggestion = `${value.slice(0, at)}@${fix}`;
    const hint = document.createElement('span');
    hint.id = id;
    hint.className = 'field-hint';
    hint.append('Did you mean ');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = suggestion;
    button.addEventListener('click', () => { input.value = suggestion; hint.remove(); input.focus(); });
    hint.append(button, '?');
    errorSlot(input).appendChild(hint);
  };

  const checkField = (name) => {
    const element = document.getElementById(name);
    if (!element || !rules[name]) return true;
    const message = rules[name](element.value, element);
    setFieldError(element, message);
    return !message;
  };

  Object.keys(rules).forEach((name) => {
    const element = document.getElementById(name);
    if (!element) return;
    // Check when the visitor leaves a field, then live once it has an error.
    element.addEventListener('blur', () => {
      if (element.value || element.type === 'checkbox') checkField(name);
      if (name === 'email') showEmailSuggestion();
    });
    element.addEventListener(element.type === 'checkbox' ? 'change' : 'input', () => {
      if (element.getAttribute('aria-invalid') === 'true') checkField(name);
    });
  });

  const validate = () => {
    const invalid = Object.keys(rules).filter((name) => !checkField(name));
    if (!invalid.length) return true;
    showMessage(invalid.length === 1
      ? 'Please fix the highlighted field before submitting.'
      : `Please fix the ${invalid.length} highlighted fields before submitting.`);
    document.getElementById(invalid[0]).focus();
    return false;
  };

  const setLoading = (loading) => {
    requestPending = loading;
    applyEnrollmentState();
    submitButton.innerHTML = loading
      ? '<span class="spinner" aria-hidden="true"></span><span>Submitting…</span>'
      : '<span>Submit Registration</span><span aria-hidden="true">→</span>';
  };

  packageSelect.addEventListener('change', updatePackageSummary);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    formMessage.hidden = true;

    if (requestPending || requestSent) return;
    if (!applyEnrollmentState()) return;

    if (!validate()) return;

    if (!endpointIsConfigured()) {
      showMessage('Registration is temporarily unavailable. Please contact support before making a payment.');
      return;
    }

    const selected = getPackage();
    const details = {
      fullName: normalizeText(document.getElementById('fullName').value, 100),
      email: normalizeText(document.getElementById('email').value, 120).toLowerCase(),
      whatsapp: normalizePhone(document.getElementById('whatsapp').value),
      country: normalizeText(document.getElementById('country').value, 60),
      packageKey: selected.key,
      paymentReference: normalizeText(document.getElementById('paymentReference').value, 120),
      consent: document.getElementById('consent').checked ? 'true' : 'false',
      website: normalizeText(document.getElementById('website').value, 200)
    };
    // Keep retries idempotent if the previous request reached the server but its
    // response was lost. Personal details stay only in this page's memory.
    const fingerprint = new URLSearchParams(details).toString();
    if (!lastAttempt || lastAttempt.fingerprint !== fingerprint) {
      lastAttempt = { fingerprint, registrationId: createRegistrationId() };
    }
    const registrationId = lastAttempt.registrationId;
    const data = new URLSearchParams({
      action: 'register',
      registrationId,
      ...details
    });

    setLoading(true);
    showMessage('Submitting your registration securely…', 'success');

    try {
      const response = await fetch(config.appsScriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: data.toString()
      });

      // The existing Apps Script endpoint returns an opaque cross-origin response.
      // Only a readable acknowledgement can confirm that the backend saved it.
      let received = false;
      if (response.type !== 'opaque') {
        if (!response.ok) throw new Error('Registration was not accepted.');
        const result = await response.json();
        if (result.ok !== true) throw new Error('Registration was not accepted.');
        received = true;
      }

      successReference.textContent = registrationId;
      setText('registrationOutcome', received ? 'Registration received' : 'Registration request sent');
      setText('registrationReceiptMessage', received
        ? 'Your registration and payment details have been received. Allow approximately 10 minutes for payment verification and delivery of your personal access code by email and WhatsApp.'
        : 'Your registration request has been sent. Check your email for confirmation that it was received. Allow approximately 10 minutes for payment verification and delivery of your personal access code by email and WhatsApp.');
      const whatsappText = encodeURIComponent(
        `Hello TREV AI Support. I submitted registration ${registrationId} for the ${selected.label} (${selected.price}). My payment reference is ${document.getElementById('paymentReference').value.trim()}.`
      );
      supportLink.href = `https://wa.me/${config.supportWhatsApp}?text=${whatsappText}`;
      requestSent = true;
      requestPending = false;
      form.removeAttribute('data-enrollment-open');
      form.hidden = true;
      const formHeading = document.getElementById('registrationFormHeading');
      if (formHeading) {
        formHeading.removeAttribute('data-enrollment-open');
        formHeading.hidden = true;
      }
      successPanel.hidden = false;
      successPanel.focus();
      window.scrollTo({ top: successPanel.offsetTop - 120, behavior: 'smooth' });
    } catch (_) {
      showMessage(navigator.onLine === false
        ? 'You appear to be offline, so your registration was not sent. Reconnect and press Submit again. Do not make another payment.'
        : 'We could not confirm your registration. Press Submit again in a moment. If it still fails and you have already paid, contact support on WhatsApp. Do not make another payment.');
      setLoading(false);
    }
  });

  updatePackageOptions();
  selectPackageFromUrl();
  applyEnrollmentState();
  const remaining = closesAt - Date.now();
  if (remaining >= 0 && remaining < 2147483647) {
    window.setTimeout(applyEnrollmentState, remaining + 1);
  }
})();

