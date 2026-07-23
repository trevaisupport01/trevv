/**
 * TREV AI — Registration, payment approval, access-code and portal backend
 *
 * Install in a Google Sheet:
 *   Sheet > Extensions > Apps Script > replace Code.gs with this file.
 *   Run setupTrevSystem() once, then deploy as a Web App.
 *
 * The website submits registrations to doPost(). Students log in through
 * doGet() using a unique code. Resources stay in the Google Sheet and are
 * returned only after an approved code is verified.
 */

var TREV = {
  ADMIN_EMAIL: 'trevaisupport01@gmail.com',
  SUPPORT_WHATSAPP: '2348139908559',
  PORTAL_URL: 'https://trevaisupport01.github.io/Trev/portal.html',
  BANK_NAME: 'OPAY',
  ACCOUNT_NAME: 'DANIEL GBENGA OLUTIMEHIN',
  ACCOUNT_NUMBER: '6109478874',
  REGISTRATIONS_SHEET: 'Registrations',
  RESOURCES_SHEET: 'Resources',
  ASSIGNMENTS_SHEET: 'Assignments',
  SUBMISSIONS_SHEET: 'Assignment Submissions',
  TIMETABLE_SHEET: 'Timetable',
  CHECKLIST_SHEET: 'Onboarding Checklist',
  GUIDELINES_SHEET: 'Community Guidelines',
  SETTINGS_SHEET: 'Portal Settings',
  CERTIFICATES_SHEET: 'Certificates',
  CONTENT_UPDATES_SHEET: 'Content Updates',
  ATTENDANCE_SHEET: 'Attendance',
  UPLOAD_ROOT_FOLDER: 'TREV AI Assignment Uploads',
  MATERIAL_ROOT_FOLDER: 'TREV AI Course Materials',
  MAX_UPLOAD_BYTES: 10 * 1024 * 1024,
  MAX_MATERIAL_BYTES: 20 * 1024 * 1024,
  COHORT_START: '2026-08-04',
  CAPSTONE_DEADLINE: '2026-08-29',
  CERTIFICATE_RELEASE: '2026-08-31',
  CLASS_DURATION_MINUTES: 90,
  TIMEZONE: 'Africa/Lagos'
};

var REG_HEADERS = [
  'Timestamp',
  'Registration ID',
  'Full Name',
  'Email',
  'WhatsApp',
  'Country',
  'Package Key',
  'Package',
  'Price',
  'Payment Reference',
  'Status',
  'Access Code',
  'Approved At',
  'Last Portal Access',
  'Login Count',
  'WhatsApp Approval Link',
  'Admin Notes'
];

var RESOURCE_HEADERS = [
  'Access Level',
  'Category',
  'Title',
  'Description',
  'URL',
  'Button Label',
  'Material Type',
  'File Size',
  'Visible',
  'Sort Order',
  'Drive File ID'
];

var ASSIGNMENT_HEADERS = [
  'Assignment ID',
  'Access Level',
  'Title',
  'Instructions',
  'Guidelines',
  'Grading Rubric',
  'Due Date',
  'Accepted Files',
  'Max Size MB',
  'Visible',
  'Sort Order'
];

var TIMETABLE_HEADERS = [
  'Date',
  'Day',
  'Access Level',
  'Session',
  'Session Title',
  'Activity Type',
  'Duration',
  'Class Time',
  'Status',
  'Portal Note'
];

var CHECKLIST_HEADERS = [
  'Access Level',
  'Sort Order',
  'Item',
  'Description',
  'Required',
  'Visible'
];

var GUIDELINE_HEADERS = [
  'Rule ID',
  'Title',
  'Guideline',
  'Visible',
  'Sort Order'
];

var SETTING_HEADERS = ['Key', 'Value', 'Notes'];

var CERTIFICATE_HEADERS = [
  'Certificate ID',
  'Student Name',
  'Registration ID',
  'Package Key',
  'Package',
  'Attendance %',
  'Capstone Status',
  'Issue Date',
  'Status',
  'PDF URL'
];

var ATTENDANCE_HEADERS = [
  'Date',
  'Session',
  'Access Level',
  'Registration ID',
  'Student Name',
  'Present',
  'Minutes Attended',
  'Notes'
];

var CONTENT_UPDATE_HEADERS = [
  'Audience',
  'Subject',
  'Email Content',
  'Resource Link',
  'Scheduled Date',
  'Status',
  'Recipient Count',
  'Sent At'
];

var SUBMISSION_HEADERS = [
  'Timestamp',
  'Submission ID',
  'Registration ID',
  'Student Name',
  'Email',
  'Package',
  'Assignment ID',
  'Assignment Title',
  'File Name',
  'Drive File URL',
  'Student Note',
  'Status',
  'Feedback',
  'Reviewed At'
];

var ALLOWED_UPLOAD_EXTENSIONS = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'zip', 'jpg', 'jpeg', 'png'];

// Per-execution cache: avoids reopening the same spreadsheet and rereading
// Portal Settings many times during a single login request.
var TREV_REQUEST_CACHE = {};

var COL = {
  TIMESTAMP: 1,
  REGISTRATION_ID: 2,
  FULL_NAME: 3,
  EMAIL: 4,
  WHATSAPP: 5,
  COUNTRY: 6,
  PACKAGE_KEY: 7,
  PACKAGE_LABEL: 8,
  PRICE: 9,
  PAYMENT_REFERENCE: 10,
  STATUS: 11,
  ACCESS_CODE: 12,
  APPROVED_AT: 13,
  LAST_ACCESS: 14,
  LOGIN_COUNT: 15,
  WHATSAPP_LINK: 16,
  ADMIN_NOTES: 17
};

var PACKAGES = {
  STARTER: {
    label: 'Starter Package', earlyPrice: '₦8,000', normalPrice: '₦10,000',
    accessLevel: 'STARTER', codePrefix: 'STA'
  },
  PROFESSIONAL: {
    label: 'Professional Package', earlyPrice: '₦30,000', normalPrice: '₦35,000',
    accessLevel: 'PROFESSIONAL', codePrefix: 'PRO'
  },
  VIP_SEAT: {
    label: 'VIP Executive — Individual Seat', earlyPrice: '₦70,000', normalPrice: '₦75,000',
    accessLevel: 'VIP', codePrefix: 'VIP'
  },
  VIP_TEAM: {
    label: 'VIP Executive — Team of up to 5', earlyPrice: '₦225,000', normalPrice: '₦250,000',
    accessLevel: 'VIP', codePrefix: 'VIP'
  }
};


function isEarlyBirdAt_(date) {
  var deadline = new Date('2026-07-28T23:59:59+01:00');
  return (date || new Date()).getTime() <= deadline.getTime();
}

function packageWithPrice_(packageInfo, capturedPrice) {
  var copy = {};
  Object.keys(packageInfo).forEach(function(key) { copy[key] = packageInfo[key]; });
  copy.price = capturedPrice || (isEarlyBirdAt_(new Date()) ? packageInfo.earlyPrice : packageInfo.normalPrice);
  return copy;
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('TREV Registration')
    .addItem('Set up / repair workbook', 'setupTrevSystem')
    .addSeparator()
    .addItem('Approve selected registration', 'approveSelectedRegistration')
    .addItem('Resend selected access email', 'resendSelectedAccessEmail')
    .addItem('Rebuild selected WhatsApp link', 'rebuildSelectedWhatsAppLink')
    .addItem('Suspend selected access', 'suspendSelectedAccess')
    .addSeparator()
    .addItem('Refresh portal data cache', 'refreshPortalCache')
    .addToUi();

  SpreadsheetApp.getUi()
    .createMenu('TREV Content Manager')
    .addItem('Upload Course Material', 'showMaterialManager')
    .addItem('Edit / Replace Selected Material', 'editSelectedMaterial')
    .addSeparator()
    .addItem('Unpublish Selected Material', 'unpublishSelectedMaterial')
    .addItem('Publish Selected Material', 'publishSelectedMaterial')
    .addItem('Delete Selected Material', 'deleteSelectedMaterial')
    .addItem('Refresh Portal Content', 'refreshPortalCache')
    .addToUi();

  SpreadsheetApp.getUi()
    .createMenu('TREV Updates')
    .addItem('Install Daily Email Trigger', 'installContentUpdateTrigger')
    .addItem('Send Due Updates Now', 'processContentUpdates')
    .addToUi();
}


/** Automatically invalidate portal data after relevant Sheet edits. */
function onEdit(e) {
  try {
    var sheet = e && e.range && e.range.getSheet();
    if (!sheet) return;
    var watched = [
      TREV.RESOURCES_SHEET,
      TREV.ASSIGNMENTS_SHEET,
      TREV.TIMETABLE_SHEET,
      TREV.CHECKLIST_SHEET,
      TREV.GUIDELINES_SHEET,
      TREV.SETTINGS_SHEET
    ];
    if (watched.indexOf(sheet.getName()) !== -1) clearPortalCache_();
  } catch (error) {
    console.error('Portal cache auto-refresh failed: ' + error);
  }
}

/** Run once before deploying the Web App. Safe to run again. */
function setupTrevSystem() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Open this script from a Google Sheet, then run setupTrevSystem again.');

  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  ss.setSpreadsheetTimeZone(TREV.TIMEZONE);

  var registrations = getOrCreateSheet_(ss, TREV.REGISTRATIONS_SHEET, REG_HEADERS);
  var resources = getOrUpgradeResourcesSheet_(ss);
  var assignments = getOrUpgradeAssignmentsSheet_(ss);
  var submissions = getOrCreateSheet_(ss, TREV.SUBMISSIONS_SHEET, SUBMISSION_HEADERS);
  var timetable = getOrCreateSheet_(ss, TREV.TIMETABLE_SHEET, TIMETABLE_HEADERS);
  var checklist = getOrCreateSheet_(ss, TREV.CHECKLIST_SHEET, CHECKLIST_HEADERS);
  var guidelines = getOrCreateSheet_(ss, TREV.GUIDELINES_SHEET, GUIDELINE_HEADERS);
  var settings = getOrCreateSheet_(ss, TREV.SETTINGS_SHEET, SETTING_HEADERS);
  var certificates = getOrCreateSheet_(ss, TREV.CERTIFICATES_SHEET, CERTIFICATE_HEADERS);
  var contentUpdates = getOrCreateSheet_(ss, TREV.CONTENT_UPDATES_SHEET, CONTENT_UPDATE_HEADERS);
  var attendance = getOrCreateSheet_(ss, TREV.ATTENDANCE_SHEET, ATTENDANCE_HEADERS);

  formatRegistrationsSheet_(registrations);
  formatResourcesSheet_(resources);
  formatAssignmentsSheet_(assignments);
  formatSubmissionsSheet_(submissions);
  formatTimetableSheet_(timetable);
  formatChecklistSheet_(checklist);
  formatGuidelinesSheet_(guidelines);
  formatSettingsSheet_(settings);
  formatCertificatesSheet_(certificates);
  formatContentUpdatesSheet_(contentUpdates);
  formatAttendanceSheet_(attendance);
  removeLegacyTestContent_(resources, assignments);
  addTimetableRows_(timetable);
  addChecklistRows_(checklist);
  addGuidelineRows_(guidelines);
  addSettingRows_(settings);

  // Remove old FALSE checkbox values from otherwise blank rows. Those values
  // made Sheets report hundreds of empty records and slowed portal login.
  clearBlankTail_(resources, 3, RESOURCE_HEADERS.length);
  clearBlankTail_(assignments, 1, ASSIGNMENT_HEADERS.length);
  clearBlankTail_(checklist, 3, CHECKLIST_HEADERS.length);
  clearBlankTail_(guidelines, 1, GUIDELINE_HEADERS.length);
  getUploadRootFolder_();
  getMaterialRootFolder_();
  clearPortalCache_();

  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert(
    'TREV registration system is ready',
    'Next: Deploy > New deployment > Web app. Execute as Me and allow access to Anyone. Copy the /exec URL into js/config.js on the website.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/** Receives registration forms from register.html. */
function doPost(e) {
  try {
    var action = clean_(e && e.parameter && e.parameter.action, 30).toLowerCase();
    if (action !== 'register') return jsonOutput_({ ok: false, error: 'Unsupported action.' });
    return jsonOutput_(registerStudent_(e.parameter));
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return jsonOutput_({ ok: false, error: 'Registration could not be processed.' });
  }
}

/** Verifies portal access through JSONP and serves the embedded upload form. */
function doGet(e) {
  var parameters = (e && e.parameter) || {};
  var action = clean_(parameters.action, 30).toLowerCase();

  // Assignment uploads use an Apps Script HTML page so file Blobs can be
  // transferred securely with google.script.run while remaining embedded in
  // the TREV portal rather than redirecting to a secondary website.
  if (action === 'upload') {
    return renderAssignmentUploadPage_(parameters.code, parameters.assignmentId);
  }

  var callback = cleanCallback_(parameters.callback);
  var payload;

  try {
    if (action === 'health') {
      payload = { ok: true, service: 'TREV AI Student Portal' };
    } else if (action === 'verify') {
      payload = verifyAccessCode_(parameters.code);
    } else if (action === 'verifycertificate') {
      payload = verifyCertificate_(parameters.certificateId);
    } else {
      payload = { valid: false, error: 'Unsupported action.' };
    }
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    payload = { valid: false, error: 'The portal service is temporarily unavailable.' };
  }

  return callback ? javascriptOutput_(callback, payload) : jsonOutput_(payload);
}

function registerStudent_(parameters) {
  if (clean_(parameters.website, 200)) {
    // Honeypot: act successful so automated spam does not learn anything.
    return { ok: true };
  }

  var fullName = clean_(parameters.fullName, 100);
  var email = clean_(parameters.email, 120).toLowerCase();
  var whatsapp = clean_(parameters.whatsapp, 24);
  var country = clean_(parameters.country, 60);
  var packageKey = clean_(parameters.packageKey, 30).toUpperCase().replace(/-/g, '_');
  var paymentReference = clean_(parameters.paymentReference, 120);
  var consent = String(parameters.consent).toLowerCase() === 'true';
  var packageInfo = PACKAGES[packageKey];
  if (packageInfo) packageInfo = packageWithPrice_(packageInfo);

  if (fullName.length < 2) throw new Error('A valid full name is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('A valid email is required.');
  if (whatsapp.replace(/\D/g, '').length < 7) throw new Error('A valid WhatsApp number is required.');
  if (!country) throw new Error('Country is required.');
  if (!packageInfo) throw new Error('Invalid package.');
  if (paymentReference.length < 3) throw new Error('A payment reference is required.');
  if (!consent) throw new Error('Consent is required.');

  var registrationId = clean_(parameters.registrationId, 40).toUpperCase();
  if (!/^TREV-[0-9]{8}-[A-Z0-9]{5}$/.test(registrationId)) registrationId = createRegistrationId_();

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('Registration service is busy.');

  try {
    var sheet = getRegistrationsSheet_();
    if (findExactRow_(sheet, COL.REGISTRATION_ID, registrationId)) {
      return { ok: true, registrationId: registrationId, duplicate: true };
    }

    sheet.appendRow([
      new Date(),
      safeCell_(registrationId),
      safeCell_(fullName),
      safeCell_(email),
      safeCell_(whatsapp),
      safeCell_(country),
      packageKey,
      packageInfo.label,
      packageInfo.price,
      safeCell_(paymentReference),
      'PENDING',
      '',
      '',
      '',
      0,
      '',
      ''
    ]);

    var row = sheet.getLastRow();
    sheet.getRange(row, COL.STATUS).setBackground('#fff7d6').setFontWeight('bold');
  } finally {
    lock.releaseLock();
  }

  sendPendingStudentEmail_(fullName, email, registrationId, packageInfo);
  sendAdminRegistrationEmail_({
    registrationId: registrationId,
    fullName: fullName,
    email: email,
    whatsapp: whatsapp,
    country: country,
    packageLabel: packageInfo.label,
    price: packageInfo.price,
    paymentReference: paymentReference
  });

  return { ok: true, registrationId: registrationId, status: 'PENDING' };
}

/** Select a registration row, then run this from the TREV Registration menu. */
function approveSelectedRegistration() {
  var ui = SpreadsheetApp.getUi();
  var context = getSelectedRegistration_();
  var row = context.values;
  var packageKey = String(row[COL.PACKAGE_KEY - 1]).toUpperCase();
  var packageInfo = PACKAGES[packageKey];
  if (packageInfo) packageInfo = packageWithPrice_(packageInfo, String(row[COL.PRICE - 1] || ''));

  if (!packageInfo) {
    ui.alert('Cannot approve', 'The selected row has an invalid package key.', ui.ButtonSet.OK);
    return;
  }

  var confirmation = ui.alert(
    'Confirm verified payment',
    'Approve ' + row[COL.FULL_NAME - 1] + ' for ' + packageInfo.label + ' (' + packageInfo.price + ')? Only continue after confirming the bank transfer.',
    ui.ButtonSet.YES_NO
  );
  if (confirmation !== ui.Button.YES) return;

  var existingCodes = splitAccessCodes_(row[COL.ACCESS_CODE - 1]);
  var codes = existingCodes.length
    ? existingCodes
    : generateUniqueAccessCodes_(packageInfo.codePrefix, packageKey === 'VIP_TEAM' ? 5 : 1);
  var codeCell = codes.join(' | ');
  var message = buildApprovalWhatsAppMessage_(row[COL.FULL_NAME - 1], packageInfo, codes);
  var whatsappUrl = buildWhatsAppUrl_(row[COL.WHATSAPP - 1], message);

  context.sheet.getRange(context.rowNumber, COL.STATUS).setValue('APPROVED').setBackground('#dcfce7').setFontWeight('bold');
  context.sheet.getRange(context.rowNumber, COL.ACCESS_CODE).setValue(codeCell);
  context.sheet.getRange(context.rowNumber, COL.APPROVED_AT).setValue(new Date());

  // Keep the very long pre-filled wa.me URL hidden behind a short clickable label.
  setShortWhatsAppLink_(context.sheet.getRange(context.rowNumber, COL.WHATSAPP_LINK), whatsappUrl);
  SpreadsheetApp.flush();

  var emailed = sendApprovalEmail_(
    row[COL.FULL_NAME - 1],
    row[COL.EMAIL - 1],
    row[COL.REGISTRATION_ID - 1],
    packageInfo,
    codes
  );

  ui.alert(
    'Registration approved',
    (codes.length > 1 ? 'Team access codes: ' : 'Access code: ') + codes.join(', ') +
      '\n\nEmail: ' + (emailed ? 'sent' : 'could not be sent') +
      '\nWhatsApp: open the link in column P to send the prepared approval message.',
    ui.ButtonSet.OK
  );
}

function resendSelectedAccessEmail() {
  var ui = SpreadsheetApp.getUi();
  var context = getSelectedRegistration_();
  var row = context.values;
  var packageInfo = PACKAGES[String(row[COL.PACKAGE_KEY - 1]).toUpperCase()];
  if (packageInfo) packageInfo = packageWithPrice_(packageInfo, String(row[COL.PRICE - 1] || ''));
  var codes = splitAccessCodes_(row[COL.ACCESS_CODE - 1]);

  if (!packageInfo || !codes.length || String(row[COL.STATUS - 1]).toUpperCase() !== 'APPROVED') {
    ui.alert('This row must already be APPROVED and have an access code.');
    return;
  }

  var sent = sendApprovalEmail_(
    row[COL.FULL_NAME - 1],
    row[COL.EMAIL - 1],
    row[COL.REGISTRATION_ID - 1],
    packageInfo,
    codes
  );
  ui.alert(sent ? 'Access email sent again.' : 'Email could not be sent. Check the Apps Script execution log.');
}

/** Replaces an existing long URL in column P without resending an email. */
function rebuildSelectedWhatsAppLink() {
  var ui = SpreadsheetApp.getUi();
  var context = getSelectedRegistration_();
  var row = context.values;
  var packageInfo = PACKAGES[String(row[COL.PACKAGE_KEY - 1]).toUpperCase()];
  if (packageInfo) packageInfo = packageWithPrice_(packageInfo, String(row[COL.PRICE - 1] || ''));
  var codes = splitAccessCodes_(row[COL.ACCESS_CODE - 1]);

  if (!packageInfo || !codes.length) {
    ui.alert('This row must have a valid package and at least one access code.');
    return;
  }

  var message = buildApprovalWhatsAppMessage_(row[COL.FULL_NAME - 1], packageInfo, codes);
  var whatsappUrl = buildWhatsAppUrl_(row[COL.WHATSAPP - 1], message);
  setShortWhatsAppLink_(context.sheet.getRange(context.rowNumber, COL.WHATSAPP_LINK), whatsappUrl);
  ui.alert('Column P now displays “Send code on WhatsApp” instead of the long URL.');
}

function suspendSelectedAccess() {
  var ui = SpreadsheetApp.getUi();
  var context = getSelectedRegistration_();
  var row = context.values;
  var confirmation = ui.alert(
    'Suspend student access?',
    'The code for ' + row[COL.FULL_NAME - 1] + ' will immediately stop working. It can be restored by approving the row again.',
    ui.ButtonSet.YES_NO
  );
  if (confirmation !== ui.Button.YES) return;

  context.sheet.getRange(context.rowNumber, COL.STATUS).setValue('SUSPENDED').setBackground('#fee2e2').setFontWeight('bold');
  ui.alert('Access suspended.');
}

function verifyAccessCode_(rawCode) {
  var code = clean_(rawCode, 40).toUpperCase().replace(/\s+/g, '');
  if (!/^TREV-(STA|PRO|VIP)-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) {
    return { valid: false, status: 'INVALID' };
  }

  var sheet = getRegistrationsSheet_();
  var rowNumber = findAccessCodeRow_(sheet, code);
  if (!rowNumber) return { valid: false, status: 'INVALID' };

  var row = sheet.getRange(rowNumber, 1, 1, REG_HEADERS.length).getValues()[0];
  var status = String(row[COL.STATUS - 1]).toUpperCase();
  if (status !== 'APPROVED') return { valid: false, status: status || 'INVALID' };

  var packageKey = String(row[COL.PACKAGE_KEY - 1]).toUpperCase();
  var packageInfo = PACKAGES[packageKey];
  if (!packageInfo) return { valid: false, status: 'INVALID' };

  var loginCount = Number(row[COL.LOGIN_COUNT - 1] || 0) + 1;
  sheet.getRange(rowNumber, COL.LAST_ACCESS).setValue(new Date());
  sheet.getRange(rowNumber, COL.LOGIN_COUNT).setValue(loginCount);

  var fullName = String(row[COL.FULL_NAME - 1] || 'Student');
  var registrationId = String(row[COL.REGISTRATION_ID - 1] || '');
  var staticPortal = getStaticPortalData_(packageInfo.accessLevel);
  return {
    valid: true,
    student: {
      name: fullName,
      firstName: fullName.split(/\s+/)[0],
      registrationId: registrationId
    },
    package: {
      key: packageKey,
      label: packageInfo.label,
      accessLevel: packageInfo.accessLevel
    },
    resources: staticPortal.resources,
    assignments: staticPortal.assignments,
    submissions: getSubmissionsForRegistration_(registrationId),
    progress: getStudentProgress_(registrationId, packageInfo.accessLevel),
    timetable: staticPortal.timetable,
    onboarding: staticPortal.onboarding,
    communityGuidelines: staticPortal.communityGuidelines,
    community: staticPortal.community,
    cohort: staticPortal.cohort
  };
}

function getResourcesForLevel_(accessLevel) {
  var allowed = ['ALL', accessLevel];

  var sheet = getSpreadsheet_().getSheetByName(TREV.RESOURCES_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];

  var rows = getDataRows_(sheet, RESOURCE_HEADERS.length, 3);
  var resources = [];

  rows.forEach(function(row) {
    var level = clean_(row[0], 30).toUpperCase();
    var visible = row[8] === true || String(row[8]).toUpperCase() === 'TRUE';
    if (allowed.indexOf(level) === -1 || !visible || !clean_(row[2], 150)) return;

    var originalUrl = safeUrl_(row[4]);
    var materialType = clean_(row[6], 40).toUpperCase() || 'FILE';
    var buttonLabel = clean_(row[5], 50) || (materialType === 'VIDEO' ? 'Watch Video' : 'Download Resource');
    var isVideo = materialType === 'VIDEO';
    var directUrl = isVideo ? makeDrivePreviewUrl_(originalUrl) : makeDirectDownloadUrl_(originalUrl);
    var isDownload = !isVideo && Boolean(originalUrl) && (directUrl !== originalUrl || /download|manual|template|workbook|pdf|slide/i.test(buttonLabel));

    resources.push({
      accessLevel: level,
      category: clean_(row[1], 80) || 'Course Resources',
      title: clean_(row[2], 150),
      description: clean_(row[3], 500),
      url: isDownload ? directUrl : (directUrl || originalUrl),
      buttonLabel: buttonLabel,
      materialType: materialType,
      fileSize: clean_(row[7], 40),
      download: isDownload,
      video: isVideo,
      sortOrder: Number(row[9] || 999)
    });
  });

  resources.sort(function(a, b) {
    return a.sortOrder - b.sortOrder || a.category.localeCompare(b.category);
  });
  return resources;
}


function getAssignmentsForLevel_(accessLevel) {
  var allowed = ['ALL', accessLevel];
  var sheet = getSpreadsheet_().getSheetByName(TREV.ASSIGNMENTS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];

  var rows = getDataRows_(sheet, ASSIGNMENT_HEADERS.length, 1);
  var assignments = [];

  rows.forEach(function(row) {
    var id = clean_(row[0], 60).toUpperCase();
    var level = clean_(row[1], 30).toUpperCase();
    var visible = row[9] === true || String(row[9]).toUpperCase() === 'TRUE';
    if (!id || allowed.indexOf(level) === -1 || !visible || !clean_(row[2], 150)) return;

    var dueDate = '';
    if (row[6] instanceof Date && !isNaN(row[6].getTime())) {
      dueDate = Utilities.formatDate(row[6], TREV.TIMEZONE, 'MMM d, yyyy');
    } else {
      dueDate = clean_(row[6], 60);
    }

    assignments.push({
      id: id,
      accessLevel: level,
      title: clean_(row[2], 150),
      instructions: clean_(row[3], 1500),
      guidelines: cleanMultiline_(row[4], 5000),
      gradingRubric: cleanMultiline_(row[5], 5000),
      dueDate: dueDate,
      acceptedFiles: clean_(row[7], 120) || '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,.jpg,.jpeg,.png',
      maxSizeMb: Math.min(Math.max(Number(row[8] || 10), 1), 10),
      sortOrder: Number(row[10] || 999)
    });
  });

  assignments.sort(function(a, b) { return a.sortOrder - b.sortOrder; });
  return assignments;
}

function getSubmissionsForRegistration_(registrationId) {
  var sheet = getSpreadsheet_().getSheetByName(TREV.SUBMISSIONS_SHEET);
  if (!sheet || sheet.getLastRow() < 2 || !registrationId) return [];

  var rows = getDataRows_(sheet, SUBMISSION_HEADERS.length, 2);
  var submissions = [];

  rows.forEach(function(row) {
    if (String(row[2]) !== registrationId) return;
    var timestamp = row[0] instanceof Date
      ? Utilities.formatDate(row[0], TREV.TIMEZONE, 'MMM d, yyyy · h:mm a')
      : clean_(row[0], 80);
    submissions.push({
      submittedAt: timestamp,
      submissionId: clean_(row[1], 60),
      assignmentId: clean_(row[6], 60),
      assignmentTitle: clean_(row[7], 150),
      fileName: clean_(row[8], 180),
      status: clean_(row[11], 40) || 'SUBMITTED',
      feedback: clean_(row[12], 1000)
    });
  });

  submissions.reverse();
  return submissions;
}

function renderAssignmentUploadPage_(rawCode, rawAssignmentId) {
  try {
    var code = clean_(rawCode, 40).toUpperCase().replace(/\s+/g, '');
    var assignmentId = clean_(rawAssignmentId, 60).toUpperCase();
    var access = verifyAccessCode_(code);
    if (!access.valid) return uploadErrorPage_('Your portal session is not approved. Sign in again and retry.');

    var assignment = null;
    (access.assignments || []).some(function(item) {
      if (item.id === assignmentId) {
        assignment = item;
        return true;
      }
      return false;
    });
    if (!assignment) return uploadErrorPage_('This assignment is not available for your package.');

    var html = '<!doctype html><html><head><base target="_top"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<style>' + uploadPageCss_() + '</style></head><body>' +
      '<main><div class="eyebrow">SECURE SUBMISSION</div><h1>' + escapeHtml_(assignment.title) + '</h1>' +
      '<p class="instructions">' + escapeHtml_(assignment.instructions || 'Upload your completed assignment below.') + '</p>' +
      (assignment.dueDate ? '<div class="due">Due: <strong>' + escapeHtml_(assignment.dueDate) + '</strong></div>' : '') +
      (assignment.guidelines ? '<details open><summary>Assignment Guidelines</summary><div class="multiline">' + escapeHtml_(assignment.guidelines) + '</div></details>' : '') +
      (assignment.gradingRubric ? '<details><summary>Grading Rubric</summary><div class="multiline">' + escapeHtml_(assignment.gradingRubric) + '</div></details>' : '') +
      '<form id="uploadForm" onsubmit="submitForm(event,this)">' +
      '<input type="hidden" name="accessCode" value="' + escapeHtml_(code) + '">' +
      '<input type="hidden" name="assignmentId" value="' + escapeHtml_(assignment.id) + '">' +
      '<label for="assignmentFile">Assignment file</label>' +
      '<input id="assignmentFile" name="assignmentFile" type="file" accept="' + escapeHtml_(assignment.acceptedFiles) + '" required>' +
      '<small>Accepted: ' + escapeHtml_(assignment.acceptedFiles) + ' · Maximum ' + assignment.maxSizeMb + 'MB</small>' +
      '<label for="studentNote">Note to instructor <span>(optional)</span></label>' +
      '<textarea id="studentNote" name="studentNote" maxlength="1000" rows="4" placeholder="Add context about your submission…"></textarea>' +
      '<div id="status" role="status" aria-live="polite"></div>' +
      '<button id="submitButton" type="submit">Submit Assignment <span>→</span></button>' +
      '</form></main>' +
      '<script>' +
      'function submitForm(event,form){event.preventDefault();var b=document.getElementById("submitButton"),s=document.getElementById("status");' +
      'b.disabled=true;b.textContent="Uploading…";s.className="working";s.textContent="Securely uploading your assignment. Keep this window open.";' +
      'google.script.run.withSuccessHandler(function(result){if(!result||!result.ok){fail((result&&result.error)||"Upload failed.");return;}' +
      's.className="success";s.textContent="Assignment submitted successfully. Submission ID: "+result.submissionId;' +
      'b.textContent="Submitted";window.parent.postMessage({source:"trev-assignment-upload",status:"success",submissionId:result.submissionId},"*");' +
      '}).withFailureHandler(function(error){fail((error&&error.message)||"Upload failed. Please retry.");}).submitAssignment(form);}' +
      'function fail(message){var b=document.getElementById("submitButton"),s=document.getElementById("status");b.disabled=false;b.textContent="Try Again";s.className="error";s.textContent=message;}' +
      '</script></body></html>';

    return HtmlService.createHtmlOutput(html)
      .setTitle('Submit ' + assignment.title)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return uploadErrorPage_('The upload form could not be loaded. Please try again.');
  }
}

/** Called only from the embedded Apps Script upload form via google.script.run. */
function submitAssignment(formObject) {
  var code = clean_(formObject && formObject.accessCode, 40).toUpperCase().replace(/\s+/g, '');
  var assignmentId = clean_(formObject && formObject.assignmentId, 60).toUpperCase();
  var studentNote = clean_(formObject && formObject.studentNote, 1000);
  var access = verifyAccessCode_(code);
  if (!access.valid) throw new Error('Your access code is no longer approved. Sign in again.');

  var assignment = null;
  (access.assignments || []).some(function(item) {
    if (item.id === assignmentId) {
      assignment = item;
      return true;
    }
    return false;
  });
  if (!assignment) throw new Error('This assignment is not available for your package.');

  var blob = formObject.assignmentFile;
  if (!blob || typeof blob.getBytes !== 'function') throw new Error('Choose a file before submitting.');

  var originalName = clean_(blob.getName(), 180);
  var extensionMatch = originalName.toLowerCase().match(/\.([a-z0-9]+)$/);
  var extension = extensionMatch ? extensionMatch[1] : '';
  if (ALLOWED_UPLOAD_EXTENSIONS.indexOf(extension) === -1) {
    throw new Error('Unsupported file type. Upload a PDF, Office document, ZIP, JPG, or PNG file.');
  }
  var assignmentExtensions = String(assignment.acceptedFiles || '')
    .toLowerCase()
    .match(/[a-z0-9]+/g) || ALLOWED_UPLOAD_EXTENSIONS;
  if (assignmentExtensions.indexOf(extension) === -1) {
    throw new Error('This assignment does not accept .' + extension + ' files. Please use one of the listed formats.');
  }

  var bytes = blob.getBytes();
  var assignmentLimit = Math.min(Number(assignment.maxSizeMb || 10) * 1024 * 1024, TREV.MAX_UPLOAD_BYTES);
  if (!bytes.length) throw new Error('The selected file is empty.');
  if (bytes.length > assignmentLimit) throw new Error('This file is larger than the ' + assignment.maxSizeMb + 'MB limit.');

  var registrationId = access.student.registrationId;
  var timestamp = Utilities.formatDate(new Date(), TREV.TIMEZONE, 'yyyyMMdd-HHmmss');
  var safeName = safeFileName_(registrationId + '-' + assignment.id + '-' + timestamp + '.' + extension);
  blob.setName(safeName);

  var driveFile;
  var submissionId = 'SUB-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('The submission service is busy. Please try again in a moment.');

  try {
    var folder = getAssignmentFolder_(access.package.accessLevel, registrationId, assignment.id);
    driveFile = folder.createFile(blob);
    driveFile.setDescription('TREV AI assignment submission by ' + access.student.name + ' · ' + assignment.title);

    var submissionsSheet = getSpreadsheet_().getSheetByName(TREV.SUBMISSIONS_SHEET);
    if (!submissionsSheet) throw new Error('Submission sheet is not configured. Run setupTrevSystem.');

    submissionsSheet.appendRow([
      new Date(),
      submissionId,
      registrationId,
      safeCell_(access.student.name),
      findStudentEmailByRegistrationId_(registrationId),
      access.package.label,
      assignment.id,
      assignment.title,
      safeCell_(originalName),
      driveFile.getUrl(),
      safeCell_(studentNote),
      'SUBMITTED',
      '',
      ''
    ]);
    submissionsSheet.getRange(submissionsSheet.getLastRow(), 12).setBackground('#fff7d6').setFontWeight('bold');
  } finally {
    lock.releaseLock();
  }

  sendAssignmentNotification_({
    submissionId: submissionId,
    studentName: access.student.name,
    registrationId: registrationId,
    packageLabel: access.package.label,
    assignmentTitle: assignment.title,
    originalName: originalName,
    fileUrl: driveFile.getUrl(),
    note: studentNote
  });

  return { ok: true, submissionId: submissionId };
}

function findStudentEmailByRegistrationId_(registrationId) {
  var sheet = getRegistrationsSheet_();
  var rowNumber = findExactRow_(sheet, COL.REGISTRATION_ID, registrationId);
  return rowNumber ? clean_(sheet.getRange(rowNumber, COL.EMAIL).getDisplayValue(), 120) : '';
}

function sendAssignmentNotification_(data) {
  var subject = 'New assignment: ' + data.studentName + ' — ' + data.assignmentTitle;
  var text = 'A student submitted an assignment.\n\n' +
    'Submission ID: ' + data.submissionId + '\n' +
    'Student: ' + data.studentName + '\n' +
    'Registration ID: ' + data.registrationId + '\n' +
    'Package: ' + data.packageLabel + '\n' +
    'Assignment: ' + data.assignmentTitle + '\n' +
    'Original file: ' + data.originalName + '\n' +
    'Student note: ' + (data.note || 'None') + '\n\n' +
    'Open file: ' + data.fileUrl;
  var html = emailShell_(
    'New assignment submitted',
    detailBox_([
      ['Submission ID', data.submissionId],
      ['Student', data.studentName],
      ['Registration ID', data.registrationId],
      ['Package', data.packageLabel],
      ['Assignment', data.assignmentTitle],
      ['Original file', data.originalName]
    ]) +
    (data.note ? '<p><strong>Student note:</strong> ' + escapeHtml_(data.note) + '</p>' : '') +
    '<p style="text-align:center"><a href="' + escapeHtml_(data.fileUrl) + '" style="display:inline-block;background:#f2b705;color:#111;text-decoration:none;font-weight:800;padding:13px 22px;border-radius:999px">Open Submitted File</a></p>'
  );
  return sendMailSafely_(TREV.ADMIN_EMAIL, subject, text, html);
}


function showMaterialManager() {
  SpreadsheetApp.getUi().showSidebar(HtmlService.createHtmlOutput(materialManagerHtml_(null)).setTitle('TREV Content Manager'));
}

function editSelectedMaterial() {
  var context=getSelectedResourceContext_();
  var row=context.sheet.getRange(context.row,1,1,RESOURCE_HEADERS.length).getDisplayValues()[0];
  var data={rowNumber:context.row,accessLevel:row[0],category:row[1],title:row[2],description:row[3],url:row[4],buttonLabel:row[5],materialType:row[6]||'LINK',sortOrder:row[9]||100,visible:String(row[8]).toUpperCase()==='TRUE'};
  SpreadsheetApp.getUi().showSidebar(HtmlService.createHtmlOutput(materialManagerHtml_(data)).setTitle('Edit Course Material'));
}

/** Called by the Sheet sidebar. File input becomes a Blob through google.script.run. */
function publishCourseMaterial(formObject) {
  var level = clean_(formObject.accessLevel, 30).toUpperCase();
  var category = clean_(formObject.category, 80);
  var title = clean_(formObject.title, 150);
  var description = clean_(formObject.description, 500);
  var materialType = clean_(formObject.materialType, 30).toUpperCase();
  var externalUrl = safeUrl_(formObject.driveUrl);
  var buttonLabel = clean_(formObject.buttonLabel, 50);
  var sortOrder = Number(formObject.sortOrder || 999);
  var visible = String(formObject.visible).toLowerCase() === 'true';
  var rowNumber = Number(formObject.rowNumber || 0);
  var sheet = getSpreadsheet_().getSheetByName(TREV.RESOURCES_SHEET);
  if (!sheet) throw new Error('Resources sheet is missing. Run setupTrevSystem.');
  var current = rowNumber >= 2 ? sheet.getRange(rowNumber,1,1,RESOURCE_HEADERS.length).getValues()[0] : null;
  if (['ALL','STARTER','PROFESSIONAL','VIP'].indexOf(level) === -1) throw new Error('Choose a valid access level.');
  if (!category || !title) throw new Error('Category and title are required.');
  if (['PDF','SLIDES','TEMPLATE','WORKBOOK','VIDEO','LINK'].indexOf(materialType) === -1) throw new Error('Choose a valid material type.');

  var url = externalUrl || (current ? safeUrl_(current[4]) : '');
  var driveFileId = current ? clean_(current[10],180) : '';
  var fileSize = current ? clean_(current[7],40) : '';
  var blob = formObject.materialFile;
  var hasFile = blob && typeof blob.getBytes === 'function' && blob.getName();

  if (materialType === 'VIDEO' || materialType === 'LINK') {
    if (!url) throw new Error('Paste a valid Drive or external link.');
    driveFileId = extractDriveFileId_(url);
    if (!buttonLabel) buttonLabel = materialType === 'VIDEO' ? 'Watch Video' : 'Open Resource';
  } else {
    if (!hasFile && !current) throw new Error('Choose a PDF, PowerPoint, document, or ZIP file.');
    if (!hasFile && current) {
      if (!url) throw new Error('Upload a replacement file.');
      if (!buttonLabel) buttonLabel = materialType === 'SLIDES' ? 'Download Slides' : materialType === 'TEMPLATE' ? 'Download Template' : 'Download Material';
    } else {
    var bytes = blob.getBytes();
    if (!bytes.length) throw new Error('The selected file is empty.');
    if (bytes.length > TREV.MAX_MATERIAL_BYTES) throw new Error('Course material uploads are limited to 20MB. Upload larger files directly to Drive and use a link.');
    var extension = (clean_(blob.getName(),180).toLowerCase().match(/\.([a-z0-9]+)$/) || [,''])[1];
    if (['pdf','ppt','pptx','doc','docx','xls','xlsx','zip'].indexOf(extension) === -1) throw new Error('Unsupported file type.');
    var folder = getMaterialFolder_(level, materialType);
    var safeName = safeFileName_(title + '-' + Utilities.formatDate(new Date(),TREV.TIMEZONE,'yyyyMMdd-HHmmss') + '.' + extension);
    blob.setName(safeName);
    var file = folder.createFile(blob);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (ignored) {}
    url = file.getUrl();
    driveFileId = file.getId();
    fileSize = formatFileSize_(bytes.length);
    if (!buttonLabel) buttonLabel = materialType === 'SLIDES' ? 'Download Slides' : materialType === 'TEMPLATE' ? 'Download Template' : 'Download Material';
    }
  }

  var values=[level,category,title,description,url,buttonLabel,materialType,fileSize,visible,sortOrder,driveFileId];
  if (current) sheet.getRange(rowNumber,1,1,RESOURCE_HEADERS.length).setValues([values]);
  else sheet.appendRow(values);
  clearPortalCache_();
  return { ok:true, title:title, message:title + (current ? ' was updated.' : ' was published to ' + level + '.') };
}

function getSelectedResourceContext_() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var range = sheet.getActiveRange();
  if (!sheet || sheet.getName() !== TREV.RESOURCES_SHEET || !range || range.getRow() < 2) throw new Error('Select a material row in the Resources sheet first.');
  return { sheet:sheet, row:range.getRow() };
}

function unpublishSelectedMaterial() {
  var context = getSelectedResourceContext_();
  context.sheet.getRange(context.row,9).setValue(false);
  clearPortalCache_();
  SpreadsheetApp.getUi().alert('Material unpublished.');
}

function publishSelectedMaterial() {
  var context = getSelectedResourceContext_();
  context.sheet.getRange(context.row,9).setValue(true);
  clearPortalCache_();
  SpreadsheetApp.getUi().alert('Material published.');
}

function deleteSelectedMaterial() {
  var ui=SpreadsheetApp.getUi();
  var context=getSelectedResourceContext_();
  var title=context.sheet.getRange(context.row,3).getDisplayValue();
  if (ui.alert('Delete material?', 'Delete “' + title + '” from the portal? The Drive file is not deleted automatically.', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  context.sheet.deleteRow(context.row);
  clearPortalCache_();
  ui.alert('Material deleted from the portal.');
}

function getMaterialRootFolder_() {
  var properties=PropertiesService.getScriptProperties();
  var id=properties.getProperty('MATERIAL_ROOT_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (ignored) {} }
  var folders=DriveApp.getFoldersByName(TREV.MATERIAL_ROOT_FOLDER);
  var folder=folders.hasNext()?folders.next():DriveApp.createFolder(TREV.MATERIAL_ROOT_FOLDER);
  properties.setProperty('MATERIAL_ROOT_FOLDER_ID',folder.getId());
  return folder;
}

function getMaterialFolder_(level,type) {
  var root=getMaterialRootFolder_();
  var packageFolder=getOrCreateChildFolder_(root,level==='ALL'?'All Students':level);
  return getOrCreateChildFolder_(packageFolder,type);
}

function formatFileSize_(bytes) {
  if (bytes < 1024*1024) return Math.max(1,Math.round(bytes/1024)) + ' KB';
  return (bytes/(1024*1024)).toFixed(1) + ' MB';
}

function materialManagerHtml_(initial) {
  var initialJson = JSON.stringify(initial || {}).replace(/</g, '\\u003c');
  return '<!doctype html><html><head><base target="_top"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' +
    'body{font-family:Arial,sans-serif;margin:0;padding:18px;color:#171717}h2{margin:0 0 5px}p{color:#666;font-size:13px;line-height:1.5}form{display:grid;gap:12px;margin-top:18px}label{font-size:12px;font-weight:700}input,select,textarea{width:100%;box-sizing:border-box;margin-top:5px;padding:10px;border:1px solid #ccc;border-radius:7px;font:inherit}textarea{resize:vertical}small{color:#777;font-size:11px}button{border:0;border-radius:999px;background:#111;color:#fff;padding:12px;font-weight:800;cursor:pointer}button:disabled{opacity:.6}.check{display:flex;align-items:center;gap:8px}.check input{width:auto;margin:0}#status{font-size:12px;padding:10px;border-radius:7px}#status:empty{display:none}.ok{background:#dcfce7;color:#166534}.error{background:#fee2e2;color:#991b1b}</style></head><body>' +
    '<h2>Upload Course Material</h2><p>Publish PDFs, slides, templates, workbooks, Drive videos, or external resources without redeploying the website.</p>' +
    '<form onsubmit="send(event,this)"><input type="hidden" name="rowNumber"><label>Package<select name="accessLevel" required><option value="ALL">All students</option><option value="STARTER">Starter only</option><option value="PROFESSIONAL">Professional only</option><option value="VIP">VIP only</option></select></label>' +
    '<label>Category<input name="category" placeholder="Session Slides" required></label><label>Title<input name="title" required></label><label>Description<textarea name="description" rows="3"></textarea></label>' +
    '<label>Material type<select name="materialType" id="type" onchange="toggle()"><option value="PDF">PDF / Document</option><option value="SLIDES">PowerPoint / Slides</option><option value="TEMPLATE">Template</option><option value="WORKBOOK">Workbook</option><option value="VIDEO">Google Drive Video</option><option value="LINK">External Link</option></select></label>' +
    '<label id="fileRow">Upload file<input type="file" name="materialFile" accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.zip"><small>Maximum 20MB. Upload larger files directly to Drive.</small></label>' +
    '<label id="urlRow" style="display:none">Drive or external link<input type="url" name="driveUrl" placeholder="https://drive.google.com/file/d/..."></label>' +
    '<label>Button label<input name="buttonLabel" placeholder="Download Slides"></label><label>Sort order<input type="number" name="sortOrder" value="100"></label>' +
    '<label class="check"><input type="checkbox" name="visible" value="true" checked> Publish immediately</label><div id="status"></div><button id="submit" type="submit">Publish Material</button></form>' +
    '<script>var initial=' + initialJson + ';function init(){var f=document.forms[0];Object.keys(initial).forEach(function(k){if(f.elements[k]){if(f.elements[k].type==="checkbox")f.elements[k].checked=!!initial[k];else f.elements[k].value=initial[k]||"";}});toggle();if(initial.rowNumber)document.getElementById("submit").textContent="Update Material";}function toggle(){var t=document.getElementById("type").value,link=t==="VIDEO"||t==="LINK";document.getElementById("fileRow").style.display=link?"none":"block";document.getElementById("urlRow").style.display=link?"block":"none";}function send(e,f){e.preventDefault();var b=document.getElementById("submit"),s=document.getElementById("status");b.disabled=true;b.textContent="Publishing…";s.className="";s.textContent="Uploading and publishing…";google.script.run.withSuccessHandler(function(r){s.className="ok";s.textContent=r.message;b.disabled=false;b.textContent="Publish Another";f.reset();toggle();}).withFailureHandler(function(err){s.className="error";s.textContent=err.message||"Upload failed";b.disabled=false;b.textContent="Try Again";}).publishCourseMaterial(f);}window.addEventListener("load",init);</script></body></html>';
}

function getUploadRootFolder_() {
  var properties = PropertiesService.getScriptProperties();
  var existingId = properties.getProperty('UPLOAD_ROOT_FOLDER_ID');
  if (existingId) {
    try { return DriveApp.getFolderById(existingId); } catch (ignored) {}
  }

  var folders = DriveApp.getFoldersByName(TREV.UPLOAD_ROOT_FOLDER);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(TREV.UPLOAD_ROOT_FOLDER);
  properties.setProperty('UPLOAD_ROOT_FOLDER_ID', folder.getId());
  return folder;
}

function getAssignmentFolder_(accessLevel, registrationId, assignmentId) {
  var root = getUploadRootFolder_();
  var packageFolder = getOrCreateChildFolder_(root, safeFileName_(accessLevel));
  var studentFolder = getOrCreateChildFolder_(packageFolder, safeFileName_(registrationId));
  return getOrCreateChildFolder_(studentFolder, safeFileName_(assignmentId));
}

function getOrCreateChildFolder_(parent, name) {
  var folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}

function safeFileName_(value) {
  return String(value || 'file')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 180) || 'file';
}

function extractDriveFileId_(url) {
  var safe = safeUrl_(url);
  if (!safe || !/drive\.google\.com/i.test(safe)) return '';
  var match = safe.match(/\/file\/d\/([A-Za-z0-9_-]+)/) || safe.match(/[?&]id=([A-Za-z0-9_-]+)/) || safe.match(/\/d\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : '';
}

function makeDirectDownloadUrl_(url) {
  var safe = safeUrl_(url);
  if (!safe) return '';
  var fileId = extractDriveFileId_(safe);
  return fileId ? 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(fileId) : safe;
}

function makeDrivePreviewUrl_(url) {
  var safe = safeUrl_(url);
  if (!safe) return '';
  var fileId = extractDriveFileId_(safe);
  return fileId ? 'https://drive.google.com/file/d/' + encodeURIComponent(fileId) + '/preview' : safe;
}

function uploadErrorPage_(message) {
  var html = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>' + uploadPageCss_() + '</style></head><body><main><div class="error-card"><h1>Upload unavailable</h1><p>' +
    escapeHtml_(message) + '</p></div></main></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setTitle('Upload unavailable')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function uploadPageCss_() {
  return ':root{font-family:Arial,sans-serif;color:#171717;background:#fafafa}*{box-sizing:border-box}body{margin:0;background:#fafafa}' +
    'main{max-width:620px;margin:0 auto;padding:28px 22px}.eyebrow{font-size:11px;font-weight:800;letter-spacing:.09em;margin-bottom:10px}' +
    'h1{font-size:28px;line-height:1.18;margin:0 0 12px}.instructions{color:#666;line-height:1.6;margin-bottom:15px}.due{display:inline-block;background:#fff4c4;border:1px solid #f2b705;border-radius:999px;padding:7px 12px;font-size:12px;margin-bottom:22px}' +
    'form{display:grid;gap:13px;background:#fff;border:1px solid #ddd;border-radius:12px;padding:22px}label{font-weight:700;font-size:13px}label span{font-weight:400;color:#777}' +
    'details{margin:12px 0;border:1px solid #ddd;border-radius:9px;background:#fff;overflow:hidden}summary{cursor:pointer;padding:12px 14px;font-weight:800;font-size:13px;background:#f5f5f2}.multiline{padding:14px;white-space:pre-line;color:#444;line-height:1.6;font-size:13px}' +
    'input[type=file],textarea{width:100%;border:1px solid #ccc;border-radius:8px;padding:12px;background:#fafafa;font:inherit}textarea{resize:vertical}small{color:#777;line-height:1.4}' +
    'button{min-height:48px;border:0;border-radius:999px;background:#111;color:#fff;font-weight:800;cursor:pointer;padding:12px 18px}button:disabled{opacity:.65;cursor:wait}' +
    '#status:empty{display:none}#status{padding:11px;border-radius:7px;font-size:13px;line-height:1.4}.working{background:#f5f5f5}.success{background:#dcfce7;color:#166534}.error{background:#fee2e2;color:#991b1b}' +
    '.error-card{margin-top:35px;padding:25px;border:1px solid #ddd;border-radius:12px;background:#fff}@media(max-width:520px){main{padding:20px 14px}h1{font-size:23px}form{padding:17px}}';
}

function getSelectedRegistration_() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var range = sheet.getActiveRange();
  if (!sheet || sheet.getName() !== TREV.REGISTRATIONS_SHEET || !range || range.getRow() < 2) {
    throw new Error('Select any cell in a student row on the Registrations sheet first.');
  }
  return {
    sheet: sheet,
    rowNumber: range.getRow(),
    values: sheet.getRange(range.getRow(), 1, 1, REG_HEADERS.length).getValues()[0]
  };
}

function getSpreadsheet_() {
  if (TREV_REQUEST_CACHE.spreadsheet) return TREV_REQUEST_CACHE.spreadsheet;
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  var spreadsheet = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Spreadsheet is not configured. Run setupTrevSystem first.');
  TREV_REQUEST_CACHE.spreadsheet = spreadsheet;
  return spreadsheet;
}

function getRegistrationsSheet_() {
  var sheet = getSpreadsheet_().getSheetByName(TREV.REGISTRATIONS_SHEET);
  if (!sheet) throw new Error('Registrations sheet is missing. Run setupTrevSystem.');
  return sheet;
}

function getOrCreateSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  var existing = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  if (existing.join('|') !== headers.join('|')) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sheet;
}


/** Preserves existing resources while adding material metadata columns. */
function getOrUpgradeResourcesSheet_(ss) {
  var sheet = ss.getSheetByName(TREV.RESOURCES_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(TREV.RESOURCES_SHEET);
    sheet.getRange(1, 1, 1, RESOURCE_HEADERS.length).setValues([RESOURCE_HEADERS]);
    return sheet;
  }
  var oldHeaders = sheet.getRange(1, 1, 1, Math.min(sheet.getLastColumn(), 8)).getDisplayValues()[0];
  var oldSignature = ['Access Level','Category','Title','Description','URL','Button Label','Visible','Sort Order'].join('|');
  if (oldHeaders.join('|') === oldSignature) {
    sheet.insertColumnsAfter(6, 2);
    sheet.insertColumnAfter(10);
  }
  sheet.getRange(1, 1, 1, RESOURCE_HEADERS.length).setValues([RESOURCE_HEADERS]);
  return sheet;
}

/** Preserves existing assignment data while adding Guidelines and Grading Rubric. */
function getOrUpgradeAssignmentsSheet_(ss) {
  var sheet = ss.getSheetByName(TREV.ASSIGNMENTS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(TREV.ASSIGNMENTS_SHEET);
    sheet.getRange(1, 1, 1, ASSIGNMENT_HEADERS.length).setValues([ASSIGNMENT_HEADERS]);
    return sheet;
  }

  var oldHeaders = sheet.getRange(1, 1, 1, Math.min(sheet.getLastColumn(), 9)).getDisplayValues()[0];
  var oldSignature = ['Assignment ID','Access Level','Title','Instructions','Due Date','Accepted Files','Max Size MB','Visible','Sort Order'].join('|');
  if (oldHeaders.join('|') === oldSignature) sheet.insertColumnsAfter(4, 2);
  sheet.getRange(1, 1, 1, ASSIGNMENT_HEADERS.length).setValues([ASSIGNMENT_HEADERS]);
  return sheet;
}

function lastDataRowByKey_(sheet, keyColumn) {
  var maxRows = sheet.getMaxRows();
  if (maxRows < 2) return 1;
  var values = sheet.getRange(2, keyColumn, maxRows - 1, 1).getDisplayValues();
  for (var index = values.length - 1; index >= 0; index--) {
    if (String(values[index][0]).trim()) return index + 2;
  }
  return 1;
}

function getDataRows_(sheet, columnCount, keyColumn) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, columnCount).getValues();
  var keyIndex = (keyColumn || 1) - 1;
  while (values.length && !String(values[values.length - 1][keyIndex] || '').trim()) values.pop();
  return values;
}

function clearBlankTail_(sheet, keyColumn, columnCount) {
  var lastRow = lastDataRowByKey_(sheet, keyColumn || 1);
  if (lastRow < sheet.getMaxRows()) {
    sheet.getRange(lastRow + 1, 1, sheet.getMaxRows() - lastRow, columnCount).clearContent();
  }
}

function formatRegistrationsSheet_(sheet) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, REG_HEADERS.length)
    .setBackground('#111111')
    .setFontColor('#ffffff')
    .setFontWeight('bold');
  sheet.setColumnWidth(COL.TIMESTAMP, 145);
  sheet.setColumnWidth(COL.REGISTRATION_ID, 165);
  sheet.setColumnWidth(COL.FULL_NAME, 190);
  sheet.setColumnWidth(COL.EMAIL, 210);
  sheet.setColumnWidth(COL.WHATSAPP, 145);
  sheet.setColumnWidth(COL.PACKAGE_LABEL, 220);
  sheet.setColumnWidth(COL.PAYMENT_REFERENCE, 220);
  sheet.setColumnWidth(COL.ACCESS_CODE, 190);
  sheet.setColumnWidth(COL.WHATSAPP_LINK, 260);
  sheet.getRange(2, COL.STATUS, Math.max(sheet.getMaxRows() - 1, 1), 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(['PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED'], true)
      .setAllowInvalid(false)
      .build()
  );
}

function formatResourcesSheet_(sheet) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, RESOURCE_HEADERS.length)
    .setBackground('#f2b705')
    .setFontColor('#111111')
    .setFontWeight('bold');
  sheet.setColumnWidth(1, 130);
  sheet.setColumnWidth(2, 170);
  sheet.setColumnWidth(3, 230);
  sheet.setColumnWidth(4, 360);
  sheet.setColumnWidth(5, 300);
  sheet.setColumnWidth(6, 150);
  sheet.setColumnWidth(7, 120);
  sheet.setColumnWidth(8, 100);
  sheet.setColumnWidth(11, 180);
  sheet.getRange(2, 9, Math.max(sheet.getMaxRows() - 1, 1), 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  sheet.getRange(2, 1, Math.max(sheet.getMaxRows() - 1, 1), 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(['ALL', 'STARTER', 'PROFESSIONAL', 'VIP'], true)
      .setAllowInvalid(false)
      .build()
  );
}

function formatAssignmentsSheet_(sheet) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, ASSIGNMENT_HEADERS.length)
    .setBackground('#111111')
    .setFontColor('#ffffff')
    .setFontWeight('bold');
  sheet.setColumnWidth(1, 160);
  sheet.setColumnWidth(2, 130);
  sheet.setColumnWidth(3, 230);
  sheet.setColumnWidth(4, 360);
  sheet.setColumnWidth(5, 430);
  sheet.setColumnWidth(6, 430);
  sheet.setColumnWidth(7, 120);
  sheet.setColumnWidth(8, 250);
  sheet.setColumnWidth(9, 110);
  sheet.getRange(2, 10, Math.max(sheet.getMaxRows() - 1, 1), 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  sheet.getRange(2, 2, Math.max(sheet.getMaxRows() - 1, 1), 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(['ALL', 'STARTER', 'PROFESSIONAL', 'VIP'], true)
      .setAllowInvalid(false)
      .build()
  );
}

function formatSubmissionsSheet_(sheet) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, SUBMISSION_HEADERS.length)
    .setBackground('#f2b705')
    .setFontColor('#111111')
    .setFontWeight('bold');
  sheet.setColumnWidth(1, 145);
  sheet.setColumnWidth(2, 145);
  sheet.setColumnWidth(3, 170);
  sheet.setColumnWidth(4, 190);
  sheet.setColumnWidth(5, 210);
  sheet.setColumnWidth(8, 230);
  sheet.setColumnWidth(9, 220);
  sheet.setColumnWidth(10, 280);
  sheet.setColumnWidth(11, 300);
  sheet.setColumnWidth(13, 360);
  sheet.getRange(2, 12, Math.max(sheet.getMaxRows() - 1, 1), 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(['SUBMITTED', 'UNDER REVIEW', 'REVISION REQUESTED', 'APPROVED'], true)
      .setAllowInvalid(true)
      .build()
  );
}

function removeLegacyTestContent_(resourcesSheet, assignmentsSheet) {
  deleteRowsByValue_(resourcesSheet, 3, ['Sample Course Material']);
  deleteRowsByValue_(assignmentsSheet, 1, ['AI-EDUCATION-ESSAY']);
}

function deleteRowsByValue_(sheet, column, values) {
  var wanted = values.map(function(value) { return String(value).toUpperCase(); });
  var lastRow = lastDataRowByKey_(sheet, column);
  if (lastRow < 2) return;
  var rows = sheet.getRange(2, column, lastRow - 1, 1).getDisplayValues();
  for (var index = rows.length - 1; index >= 0; index--) {
    if (wanted.indexOf(String(rows[index][0]).trim().toUpperCase()) !== -1) sheet.deleteRow(index + 2);
  }
}

function formatTimetableSheet_(sheet) {
  styleAdminHeader_(sheet, TIMETABLE_HEADERS.length, '#111111', '#ffffff');
  sheet.setColumnWidth(1, 120); sheet.setColumnWidth(2, 110); sheet.setColumnWidth(3, 130);
  sheet.setColumnWidth(4, 100); sheet.setColumnWidth(5, 260); sheet.setColumnWidth(6, 140);
  sheet.setColumnWidth(7, 110); sheet.setColumnWidth(8, 210); sheet.setColumnWidth(9, 110); sheet.setColumnWidth(10, 340);
}

function formatChecklistSheet_(sheet) {
  styleAdminHeader_(sheet, CHECKLIST_HEADERS.length, '#f2b705', '#111111');
  sheet.setColumnWidth(1, 140); sheet.setColumnWidth(2, 100); sheet.setColumnWidth(3, 250); sheet.setColumnWidth(4, 420);
  sheet.getRange(2, 5, Math.max(sheet.getMaxRows() - 1, 1), 2).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
}

function formatGuidelinesSheet_(sheet) {
  styleAdminHeader_(sheet, GUIDELINE_HEADERS.length, '#111111', '#ffffff');
  sheet.setColumnWidth(1, 100); sheet.setColumnWidth(2, 250); sheet.setColumnWidth(3, 500);
  sheet.getRange(2, 4, Math.max(sheet.getMaxRows() - 1, 1), 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
}

function formatSettingsSheet_(sheet) {
  styleAdminHeader_(sheet, SETTING_HEADERS.length, '#f2b705', '#111111');
  sheet.setColumnWidth(1, 250); sheet.setColumnWidth(2, 360); sheet.setColumnWidth(3, 460);
}

function formatCertificatesSheet_(sheet) {
  styleAdminHeader_(sheet, CERTIFICATE_HEADERS.length, '#111111', '#ffffff');
  sheet.setColumnWidth(1, 190); sheet.setColumnWidth(2, 220); sheet.setColumnWidth(3, 180);
  sheet.setColumnWidth(5, 220); sheet.setColumnWidth(10, 300);
}

function formatAttendanceSheet_(sheet) {
  styleAdminHeader_(sheet, ATTENDANCE_HEADERS.length, '#111111', '#ffffff');
  sheet.setColumnWidth(1, 120); sheet.setColumnWidth(2, 180); sheet.setColumnWidth(3, 130);
  sheet.setColumnWidth(4, 190); sheet.setColumnWidth(5, 220); sheet.setColumnWidth(7, 130); sheet.setColumnWidth(8, 320);
  sheet.getRange(2,6,Math.max(sheet.getMaxRows()-1,1),1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
}

function formatContentUpdatesSheet_(sheet) {
  styleAdminHeader_(sheet, CONTENT_UPDATE_HEADERS.length, '#f2b705', '#111111');
  sheet.setColumnWidth(1, 150); sheet.setColumnWidth(2, 260); sheet.setColumnWidth(3, 520);
  sheet.setColumnWidth(4, 300); sheet.setColumnWidth(5, 150); sheet.setColumnWidth(6, 120);
  sheet.getRange(2,1,Math.max(sheet.getMaxRows()-1,1),1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['PROFESSIONAL','VIP','BOTH'],true).build());
  sheet.getRange(2,6,Math.max(sheet.getMaxRows()-1,1),1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['DRAFT','SCHEDULED','SENT','CANCELLED'],true).build());
}

function styleAdminHeader_(sheet, length, background, color) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, length).setBackground(background).setFontColor(color).setFontWeight('bold');
}

function addTimetableRows_(sheet) {
  if (lastDataRowByKey_(sheet, 1) > 1) return;
  var time = 'To be announced after onboarding';
  var note = 'The secure class link will be shared in the official WhatsApp group 30–60 minutes before class.';
  var rows = [
    ['4 Aug 2026','Tuesday','STARTER','Session 1','AI Foundations','Core Class','90 minutes',time,'UPCOMING',note],
    ['5 Aug 2026','Wednesday','PROFESSIONAL','Session 1','AI Foundations','Core Class','90 minutes',time,'UPCOMING',note],
    ['6 Aug 2026','Thursday','VIP','Session 1','AI Foundations','Core Class','90 minutes',time,'UPCOMING',note],
    ['7 Aug 2026','Friday','STARTER','Session 2','Prompt Engineering I','Core Class','90 minutes',time,'UPCOMING',note],
    ['8 Aug 2026','Saturday','PROFESSIONAL','Session 2','Prompt Engineering I','Core Class','90 minutes',time,'UPCOMING',note],
    ['9 Aug 2026','Sunday','VIP','Session 2','Prompt Engineering I','Core Class','90 minutes',time,'UPCOMING',note],
    ['10 Aug 2026','Monday','STARTER','Session 3','Prompt Engineering II','Core Class','90 minutes',time,'UPCOMING',note],
    ['11 Aug 2026','Tuesday','PROFESSIONAL','Session 3','Prompt Engineering II','Core Class','90 minutes',time,'UPCOMING',note],
    ['12 Aug 2026','Wednesday','VIP','Session 3','Prompt Engineering II','Core Class','90 minutes',time,'UPCOMING',note],
    ['13 Aug 2026','Thursday','STARTER','Session 4','Research & Deep Thinking','Core Class','90 minutes',time,'UPCOMING',note],
    ['14 Aug 2026','Friday','PROFESSIONAL','Session 4','Research & Deep Thinking','Core Class','90 minutes',time,'UPCOMING',note],
    ['15 Aug 2026','Saturday','VIP','Session 4','Research & Deep Thinking','Core Class','90 minutes',time,'UPCOMING',note],
    ['16 Aug 2026','Sunday','STARTER','Support','Starter Capstone Support','Support Clinic','90 minutes',time,'UPCOMING',note],
    ['17 Aug 2026','Monday','PROFESSIONAL','Session 5','Creating with AI','Core Class','90 minutes',time,'UPCOMING',note],
    ['18 Aug 2026','Tuesday','VIP','Session 5','Creating with AI','Core Class','90 minutes',time,'UPCOMING',note],
    ['19 Aug 2026','Wednesday','STARTER','Review','Assignment Review & Certificate Readiness','Support Clinic','90 minutes',time,'UPCOMING',note],
    ['20 Aug 2026','Thursday','PROFESSIONAL','Session 6','Chaining Tools & Ethics','Core Class','90 minutes',time,'UPCOMING',note],
    ['21 Aug 2026','Friday','VIP','Session 6','Chaining Tools & Ethics','Core Class','90 minutes',time,'UPCOMING',note],
    ['22 Aug 2026','Saturday','ALL','Support','Open Capstone Clinic','Support Clinic','90 minutes',time,'UPCOMING',note],
    ['23 Aug 2026','Sunday','PROFESSIONAL','Session 7','Final Presentations','Final Session','90 minutes',time,'UPCOMING',note],
    ['24 Aug 2026','Monday','VIP','Session 7','Final Presentations','Final Session','90 minutes',time,'UPCOMING',note]
  ];
  sheet.getRange(2, 1, rows.length, TIMETABLE_HEADERS.length).setValues(rows);
}

function addChecklistRows_(sheet) {
  if (lastDataRowByKey_(sheet, 3) > 1) return;
  var rows = [
    ['ALL',1,'Save your personal access code','Keep it private and do not save it on a shared device.',true,true],
    ['ALL',2,'Log into the student portal','Confirm your package, registration ID, timetable, resources, and assignments.',true,true],
    ['ALL',3,'Join your official WhatsApp community','Use the package-specific invitation shown after approval.',true,true],
    ['ALL',4,'Read the community guidelines','Review the conduct, privacy, recording, and material-sharing rules.',true,true],
    ['ALL',5,'Review the timetable','Class time will be confirmed after onboarding; links appear only in WhatsApp.',true,true],
    ['ALL',6,'Test your learning setup','Confirm your internet connection, browser, audio, and device are ready.',true,true],
    ['STARTER',10,'Create a ChatGPT account','Free or paid access is acceptable.',true,true],
    ['STARTER',11,'Create a Claude account','Free or paid access is acceptable.',true,true],
    ['STARTER',12,'Create a Google Gemini account','Free or paid access is acceptable.',true,true],
    ['STARTER',13,'Create a NotebookLM account','Use the Google account you will use during class.',true,true],
    ['PROFESSIONAL',20,'Create all required AI and productivity accounts','ChatGPT, Claude, Gemini, NotebookLM, Google AI Studio, Canva, Google Drive, Zoom or Google Meet, and Make or Zapier.',true,true],
    ['VIP',20,'Create all required AI and productivity accounts','ChatGPT, Claude, Gemini, NotebookLM, Google AI Studio, Canva, Google Drive, Zoom or Google Meet, and Make or Zapier.',true,true]
  ];
  sheet.getRange(2, 1, rows.length, CHECKLIST_HEADERS.length).setValues(rows);
}

function addGuidelineRows_(sheet) {
  if (lastDataRowByKey_(sheet, 1) > 1) return;
  var rows = [
    ['G01','Respectful communication','No harassment, disrespect, discrimination, threats, or disruptive behaviour.',true,1],
    ['G02','No spam or unrelated promotion','Do not post unrelated advertisements, schemes, referral links, or repetitive promotional messages.',true,2],
    ['G03','No unsolicited private messaging','Private messages are permitted only for payment and account issues unless the recipient gives permission.',true,3],
    ['G04','Keep portal codes private','Access codes belong to approved learners and must not be shared.',true,4],
    ['G05','Protect TREV materials','Do not redistribute, resell, or publicly upload manuals, recordings, slides, templates, or portal files.',true,5],
    ['G06','Respect student privacy','Do not share student phone numbers, screenshots, work, messages, or personal information without consent.',true,6],
    ['G07','Academic integrity','Assignments must represent the student’s own learning process. AI support is allowed where instructed, but copying another learner’s work is prohibited.',true,7],
    ['G08','Do not share recordings','Class recordings are for approved students and must not be redistributed.',true,8],
    ['G09','Use support correctly','Payment and account problems should be sent through the official support WhatsApp link during package support hours.',true,9],
    ['G10','Enforcement','Repeated or serious violations may result in warnings, community removal, or portal suspension.',true,10]
  ];
  sheet.getRange(2, 1, rows.length, GUIDELINE_HEADERS.length).setValues(rows);
}

function addSettingRows_(sheet) {
  if (lastDataRowByKey_(sheet, 1) > 1) return;
  var rows = [
    ['COHORT_START_DATE','4 August 2026','First day of the rotating cohort timetable.'],
    ['CLASS_TIME','To be announced after onboarding','Update once the final daily time is fixed.'],
    ['CLASS_DURATION','90 minutes','Applies to core classes and support clinics.'],
    ['CAPSTONE_DEADLINE','29 August 2026','Final capstone submission deadline.'],
    ['CERTIFICATE_RELEASE','31 August 2026','Target certificate release date.'],
    ['PAYMENT_VERIFICATION_TIME','5 minutes to 1 hour','Normal manual-transfer verification window.'],
    ['CLASS_LINK_POLICY','Shared in WhatsApp 30–60 minutes before class','Class links are intentionally not displayed in the portal.'],
    ['RECORDING_POLICY','Students are informed before recording begins','Recordings must not be redistributed.'],
    ['PRIVATE_MESSAGE_POLICY','Only for payment and account issues','Other questions should use the official group.'],
    ['STARTER_GROUP_NAME','TrevAI Starters','Official Starter community.'],
    ['STARTER_GROUP_LINK','','Paste the Starter WhatsApp invitation link here.'],
    ['STARTER_SUPPORT_HOURS','Monday–Friday, 11:00 AM–5:00 PM WAT',''],
    ['PROFESSIONAL_GROUP_NAME','TrevAI Professionals','Official Professional community.'],
    ['PROFESSIONAL_GROUP_LINK','','Paste the Professional WhatsApp invitation link here.'],
    ['PROFESSIONAL_SUPPORT_HOURS','Monday–Friday, 10:00 AM–5:00 PM WAT',''],
    ['VIP_GROUP_NAME','TrevAI Executives','Official VIP community.'],
    ['VIP_GROUP_LINK','','Paste the VIP WhatsApp invitation link here.'],
    ['VIP_SUPPORT_HOURS','Monday–Saturday, 9:00 AM–6:00 PM WAT',''],
    ['WRONG_PAYMENT_AMOUNT','The incorrect payment will be refunded after verification.',''],
    ['PAYMENT_NAME_MISMATCH','The student must contact support to confirm the transfer and verify identification.','']
  ];
  sheet.getRange(2, 1, rows.length, SETTING_HEADERS.length).setValues(rows);
}

function getTimetableForLevel_(accessLevel) {
  var sheet = getSpreadsheet_().getSheetByName(TREV.TIMETABLE_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var rows = getDataRows_(sheet, TIMETABLE_HEADERS.length, 1);
  return rows.filter(function(row) {
    var level = clean_(row[2], 30).toUpperCase();
    return level === 'ALL' || level === accessLevel;
  }).map(function(row) {
    return {
      date: clean_(row[0], 80), day: clean_(row[1], 30), accessLevel: clean_(row[2], 30),
      session: clean_(row[3], 50), title: clean_(row[4], 160), activityType: clean_(row[5], 80),
      duration: clean_(row[6], 50), classTime: clean_(row[7], 100), status: clean_(row[8], 40), note: clean_(row[9], 500)
    };
  });
}

function getChecklistForLevel_(accessLevel) {
  var sheet = getSpreadsheet_().getSheetByName(TREV.CHECKLIST_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var rows = getDataRows_(sheet, CHECKLIST_HEADERS.length, 3);
  return rows.filter(function(row) {
    var level = clean_(row[0], 30).toUpperCase();
    var visible = row[5] === true || String(row[5]).toUpperCase() === 'TRUE';
    return visible && (level === 'ALL' || level === accessLevel);
  }).map(function(row) {
    return { accessLevel: clean_(row[0],30), sortOrder:Number(row[1]||999), item:clean_(row[2],160), description:clean_(row[3],500), required:row[4]===true||String(row[4]).toUpperCase()==='TRUE' };
  }).sort(function(a,b){return a.sortOrder-b.sortOrder;});
}

function getCommunityGuidelines_() {
  var sheet = getSpreadsheet_().getSheetByName(TREV.GUIDELINES_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return getDataRows_(sheet, GUIDELINE_HEADERS.length, 1).filter(function(row){
    return row[3]===true||String(row[3]).toUpperCase()==='TRUE';
  }).map(function(row){
    return { id:clean_(row[0],30), title:clean_(row[1],160), guideline:clean_(row[2],800), sortOrder:Number(row[4]||999) };
  }).sort(function(a,b){return a.sortOrder-b.sortOrder;});
}

function getSettingsMap_() {
  if (TREV_REQUEST_CACHE.settings) return TREV_REQUEST_CACHE.settings;
  var map = {};
  var sheet = getSpreadsheet_().getSheetByName(TREV.SETTINGS_SHEET);
  if (sheet) {
    getDataRows_(sheet, SETTING_HEADERS.length, 1).forEach(function(row) {
      var key = clean_(row[0], 100);
      if (key) map[key] = clean_(row[1], 1000);
    });
  }
  TREV_REQUEST_CACHE.settings = map;
  return map;
}

function settingValue_(key, fallback) {
  var settings = getSettingsMap_();
  return Object.prototype.hasOwnProperty.call(settings, key) && settings[key] ? settings[key] : (fallback || '');
}

function getCommunityInfo_(accessLevel) {
  var prefix = accessLevel === 'STARTER' ? 'STARTER' : accessLevel === 'PROFESSIONAL' ? 'PROFESSIONAL' : 'VIP';
  return {
    groupName: settingValue_(prefix + '_GROUP_NAME', ''),
    inviteUrl: safeUrl_(settingValue_(prefix + '_GROUP_LINK', '')),
    supportHours: settingValue_(prefix + '_SUPPORT_HOURS', ''),
    classLinkPolicy: settingValue_('CLASS_LINK_POLICY', ''),
    recordingPolicy: settingValue_('RECORDING_POLICY', ''),
    privateMessagePolicy: settingValue_('PRIVATE_MESSAGE_POLICY', '')
  };
}


function getStudentProgress_(registrationId, accessLevel) {
  var requiredSessions = accessLevel === 'STARTER' ? 4 : 7;
  var attendanceSheet = getSpreadsheet_().getSheetByName(TREV.ATTENDANCE_SHEET);
  var attendedLabels = [];
  if (attendanceSheet) {
    getDataRows_(attendanceSheet, ATTENDANCE_HEADERS.length, 4).forEach(function(row) {
      var present = row[5] === true || String(row[5]).toUpperCase() === 'TRUE';
      if (String(row[3]) === registrationId && present) {
        var label = clean_(row[1], 120);
        if (label && attendedLabels.indexOf(label) === -1) attendedLabels.push(label);
      }
    });
  }
  var lessonsCompleted = Math.min(requiredSessions, attendedLabels.length);
  var attendancePercent = Math.min(100, Math.round((lessonsCompleted / requiredSessions) * 100));

  var assignments = getAssignmentsForLevel_(accessLevel);
  var submissions = getSubmissionsForRegistration_(registrationId);
  var approvedIds = [];
  var capstoneApproved = false;
  submissions.forEach(function(submission) {
    if (clean_(submission.status, 40).toUpperCase() === 'APPROVED') {
      if (approvedIds.indexOf(submission.assignmentId) === -1) approvedIds.push(submission.assignmentId);
      var combined = (submission.assignmentId + ' ' + submission.assignmentTitle).toUpperCase();
      if (/CAPSTONE|FINAL|VIP-PROJECT/.test(combined)) capstoneApproved = true;
    }
  });
  var requiredAssignments = assignments.length;
  var approvedAssignments = assignments.filter(function(item) { return approvedIds.indexOf(item.id) !== -1; }).length;
  var assignmentPercent = requiredAssignments ? Math.min(100, Math.round((approvedAssignments / requiredAssignments) * 100)) : 0;

  var certificate = null;
  var certificatesSheet = getSpreadsheet_().getSheetByName(TREV.CERTIFICATES_SHEET);
  if (certificatesSheet) {
    getDataRows_(certificatesSheet, CERTIFICATE_HEADERS.length, 1).some(function(row) {
      if (String(row[2]) === registrationId) {
        certificate = { id:clean_(row[0],60), issueDate:row[7] instanceof Date ? Utilities.formatDate(row[7],TREV.TIMEZONE,'MMM d, yyyy') : clean_(row[7],80), status:clean_(row[8],30)||'ISSUED' };
        return true;
      }
      return false;
    });
  }
  return {
    requiredSessions:requiredSessions,
    lessonsCompleted:lessonsCompleted,
    attendancePercent:attendancePercent,
    attendedSessions:attendedLabels,
    requiredAssignments:requiredAssignments,
    approvedAssignments:approvedAssignments,
    assignmentPercent:assignmentPercent,
    capstoneApproved:capstoneApproved,
    certificateEligible:attendancePercent >= 75 && capstoneApproved,
    certificate:certificate
  };
}

function getStaticPortalData_(accessLevel) {
  var cache = CacheService.getScriptCache();
  var key = 'portal-static-v3-' + accessLevel;
  var cached = cache.get(key);
  if (cached) {
    try { return JSON.parse(cached); } catch (ignored) {}
  }
  var data = {
    resources: getResourcesForLevel_(accessLevel),
    assignments: getAssignmentsForLevel_(accessLevel),
    timetable: getTimetableForLevel_(accessLevel),
    onboarding: getChecklistForLevel_(accessLevel),
    communityGuidelines: getCommunityGuidelines_(),
    community: getCommunityInfo_(accessLevel),
    cohort: {
      startDate: settingValue_('COHORT_START_DATE', '4 August 2026'),
      classTime: settingValue_('CLASS_TIME', 'To be announced after onboarding'),
      duration: settingValue_('CLASS_DURATION', '90 minutes'),
      capstoneDeadline: settingValue_('CAPSTONE_DEADLINE', '29 August 2026'),
      certificateRelease: settingValue_('CERTIFICATE_RELEASE', '31 August 2026')
    }
  };
  try { cache.put(key, JSON.stringify(data), 300); } catch (ignored) {}
  return data;
}

function clearPortalCache_() {
  CacheService.getScriptCache().removeAll([
    'portal-static-v3-STARTER',
    'portal-static-v3-PROFESSIONAL',
    'portal-static-v3-VIP'
  ]);
}

function refreshPortalCache() {
  clearPortalCache_();
  SpreadsheetApp.getUi().alert('Portal data cache cleared. Updated resources, timetable, checklist, guidelines, and settings will be visible on the next login.');
}


function installContentUpdateTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'processContentUpdates') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('processContentUpdates').timeBased().everyDays(1).atHour(10).create();
  SpreadsheetApp.getUi().alert('Daily content-update trigger installed for approximately 10:00 AM WAT.');
}

function processContentUpdates() {
  var ss=getSpreadsheet_();
  var sheet=ss.getSheetByName(TREV.CONTENT_UPDATES_SHEET);
  if (!sheet || sheet.getLastRow()<2) return;
  var updates=getDataRows_(sheet,CONTENT_UPDATE_HEADERS.length,2);
  var now=new Date();
  updates.forEach(function(row,index) {
    var status=clean_(row[5],30).toUpperCase();
    var scheduled=row[4] instanceof Date?row[4]:new Date(row[4]);
    if (status!=='SCHEDULED'||isNaN(scheduled.getTime())||scheduled.getTime()>now.getTime()) return;
    var recipients=getUpdateRecipients_(clean_(row[0],30).toUpperCase(),now);
    var quota=MailApp.getRemainingDailyQuota();
    if (recipients.length>quota) {
      sheet.getRange(index+2,6).setNote('Not sent: '+recipients.length+' recipients exceed remaining Gmail quota of '+quota+'.');
      return;
    }
    var subject=clean_(row[1],180); var content=cleanMultiline_(row[2],10000); var resource=safeUrl_(row[3]);
    var sent=0;
    recipients.forEach(function(student) {
      var text='Hi '+firstName_(student.name)+',\n\n'+content+(resource?'\n\nNew resource: '+resource:'')+'\n\n— TREV AI Support';
      var html=emailShell_(subject,'<p>Hi '+escapeHtml_(firstName_(student.name))+',</p><div style="white-space:pre-line;line-height:1.65">'+escapeHtml_(content)+'</div>'+(resource?'<p><a href="'+escapeHtml_(resource)+'" style="display:inline-block;background:#f2b705;color:#111;text-decoration:none;font-weight:800;padding:12px 20px;border-radius:999px">Open New Resource</a></p>':''));
      if (sendMailSafely_(student.email,subject,text,html)) sent++;
    });
    sheet.getRange(index+2,6,1,3).setValues([['SENT',sent,new Date()]]);
  });
}

function getUpdateRecipients_(audience,now) {
  var rows=getDataRows_(getRegistrationsSheet_(),REG_HEADERS.length,COL.REGISTRATION_ID);
  var cutoff=new Date(now.getTime()); cutoff.setMonth(cutoff.getMonth()-24);
  var seen={}; var result=[];
  rows.forEach(function(row) {
    if (clean_(row[COL.STATUS-1],30).toUpperCase()!=='APPROVED') return;
    var key=clean_(row[COL.PACKAGE_KEY-1],30).toUpperCase();
    var eligible=(audience==='BOTH'&&(key==='PROFESSIONAL'||key.indexOf('VIP_')===0))||(audience==='PROFESSIONAL'&&key==='PROFESSIONAL')||(audience==='VIP'&&key.indexOf('VIP_')===0);
    if (!eligible) return;
    var approved=row[COL.APPROVED_AT-1] instanceof Date?row[COL.APPROVED_AT-1]:new Date(row[COL.APPROVED_AT-1]);
    if (!isNaN(approved.getTime())&&approved<cutoff) return;
    var email=clean_(row[COL.EMAIL-1],120).toLowerCase();
    if (!email||seen[email]) return;
    seen[email]=true; result.push({email:email,name:clean_(row[COL.FULL_NAME-1],100)});
  });
  return result;
}

function verifyCertificate_(rawId) {
  var certificateId = clean_(rawId, 60).toUpperCase();
  if (!/^TREV-(STA|PRO|VIP)-2026-[0-9]{4,}$/.test(certificateId)) return { valid:false, status:'INVALID' };
  var sheet = getSpreadsheet_().getSheetByName(TREV.CERTIFICATES_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return { valid:false, status:'NOT FOUND' };
  var rowNumber = findExactRow_(sheet,1,certificateId);
  if (!rowNumber) return { valid:false, status:'NOT FOUND' };
  var row = sheet.getRange(rowNumber,1,1,CERTIFICATE_HEADERS.length).getValues()[0];
  var status = clean_(row[8],30).toUpperCase() || 'ISSUED';
  if (status === 'REVOKED') return { valid:false, status:'REVOKED' };
  return { valid:true, certificate:{
    id:certificateId, studentName:clean_(row[1],160), registrationId:clean_(row[2],60),
    packageKey:clean_(row[3],30), packageLabel:clean_(row[4],160), attendance:clean_(row[5],30),
    capstoneStatus:clean_(row[6],60), issueDate:row[7] instanceof Date ? Utilities.formatDate(row[7],TREV.TIMEZONE,'MMM d, yyyy') : clean_(row[7],80),
    status:status
  }};
}

function generateUniqueAccessCodes_(prefix, count) {
  var codes = [];
  while (codes.length < count) codes.push(generateUniqueAccessCode_(prefix, codes));
  return codes;
}

function generateUniqueAccessCode_(prefix, currentBatch) {
  var sheet = getRegistrationsSheet_();
  for (var attempt = 0; attempt < 20; attempt++) {
    var raw = Utilities.getUuid().replace(/-/g, '').toUpperCase();
    var code = 'TREV-' + prefix + '-' + raw.slice(0, 4) + '-' + raw.slice(4, 8);
    if (!findAccessCodeRow_(sheet, code) && (currentBatch || []).indexOf(code) === -1) return code;
  }
  throw new Error('Could not generate a unique access code.');
}

function createRegistrationId_() {
  var date = Utilities.formatDate(new Date(), TREV.TIMEZONE, 'yyyyMMdd');
  var random = Utilities.getUuid().replace(/-/g, '').slice(0, 5).toUpperCase();
  return 'TREV-' + date + '-' + random;
}

function findExactRow_(sheet, column, value) {
  if (sheet.getLastRow() < 2) return 0;
  var match = sheet
    .getRange(2, column, sheet.getLastRow() - 1, 1)
    .createTextFinder(String(value))
    .matchEntireCell(true)
    .matchCase(false)
    .findNext();
  return match ? match.getRow() : 0;
}

function findAccessCodeRow_(sheet, code) {
  if (sheet.getLastRow() < 2) return 0;
  var values = sheet.getRange(2, COL.ACCESS_CODE, sheet.getLastRow() - 1, 1).getDisplayValues();
  for (var index = 0; index < values.length; index++) {
    if (splitAccessCodes_(values[index][0]).indexOf(code) !== -1) return index + 2;
  }
  return 0;
}

function splitAccessCodes_(value) {
  return String(value || '')
    .toUpperCase()
    .split(/\s*[|,\n]\s*/)
    .map(function(code) { return code.trim(); })
    .filter(function(code) { return code; });
}

function sendPendingStudentEmail_(name, email, registrationId, packageInfo) {
  var subject = 'Registration received — payment verification pending';
  var text =
    'Hi ' + firstName_(name) + ',\n\n' +
    'We received your registration for the ' + packageInfo.label + ' (' + packageInfo.price + ').\n' +
    'Registration reference: ' + registrationId + '\n\n' +
    'Your payment is now awaiting manual verification. Normal verification takes 5 minutes to 1 hour. Once approved, your personal student-portal access code will be sent to this email address.\n\n' +
    'If the transfer name differs from your registration name, contact support on WhatsApp so your identity and payment can be confirmed. Incorrect payment amounts will be refunded after verification.\n\n' +
    'TREV AI Support\n' + TREV.ADMIN_EMAIL;
  var html = emailShell_(
    'Registration received',
    '<p>Hi ' + escapeHtml_(firstName_(name)) + ',</p>' +
    '<p>We received your registration for the <strong>' + escapeHtml_(packageInfo.label) + '</strong> (' + escapeHtml_(packageInfo.price) + ').</p>' +
    detailBox_([
      ['Registration reference', registrationId],
      ['Status', 'Payment verification pending'],
      ['Expected verification time', '5 minutes to 1 hour']
    ]) +
    '<p>Once the transfer is verified, your personal student-portal access code will be sent to this email address.</p>' +
    '<p>If the transfer name differs from your registration name, contact support on WhatsApp. Incorrect payment amounts will be refunded after verification.</p>'
  );
  return sendMailSafely_(email, subject, text, html);
}

function sendAdminRegistrationEmail_(data) {
  var subject = 'New registration pending: ' + data.fullName + ' — ' + data.packageLabel;
  var text =
    'A new TREV AI registration is awaiting payment verification.\n\n' +
    'Registration ID: ' + data.registrationId + '\n' +
    'Name: ' + data.fullName + '\n' +
    'Email: ' + data.email + '\n' +
    'WhatsApp: ' + data.whatsapp + '\n' +
    'Country: ' + data.country + '\n' +
    'Package: ' + data.packageLabel + ' (' + data.price + ')\n' +
    'Payment reference: ' + data.paymentReference + '\n\n' +
    'Verify the transfer, select the row in the Registrations sheet, then use TREV Registration > Approve selected registration.';
  var html = emailShell_(
    'New registration pending',
    detailBox_([
      ['Registration ID', data.registrationId],
      ['Student', data.fullName],
      ['Email', data.email],
      ['WhatsApp', data.whatsapp],
      ['Country', data.country],
      ['Package', data.packageLabel + ' — ' + data.price],
      ['Payment reference', data.paymentReference]
    ]) +
    '<p><strong>Next step:</strong> verify the transfer, select the row in the Registrations sheet, then choose <em>TREV Registration → Approve selected registration</em>.</p>'
  );
  return sendMailSafely_(TREV.ADMIN_EMAIL, subject, text, html);
}

function sendApprovalEmail_(name, email, registrationId, packageInfo, codes) {
  var isTeam = codes.length > 1;
  var community = getCommunityInfo_(packageInfo.accessLevel);
  var communityText = community.inviteUrl ? '\nWhatsApp community (' + community.groupName + '): ' + community.inviteUrl : '';
  var communityHtml = community.inviteUrl
    ? '<p style="text-align:center"><a href="' + escapeHtml_(community.inviteUrl) + '" style="display:inline-block;border:1px solid #111;color:#111;text-decoration:none;font-weight:800;padding:12px 20px;border-radius:999px">Join ' + escapeHtml_(community.groupName) + '</a></p>'
    : '<p>Your package community is <strong>' + escapeHtml_(community.groupName || 'the official TREV AI WhatsApp group') + '</strong>. The invitation will appear in your portal once configured.</p>';
  var subject = 'Payment confirmed — your TREV AI access code' + (isTeam ? 's' : '');
  var codeText = codes.map(function(code, index) {
    return (isTeam ? 'Seat ' + (index + 1) + ': ' : '') + code;
  }).join('\n');
  var codeHtml = codes.map(function(code, index) {
    return '<div style="margin:5px 0"><span style="color:#f2b705;font-family:Arial,sans-serif;font-size:11px">' +
      (isTeam ? 'SEAT ' + (index + 1) + ' · ' : '') + '</span>' + escapeHtml_(code) + '</div>';
  }).join('');

  var text =
    'Hi ' + firstName_(name) + ',\n\n' +
    'Your payment has been confirmed and your ' + packageInfo.label + ' enrollment is approved.\n\n' +
    (isTeam ? 'Team access codes:\n' : 'Access code: ') + codeText + '\n\n' +
    'Student portal: ' + TREV.PORTAL_URL + '\n' +
    'Registration ID: ' + registrationId + communityText + '\n\n' +
    'Inside the portal you will find your package summary, timetable, onboarding checklist, resources, assignments, community guidelines, and support information.\n\n' +
    'Keep each code private and assign only one code to each approved learner.\n\nTREV AI Support';
  var html = emailShell_(
    'Your enrollment is approved',
    '<p>Hi ' + escapeHtml_(firstName_(name)) + ',</p>' +
    '<p>Your payment has been confirmed and your <strong>' + escapeHtml_(packageInfo.label) + '</strong> enrollment is approved.</p>' +
    (isTeam ? '<p>Assign one unique code to each of the five approved team members.</p>' : '') +
    '<div style="margin:24px 0;padding:22px;background:#111;color:#fff;border-radius:10px;text-align:center">' +
      '<div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#f2b705;margin-bottom:8px">' + (isTeam ? 'Team access codes' : 'Personal access code') + '</div>' +
      '<div style="font-family:monospace;font-size:22px;font-weight:800;letter-spacing:.06em">' + codeHtml + '</div>' +
    '</div>' +
    detailBox_([
      ['Registration ID', registrationId],
      ['Approved package', packageInfo.label],
      ['Confirmed amount', packageInfo.price],
      ['Cohort begins', settingValue_('COHORT_START_DATE', '4 August 2026')],
      ['Class time', settingValue_('CLASS_TIME', 'To be announced after onboarding')],
      ['Support hours', community.supportHours]
    ]) +
    '<p style="text-align:center"><a href="' + escapeHtml_(TREV.PORTAL_URL) + '" style="display:inline-block;background:#f2b705;color:#111;text-decoration:none;font-weight:800;padding:13px 22px;border-radius:999px">Open Student Portal</a></p>' +
    communityHtml +
    '<p>The portal contains your package summary, timetable, onboarding checklist, resources, assignments, community guidelines, and support information.</p>' +
    '<p><strong>Keep each code private.</strong> Codes can be suspended if shared outside the approved enrollment.</p>'
  );
  return sendMailSafely_(email, subject, text, html);
}

function sendMailSafely_(to, subject, text, html) {
  try {
    MailApp.sendEmail({
      to: to,
      subject: subject,
      body: text,
      htmlBody: html,
      name: 'TREV AI Support',
      replyTo: TREV.ADMIN_EMAIL
    });
    return true;
  } catch (error) {
    console.error('Email failed for ' + to + ': ' + error);
    return false;
  }
}

function buildApprovalWhatsAppMessage_(name, packageInfo, codes) {
  var isTeam = codes.length > 1;
  var community = getCommunityInfo_(packageInfo.accessLevel);
  var communityLine = community.inviteUrl ? '\n\nWhatsApp community (' + community.groupName + '): ' + community.inviteUrl : '';
  var codeList = codes.map(function(code, index) {
    return isTeam
      ? (index + 1) + '. *' + code + '*'
      : '*' + code + '*';
  }).join('\n');

  return 'Hello ' + firstName_(name) + ', your payment has been confirmed and your ' +
    packageInfo.label + ' enrollment is approved.\n\n' +
    (isTeam ? 'Your five unique team access codes are:\n' : 'Your personal TREV AI access code is: ') + codeList +
    '\n\nConfirmed amount: *' + packageInfo.price + '*\n\nStudent portal: ' + TREV.PORTAL_URL + communityLine +
    '\n\nPlease keep each code private and assign one code per approved learner.\n\n' +
    '— TREV AI Support';
}

function buildWhatsAppUrl_(phone, message) {
  var digits = String(phone || '').replace(/\D/g, '');
  if (digits.indexOf('2340') === 0) digits = '234' + digits.slice(4);
  else if (digits.charAt(0) === '0') digits = '234' + digits.slice(1);
  return digits ? 'https://wa.me/' + digits + '?text=' + encodeURIComponent(message) : '';
}

function setShortWhatsAppLink_(range, whatsappUrl) {
  var richText = SpreadsheetApp.newRichTextValue()
    .setText('Send code on WhatsApp')
    .setLinkUrl(whatsappUrl)
    .build();
  range.setRichTextValue(richText);
}

function emailShell_(heading, body) {
  return '<div style="margin:0;background:#f6f6f3;padding:28px 12px;font-family:Arial,sans-serif;color:#1a1a1a">' +
    '<div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #e4e4df;border-radius:12px;overflow:hidden">' +
      '<div style="padding:18px 24px;background:#111;color:#fff;font-size:20px;font-weight:800"><span style="color:#f2b705">TREV</span> AI</div>' +
      '<div style="padding:28px 24px"><h1 style="font-size:26px;line-height:1.2;margin:0 0 20px">' + escapeHtml_(heading) + '</h1>' + body +
      '<p style="margin-top:28px;color:#6b6b6b;font-size:13px">TREV AI Support · ' + escapeHtml_(TREV.ADMIN_EMAIL) + '</p></div>' +
    '</div></div>';
}

function detailBox_(rows) {
  var html = '<div style="margin:20px 0;padding:16px;background:#fafafa;border:1px solid #e5e5e5;border-radius:8px">';
  rows.forEach(function(row) {
    html += '<div style="padding:7px 0;border-bottom:1px solid #ececec"><span style="color:#6b6b6b">' +
      escapeHtml_(row[0]) + ':</span> <strong>' + escapeHtml_(row[1]) + '</strong></div>';
  });
  return html + '</div>';
}

function firstName_(name) {
  return clean_(name, 100).split(/\s+/)[0] || 'Student';
}

function clean_(value, maxLength) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, maxLength || 500);
}

function cleanMultiline_(value, maxLength) {
  return String(value == null ? '' : value)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .trim()
    .slice(0, maxLength || 10000);
}

function safeCell_(value) {
  var cleaned = clean_(value, 500);
  return /^[=+@-]/.test(cleaned) ? "'" + cleaned : cleaned;
}

function safeUrl_(value) {
  var url = clean_(value, 1000);
  return /^https?:\/\//i.test(url) ? url : '';
}

function cleanCallback_(value) {
  var callback = String(value || '').trim();
  return /^[A-Za-z_$][0-9A-Za-z_$]{0,100}$/.test(callback) ? callback : '';
}

function escapeHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function jsonOutput_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function javascriptOutput_(callback, payload) {
  return ContentService
    .createTextOutput(callback + '(' + JSON.stringify(payload) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
