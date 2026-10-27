/* Shared enrollment dates. Prices are configured separately from enrollment. */
(() => {
  'use strict';
  const cohort = window.TREV_CONFIG?.cohort;
  if (!cohort) return;
  const closes = new Date(cohort.closesAt).getTime();
  const starts = new Date(cohort.startsAt).getTime();
  const formatDate = (value) => new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos'
  }).format(new Date(value));
  const isOpen = (now = Date.now()) => Number.isFinite(closes) && Number(new Date(now)) <= closes;
  const apply = (root = document, now = Date.now()) => {
    const open = isOpen(now);
    root.querySelectorAll('[data-cohort-start]').forEach(el => { el.textContent = formatDate(starts); });
    root.querySelectorAll('[data-cohort-close]').forEach(el => { el.textContent = formatDate(closes); });
    root.querySelectorAll('[data-enrollment-open]').forEach(el => {
      // Registration owns its form after submission; never reopen it on a timer tick.
      if (el.dataset.registrationSubmitted !== 'true') el.hidden = !open;
    });
    root.querySelectorAll('[data-enrollment-closed]').forEach(el => { el.hidden = open; });
    root.querySelectorAll('[data-enroll-link]').forEach(el => {
      if (!el.dataset.enrollmentHref) {
        el.dataset.enrollmentHref = el.getAttribute('href');
        el.dataset.enrollmentLabel = el.textContent;
      }
      el.setAttribute('href', open ? el.dataset.enrollmentHref : 'contact.html#contact');
      el.textContent = open ? el.dataset.enrollmentLabel : 'Ask About the Next Cohort';
    });
  };
  window.TREV_ENROLLMENT = Object.freeze({ isOpen, apply, startsAt: starts, closesAt: closes });
  const init = () => { apply(); window.setInterval(() => apply(), 1000); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
