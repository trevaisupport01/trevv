/*
 * TREV AI site monitoring
 *  - Error tracking: browser errors are sent to the Apps Script backend and
 *    appear in the "Error Log" tab of the Google Sheet.
 *  - Analytics: loads Vercel Web Analytics (cookie-free page-view counts).
 *    Turn it on in Vercel: Project > Analytics > Enable.
 * Loaded in <head> without defer so it catches errors from every other script.
 */
(() => {
  'use strict';

  const host = window.location.hostname;
  const isLocal = !host || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost');
  const MAX_REPORTS_PER_PAGE = 5;
  const sent = new Set();

  const endpoint = () => {
    const url = window.TREV_CONFIG && window.TREV_CONFIG.appsScriptUrl;
    return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url || '') ? url : '';
  };

  const report = (message, detail) => {
    const text = String(message || 'Unknown error').slice(0, 500);
    if (sent.size >= MAX_REPORTS_PER_PAGE || sent.has(text)) return;
    sent.add(text);
    if (isLocal) {
      console.warn('[TREV monitoring] would report:', text, detail || '');
      return;
    }
    const url = endpoint();
    if (!url) return;
    const body = new URLSearchParams({
      action: 'logerror',
      page: window.location.pathname + window.location.search.replace(/([?&]code=)[^&]*/i, '$1[hidden]'),
      message: text,
      detail: String(detail || '').slice(0, 500),
      browser: navigator.userAgent.slice(0, 300)
    });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(url, body)) return;
    } catch (_) { /* fall through */ }
    try {
      fetch(url, { method: 'POST', mode: 'no-cors', keepalive: true, body }).catch(() => {});
    } catch (_) { /* never let monitoring break the page */ }
  };

  // Errors from browser extensions or other sites carry no useful detail.
  const isNoise = (message, source) =>
    /^Script error\.?$/i.test(message || '') ||
    /^(chrome|moz|safari|safari-web)-extension:/i.test(source || '') ||
    /ResizeObserver loop/i.test(message || '');

  window.addEventListener('error', (event) => {
    if (!event || !event.message) return; // failed images/scripts have no message
    if (isNoise(event.message, event.filename)) return;
    const where = event.filename ? `${event.filename.split('/').pop()}:${event.lineno}:${event.colno}` : '';
    report(event.message, [where, event.error && event.error.stack].filter(Boolean).join(' | '));
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event && event.reason;
    const message = reason && reason.message ? reason.message : String(reason);
    if (isNoise(message, reason && reason.stack)) return;
    report(`Unhandled promise rejection: ${message}`, reason && reason.stack);
  });

  // Lets other scripts report a handled problem: window.trevReportError('msg', 'detail')
  window.trevReportError = report;

  // Vercel Web Analytics. Does nothing until enabled in the Vercel dashboard,
  // and is skipped on local copies of the site.
  if (!isLocal) {
    window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
    const script = document.createElement('script');
    script.defer = true;
    script.src = '/_vercel/insights/script.js';
    document.head.appendChild(script);
  }
})();
