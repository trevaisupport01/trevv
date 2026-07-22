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

  const endpointIsConfigured = () =>
    /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(config.appsScriptUrl);

  const getPackage = () => config.packages[packageSelect.value] || config.packages.professional;

  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };

  const updatePackageSummary = () => {
    const selected = getPackage();
    packageName.textContent = selected.label;
    packagePrice.textContent = selected.price;
    amountDue.textContent = selected.price;
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

  const validate = () => {
    if (!form.reportValidity()) return false;

    const phone = normalizePhone(document.getElementById('whatsapp').value);
    if (phone.replace(/\D/g, '').length < 7) {
      showMessage('Please enter a valid WhatsApp number, including the country code.');
      document.getElementById('whatsapp').focus();
      return false;
    }

    if (document.getElementById('paymentReference').value.trim().length < 3) {
      showMessage('Enter the transfer reference or sender name so we can verify your payment.');
      document.getElementById('paymentReference').focus();
      return false;
    }

    return true;
  };

  const setLoading = (loading) => {
    Array.from(form.elements).forEach((element) => { element.disabled = loading; });
    submitButton.innerHTML = loading
      ? '<span class="spinner" aria-hidden="true"></span><span>Submitting…</span>'
      : '<span>Submit Registration</span><span aria-hidden="true">→</span>';
  };

  packageSelect.addEventListener('change', updatePackageSummary);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    formMessage.hidden = true;

    if (!validate()) return;

    if (!endpointIsConfigured()) {
      showMessage('Registration is not connected yet. The administrator must add the Apps Script Web App URL in js/config.js.');
      return;
    }

    const selected = getPackage();
    const registrationId = createRegistrationId();
    const data = new URLSearchParams({
      action: 'register',
      registrationId,
      fullName: document.getElementById('fullName').value.trim(),
      email: document.getElementById('email').value.trim().toLowerCase(),
      whatsapp: normalizePhone(document.getElementById('whatsapp').value),
      country: document.getElementById('country').value.trim(),
      packageKey: selected.key,
      paymentReference: document.getElementById('paymentReference').value.trim(),
      consent: document.getElementById('consent').checked ? 'true' : 'false',
      website: document.getElementById('website').value
    });

    setLoading(true);
    showMessage('Submitting your registration securely…', 'success');

    try {
      await fetch(config.appsScriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: data.toString()
      });

      successReference.textContent = registrationId;
      const whatsappText = encodeURIComponent(
        `Hello TREV AI Support. I submitted registration ${registrationId} for the ${selected.label} (${selected.price}). My payment reference is ${document.getElementById('paymentReference').value.trim()}.`
      );
      supportLink.href = `https://wa.me/${config.supportWhatsApp}?text=${whatsappText}`;
      form.hidden = true;
      successPanel.hidden = false;
      successPanel.focus();
      window.scrollTo({ top: successPanel.offsetTop - 120, behavior: 'smooth' });
    } catch (_) {
      showMessage('We could not submit your registration. Check your internet connection and try again.');
      setLoading(false);
    }
  });

  selectPackageFromUrl();
})();
