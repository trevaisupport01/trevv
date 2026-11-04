/**
 * TREV AI — Newsletter
 *
 * Install as its own file (Newsletter.gs) in the same Apps Script project as
 * Code.gs and Waitlist.gs.
 *
 * Each row in the "Content Updates" tab is one email. When its Scheduled Date
 * has passed and its Status is SCHEDULED, the daily trigger sends it to the
 * chosen audience. If the Gmail daily limit runs out, the row switches to
 * SENDING and the rest go out on the next run. Every email carries a one-click
 * unsubscribe link; unsubscribed addresses are kept in "Newsletter Unsubscribes".
 * Course emails (approval, access codes, assignment feedback) are not affected.
 */

var NEWSLETTER = {
  UNSUBSCRIBES_SHEET: 'Newsletter Unsubscribes',
  LOG_SHEET: 'Newsletter Log',
  WAITLIST_SHEET: 'Waitlist Subscribers',
  WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbz_oyQWP8kZ4lWjChn0V2GDC2DzILmyMhA9scAjlp_W_2Yyb_08icF0UDPgPskfLq85zg/exec',
  SITE_URL: 'https://trevv-nu.vercel.app',
  QUOTA_RESERVE: 15,
  AUDIENCES: ['EVERYONE', 'ALL_STUDENTS', 'WAITLIST', 'STARTER', 'PROFESSIONAL', 'VIP', 'BOTH', 'TEENS'],
  STATUSES: ['DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED']
};

var NEWSLETTER_UNSUBSCRIBE_HEADERS = ['Email', 'Unsubscribed At', 'Source'];
var NEWSLETTER_LOG_HEADERS = ['Update ID', 'Email', 'Recipient Type', 'Sent At'];

/* ---------------------------------------------------------------------------
 * Menu actions
 * ------------------------------------------------------------------------- */

function installContentUpdateTrigger() {
  requireAdmin_();
  prepareNewsletterSheets_();
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (['processContentUpdates', 'processContentUpdates_'].indexOf(trigger.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(trigger);
  });
  // Private handlers cannot be invoked through a student's google.script.run bridge.
  ScriptApp.newTrigger('processContentUpdates_').timeBased().everyDays(1).atHour(10).create();
  SpreadsheetApp.getUi().alert('Daily newsletter trigger installed for about 10:00 AM WAT. Rows in Content Updates marked SCHEDULED are sent once their date has passed.');
}

function processContentUpdates() {
  requireAdmin_();
  var result = processContentUpdates_();
  SpreadsheetApp.getUi().alert(result.busy ? 'Another send is already running. Try again in a minute.' :
    'Sent ' + result.sent + ' email(s).' + (result.waiting ? ' ' + result.waiting + ' more will go out on the next run because of the Gmail daily limit.' : ''));
}

/** Sends the selected Content Updates row to the admin only, marked [TEST]. */
function sendSelectedUpdateTest() {
  requireAdmin_();
  prepareNewsletterSheets_();
  var sheet = SpreadsheetApp.getActiveSheet();
  var row = sheet.getActiveRange() ? sheet.getActiveRange().getRow() : 0;
  if (sheet.getName() !== TREV.CONTENT_UPDATES_SHEET || row < 2) {
    SpreadsheetApp.getUi().alert('Open the Content Updates tab and click any cell in the email you want to test.');
    return;
  }
  var values = sheet.getRange(row, 1, 1, CONTENT_UPDATE_HEADERS.length).getValues()[0];
  var me = { email: TREV.ADMIN_EMAIL, name: 'Trev', type: 'STUDENT' };
  var ok = sendNewsletterEmail_(me, values, '[TEST] ');
  SpreadsheetApp.getUi().alert(ok ? 'Test sent to ' + TREV.ADMIN_EMAIL + '. Nothing was sent to students or the waitlist.' : 'The test email could not be sent. Check the Error Log tab.');
}

/** Copies people from any linked "Form Responses" tab into Waitlist Subscribers. */
function importWaitlistResponses() {
  requireAdmin_();
  var added = importWaitlistFromFormResponses_();
  SpreadsheetApp.getUi().alert(added ? added + ' new waitlist subscriber(s) added.' : 'No new waitlist sign-ups found. Link the waitlist Google Form to this spreadsheet first (Form > Responses > Link to Sheets).');
}

/* ---------------------------------------------------------------------------
 * Sending
 * ------------------------------------------------------------------------- */

/** Installed triggers run this private handler; manual sends use the guarded wrapper. */
function processContentUpdates_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { sent: 0, waiting: 0, busy: true };
  try {
    var ss = getSpreadsheet_();
    var sheet = prepareNewsletterSheets_();
    if (sheet.getLastRow() < 2) return { sent: 0, waiting: 0 };
    try { importWaitlistFromFormResponses_(); } catch (error) { logServerError_('newsletter:import', error); }

    var rows = getDataRows_(sheet, CONTENT_UPDATE_HEADERS.length, 2);
    var unsubscribed = getNewsletterUnsubscribes_(ss);
    var now = new Date();
    var totalSent = 0;
    var waiting = 0;

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var rowNumber = i + 2;
      var status = clean_(row[5], 30).toUpperCase();
      if (status !== 'SCHEDULED' && status !== 'SENDING') continue;
      var scheduled = row[4] instanceof Date ? row[4] : new Date(row[4]);
      if (isNaN(scheduled.getTime()) || scheduled.getTime() > now.getTime()) continue;

      var updateId = clean_(row[9], 40);
      if (!updateId) {
        updateId = 'U-' + Utilities.getUuid().slice(0, 8).toUpperCase();
        sheet.getRange(rowNumber, 10).setValue(updateId);
      }
      var alreadySent = getNewsletterSentSet_(ss, updateId);
      var recipients = getUpdateRecipients_(clean_(row[0], 30).toUpperCase(), now).filter(function(person) {
        return !unsubscribed[person.email] && !alreadySent[person.email];
      });

      var budget = MailApp.getRemainingDailyQuota() - NEWSLETTER.QUOTA_RESERVE;
      var log = [];
      var failed = 0;
      var j = 0;
      for (; j < recipients.length && budget > 0; j++) {
        if (sendNewsletterEmail_(recipients[j], row, '')) {
          log.push([updateId, recipients[j].email, recipients[j].type, new Date()]);
        } else {
          failed++;
        }
        budget--;
      }
      appendNewsletterLog_(ss, log);
      totalSent += log.length;
      var sentSoFar = Number(row[6] || 0) + log.length;
      var left = recipients.length - j;

      if (left > 0) {
        waiting += left;
        sheet.getRange(rowNumber, 6, 1, 2).setValues([['SENDING', sentSoFar]]);
        sheet.getRange(rowNumber, 6).setNote(left + ' recipient(s) left. They go out on the next run (Gmail daily limit).');
        break; // Out of quota: later rows wait for the next run.
      }
      sheet.getRange(rowNumber, 6, 1, 3).setValues([['SENT', sentSoFar, new Date()]]);
      if (failed) sheet.getRange(rowNumber, 6).setNote(failed + ' email(s) failed and were skipped. See the Error Log tab.');
      else sheet.getRange(rowNumber, 6).clearNote();
    }
    return { sent: totalSent, waiting: waiting };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Audience values:
 *   EVERYONE      all active students and the waitlist
 *   ALL_STUDENTS  Starter, Professional and VIP students
 *   WAITLIST      waitlist subscribers only
 *   STARTER / PROFESSIONAL / VIP   one package
 *   BOTH          Professional and VIP (kept for older rows)
 */
function getUpdateRecipients_(audience, now) {
  var seen = {};
  var result = [];
  var wantsStudents = audience !== 'WAITLIST';
  var wantsWaitlist = audience === 'WAITLIST' || audience === 'EVERYONE';

  if (wantsStudents) {
    getDataRows_(getRegistrationsSheet_(), REG_HEADERS.length, COL.REGISTRATION_ID).forEach(function(row) {
      if (clean_(row[COL.STATUS - 1], 30).toUpperCase() !== 'APPROVED') return;
      var key = clean_(row[COL.PACKAGE_KEY - 1], 30).toUpperCase();
      var packageInfo = PACKAGES[key];
      if (!packageInfo) return;
      var level = packageInfo.accessLevel;
      // Teens Scholarship families only receive emails sent to the TEENS audience,
      // addressed to the parent, never general newsletters.
      var eligible = level === 'TEENS' ? audience === 'TEENS' :
        (audience === 'EVERYONE' || audience === 'ALL_STUDENTS' || audience === level ||
        (audience === 'BOTH' && (level === 'PROFESSIONAL' || level === 'VIP')));
      if (!eligible || !accessWindow_(row, packageInfo, now).valid) return;
      var email = clean_(row[COL.EMAIL - 1], 120).toLowerCase();
      if (!isNewsletterEmail_(email) || seen[email]) return;
      seen[email] = true;
      var name = level === 'TEENS' && typeof teensParentName_ === 'function' ? teensParentName_(row) : clean_(row[COL.FULL_NAME - 1], 100);
      result.push({ email: email, name: name, type: level === 'TEENS' ? 'PARENT' : 'STUDENT' });
    });
  }

  if (wantsWaitlist) {
    var sheet = getNewsletterWaitlistSheet_();
    if (sheet) {
      getDataRows_(sheet, 10, 2).forEach(function(row) {
        var email = clean_(row[1], 150).toLowerCase();
        var status = clean_(row[7], 30).toUpperCase();
        if (!isNewsletterEmail_(email) || seen[email]) return;
        if (row[6] === true || String(row[6]).toUpperCase() === 'TRUE' || status === 'UNSUBSCRIBED' || status === 'INVALID') return;
        seen[email] = true;
        result.push({ email: email, name: clean_(row[0], 100), type: 'WAITLIST' });
      });
    }
  }
  return result;
}

function sendNewsletterEmail_(person, row, subjectPrefix) {
  var subject = (subjectPrefix || '') + clean_(row[1], 180);
  var content = cleanMultiline_(row[2], 10000);
  if (!clean_(row[1], 180) || !content) return false;
  var link = safeUrl_(row[3]);
  var label = clean_(row[8], 40);
  if (!link) {
    link = person.type === 'WAITLIST' ? NEWSLETTER.SITE_URL + '/course.html' : TREV.PORTAL_URL;
    label = label || (person.type === 'WAITLIST' ? 'See the course' : person.type === 'PARENT' ? 'Open the student portal' : 'Open your portal');
  }
  label = label || 'Read more';
  var first = firstName_(person.name);
  if (first === 'Student' && person.type === 'WAITLIST') first = 'there';
  var unsubscribeUrl = newsletterUnsubscribeUrl_(person.email);
  var why = person.type === 'STUDENT' ? 'You are receiving this because you are a TREV AI Academy student.' :
    person.type === 'PARENT' ? 'You are receiving this because your child is in the TREV AI Teens Scholarship.' :
    'You are receiving this because you joined the TREV AI Academy waitlist.';

  var text = 'Hi ' + first + ',\n\n' + content + '\n\n' + label + ': ' + link +
    '\n\n— Olutimehin Daniel, TREV AI Academy\n\n' + why + '\nUnsubscribe from these emails: ' + unsubscribeUrl;
  var html = emailShell_(clean_(row[1], 180),
    '<p>Hi ' + escapeHtml_(first) + ',</p>' +
    '<div style="white-space:pre-line;line-height:1.65">' + escapeHtml_(content) + '</div>' +
    '<p style="margin:26px 0"><a href="' + escapeHtml_(link) + '" style="display:inline-block;background:#f2b705;color:#111;text-decoration:none;font-weight:800;padding:12px 22px;border-radius:999px">' + escapeHtml_(label) + '</a></p>' +
    '<p style="margin:0">— Olutimehin Daniel, TREV AI Academy</p>' +
    '<p style="margin-top:24px;padding-top:14px;border-top:1px solid #eee;font-size:12px;color:#888">' + escapeHtml_(why) +
    ' <a href="' + escapeHtml_(unsubscribeUrl) + '" style="color:#666">Unsubscribe from these emails</a>.</p>');
  var ok = sendMailSafely_(person.email, subject, text, html);
  if (!ok) logServerError_('newsletter:send', new Error('Could not send "' + subject + '" to ' + person.email));
  return ok;
}

/* ---------------------------------------------------------------------------
 * Unsubscribe
 * ------------------------------------------------------------------------- */

function newsletterSecret_() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('NEWSLETTER_SECRET');
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('NEWSLETTER_SECRET', secret);
  }
  return secret;
}

function newsletterSignature_(email) {
  var bytes = Utilities.computeHmacSha256Signature(String(email).toLowerCase(), newsletterSecret_());
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '').slice(0, 24);
}

function newsletterUnsubscribeUrl_(email) {
  return NEWSLETTER.WEB_APP_URL + '?action=newsletteroff&e=' + encodeURIComponent(email) + '&s=' + newsletterSignature_(email);
}

/** doGet(action=newsletteroff) */
function handleNewsletterUnsubscribe_(parameters) {
  var email = clean_(parameters.e, 150).toLowerCase();
  var signature = clean_(parameters.s, 60);
  var ok = isNewsletterEmail_(email) && signature && signature === newsletterSignature_(email);
  if (ok) {
    var ss = getSpreadsheet_();
    var sheet = getOrCreateSheet_(ss, NEWSLETTER.UNSUBSCRIBES_SHEET, NEWSLETTER_UNSUBSCRIBE_HEADERS);
    if (!getNewsletterUnsubscribes_(ss)[email]) sheet.appendRow([email, new Date(), 'Email link']);
    var waitlist = getNewsletterWaitlistSheet_();
    if (waitlist && waitlist.getLastRow() > 1) {
      var found = waitlist.getRange(2, 2, waitlist.getLastRow() - 1, 1).createTextFinder(email).matchEntireCell(true).matchCase(false).findNext();
      if (found) waitlist.getRange(found.getRow(), 7, 1, 2).setValues([[true, 'UNSUBSCRIBED']]);
    }
  }
  var message = ok
    ? '<h1 style="font-size:26px">You are unsubscribed</h1><p>You will no longer receive TREV AI newsletters. Students still receive essential course emails, such as access codes and assignment feedback.</p><p>Changed your mind? Reply to any TREV AI email or write to ' + escapeHtml_(TREV.ADMIN_EMAIL) + '.</p>'
    : '<h1 style="font-size:26px">This link did not work</h1><p>Please email ' + escapeHtml_(TREV.ADMIN_EMAIL) + ' and we will remove you straight away.</p>';
  return HtmlService.createHtmlOutput('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<div style="max-width:560px;margin:60px auto;padding:32px 24px;border:1px solid #e4e4df;border-radius:12px;font-family:Arial,sans-serif;color:#1a1a1a">' +
    '<div style="font-weight:800;font-size:22px;margin-bottom:18px"><span style="color:#d4a100">TREV</span> AI</div>' + message + '</div>')
    .setTitle('TREV AI email preferences');
}

/* ---------------------------------------------------------------------------
 * Sheets
 * ------------------------------------------------------------------------- */

function prepareNewsletterSheets_() {
  var ss = getSpreadsheet_();
  var sheet = getOrCreateSheet_(ss, TREV.CONTENT_UPDATES_SHEET, CONTENT_UPDATE_HEADERS);
  formatContentUpdatesSheet_(sheet);
  styleAdminHeader_(getOrCreateSheet_(ss, NEWSLETTER.UNSUBSCRIBES_SHEET, NEWSLETTER_UNSUBSCRIBE_HEADERS), NEWSLETTER_UNSUBSCRIBE_HEADERS.length, '#111111', '#ffffff');
  styleAdminHeader_(getOrCreateSheet_(ss, NEWSLETTER.LOG_SHEET, NEWSLETTER_LOG_HEADERS), NEWSLETTER_LOG_HEADERS.length, '#111111', '#ffffff');
  return sheet;
}

function formatContentUpdatesSheet_(sheet) {
  styleAdminHeader_(sheet, CONTENT_UPDATE_HEADERS.length, '#f2b705', '#111111');
  sheet.setColumnWidth(1, 150); sheet.setColumnWidth(2, 260); sheet.setColumnWidth(3, 520);
  sheet.setColumnWidth(4, 300); sheet.setColumnWidth(5, 150); sheet.setColumnWidth(6, 120);
  sheet.setColumnWidth(9, 160); sheet.setColumnWidth(10, 120);
  var rows = Math.max(sheet.getMaxRows() - 1, 1);
  sheet.getRange(2, 1, rows, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(NEWSLETTER.AUDIENCES, true).build());
  sheet.getRange(2, 6, rows, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(NEWSLETTER.STATUSES, true).build());
  sheet.getRange(1, 1).setNote('EVERYONE = adult students and waitlist. ALL_STUDENTS = every adult package. WAITLIST = waitlist only. STARTER, PROFESSIONAL, VIP = one package. BOTH = Professional and VIP. TEENS = parents of Teens Scholarship children (they never get the other audiences).');
  sheet.getRange(1, 6).setNote('DRAFT = not sent. SCHEDULED = sent at about 10 AM once the date has passed. SENDING = part sent, rest goes out next run. SENT = done.');
  sheet.getRange(1, 9).setNote('Optional. Text for the yellow button. Leave Resource Link blank to send students to the portal and waitlist people to the course page.');
  sheet.getRange(1, 10).setNote('Filled in automatically. Used to avoid sending the same email twice.');
}

function getNewsletterUnsubscribes_(ss) {
  var sheet = getOrCreateSheet_(ss, NEWSLETTER.UNSUBSCRIBES_SHEET, NEWSLETTER_UNSUBSCRIBE_HEADERS);
  var map = {};
  getDataRows_(sheet, 1, 1).forEach(function(row) {
    var email = clean_(row[0], 150).toLowerCase();
    if (email) map[email] = true;
  });
  return map;
}

function getNewsletterSentSet_(ss, updateId) {
  var sheet = getOrCreateSheet_(ss, NEWSLETTER.LOG_SHEET, NEWSLETTER_LOG_HEADERS);
  var set = {};
  getDataRows_(sheet, 2, 1).forEach(function(row) {
    if (String(row[0]) === updateId) set[String(row[1]).toLowerCase()] = true;
  });
  return set;
}

function appendNewsletterLog_(ss, rows) {
  if (!rows.length) return;
  var sheet = getOrCreateSheet_(ss, NEWSLETTER.LOG_SHEET, NEWSLETTER_LOG_HEADERS);
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, NEWSLETTER_LOG_HEADERS.length).setValues(rows);
}

function getNewsletterWaitlistSheet_() {
  var ss = typeof getWaitlistSpreadsheet_ === 'function' ? getWaitlistSpreadsheet_() : getSpreadsheet_();
  return ss.getSheetByName(NEWSLETTER.WAITLIST_SHEET);
}

/** Adds sign-ups from linked "Form Responses" tabs that are not yet in Waitlist Subscribers. */
function importWaitlistFromFormResponses_() {
  var waitlist = getNewsletterWaitlistSheet_();
  if (!waitlist) return 0;
  var known = {};
  getDataRows_(waitlist, 2, 2).forEach(function(row) { known[clean_(row[1], 150).toLowerCase()] = true; });
  var additions = [];
  getSpreadsheet_().getSheets().forEach(function(sheet) {
    if (!/^form responses/i.test(sheet.getName()) || sheet.getLastRow() < 2) return;
    var values = sheet.getDataRange().getValues();
    // This project runs on the legacy (ES5) Apps Script runtime, so no findIndex.
    var emailCol = -1, nameCol = -1, timeCol = -1;
    values[0].forEach(function(header, index) {
      var text = String(header);
      if (emailCol < 0 && /e-?mail/i.test(text)) emailCol = index;
      if (nameCol < 0 && /name/i.test(text)) nameCol = index;
      if (timeCol < 0 && /timestamp/i.test(text)) timeCol = index;
    });
    if (emailCol < 0) return;
    values.slice(1).forEach(function(row) {
      var email = clean_(row[emailCol], 150).toLowerCase();
      if (!isNewsletterEmail_(email) || known[email]) return;
      known[email] = true;
      var joined = timeCol >= 0 && row[timeCol] instanceof Date ? row[timeCol] : new Date();
      additions.push([nameCol >= 0 ? clean_(row[nameCol], 100) : '', email, joined, 0, '', false, false, 'ACTIVE', Utilities.getUuid().replace(/-/g, ''), '']);
    });
  });
  // The tab has checkbox columns down to the last row, so find the last real email instead of getLastRow().
  if (additions.length) waitlist.getRange(lastDataRowByKey_(waitlist, 2) + 1, 1, additions.length, 10).setValues(additions);
  return additions.length;
}

function isNewsletterEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''));
}
