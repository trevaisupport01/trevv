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

  const validate = () => {
    if (!form.reportValidity()) return false;

    if (normalizeText(document.getElementById('fullName').value, 100).length < 2) {
      showMessage('Please enter your full name using at least two characters.');
      document.getElementById('fullName').focus();
      return false;
    }

    if (!normalizeText(document.getElementById('country').value, 60)) {
      showMessage('Please enter your country.');
      document.getElementById('country').focus();
      return false;
    }

    const email = normalizeText(document.getElementById('email').value, 120).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showMessage('Please enter a valid email address, such as you@example.com.');
      document.getElementById('email').focus();
      return false;
    }

    const phone = normalizePhone(document.getElementById('whatsapp').value);
    if (phone.replace(/\D/g, '').length < 7) {
      showMessage('Please enter a valid WhatsApp number, including the country code.');
      document.getElementById('whatsapp').focus();
      return false;
    }

    if (normalizeText(document.getElementById('paymentReference').value, 120).length < 3) {
      showMessage('Enter the transfer reference or sender name so we can verify your payment.');
      document.getElementById('paymentReference').focus();
      return false;
    }

    return true;
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
      showMessage('We could not confirm your registration. Check your connection and contact support if you have already paid. Do not make another payment.');
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

