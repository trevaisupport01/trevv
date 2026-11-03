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
  const communityContainer = document.getElementById('portalCommunity');
  const onboardingContainer = document.getElementById('portalOnboarding');
  const timetableContainer = document.getElementById('portalTimetable');
  const guidelinesContainer = document.getElementById('portalGuidelines');
  const promptLibraryContainer = document.getElementById('promptLibrary');
  const promptSearch = document.getElementById('promptSearch');
  const promptCategory = document.getElementById('promptCategory');
  const promptPdfDownload = document.getElementById('promptPdfDownload');
  const vipTemplatesDownload = document.getElementById('vipTemplatesDownload');
  const promptResultCount = document.getElementById('promptResultCount');
  const promptLoadMore = document.getElementById('promptLoadMore');
  const logoutButton = document.getElementById('portalLogout');
  const assignmentModal = document.getElementById('assignmentUploadModal');
  const assignmentFrame = document.getElementById('assignmentUploadFrame');
  const assignmentModalTitle = document.getElementById('assignmentModalTitle');
  const assignmentModalClose = document.getElementById('assignmentModalClose');
  const videoModal = document.getElementById('videoModal');
  const videoFrame = document.getElementById('videoFrame');
  const videoModalTitle = document.getElementById('videoModalTitle');
  const videoModalClose = document.getElementById('videoModalClose');
  const continueLearningButton = document.getElementById('continueLearningButton');
  const STORAGE_KEY = 'trevStudentAccessCode';
  const DEVICE_KEY = 'trevDeviceId';
  const REMEMBER_DAYS = 30;
  const IDLE_SIGN_OUT_MINUTES = 60;
  let currentAccessCode = '';
  let idleTimer = null;
  let modalTrigger = null;
  let currentProgressData = null;
  let currentOnboardingRatio = 0;
  let currentTimetable = [];
  let currentSubmissions = [];
  let currentAccessLevel = '';

  if (!config || !loginForm) return;

  // localStorage can throw in private browsing; the portal must still work.
  const storage = {
    get: (key) => { try { return localStorage.getItem(key); } catch (_) { return null; } },
    set: (key, value) => { try { localStorage.setItem(key, value); } catch (_) { /* ignore */ } },
    remove: (key) => { try { localStorage.removeItem(key); } catch (_) { /* ignore */ } }
  };

  // A random per-browser ID lets the server slow down repeated wrong codes.
  const getDeviceId = () => {
    let id = storage.get(DEVICE_KEY);
    if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      const bytes = new Uint8Array(12);
      (window.crypto || {}).getRandomValues ? window.crypto.getRandomValues(bytes) : bytes.forEach((_, i) => { bytes[i] = Math.random() * 256; });
      id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      storage.set(DEVICE_KEY, id);
    }
    return id;
  };

  const saveRememberedCode = (code) => storage.set(STORAGE_KEY, JSON.stringify({ code, savedAt: Date.now() }));

  const readRememberedCode = () => {
    const raw = storage.get(STORAGE_KEY);
    if (!raw) return '';
    let record;
    try { record = JSON.parse(raw); } catch (_) { record = null; }
    // Older versions stored the plain code. Upgrade it and start the 30-day clock now.
    if (!record || typeof record !== 'object') {
      saveRememberedCode(raw);
      return raw;
    }
    if (!record.code || Date.now() - Number(record.savedAt || 0) > REMEMBER_DAYS * 86400000) {
      storage.remove(STORAGE_KEY);
      return '';
    }
    return record.code;
  };

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
      () => cleanup(new Error('The portal is taking longer than usual to respond. Check your internet connection and try again.')),
      30000
    );

    window[callbackName] = (data) => cleanup(null, data);
    script.onerror = () => cleanup(new Error(navigator.onLine === false
      ? 'You appear to be offline. Reconnect to the internet and try again.'
      : 'We could not reach the portal service. Check your internet connection and try again.'));

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
    if (!String(value || '').trim()) return ''; // blank must not resolve to this page
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

  // YouTube pages refuse to load inside the portal; their embed address works.
  const youtubeEmbedUrl = (value) => {
    try {
      const url = new URL(value);
      const host = url.hostname.replace(/^www\.|^m\./, '');
      let id = '';
      if (host === 'youtu.be') id = url.pathname.slice(1);
      else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
        id = url.searchParams.get('v') || (/^\/(?:embed|shorts|live)\/([^/?]+)/.exec(url.pathname) || [])[1] || '';
      }
      return /^[A-Za-z0-9_-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}?rel=0` : '';
    } catch (_) {
      return '';
    }
  };

  const openVideoModal = (resource) => {
    const raw = validResourceUrl(resource.url || '');
    const url = youtubeEmbedUrl(raw) || raw;
    if (!url) return;
    videoModalTitle.textContent = resource.title || 'Course Video';
    videoFrame.src = url;
    videoModal.hidden = false;
    document.body.classList.add('modal-open');
    videoModalClose.focus();
  };

  const closeVideoModal = () => {
    videoModal.hidden = true;
    videoFrame.src = 'about:blank';
    document.body.classList.remove('modal-open');
  };

  // Resources are sorted by their Category in the Resources sheet:
  //   "Session 3 …"   → shown inside Session 3
  //   "Announcement…" → shown on the Home tab
  //   anything else   → "Other course resources" on the More tab
  const resourceSession = (resource) => sessionNumberOf(resource.category);
  const isAnnouncement = (resource) => /^announce/i.test(String(resource.category || '').trim());

  const renderResources = (resources) => {
    const list = (Array.isArray(resources) ? resources : []).map((resource) =>
      (!resource.video && youtubeEmbedUrl(resource.url || '') ? { ...resource, video: true, download: false } : resource));
    currentResources = list;
    renderAnnouncements(list.filter(isAnnouncement));
    const general = list.filter((resource) => !isAnnouncement(resource) && !resourceSession(resource));
    resourcesContainer.replaceChildren();

    if (general.length === 0) {
      const empty = createElement('div', 'portal-empty-state compact');
      empty.append(
        createElement('h3', '', 'Nothing extra yet'),
        createElement('p', '', 'Session recordings and slides appear inside each session. Other materials will appear here as they are released.')
      );
      resourcesContainer.appendChild(empty);
      return;
    }
    resourcesContainer.appendChild(buildResourceGroups(general));
  };

  const buildResourceGroups = (resources) => {
    const wrapper = document.createDocumentFragment();
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
        const availabilityText = resource.video ? 'Ready to watch' : resource.download ? 'Ready to download' : 'Available';
        const status = createElement('span', `resource-status ${availableUrl ? 'available' : 'coming-soon'}`, availableUrl ? availabilityText : 'Coming soon');
        card.append(status, createElement('h4', '', resource.title || 'Course resource'), createElement('p', '', resource.description || ''));
        if (resource.fileSize || resource.materialType) {
          card.appendChild(createElement('span', 'resource-meta', [resource.materialType, resource.fileSize].filter(Boolean).join(' · ')));
        }

        if (availableUrl) {
          const defaultLabel = resource.video ? 'Watch Video' : resource.download ? 'Download Resource' : 'Open Resource';
          if (resource.video) {
            const button = createElement('button', 'btn btn-primary btn-sm resource-action', resource.buttonLabel || defaultLabel);
            button.type = 'button';
            button.addEventListener('click', () => openVideoModal(resource));
            card.appendChild(button);
          } else if (resource.download) {
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
      wrapper.appendChild(section);
    });
    return wrapper;
  };

  const announcementsContainer = document.getElementById('portalAnnouncements');
  const renderAnnouncements = (items) => {
    if (!announcementsContainer) return;
    announcementsContainer.replaceChildren();
    if (!items.length) {
      announcementsContainer.appendChild(createElement('p', 'portal-card-note', 'No announcements right now. Class updates are also posted in your WhatsApp group.'));
      return;
    }
    const list = createElement('ul', 'announcement-list');
    items.forEach((item) => {
      const row = createElement('li', 'announcement-item');
      row.append(createElement('strong', '', item.title || 'Update'));
      if (item.description) row.append(createElement('p', '', item.description));
      const url = validResourceUrl(item.url || '');
      if (url) {
        const link = createElement('a', '', item.buttonLabel || 'Open');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        row.append(link);
      }
      list.appendChild(row);
    });
    announcementsContainer.appendChild(list);
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

    assignments.forEach((assignment) => assignmentsContainer.appendChild(buildAssignmentCard(assignment, latest)));
  };

  const buildAssignmentCard = (assignment, latest) => {
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

      if (assignment.guidelines) {
        const details = createElement('details', 'assignment-guidelines');
        details.append(
          createElement('summary', '', 'Assignment Guidelines'),
          createElement('div', 'assignment-guidelines-text', assignment.guidelines)
        );
        card.appendChild(details);
      }

      if (assignment.gradingRubric) {
        const rubric = createElement('details', 'assignment-guidelines');
        rubric.append(
          createElement('summary', '', 'Grading Rubric'),
          createElement('div', 'assignment-guidelines-text', assignment.gradingRubric)
        );
        card.appendChild(rubric);
      }

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
      return card;
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



  /* ---------------- App views (Home · Sessions · Assignments · Prompts · More) ---------------- */

  const VIEWS = ['home', 'sessions', 'assignments', 'prompts', 'more'];
  // Which tab each existing section lives in, so old "scroll to" targets still work.
  const SECTION_VIEW = {
    portalOnboarding: 'more', portalTimetable: 'more', portalCommunity: 'more', portalResources: 'more',
    portalGuidelines: 'more', portalAssignments: 'assignments', portalSubmissions: 'assignments',
    promptLibrarySection: 'prompts', portalSessionList: 'sessions'
  };
  const viewPanels = document.querySelectorAll('[data-view-panel]');
  const viewTabs = document.querySelectorAll('.portal-tab[data-view]');
  let currentView = 'home';

  const showView = (view, options = {}) => {
    if (!VIEWS.includes(view)) view = 'home';
    currentView = view;
    viewPanels.forEach((panel) => { panel.hidden = panel.dataset.viewPanel !== view; });
    viewTabs.forEach((tab) => {
      if (tab.dataset.view === view) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    });
    if (view === 'sessions') {
      if (options.session) openSession(options.session, { updateHash: false });
      else closeSession({ updateHash: false });
    }
    if (options.updateHash !== false) {
      const hash = options.session ? `#sessions/${options.session}` : `#${view}`;
      if (window.location.hash !== hash) history.pushState(null, '', hash);
    }
    const target = options.scrollTo && document.getElementById(options.scrollTo);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else if (!options.keepScroll) window.scrollTo({ top: Math.max(0, dashboard.offsetTop - 90), behavior: 'instant' });
  };

  const routeFromHash = () => {
    if (dashboard.hidden) return;
    const match = /^#(home|sessions|assignments|prompts|more)(?:\/([1-7]))?$/.exec(window.location.hash);
    if (!match) return showView('home', { updateHash: false });
    showView(match[1], { session: match[2] ? Number(match[2]) : 0, updateHash: false });
  };

  const scrollToPortalSection = (id) => {
    const match = /^session-([1-7])$/.exec(id || '');
    if (match) return showView('sessions', { session: Number(match[1]) });
    showView(SECTION_VIEW[id] || 'home', { scrollTo: id });
  };

  viewTabs.forEach((tab) => tab.addEventListener('click', () => showView(tab.dataset.view)));
  window.addEventListener('popstate', routeFromHash);

  /* ---------------- Sessions ---------------- */

  // The course outline. Starter covers 1–4; Professional and VIP cover all 7.
  const SESSIONS = [
    { n: 1, title: 'Your AI Toolkit', tools: 'ChatGPT & Gemini', summary: 'Get set up on the two most-used AI assistants and do your first real tasks with them.', topics: ['Free ChatGPT and Gemini accounts on phone and laptop', 'What AI is good at, what it gets wrong, and why you always check', 'First tasks: rewrite a message, summarise a document, plan your week'] },
    { n: 2, title: 'Prompts That Work', tools: 'ChatGPT & Claude', summary: 'Get the answer you actually want, the first time or after a quick fix.', topics: ['The 4-part prompt: role, task, context, format', 'Giving examples and improving drafts step by step', 'Saving your best prompts as reusable templates'] },
    { n: 3, title: 'AI for Everyday Work', tools: 'ChatGPT, Gemini, Claude & Grok', summary: 'Use AI on the writing and planning you already do.', topics: ['Emails, CVs, cover letters, reports and posts', 'Changing tone for a boss, client or international audience', 'Which tool for which job: your one-page cheat sheet'] },
    { n: 4, title: 'Research You Can Trust', tools: 'Perplexity & NotebookLM', summary: 'Find information you can rely on and use AI on your own documents.', topics: ['Research with sources you can check', 'NotebookLM on your own notes and documents', 'Spotting made-up facts and what never to paste into AI'] },
    { n: 5, title: 'Create Images & Video', tools: 'AI image tools, Canva, Veo & Kling', summary: 'Turn ideas into flyers, social graphics and short videos.', topics: ['Flyers, posts and product images', 'Short videos: script, visuals and captions', 'Copyright, real faces and labelling AI content'], advanced: true },
    { n: 6, title: 'AI Agents & Automation', tools: 'Gems, custom GPTs, Zapier & Make', summary: 'Go from asking AI questions to having it do repeat work for you.', topics: ['Your own assistant that remembers your instructions', 'AI agents that carry out tasks, and when to trust them', 'Your first Zapier or Make automation'], advanced: true },
    { n: 7, title: 'Capstone & Graduation', tools: 'Your project', summary: 'Show what you built and get feedback.', topics: ['Professional: present a working AI workflow', 'VIP: present an AI plan for your business', 'Instructor and peer feedback'], advanced: true }
  ];

  const sessionListContainer = document.getElementById('portalSessionList');
  const sessionDetailContainer = document.getElementById('portalSessionDetail');
  let currentResources = [];
  let currentAssignments = [];

  const sessionNumberOf = (value) => {
    const match = /^\s*(?:session|class|s)\s*0?([1-7])\b/i.exec(String(value || ''));
    return match ? Number(match[1]) : 0;
  };
  const assignmentSession = (assignment) =>
    sessionNumberOf(assignment.id) || sessionNumberOf(String(assignment.id || '').replace(/^SESSION[-_]/i, 'Session ')) ||
    Number((/session\s*0?([1-7])\b/i.exec(assignment.title || '') || [])[1] || 0);

  const sessionIncluded = (n) => currentAccessLevel !== 'STARTER' || n <= 4;

  const sessionState = (n) => {
    const entry = { session: `Session ${n}`, title: '' };
    const progress = currentProgressData || {};
    if (progress.certificatePolicyVersion === 2 && hasSessionRecord(progress.completedSessions, entry)) return 'completed';
    if (hasSessionRecord(progress.attendedSessions, entry)) return 'attended';
    return 'upcoming';
  };

  const timetableFor = (n) => currentTimetable.find((entry) => sessionNumberOf(entry.session) === n);

  const stateLabel = { completed: 'Completed', attended: 'Attended', upcoming: 'Upcoming', locked: 'Professional & VIP' };

  const renderSessions = () => {
    if (!sessionListContainer) return;
    sessionListContainer.replaceChildren();
    const nextOpen = SESSIONS.find((s) => sessionIncluded(s.n) && sessionState(s.n) === 'upcoming');
    SESSIONS.forEach((session) => {
      const included = sessionIncluded(session.n);
      const state = included ? sessionState(session.n) : 'locked';
      const button = createElement('button', `session-row session-${state}${nextOpen && nextOpen.n === session.n ? ' session-next' : ''}`);
      button.type = 'button';
      const number = createElement('span', 'session-row-num', String(session.n).padStart(2, '0'));
      const body = createElement('span', 'session-row-body');
      body.append(createElement('strong', '', session.title), createElement('small', '', session.tools));
      const slot = timetableFor(session.n);
      if (slot && slot.date) body.append(createElement('small', 'session-row-date', `${slot.date}${slot.classTime ? ' · ' + slot.classTime : ''}`));
      const status = createElement('span', `session-row-status status-${state}`, nextOpen && nextOpen.n === session.n ? 'Up next' : stateLabel[state]);
      button.append(number, body, status);
      button.addEventListener('click', () => showView('sessions', { session: session.n }));
      sessionListContainer.appendChild(button);
    });
  };

  const openSession = (n, options = {}) => {
    const session = SESSIONS.find((s) => s.n === n);
    if (!session || !sessionDetailContainer) return;
    sessionListContainer.hidden = true;
    sessionDetailContainer.hidden = false;
    sessionDetailContainer.replaceChildren();

    const back = createElement('button', 'link-button session-back', '← All sessions');
    back.type = 'button';
    back.addEventListener('click', () => showView('sessions'));

    const header = createElement('div', 'session-detail-header');
    const included = sessionIncluded(n);
    const state = included ? sessionState(n) : 'locked';
    header.append(
      createElement('span', 'section-tag', `Session ${n} · ${session.tools}`),
      createElement('h2', '', session.title),
      createElement('p', '', session.summary),
      createElement('span', `session-row-status status-${state}`, stateLabel[state])
    );
    sessionDetailContainer.append(back, header);

    if (!included) {
      const locked = createElement('div', 'portal-empty-state');
      locked.append(
        createElement('h3', '', 'Included in Professional and VIP'),
        createElement('p', '', 'Your Starter package covers sessions 1–4. Upgrade to unlock images and video, AI agents and automation, and the capstone project.')
      );
      const upgrade = createElement('a', 'btn btn-primary btn-sm', 'Ask About Upgrading');
      upgrade.href = `https://wa.me/${config.supportWhatsApp || '2348139908559'}?text=${encodeURIComponent('Hello TREV AI Support. I am a Starter student and would like to upgrade to Professional.')}`;
      upgrade.target = '_blank';
      upgrade.rel = 'noopener noreferrer';
      locked.appendChild(upgrade);
      sessionDetailContainer.appendChild(locked);
      return;
    }

    const slot = timetableFor(n);
    const when = createElement('div', 'session-detail-when portal-card');
    when.append(
      createElement('span', 'portal-card-label', 'LIVE CLASS'),
      createElement('strong', '', slot && slot.date ? `${slot.date}${slot.day ? ' (' + slot.day + ')' : ''}` : 'Date to be announced'),
      createElement('small', '', slot ? `${slot.classTime || 'Time to be announced'} · ${slot.duration || 'Duration to be announced'}` : 'Check your WhatsApp group for the schedule')
    );

    const topics = createElement('div', 'session-detail-topics portal-card');
    topics.appendChild(createElement('span', 'portal-card-label', 'WHAT YOU WILL LEARN'));
    const list = createElement('ul');
    session.topics.forEach((topic) => list.appendChild(createElement('li', '', topic)));
    topics.appendChild(list);

    const top = createElement('div', 'session-detail-grid');
    top.append(when, topics);
    sessionDetailContainer.appendChild(top);

    sessionDetailContainer.appendChild(createElement('h3', 'session-detail-subhead', 'Recording, slides & materials'));
    const materials = currentResources.filter((resource) => !isAnnouncement(resource) && resourceSession(resource) === n);
    if (materials.length) sessionDetailContainer.appendChild(buildResourceGroups(materials));
    else sessionDetailContainer.appendChild(createElement('div', 'portal-empty-state compact', 'Materials for this session will appear here after the class. You will not need a new code.'));

    sessionDetailContainer.appendChild(createElement('h3', 'session-detail-subhead', 'Assignment'));
    const work = currentAssignments.filter((assignment) => assignmentSession(assignment) === n);
    if (work.length) {
      const latest = latestSubmissionByAssignment(currentSubmissions);
      const wrap = createElement('div', 'portal-assignments');
      work.forEach((assignment) => wrap.appendChild(buildAssignmentCard(assignment, latest)));
      sessionDetailContainer.appendChild(wrap);
    } else {
      sessionDetailContainer.appendChild(createElement('div', 'portal-empty-state compact', 'The assignment for this session has not been released yet.'));
    }

    const nav = createElement('div', 'session-detail-nav');
    if (n > 1) {
      const prev = createElement('button', 'btn btn-outline btn-sm', `← Session ${n - 1}`);
      prev.type = 'button';
      prev.addEventListener('click', () => showView('sessions', { session: n - 1 }));
      nav.appendChild(prev);
    }
    if (n < SESSIONS.length) {
      const next = createElement('button', 'btn btn-outline btn-sm', `Session ${n + 1} →`);
      next.type = 'button';
      next.addEventListener('click', () => showView('sessions', { session: n + 1 }));
      nav.appendChild(next);
    }
    sessionDetailContainer.appendChild(nav);
    if (options.updateHash) history.pushState(null, '', `#sessions/${n}`);
  };

  function closeSession() {
    if (!sessionDetailContainer) return;
    sessionDetailContainer.hidden = true;
    sessionListContainer.hidden = false;
  }

  const hasSessionRecord = (records, entry) => {
    const normalize = (value) => String(value || '').trim().toLowerCase();
    const sessionNumber = (value) => /^(?:session|class)\s*0?([1-7])(?:\s*[:\-–—]\s*.*)?$/i.exec(normalize(value))?.[1];
    const labels = [entry.session, entry.title].map(normalize).filter(Boolean);
    const number = sessionNumber(entry.session) || sessionNumber(entry.title);
    return Array.isArray(records) && records.some((record) => {
      const label = normalize(record);
      return label && (labels.includes(label) || (number && sessionNumber(label) === number));
    });
  };

  const updateDashboardProgress = () => {
    const progress=currentProgressData||{};
    const requiredSessions=currentAccessLevel==='STARTER'?4:7;
    const certificateRequiredSessions=currentAccessLevel==='STARTER'?4:5;
    const completionTracked=progress.certificatePolicyVersion===2;
    const completedSessions=completionTracked?Math.max(0,Math.min(requiredSessions,Number(progress.lessonsCompleted)||0)):0;
    const total=Math.min(100,Math.round((completedSessions/certificateRequiredSessions)*100));
    const ring=document.getElementById('overallProgressRing');
    ring.style.setProperty('--progress',total);
    document.getElementById('overallProgressValue').textContent=`${total}%`;
    document.getElementById('progressLessons').textContent=`${completedSessions} / ${requiredSessions}`;
    document.getElementById('progressAssignments').textContent=`${progress.approvedAssignments||0} / ${progress.requiredAssignments||0}`;

    const next=currentTimetable.find((entry)=>
      String(entry.status||'').trim().toUpperCase()!=='COMPLETED' &&
      !hasSessionRecord(progress.attendedSessions,entry) &&
      !hasSessionRecord(progress.completedSessions,entry)
    );
    document.getElementById('progressNextClass').textContent=next?.title||'To be announced';
    document.getElementById('progressNextClassDate').textContent=next?`${next.date || 'Date to be announced'} · ${next.classTime || 'Time to be announced'}`:'Check timetable for updates';

    const certificateLabel=document.getElementById('progressCertificate');
    const certificateDetail=document.getElementById('progressCertificateDetail');
    if (progress.certificate && String(progress.certificate.status).toUpperCase()==='ISSUED') {
      certificateLabel.textContent='Issued'; certificateDetail.textContent=progress.certificate.id||'Certificate available';
    } else if (completionTracked && progress.certificateEligible && completedSessions>=certificateRequiredSessions) {
      certificateLabel.textContent='Eligible'; certificateDetail.textContent='Awaiting certificate issue';
    } else {
      certificateLabel.textContent=completionTracked?'Classes pending':'Completion review pending';
      certificateDetail.textContent=`Attend and complete ${certificateRequiredSessions} of ${requiredSessions} classes`;
    }

    const nextSession = SESSIONS.find((s) => sessionIncluded(s.n) && sessionState(s.n) === 'upcoming');
    let target = nextSession ? `session-${nextSession.n}` : 'portalSessionList';
    let label = nextSession ? `Continue: Session ${nextSession.n}, ${nextSession.title}` : 'Review Your Sessions';
    if (currentOnboardingRatio<1) { target='portalOnboarding'; label='Finish Your Setup Checklist'; }
    else if (currentSubmissions.some((item)=>String(item.status).toUpperCase()==='REVISION REQUESTED')) { target='portalSubmissions'; label='Review Instructor Feedback'; }
    else if ((progress.approvedAssignments||0)<(progress.requiredAssignments||0)) { target='portalAssignments'; label='Continue with Assignments'; }
    continueLearningButton.dataset.target=target;
    continueLearningButton.firstChild.textContent=label+' ';
    document.getElementById('progressSummary').textContent=completionTracked
      ? `${completedSessions} of ${requiredSessions} classes attended and completed. Certificate requirement: ${certificateRequiredSessions} of ${requiredSessions}. Certificates are issued separately.`
      : `Attend and complete ${certificateRequiredSessions} of ${requiredSessions} classes. Your instructor will confirm your completion record.`;
  };

  const renderCommunity = (community, cohort) => {
    communityContainer.replaceChildren();
    const card = createElement('article', 'community-card');
    const top = createElement('div', 'community-card-top');
    const titleWrap = createElement('div');
    titleWrap.append(
      createElement('span', 'community-label', 'OFFICIAL WHATSAPP COMMUNITY'),
      createElement('h3', '', community?.groupName || 'TREV AI Community')
    );
    top.appendChild(titleWrap);

    const homeJoin = document.getElementById('nextClassJoin');
    if (homeJoin) {
      const invite = community?.inviteUrl ? validResourceUrl(community.inviteUrl) : '';
      homeJoin.hidden = !invite;
      if (invite) homeJoin.href = invite;
    }

    if (community?.inviteUrl && validResourceUrl(community.inviteUrl)) {
      const join = createElement('a', 'btn btn-secondary btn-sm', 'Join Community');
      join.href = community.inviteUrl;
      join.target = '_blank';
      join.rel = 'noopener noreferrer';
      top.appendChild(join);
    } else {
      top.appendChild(createElement('span', 'community-link-pending', 'Invite link pending'));
    }
    card.appendChild(top);

    const facts = createElement('div', 'community-facts');
    [
      ['Support hours', community?.supportHours || 'See WhatsApp group'],
      ['Class time', currentCohortValue(cohort?.classTime, 'To be announced after onboarding', 'To be announced')],
      ['Class links', community?.classLinkPolicy || 'Shared in WhatsApp before class'],
      ['Recording', community?.recordingPolicy || 'Students are informed before recording begins'],
      ['Private messages', community?.privateMessagePolicy || 'Only for payment and account issues']
    ].forEach(([label, value]) => {
      const item = createElement('div');
      item.append(createElement('span', '', label), createElement('strong', '', value));
      facts.appendChild(item);
    });
    card.appendChild(facts);
    communityContainer.appendChild(card);
    const officeHours=document.getElementById('instructorOfficeHours');
    if (officeHours) officeHours.textContent=`Support hours: ${community?.supportHours||'See your community card'}`;
  };

  const renderOnboarding = (items, registrationId) => {
    onboardingContainer.replaceChildren();
    if (!Array.isArray(items) || items.length === 0) {
      onboardingContainer.appendChild(createElement('div', 'portal-empty-state compact', 'Your checklist is being prepared.'));
      currentOnboardingRatio = 1; // nothing to finish, so don't send students here
      return;
    }
    const storageKey = `trevOnboarding:${registrationId}`;
    let completed = [];
    try { completed = JSON.parse(storage.get(storageKey) || '[]'); } catch (_) { completed = []; }
    if (!Array.isArray(completed)) completed = [];
    const list = createElement('div', 'onboarding-list');

    items.forEach((item, index) => {
      const itemKey = `${item.accessLevel || 'ALL'}:${item.sortOrder || index}:${item.item}`;
      const label = createElement('label', 'onboarding-item');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = completed.includes(itemKey);
      const copy = createElement('span', 'onboarding-copy');
      copy.append(
        createElement('strong', '', item.item),
        createElement('small', '', item.description || '')
      );
      label.append(checkbox, copy);
      label.classList.toggle('completed', checkbox.checked);
      checkbox.addEventListener('change', () => {
        const set = new Set(completed);
        if (checkbox.checked) set.add(itemKey); else set.delete(itemKey);
        completed = Array.from(set);
        storage.set(storageKey, JSON.stringify(completed));
        label.classList.toggle('completed', checkbox.checked);
        updateProgress();
      });
      list.appendChild(label);
    });

    const progress = createElement('div', 'onboarding-progress');
    const bar = createElement('div', 'onboarding-progress-bar');
    const fill = createElement('span');
    bar.appendChild(fill);
    const text = createElement('strong');
    progress.append(text, bar);
    const updateProgress = () => {
      const done = list.querySelectorAll('input:checked').length;
      const total = items.length;
      text.textContent = `${done} of ${total} onboarding steps completed`;
      fill.style.width = `${Math.round((done / total) * 100)}%`;
      currentOnboardingRatio = total ? done / total : 0;
      updateDashboardProgress();
    };
    onboardingContainer.append(progress, list);
    updateProgress();
  };

  const currentCohortValue = (value, legacyValue, fallback) => value && value!==legacyValue ? value : fallback;

  const isCurrentCohortSession = (entry) => {
    const date=new Date(entry.date);
    const start=new Date(config.pricing?.cohortStarts||'2026-11-09T00:00:00+01:00');
    return Number.isNaN(date.getTime())||date.getTime()>=start.getTime();
  };

  const renderTimetable = (timetable, cohort) => {
    timetableContainer.replaceChildren();
    const summary = createElement('div', 'timetable-summary');
    [
      ['Cohort begins', currentCohortValue(cohort?.startDate, '4 August 2026', '9 November 2026')],
      ['Class time', currentCohortValue(cohort?.classTime, 'To be announced after onboarding', 'To be announced')],
      ['Class duration', currentCohortValue(cohort?.duration, '90 minutes', 'To be announced')],
      ['Certificate release', currentCohortValue(cohort?.certificateRelease, '31 August 2026', 'To be announced')]
    ].forEach(([label, value]) => {
      const item = createElement('div');
      item.append(createElement('span', '', label), createElement('strong', '', value));
      summary.appendChild(item);
    });
    timetableContainer.appendChild(summary);
    if (!Array.isArray(timetable) || timetable.length === 0) {
      timetableContainer.appendChild(createElement('div', 'portal-empty-state compact', 'The class timetable and session duration are being finalized. Details will be announced once confirmed.'));
      return;
    }

    const list = createElement('div', 'timetable-list');
    const attended = currentProgressData?.attendedSessions || [];
    const completed = currentProgressData?.certificatePolicyVersion===2 ? currentProgressData.completedSessions || [] : [];
    let currentAssigned = false;
    timetable.forEach((entry) => {
      const isCompleted = hasSessionRecord(completed,entry);
      const isAttended = hasSessionRecord(attended,entry);
      const isPast = String(entry.status || '').trim().toUpperCase()==='COMPLETED';
      const isCore = String(entry.activityType || '').toLowerCase().includes('core') || /^(?:session|class)\s*0?[1-7]\b/i.test(String(entry.session || ''));
      const isCurrent = !isCompleted && !isAttended && !isPast && !currentAssigned && isCore;
      if (isCurrent) currentAssigned = true;
      const state = isCompleted ? 'completed' : isCurrent ? 'current' : isAttended ? 'attended' : isPast ? 'past' : 'upcoming';
      const row = createElement('article', `timetable-row roadmap-${state}`);
      const date = createElement('div', 'timetable-date');
      date.append(createElement('strong', '', entry.date || ''), createElement('span', '', entry.day || ''));
      const detail = createElement('div', 'timetable-detail');
      detail.append(
        createElement('span', 'timetable-session', `${entry.session || 'Session'} · ${entry.activityType || 'Class'}`),
        createElement('h3', '', entry.title || 'Class Session'),
        createElement('p', '', `${entry.classTime || 'Time to be announced'} · ${entry.duration || 'Duration to be announced'}`)
      );
      const status = createElement('span', 'timetable-status', isCompleted ? 'COMPLETED' : isAttended ? 'ATTENDED' : isPast ? 'SESSION ENDED' : isCurrent ? 'CURRENT' : 'UPCOMING');
      row.append(date, detail, status);
      list.appendChild(row);
    });
    timetableContainer.appendChild(list);
  };

  const renderGuidelines = (guidelines) => {
    guidelinesContainer.replaceChildren();
    if (!Array.isArray(guidelines) || guidelines.length === 0) {
      guidelinesContainer.appendChild(createElement('div', 'portal-empty-state compact', 'Community guidelines are being prepared.'));
      return;
    }
    guidelines.forEach((rule, index) => {
      const card = createElement('article', 'guideline-card');
      card.append(
        createElement('span', 'guideline-number', String(index + 1).padStart(2, '0')),
        createElement('h3', '', rule.title || 'Community rule'),
        createElement('p', '', rule.guideline || '')
      );
      guidelinesContainer.appendChild(card);
    });
  };


  let allPrompts = [];
  let filteredPrompts = [];
  let visiblePromptCount = 0;

  const copyPromptText = async (text, button) => {
    try { await navigator.clipboard.writeText(text); }
    catch (_) {
      const area=document.createElement('textarea'); area.value=text; area.style.position='fixed'; area.style.opacity='0';
      document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove();
    }
    const original=button.textContent; button.textContent='Copied';
    window.setTimeout(()=>{button.textContent=original;},1500);
  };

  const createPromptCard = (entry) => {
    const card=createElement('article','prompt-card');
    const top=createElement('div','prompt-card-top');
    top.append(createElement('span','prompt-id',entry.id||''),createElement('span','prompt-category-label',entry.category||''));
    card.append(top,createElement('h3','',entry.title||'Prompt'),createElement('p','prompt-use-case',entry.useCase||''));
    const details=createElement('details','prompt-details');
    details.appendChild(createElement('summary','','View Prompt'));
    const body=createElement('div','prompt-body');
    body.append(createElement('pre','prompt-text',entry.prompt||''));
    if (entry.variables?.length) body.appendChild(createElement('p','prompt-notes',`Variables: ${entry.variables.join(', ')}`));
    body.appendChild(createElement('p','prompt-notes',`Expected output: ${entry.expectedOutput||''}`));
    body.appendChild(createElement('p','prompt-notes',`Refinement: ${entry.refinement||''}`));
    const copy=createElement('button','btn btn-primary btn-sm','Copy Prompt'); copy.type='button'; copy.addEventListener('click',()=>copyPromptText(entry.prompt||'',copy));
    body.appendChild(copy); details.appendChild(body); card.appendChild(details); return card;
  };

  const drawPromptResults = (reset=true) => {
    if (reset) { promptLibraryContainer.replaceChildren(); visiblePromptCount=0; }
    const next=filteredPrompts.slice(visiblePromptCount,visiblePromptCount+20);
    next.forEach((entry)=>promptLibraryContainer.appendChild(createPromptCard(entry)));
    visiblePromptCount+=next.length;
    promptResultCount.textContent=`Showing ${visiblePromptCount} of ${filteredPrompts.length} prompts`;
    promptLoadMore.hidden=visiblePromptCount>=filteredPrompts.length;
  };

  const filterPrompts = () => {
    const query=promptSearch.value.trim().toLowerCase(); const category=promptCategory.value;
    filteredPrompts=allPrompts.filter((entry)=>{
      const matchesCategory=!category||entry.category===category;
      const haystack=`${entry.title} ${entry.category} ${entry.useCase} ${entry.prompt}`.toLowerCase();
      return matchesCategory&&(!query||haystack.includes(query));
    });
    drawPromptResults(true);
  };

  const renderPromptLibrary = async (accessLevel) => {
    const tier=accessLevel==='STARTER'?'starter':accessLevel==='PROFESSIONAL'?'professional':'vip';
    const pdfs={starter:'trev-ai-starter-prompt-library.pdf',professional:'trev-ai-professional-prompt-library.pdf',vip:'trev-ai-vip-prompt-library.pdf'};
    promptPdfDownload.href=`assets/prompt-libraries/${pdfs[tier]}`;
    vipTemplatesDownload.hidden=tier!=='vip';
    promptLibraryContainer.replaceChildren(createElement('div','portal-empty-state compact','Loading prompt library…'));
    try {
      const response=await fetch(`assets/prompt-libraries/${tier}.json`,{cache:'no-store'});
      if(!response.ok) throw new Error('Prompt library unavailable');
      const data=await response.json(); allPrompts=Array.isArray(data.prompts)?data.prompts:[];
      promptCategory.replaceChildren(new Option('All categories',''));
      [...new Set(allPrompts.map((entry)=>entry.category))].sort().forEach((category)=>promptCategory.add(new Option(category,category)));
      filteredPrompts=allPrompts.slice(); drawPromptResults(true);
    } catch (_) {
      promptLibraryContainer.replaceChildren(createElement('div','portal-empty-state','The prompt library could not be loaded. Refresh the page or download the PDF version.'));
      promptResultCount.textContent=''; promptLoadMore.hidden=true;
    }
  };

  const renderDashboard = (response, code, options = {}) => {
    currentAccessCode = code;
    currentAccessLevel = response.package.accessLevel || '';
    currentProgressData = response.progress || {};
    currentTimetable = (response.timetable || []).filter(isCurrentCohortSession);
    currentSubmissions = response.submissions || [];
    currentAssignments = Array.isArray(response.assignments) ? response.assignments : [];
    document.getElementById('studentName').textContent = response.student.firstName || response.student.name || 'Student';
    document.getElementById('studentRegistrationId').textContent = response.student.registrationId || '—';
    document.getElementById('studentPackage').textContent = response.package.label || response.package.key || 'Enrolled Package';
    document.getElementById('studentPackageBadge').textContent = response.package.accessLevel || response.package.key || 'STUDENT';
    renderCommunity(response.community || {}, response.cohort || {});
    renderOnboarding(response.onboarding || [], response.student.registrationId || 'student');
    renderTimetable(currentTimetable, response.cohort || {});
    renderResources(response.resources);
    renderAssignments(response.assignments, response.submissions);
    renderSubmissions(response.submissions);
    renderGuidelines(response.communityGuidelines || []);
    renderSessions();
    updateDashboardProgress();
    if (!allPrompts.length || !options.refresh) renderPromptLibrary(response.package.accessLevel);
    showWelcomeGuide(response.student.registrationId || 'student');

    if (!options.refresh) {
      if (rememberInput.checked) saveRememberedCode(code);
      else storage.remove(STORAGE_KEY);
    }
    resetIdleTimer();

    loginPanel.hidden = true;
    dashboard.hidden = false;
    document.body.classList.add('portal-signed-in');
    if (options.refresh) {
      // Keep the student where they were, but redraw an open session with fresh data.
      if (currentView === 'sessions' && sessionDetailContainer && !sessionDetailContainer.hidden) {
        const open = /^#sessions\/([1-7])$/.exec(window.location.hash);
        if (open) openSession(Number(open[1]));
      }
    } else {
      dashboard.focus({ preventScroll: true });
      routeFromHash();
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
      const response = await jsonpRequest({ action: 'verify', code, clientId: getDeviceId() });
      if (!response || !response.valid) {
        const reasonMessages = {
          SUSPENDED: 'This access code has been suspended. Contact TREV AI Support.',
          REJECTED: 'This registration was not approved. Contact TREV AI Support.',
          PENDING: 'Your registration is still awaiting payment verification. Your code will arrive by email and WhatsApp once your payment is confirmed (usually within 10 minutes).',
          EXPIRED: 'Your package access period has ended. Contact TREV AI Support if you need help with your account.',
          APPROVAL_REVIEW: 'Your access record needs a support review. Contact TREV AI Support with your registration details.',
          ERASED: 'This account’s data was deleted at the student’s request, so the code no longer works.',
          RATE_LIMITED: 'Too many incorrect codes were tried from this device. Wait 15 minutes, then try again, or use “Lost your access code?” below.'
        };
        const fallback = response && response.error
          ? 'The portal service is having a problem right now. Please try again in a few minutes.'
          : 'We could not find that access code. Check it matches your approval email exactly (for example TREV-PRO-AB12-CD34), or use “Lost your access code?” below.';
        showMessage(reasonMessages[response && response.status] || fallback);
        if (response && ['INVALID', 'SUSPENDED', 'REJECTED', 'EXPIRED', 'ERASED'].includes(response.status)) storage.remove(STORAGE_KEY);
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

  const signOut = (message) => {
    storage.remove(STORAGE_KEY);
    window.clearTimeout(idleTimer);
    idleTimer = null;
    currentAccessCode = '';
    codeInput.value = '';
    rememberInput.checked = false;
    if (!assignmentModal.hidden) closeAssignmentModal();
    if (!videoModal.hidden) closeVideoModal();
    dashboard.hidden = true;
    loginPanel.hidden = false;
    document.body.classList.remove('portal-signed-in');
    if (window.location.hash) history.replaceState(null, '', window.location.pathname + window.location.search);
    if (message) showMessage(message, 'success');
    else loginMessage.hidden = true;
    codeInput.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Sessions that were not "remembered" end after an hour without activity,
  // so a shared or public computer does not stay signed in.
  function resetIdleTimer() {
    window.clearTimeout(idleTimer);
    if (!currentAccessCode || rememberInput.checked) return;
    idleTimer = window.setTimeout(() => {
      signOut(`You were signed out after ${IDLE_SIGN_OUT_MINUTES} minutes of inactivity. Enter your code to continue.`);
    }, IDLE_SIGN_OUT_MINUTES * 60000);
  }
  let lastActivity = 0;
  ['click', 'keydown', 'scroll', 'touchstart'].forEach((type) => {
    window.addEventListener(type, () => {
      if (!idleTimer || Date.now() - lastActivity < 30000) return;
      lastActivity = Date.now();
      resetIdleTimer();
    }, { passive: true });
  });

  logoutButton.addEventListener('click', () => signOut('You have signed out.'));

  // First-visit welcome guide, hidden for good once dismissed.
  const welcome = document.getElementById('portalWelcome');
  let welcomeKey = '';
  function showWelcomeGuide(registrationId) {
    if (!welcome) return;
    welcomeKey = `trevWelcomeDismissed:${registrationId}`;
    welcome.hidden = storage.get(welcomeKey) === '1';
  }
  if (welcome) {
    document.getElementById('portalWelcomeDismiss').addEventListener('click', () => {
      welcome.hidden = true;
      if (welcomeKey) storage.set(welcomeKey, '1');
    });
    welcome.querySelectorAll('[data-welcome-target]').forEach((button) => {
      button.addEventListener('click', () => scrollToPortalSection(button.dataset.welcomeTarget));
    });
  }

  // "Lost your access code?" — the server always gives the same reply so
  // nobody can use this form to check who is enrolled.
  const lostToggle = document.getElementById('lostCodeToggle');
  const lostForm = document.getElementById('lostCodeForm');
  const lostEmail = document.getElementById('lostCodeEmail');
  const lostMessage = document.getElementById('lostCodeMessage');
  const lostSubmit = document.getElementById('lostCodeSubmit');
  const showLostMessage = (text, type = 'error') => {
    lostMessage.textContent = text;
    lostMessage.className = `form-message ${type}`;
    lostMessage.hidden = false;
  };
  if (lostToggle && lostForm) {
    lostToggle.addEventListener('click', () => {
      const open = lostForm.hidden;
      lostForm.hidden = !open;
      lostToggle.setAttribute('aria-expanded', String(open));
      if (open) lostEmail.focus();
    });
    lostEmail.addEventListener('input', () => {
      lostEmail.removeAttribute('aria-invalid');
      lostMessage.hidden = true;
    });
    lostForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = lostEmail.value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        lostEmail.setAttribute('aria-invalid', 'true');
        showLostMessage('Enter the full email address you registered with, such as you@example.com.');
        lostEmail.focus();
        return;
      }
      if (!endpointIsConfigured()) {
        showLostMessage('This feature is not available right now. Please contact support on WhatsApp.');
        return;
      }
      lostSubmit.disabled = true;
      lostSubmit.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>Sending…</span>';
      try {
        await fetch(config.appsScriptUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: new URLSearchParams({ action: 'resendcode', email }).toString()
        });
        showLostMessage('If that email matches an approved enrollment, your access code is on its way. Check your inbox and spam folder in the next few minutes.', 'success');
        lostForm.reset();
      } catch (_) {
        showLostMessage('We could not send the request. Check your internet connection and try again.');
      } finally {
        lostSubmit.disabled = false;
        lostSubmit.textContent = 'Email My Code';
      }
    });
  }

  // "Delete my data" — sends a request; the admin completes it from the Sheet.
  const deleteOpen = document.getElementById('deleteDataOpen');
  const deleteForm = document.getElementById('deleteDataForm');
  const deleteConfirm = document.getElementById('deleteDataConfirm');
  const deleteMessage = document.getElementById('deleteDataMessage');
  const deleteSubmit = document.getElementById('deleteDataSubmit');
  const showDeleteMessage = (text, type = 'error') => {
    deleteMessage.textContent = text;
    deleteMessage.className = `form-message ${type}`;
    deleteMessage.hidden = false;
  };
  if (deleteOpen && deleteForm) {
    deleteOpen.addEventListener('click', () => {
      deleteForm.hidden = false;
      deleteOpen.hidden = true;
      deleteConfirm.focus();
    });
    document.getElementById('deleteDataCancel').addEventListener('click', () => {
      deleteForm.reset();
      deleteForm.hidden = true;
      deleteMessage.hidden = true;
      deleteOpen.hidden = false;
      deleteOpen.focus();
    });
    deleteForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!deleteConfirm.checked) {
        showDeleteMessage('Tick the box to confirm you understand this cannot be undone.');
        deleteConfirm.focus();
        return;
      }
      if (!currentAccessCode) {
        showDeleteMessage('Your session has ended. Sign in again, then retry.');
        return;
      }
      deleteSubmit.disabled = true;
      deleteSubmit.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>Sending…</span>';
      try {
        const result = await jsonpRequest({
          action: 'datarequest',
          code: currentAccessCode,
          note: document.getElementById('deleteDataNote').value.trim().slice(0, 500)
        });
        if (result && result.ok) {
          showDeleteMessage(`Request received (${result.requestId}). We have emailed you a confirmation and will complete it within 30 days.`, 'success');
          deleteSubmit.hidden = true;
          document.getElementById('deleteDataCancel').textContent = 'Close';
          return;
        }
        showDeleteMessage(result && result.status === 'RATE_LIMITED'
          ? 'You have already sent this request. We will email you once it is complete.'
          : 'We could not send your request. Please contact support on WhatsApp.');
      } catch (error) {
        showDeleteMessage(error.message || 'We could not send your request. Try again shortly.');
      } finally {
        deleteSubmit.disabled = false;
        if (!deleteSubmit.hidden) deleteSubmit.textContent = 'Send Deletion Request';
      }
    });
  }

  assignmentModalClose.addEventListener('click', closeAssignmentModal);
  assignmentModal.querySelector('[data-close-assignment-modal]').addEventListener('click', closeAssignmentModal);
  videoModalClose.addEventListener('click', closeVideoModal);
  videoModal.querySelector('[data-close-video-modal]').addEventListener('click', closeVideoModal);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !assignmentModal.hidden) closeAssignmentModal();
    if (event.key === 'Escape' && !videoModal.hidden) closeVideoModal();
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

  continueLearningButton.addEventListener('click', () => scrollToPortalSection(continueLearningButton.dataset.target || 'portalResources'));
  promptSearch.addEventListener('input', filterPrompts);
  promptCategory.addEventListener('change', filterPrompts);
  promptLoadMore.addEventListener('click', () => drawPromptResults(false));

  const savedCode = readRememberedCode();
  if (savedCode) {
    codeInput.value = savedCode;
    rememberInput.checked = true;
    verifyCode(savedCode);
  }
})();

