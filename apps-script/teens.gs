/**
 * TREV AI — Teens Scholarship (ages 13–16)
 *
 * Install as its own file (Teens.gs) next to Code.gs, Waitlist.gs and
 * Newsletter.gs. This project runs on the legacy (ES5) runtime: no arrow
 * functions, let/const or newer array methods.
 *
 * A parent registers the child on teens.html and pays ₦2,500. The row is saved
 * in Registrations with Package Key TEENS: Full Name is the child (used for the
 * portal and the certificate); Email and WhatsApp are the parent's. Parent
 * name, date of birth, school class and photo consent are kept in Admin Notes.
 * The first 20 PENDING or APPROVED rows hold the places. Anyone who registers
 * after that is saved as WAITLIST so no payment is ever lost.
 */

var TEENS_PROGRAM = {
  PACKAGE_KEY: 'TEENS',
  CAPACITY: 20,
  CLOSES_AT: '2026-11-11T23:59:59+01:00',
  FIRST_CLASS: '2026-11-14T16:00:00+01:00',
  MIN_AGE: 13,
  MAX_AGE: 16,
  START_LABEL: 'Saturday 14 November 2026',
  DATES_LABEL: 'Sat 14, Sun 15, Sat 21 and Sun 22 November 2026',
  TIME_LABEL: '4:00 – 5:30 PM (WAT), live on Google Meet'
};

/** doGet(action=teensplaces): public count of remaining places. */
function teensPlaces_() {
  var taken = countTeensPlacesTaken_();
  var closes = new Date(TEENS_PROGRAM.CLOSES_AT);
  var left = Math.max(0, TEENS_PROGRAM.CAPACITY - taken);
  return {
    ok: true,
    capacity: TEENS_PROGRAM.CAPACITY,
    taken: Math.min(taken, TEENS_PROGRAM.CAPACITY),
    left: left,
    closesAt: TEENS_PROGRAM.CLOSES_AT,
    open: left > 0 && new Date().getTime() <= closes.getTime()
  };
}

function countTeensPlacesTaken_() {
  var count = 0;
  getDataRows_(getRegistrationsSheet_(), REG_HEADERS.length, COL.REGISTRATION_ID).forEach(function(row) {
    var key = clean_(row[COL.PACKAGE_KEY - 1], 30).toUpperCase();
    var status = clean_(row[COL.STATUS - 1], 30).toUpperCase();
    if (key === TEENS_PROGRAM.PACKAGE_KEY && (status === 'PENDING' || status === 'APPROVED')) count++;
  });
  return count;
}

/** Called by registerStudent_ when packageKey is TEENS. */
function registerTeen_(parameters) {
  if (clean_(parameters.website, 200)) return { ok: true }; // honeypot

  var parentName = clean_(parameters.parentName, 100);
  var childName = clean_(parameters.childName, 100);
  var childDob = clean_(parameters.childDob, 10);
  var schoolClass = clean_(parameters.schoolClass, 40);
  var email = clean_(parameters.email, 120).toLowerCase();
  var whatsapp = clean_(parameters.whatsapp, 24);
  var country = clean_(parameters.country, 60) || 'Nigeria';
  var paymentReference = clean_(parameters.paymentReference, 120);
  var consent = String(parameters.consent).toLowerCase() === 'true';
  var aiConsent = String(parameters.aiConsent).toLowerCase() === 'true';
  var photoConsent = String(parameters.photoConsent).toLowerCase() === 'true';
  var packageInfo = PACKAGES.TEENS;

  if (parentName.length < 2) throw new Error('A parent or guardian name is required.');
  if (childName.length < 2) throw new Error('The child\'s name is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('A valid email is required.');
  if (whatsapp.replace(/\D/g, '').length < 7) throw new Error('A valid WhatsApp number is required.');
  if (!schoolClass) throw new Error('School class is required.');
  if (paymentReference.length < 3) throw new Error('A payment reference is required.');
  if (!consent || !aiConsent) throw new Error('Parent consent is required.');
  var age = teensAgeOn_(childDob, new Date(TEENS_PROGRAM.FIRST_CLASS));
  if (age === null || age < TEENS_PROGRAM.MIN_AGE || age > TEENS_PROGRAM.MAX_AGE) {
    throw new Error('The Teens Scholarship is for ages ' + TEENS_PROGRAM.MIN_AGE + ' to ' + TEENS_PROGRAM.MAX_AGE + '.');
  }
  if (isRateLimited_('register:' + email, RATE_LIMITS.REGISTER_PER_EMAIL)) {
    throw new Error('Too many registration attempts. Contact support if you already paid.');
  }

  var registrationId = clean_(parameters.registrationId, 40).toUpperCase();
  if (!/^TREV-[0-9]{8}-[A-Z0-9]{5}$/.test(registrationId)) registrationId = createRegistrationId_();

  var status;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('Registration service is busy.');
  try {
    var sheet = getRegistrationsSheet_();
    if (findExactRow_(sheet, COL.REGISTRATION_ID, registrationId)) {
      return { ok: true, registrationId: registrationId, duplicate: true };
    }
    var open = new Date().getTime() <= new Date(TEENS_PROGRAM.CLOSES_AT).getTime();
    // Never lose a paid sign-up: late or over-capacity rows are kept as WAITLIST.
    status = open && countTeensPlacesTaken_() < TEENS_PROGRAM.CAPACITY ? 'PENDING' : 'WAITLIST';
    var notes = 'TEENS | Parent: ' + parentName + ' | DOB: ' + childDob + ' (age ' + age + ') | Class: ' + schoolClass +
      ' | AI consent: yes | Photo consent: ' + (photoConsent ? 'yes' : 'no');

    sheet.appendRow([
      new Date(),
      safeCell_(registrationId),
      safeCell_(childName),
      safeCell_(email),
      safeCell_(whatsapp),
      safeCell_(country),
      TEENS_PROGRAM.PACKAGE_KEY,
      packageInfo.label,
      packageInfo.normalPrice,
      safeCell_(paymentReference),
      status,
      '',
      '',
      '',
      0,
      '',
      safeCell_(notes)
    ]);
    var row = sheet.getLastRow();
    sheet.getRange(row, COL.STATUS).setBackground(status === 'PENDING' ? '#fff7d6' : '#e0e7ff').setFontWeight('bold');
  } finally {
    lock.releaseLock();
  }

  sendTeensReceivedEmail_(parentName, childName, email, registrationId, status);
  sendMailSafely_(TREV.ADMIN_EMAIL,
    (status === 'WAITLIST' ? 'Teens WAITLIST (places full): ' : 'New Teens registration pending: ') + childName,
    'Child: ' + childName + ' (age ' + age + ', ' + schoolClass + ')\nParent: ' + parentName + '\nEmail: ' + email +
      '\nWhatsApp: ' + whatsapp + '\nPayment reference: ' + paymentReference + '\nPhoto consent: ' + (photoConsent ? 'yes' : 'no') +
      '\nRegistration ID: ' + registrationId + '\nStatus: ' + status +
      (status === 'WAITLIST' ? '\n\nAll 20 places were taken when this arrived. Refund the parent or offer a place if someone drops out.' :
        '\n\nVerify the transfer, select the row in Registrations, then use TREV Registration > Approve selected registration.'),
    emailShell_(status === 'WAITLIST' ? 'Teens sign-up on the waitlist' : 'New Teens registration pending',
      detailBox_([
        ['Child', childName + ' (age ' + age + ', ' + schoolClass + ')'],
        ['Parent', parentName],
        ['Email', email],
        ['WhatsApp', whatsapp],
        ['Payment reference', paymentReference],
        ['Photo consent', photoConsent ? 'Yes' : 'No'],
        ['Registration ID', registrationId],
        ['Status', status]
      ]) +
      (status === 'WAITLIST'
        ? '<p><strong>All 20 places were taken.</strong> Refund the parent, or approve this row if a place opens up.</p>'
        : '<p><strong>Next step:</strong> verify the transfer, select the row in Registrations, then choose <em>TREV Registration → Approve selected registration</em>.</p>')));

  return { ok: true, registrationId: registrationId, status: status };
}

/** Whole years between a YYYY-MM-DD birth date and a reference date, or null. */
function teensAgeOn_(dob, onDate) {
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob || '');
  if (!match) return null;
  var year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  var age = onDate.getFullYear() - year;
  if (onDate.getMonth() + 1 < month || (onDate.getMonth() + 1 === month && onDate.getDate() < day)) age--;
  return age >= 0 && age < 100 ? age : null;
}

/** Parent name stored in Admin Notes, e.g. "TEENS | Parent: Ada Obi | ...". */
function teensParentName_(row) {
  var match = /Parent:\s*([^|]+)/.exec(String(row[COL.ADMIN_NOTES - 1] || ''));
  return match ? clean_(match[1], 100) : 'Parent';
}

function sendTeensReceivedEmail_(parentName, childName, email, registrationId, status) {
  var waitlisted = status === 'WAITLIST';
  var subject = waitlisted ? 'Teens Scholarship: all places are taken' : 'Teens Scholarship: registration received';
  var lines = waitlisted
    ? ['Thank you for registering ' + childName + '. Unfortunately all 20 places were taken before your registration arrived.',
       'Your child is now first in line if a place opens up. If you have already paid and would prefer a refund, reply to this email or message us on WhatsApp and we will refund you.']
    : ['We received ' + childName + '\'s registration for the TREV AI Teens Scholarship (₦2,500).',
       'We will check your transfer and then send your child\'s access code to this email and WhatsApp, usually within a few hours.'];
  var text = 'Hello ' + firstName_(parentName) + ',\n\n' + lines.join('\n\n') +
    '\n\nRegistration reference: ' + registrationId +
    '\nClasses: ' + TEENS_PROGRAM.DATES_LABEL + ', ' + TEENS_PROGRAM.TIME_LABEL + '\n\nTREV AI Academy\n' + TREV.ADMIN_EMAIL;
  var html = emailShell_(waitlisted ? 'All places are taken' : 'Registration received',
    '<p>Hello ' + escapeHtml_(firstName_(parentName)) + ',</p>' +
    lines.map(function(line) { return '<p>' + escapeHtml_(line) + '</p>'; }).join('') +
    detailBox_([
      ['Child', childName],
      ['Registration reference', registrationId],
      ['Status', waitlisted ? 'Waitlist' : 'Payment check pending'],
      ['Classes', TEENS_PROGRAM.DATES_LABEL],
      ['Time', TEENS_PROGRAM.TIME_LABEL]
    ]));
  return sendMailSafely_(email, subject, text, html);
}

/** Used by approveSelectedRegistration and resendSelectedAccessEmail for TEENS rows. */
function sendTeensApprovalEmail_(row, codes) {
  var parent = teensParentName_(row);
  var child = clean_(row[COL.FULL_NAME - 1], 100);
  var email = clean_(row[COL.EMAIL - 1], 120);
  var community = getCommunityInfo_('TEENS');
  var subject = 'Teens Scholarship confirmed: ' + firstName_(child) + '\'s access code';
  var steps = [
    'Create or check your child\'s Google account (needed for Gemini). For ages 13–16 a parent should help set it up.',
    'Log in to the student portal with the code below to see the classes, materials and tasks.',
    'We will send the Google Meet link for every class to this email and WhatsApp before ' + TEENS_PROGRAM.START_LABEL + '.'
  ];
  if (community.inviteUrl) steps.push('Join the parents\' WhatsApp group: ' + community.inviteUrl);
  var text = 'Hello ' + firstName_(parent) + ',\n\nYour payment is confirmed and ' + child + ' has a place in the TREV AI Teens Scholarship.\n\n' +
    'Access code: ' + codes[0] + '\nStudent portal: ' + TREV.PORTAL_URL + '\n\nClasses: ' + TEENS_PROGRAM.DATES_LABEL + '\nTime: ' + TEENS_PROGRAM.TIME_LABEL + '\n\n' +
    'Before the first class:\n' + steps.map(function(step, index) { return (index + 1) + '. ' + step; }).join('\n') +
    '\n\nKeep the access code private. Children who attend at least 3 of the 4 classes and present their final project receive a TREV AI Teens certificate.\n\nTREV AI Academy';
  var html = emailShell_('Your child\'s place is confirmed',
    '<p>Hello ' + escapeHtml_(firstName_(parent)) + ',</p>' +
    '<p>Your payment is confirmed and <strong>' + escapeHtml_(child) + '</strong> has a place in the TREV AI Teens Scholarship.</p>' +
    '<div style="margin:24px 0;padding:22px;background:#111;color:#fff;border-radius:10px;text-align:center">' +
      '<div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#f2b705;margin-bottom:8px">Student access code</div>' +
      '<div style="font-family:monospace;font-size:22px;font-weight:800;letter-spacing:.06em">' + escapeHtml_(codes[0]) + '</div>' +
    '</div>' +
    detailBox_([['Classes', TEENS_PROGRAM.DATES_LABEL], ['Time', TEENS_PROGRAM.TIME_LABEL], ['Registration ID', clean_(row[COL.REGISTRATION_ID - 1], 40)]]) +
    '<p><strong>Before the first class</strong></p><ol>' + steps.map(function(step) { return '<li style="margin-bottom:6px">' + escapeHtml_(step) + '</li>'; }).join('') + '</ol>' +
    '<p style="text-align:center;margin:24px 0"><a href="' + escapeHtml_(TREV.PORTAL_URL) + '" style="display:inline-block;background:#f2b705;color:#111;text-decoration:none;font-weight:800;padding:12px 22px;border-radius:999px">Open the student portal</a></p>' +
    '<p>Children who attend at least 3 of the 4 classes and present their final project receive a TREV AI Teens certificate.</p>');
  return sendMailSafely_(email, subject, text, html);
}

function buildTeensWhatsAppMessage_(row, codes) {
  var parent = teensParentName_(row);
  var child = clean_(row[COL.FULL_NAME - 1], 100);
  var community = getCommunityInfo_('TEENS');
  return 'Hello ' + firstName_(parent) + ', your payment is confirmed and ' + child + ' has a place in the TREV AI Teens Scholarship.\n\n' +
    'Access code: *' + codes[0] + '*\nStudent portal: ' + TREV.PORTAL_URL + '\n\nClasses: ' + TEENS_PROGRAM.DATES_LABEL + '\n' + TEENS_PROGRAM.TIME_LABEL +
    (community.inviteUrl ? '\n\nParents\' WhatsApp group: ' + community.inviteUrl : '') +
    '\n\nWe will send the Google Meet link before the first class.\n\n— TREV AI Academy';
}
