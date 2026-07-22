(() => {
  'use strict';
  const config = window.TREV_CONFIG;
  const form = document.getElementById('certificateForm');
  const input = document.getElementById('certificateId');
  const button = document.getElementById('certificateVerifyButton');
  const message = document.getElementById('certificateMessage');
  const result = document.getElementById('certificateResult');
  if (!config || !form) return;

  const showMessage = (text, type = 'error') => {
    message.textContent = text;
    message.className = `form-message ${type}`;
    message.hidden = false;
  };

  const jsonp = (parameters) => new Promise((resolve, reject) => {
    const callback = `trevCertificateCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    let done = false;
    const finish = (error, data) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      delete window[callback];
      script.remove();
      error ? reject(error) : resolve(data);
    };
    const timer = window.setTimeout(() => finish(new Error('Verification timed out. Please try again.')), 12000);
    window[callback] = (data) => finish(null, data);
    script.onerror = () => finish(new Error('The verification service could not be reached.'));
    script.src = `${config.appsScriptUrl}?${new URLSearchParams({ ...parameters, callback })}`;
    document.head.appendChild(script);
  });

  const verify = async (rawId) => {
    const certificateId = rawId.trim().toUpperCase().replace(/\s+/g, '');
    result.hidden = true;
    if (!/^TREV-(STA|PRO|VIP)-2026-[0-9]{4,}$/.test(certificateId)) {
      showMessage('Enter a complete certificate ID, for example TREV-PRO-2026-0001.');
      return;
    }
    button.disabled = true;
    button.textContent = 'Verifying…';
    showMessage('Checking the certificate registry…', 'success');
    try {
      const response = await jsonp({ action: 'verifyCertificate', certificateId });
      if (!response || !response.valid) {
        showMessage(response?.status === 'REVOKED' ? 'This certificate has been revoked.' : 'No valid certificate was found with that ID.');
        return;
      }
      const certificate = response.certificate;
      document.getElementById('verifiedStudent').textContent = certificate.studentName || '—';
      document.getElementById('verifiedCertificateId').textContent = certificate.id || certificateId;
      document.getElementById('verifiedPackage').textContent = certificate.packageLabel || '—';
      document.getElementById('verifiedIssueDate').textContent = certificate.issueDate || '—';
      document.getElementById('verifiedAttendance').textContent = certificate.attendance ? `${certificate.attendance}%` : 'Eligible';
      document.getElementById('verifiedCapstone').textContent = certificate.capstoneStatus || 'Approved';
      message.hidden = true;
      result.hidden = false;
      result.focus();
      history.replaceState(null, '', `?id=${encodeURIComponent(certificate.id || certificateId)}`);
    } catch (error) {
      showMessage(error.message || 'Certificate verification is temporarily unavailable.');
    } finally {
      button.disabled = false;
      button.textContent = 'Verify Certificate';
    }
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    verify(input.value);
  });

  const requested = new URLSearchParams(window.location.search).get('id');
  if (requested) {
    input.value = requested;
    verify(requested);
  }
})();
