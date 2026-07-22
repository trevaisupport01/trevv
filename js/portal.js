(() => {
  'use strict';

  const config = window.TREV_CONFIG;
  const loginForm = document.getElementById('portalLoginForm');
  const codeInput = document.getElementById('accessCode');
  const rememberInput = document.getElementById('rememberCode');
  const loginButton = document.getElementById('portalLoginButton');
  const loginMessage = document.getElementById('portalLoginMessage');
  const loginPanel = document.getElementById('portalLoginPanel');
  const dashboard = document.getElementById('studentDashboard');
  const resourcesContainer = document.getElementById('portalResources');
  const assignmentsContainer = document.getElementById('portalAssignments');
  const submissionsContainer = document.getElementById('portalSubmissions');
  const logoutButton = document.getElementById('portalLogout');
  const assignmentModal = document.getElementById('assignmentUploadModal');
  const assignmentFrame = document.getElementById('assignmentUploadFrame');
  const assignmentModalTitle = document.getElementById('assignmentModalTitle');
  const assignmentModalClose = document.getElementById('assignmentModalClose');
  const STORAGE_KEY = 'trevStudentAccessCode';
  let currentAccessCode = '';
  let modalTrigger = null;

  if (!config || !loginForm) return;

  const endpointIsConfigured = () =>
    /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(config.appsScriptUrl);

  const showMessage = (message, type = 'error') => {
    loginMessage.textContent = message;
    loginMessage.className = `form-message ${type}`;
    loginMessage.hidden = false;
  };

  const showPortalToast = (message) => {
    let toast = document.getElementById('portalToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'portalToast';
      toast.className = 'portal-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('visible');
    window.setTimeout(() => toast.classList.remove('visible'), 4500);
  };

  const setLoading = (loading) => {
    codeInput.disabled = loading;
    rememberInput.disabled = loading;
    loginButton.disabled = loading;
    loginButton.innerHTML = loading
      ? '<span class="spinner" aria-hidden="true"></span><span>Checking access…</span>'
      : '<span>Open My Portal</span><span aria-hidden="true">→</span>';
  };

  const jsonpRequest = (parameters) => new Promise((resolve, reject) => {
    const callbackName = `trevPortalCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    let finished = false;

    const cleanup = (error, data) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
      if (error) reject(error);
      else resolve(data);
    };

    const timeout = window.setTimeout(
      () => cleanup(new Error('The portal took too long to respond.')),
      12000
    );

    window[callbackName] = (data) => cleanup(null, data);
    script.onerror = () => cleanup(new Error('The portal service could not be reached.'));

    const query = new URLSearchParams({ ...parameters, callback: callbackName });
    script.src = `${config.appsScriptUrl}?${query.toString()}`;
    document.head.appendChild(script);
  });

  const createElement = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (typeof text === 'string') element.textContent = text;
    return element;
  };

  const validResourceUrl = (value) => {
    try {
      const url = new URL(value, window.location.href);
      return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
    } catch (_) {
      return '';
    }
  };

  const triggerDirectDownload = (url, title) => {
    const frame = document.createElement('iframe');
    frame.className = 'direct-download-frame';
    frame.title = `Downloading ${title || 'course resource'}`;
    frame.src = url;
    document.body.appendChild(frame);
    showPortalToast(`Your download is starting: ${title || 'course resource'}`);
    window.setTimeout(() => frame.remove(), 60000);
  };

  const renderResources = (resources) => {
    resourcesContainer.replaceChildren();

    if (!Array.isArray(resources) || resources.length === 0) {
      const empty = createElement('div', 'portal-empty-state');
      empty.append(
        createElement('h3', '', 'Your learning space is ready'),
        createElement('p', '', 'Course resources will appear here as they are released. You will not need a new access code.')
      );
      resourcesContainer.appendChild(empty);
      return;
    }

    const groups = new Map();
    resources.forEach((resource) => {
      const category = resource.category || 'Course Resources';
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(resource);
    });

    groups.forEach((items, category) => {
      const section = createElement('section', 'portal-resource-group');
      section.appendChild(createElement('h3', 'portal-resource-heading', category));
      const grid = createElement('div', 'portal-resource-grid');

      items.forEach((resource) => {
        const card = createElement('article', 'portal-resource-card');
        const availableUrl = validResourceUrl(resource.url || '');
        const status = createElement(
          'span',
          `resource-status ${availableUrl ? 'available' : 'coming-soon'}`,
          availableUrl ? (resource.download ? 'Ready to download' : 'Available') : 'Coming soon'
        );
        card.append(
          status,
          createElement('h4', '', resource.title || 'Course resource'),
          createElement('p', '', resource.description || '')
        );

        if (availableUrl) {
          const defaultLabel = resource.download ? 'Download Resource' : 'Open Resource';
          if (resource.download) {
            const button = createElement('button', 'btn btn-outline btn-sm resource-action download-action', resource.buttonLabel || defaultLabel);
            button.type = 'button';
            button.addEventListener('click', () => triggerDirectDownload(availableUrl, resource.title));
            card.appendChild(button);
          } else {
            const link = createElement('a', 'btn btn-outline btn-sm resource-action', resource.buttonLabel || defaultLabel);
            link.href = availableUrl;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            card.appendChild(link);
          }
        }
        grid.appendChild(card);
      });

      section.appendChild(grid);
      resourcesContainer.appendChild(section);
    });
  };

  const latestSubmissionByAssignment = (submissions) => {
    const latest = new Map();
    (submissions || []).forEach((submission) => {
      if (!latest.has(submission.assignmentId)) latest.set(submission.assignmentId, submission);
    });
    return latest;
  };

  const openAssignmentModal = (assignment, trigger) => {
    if (!currentAccessCode || !endpointIsConfigured()) {
      showPortalToast('Sign in again before submitting an assignment.');
      return;
    }
    modalTrigger = trigger;
    assignmentModalTitle.textContent = assignment.title || 'Submit your work';
    const query = new URLSearchParams({
      action: 'upload',
      code: currentAccessCode,
      assignmentId: assignment.id
    });
    assignmentFrame.src = `${config.appsScriptUrl}?${query.toString()}`;
    assignmentModal.hidden = false;
    document.body.classList.add('modal-open');
    assignmentModalClose.focus();
  };

  const closeAssignmentModal = () => {
    assignmentModal.hidden = true;
    assignmentFrame.src = 'about:blank';
    document.body.classList.remove('modal-open');
    if (modalTrigger) modalTrigger.focus();
    modalTrigger = null;
  };

  const renderAssignments = (assignments, submissions) => {
    assignmentsContainer.replaceChildren();
    const latest = latestSubmissionByAssignment(submissions);

    if (!Array.isArray(assignments) || assignments.length === 0) {
      const empty = createElement('div', 'portal-empty-state');
      empty.append(
        createElement('h3', '', 'No assignments have been released'),
        createElement('p', '', 'New assignments will appear here when they are available for your package.')
      );
      assignmentsContainer.appendChild(empty);
      return;
    }

    assignments.forEach((assignment) => {
      const previous = latest.get(assignment.id);
      const card = createElement('article', 'assignment-card');
      const header = createElement('div', 'assignment-card-header');
      const status = createElement(
        'span',
        `assignment-status ${previous ? 'submitted' : 'open'}`,
        previous ? (previous.status || 'SUBMITTED') : 'OPEN'
      );
      header.append(status);
      if (assignment.dueDate) header.append(createElement('span', 'assignment-due', `Due ${assignment.dueDate}`));

      card.append(
        header,
        createElement('h3', '', assignment.title || 'Assignment'),
        createElement('p', '', assignment.instructions || 'Upload your completed work for instructor review.')
      );

      const meta = createElement('div', 'assignment-meta');
      meta.append(
        createElement('span', '', `Files: ${assignment.acceptedFiles || 'PDF or document'}`),
        createElement('span', '', `Maximum: ${assignment.maxSizeMb || 10}MB`)
      );
      card.appendChild(meta);

      const button = createElement(
        'button',
        'btn btn-primary btn-sm assignment-upload-button',
        previous ? 'Submit a New Version' : 'Upload Assignment'
      );
      button.type = 'button';
      button.addEventListener('click', () => openAssignmentModal(assignment, button));
      card.appendChild(button);
      assignmentsContainer.appendChild(card);
    });
  };

  const renderSubmissions = (submissions) => {
    submissionsContainer.replaceChildren();

    if (!Array.isArray(submissions) || submissions.length === 0) {
      const empty = createElement('div', 'portal-empty-state compact');
      empty.append(
        createElement('h3', '', 'No submissions yet'),
        createElement('p', '', 'Your uploaded assignments and review status will appear here.')
      );
      submissionsContainer.appendChild(empty);
      return;
    }

    submissions.forEach((submission) => {
      const row = createElement('article', 'submission-row');
      const main = createElement('div', 'submission-main');
      main.append(
        createElement('h3', '', submission.assignmentTitle || 'Assignment submission'),
        createElement('p', '', `${submission.fileName || 'Uploaded file'} · ${submission.submittedAt || ''}`)
      );
      const statusClass = String(submission.status || 'submitted').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const status = createElement('span', `submission-status status-${statusClass}`, submission.status || 'SUBMITTED');
      row.append(main, status);

      if (submission.feedback) {
        const feedback = createElement('div', 'submission-feedback');
        feedback.append(
          createElement('strong', '', 'Instructor feedback'),
          createElement('p', '', submission.feedback)
        );
        row.appendChild(feedback);
      }
      submissionsContainer.appendChild(row);
    });
  };

  const renderDashboard = (response, code, options = {}) => {
    currentAccessCode = code;
    document.getElementById('studentName').textContent = response.student.firstName || response.student.name || 'Student';
    document.getElementById('studentRegistrationId').textContent = response.student.registrationId || '—';
    document.getElementById('studentPackage').textContent = response.package.label || response.package.key || 'Enrolled Package';
    document.getElementById('studentPackageBadge').textContent = response.package.accessLevel || response.package.key || 'STUDENT';
    renderResources(response.resources);
    renderAssignments(response.assignments, response.submissions);
    renderSubmissions(response.submissions);

    if (rememberInput.checked) localStorage.setItem(STORAGE_KEY, code);
    else localStorage.removeItem(STORAGE_KEY);

    loginPanel.hidden = true;
    dashboard.hidden = false;
    if (!options.refresh) {
      dashboard.focus();
      window.scrollTo({ top: dashboard.offsetTop - 100, behavior: 'smooth' });
    }
  };

  const verifyCode = async (rawCode, options = {}) => {
    const code = rawCode.trim().toUpperCase().replace(/\s+/g, '');
    if (code.length < 10) {
      showMessage('Enter the complete access code from your approval email or WhatsApp message.');
      codeInput.focus();
      return;
    }

    if (!endpointIsConfigured()) {
      showMessage('The student portal has not been connected yet. Please contact TREV AI Support.');
      return;
    }

    if (!options.refresh) {
      setLoading(true);
      showMessage('Checking your access code…', 'success');
    }

    try {
      const response = await jsonpRequest({ action: 'verify', code });
      if (!response || !response.valid) {
        const reasonMessages = {
          SUSPENDED: 'This access code has been suspended. Contact TREV AI Support.',
          REJECTED: 'This registration was not approved. Contact TREV AI Support.',
          PENDING: 'Your registration is still awaiting payment verification.'
        };
        showMessage(reasonMessages[response && response.status] || 'That access code is invalid. Check it carefully or contact support.');
        if (options.refresh) {
          dashboard.hidden = true;
          loginPanel.hidden = false;
        }
        return;
      }
      renderDashboard(response, code, options);
    } catch (error) {
      if (options.refresh) showPortalToast('The dashboard could not refresh. Your submission may still have been received.');
      else showMessage(error.message || 'The portal could not verify your access right now. Try again shortly.');
    } finally {
      if (!options.refresh) setLoading(false);
    }
  };

  loginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    verifyCode(codeInput.value);
  });

  logoutButton.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    currentAccessCode = '';
    codeInput.value = '';
    rememberInput.checked = false;
    closeAssignmentModal();
    dashboard.hidden = true;
    loginPanel.hidden = false;
    loginMessage.hidden = true;
    codeInput.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  assignmentModalClose.addEventListener('click', closeAssignmentModal);
  assignmentModal.querySelector('[data-close-assignment-modal]').addEventListener('click', closeAssignmentModal);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !assignmentModal.hidden) closeAssignmentModal();
  });

  window.addEventListener('message', (event) => {
    if (event.source !== assignmentFrame.contentWindow) return;
    const data = event.data;
    if (!data || data.source !== 'trev-assignment-upload' || data.status !== 'success') return;
    showPortalToast(`Assignment received. Submission ID: ${data.submissionId || 'created'}`);
    window.setTimeout(() => {
      closeAssignmentModal();
      verifyCode(currentAccessCode, { refresh: true });
    }, 900);
  });

  const savedCode = localStorage.getItem(STORAGE_KEY);
  if (savedCode) {
    codeInput.value = savedCode;
    rememberInput.checked = true;
    verifyCode(savedCode);
  }
})();
