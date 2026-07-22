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
  UPLOAD_ROOT_FOLDER: 'TREV AI Assignment Uploads',
  MAX_UPLOAD_BYTES: 10 * 1024 * 1024,
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
  'Visible',
  'Sort Order'
];

var ASSIGNMENT_HEADERS = [
  'Assignment ID',
  'Access Level',
  'Title',
  'Instructions',
  'Due Date',
  'Accepted Files',
  'Max Size MB',
  'Visible',
  'Sort Order'
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
    label: 'Starter Package',
    price: '₦10,000',
    accessLevel: 'STARTER',
    codePrefix: 'STA'
  },
  PROFESSIONAL: {
    label: 'Professional Package',
    price: '₦35,000',
    accessLevel: 'PROFESSIONAL',
    codePrefix: 'PRO'
  },
  VIP_SEAT: {
    label: 'VIP Executive — Individual Seat',
    price: '₦75,000',
    accessLevel: 'VIP',
    codePrefix: 'VIP'
  },
  VIP_TEAM: {
    label: 'VIP Executive — Team of up to 5',
    price: '₦250,000',
    accessLevel: 'VIP',
    codePrefix: 'VIP'
  }
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('TREV Registration')
    .addItem('Set up / repair workbook', 'setupTrevSystem')
    .addSeparator()
    .addItem('Approve selected registration', 'approveSelectedRegistration')
    .addItem('Resend selected access email', 'resendSelectedAccessEmail')
    .addItem('Rebuild selected WhatsApp link', 'rebuildSelectedWhatsAppLink')
    .addItem('Suspend selected access', 'suspendSelectedAccess')
    .addToUi();
}

/** Run once before deploying the Web App. Safe to run again. */
function setupTrevSystem() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Open this script from a Google Sheet, then run setupTrevSystem again.');

  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  ss.setSpreadsheetTimeZone(TREV.TIMEZONE);

  var registrations = getOrCreateSheet_(ss, TREV.REGISTRATIONS_SHEET, REG_HEADERS);
  var resources = getOrCreateSheet_(ss, TREV.RESOURCES_SHEET, RESOURCE_HEADERS);
  var assignments = getOrCreateSheet_(ss, TREV.ASSIGNMENTS_SHEET, ASSIGNMENT_HEADERS);
  var submissions = getOrCreateSheet_(ss, TREV.SUBMISSIONS_SHEET, SUBMISSION_HEADERS);

  formatRegistrationsSheet_(registrations);
  formatResourcesSheet_(resources);
  formatAssignmentsSheet_(assignments);
  formatSubmissionsSheet_(submissions);
  addStarterResourceRows_(resources);
  addStarterAssignmentRows_(assignments);
  getUploadRootFolder_();

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
    resources: getResourcesForLevel_(packageInfo.accessLevel),
    assignments: getAssignmentsForLevel_(packageInfo.accessLevel),
    submissions: getSubmissionsForRegistration_(registrationId)
  };
}

function getResourcesForLevel_(accessLevel) {
  var allowed = {
    STARTER: ['ALL', 'STARTER'],
    PROFESSIONAL: ['ALL', 'STARTER', 'PROFESSIONAL'],
    VIP: ['ALL', 'STARTER', 'PROFESSIONAL', 'VIP']
  }[accessLevel] || ['ALL'];

  var sheet = getSpreadsheet_().getSheetByName(TREV.RESOURCES_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, RESOURCE_HEADERS.length).getValues();
  var resources = [];

  rows.forEach(function(row) {
    var level = clean_(row[0], 30).toUpperCase();
    var visible = row[6] === true || String(row[6]).toUpperCase() === 'TRUE';
    if (allowed.indexOf(level) === -1 || !visible || !clean_(row[2], 150)) return;

    var originalUrl = safeUrl_(row[4]);
    var buttonLabel = clean_(row[5], 50) || 'Download Resource';
    var directUrl = makeDirectDownloadUrl_(originalUrl);
    var isDownload = Boolean(originalUrl) && (directUrl !== originalUrl || /download|manual|template|workbook|pdf/i.test(buttonLabel));

    resources.push({
      accessLevel: level,
      category: clean_(row[1], 80) || 'Course Resources',
      title: clean_(row[2], 150),
      description: clean_(row[3], 500),
      url: isDownload ? directUrl : originalUrl,
      buttonLabel: buttonLabel,
      download: isDownload,
      sortOrder: Number(row[7] || 999)
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

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, ASSIGNMENT_HEADERS.length).getValues();
  var assignments = [];

  rows.forEach(function(row) {
    var id = clean_(row[0], 60).toUpperCase();
    var level = clean_(row[1], 30).toUpperCase();
    var visible = row[7] === true || String(row[7]).toUpperCase() === 'TRUE';
    if (!id || allowed.indexOf(level) === -1 || !visible || !clean_(row[2], 150)) return;

    var dueDate = '';
    if (row[4] instanceof Date && !isNaN(row[4].getTime())) {
      dueDate = Utilities.formatDate(row[4], TREV.TIMEZONE, 'MMM d, yyyy');
    } else {
      dueDate = clean_(row[4], 60);
    }

    assignments.push({
      id: id,
      accessLevel: level,
      title: clean_(row[2], 150),
      instructions: clean_(row[3], 1000),
      dueDate: dueDate,
      acceptedFiles: clean_(row[5], 120) || '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,.jpg,.jpeg,.png',
      maxSizeMb: Math.min(Math.max(Number(row[6] || 10), 1), 10),
      sortOrder: Number(row[8] || 999)
    });
  });

  assignments.sort(function(a, b) { return a.sortOrder - b.sortOrder; });
  return assignments;
}

function getSubmissionsForRegistration_(registrationId) {
  var sheet = getSpreadsheet_().getSheetByName(TREV.SUBMISSIONS_SHEET);
  if (!sheet || sheet.getLastRow() < 2 || !registrationId) return [];

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, SUBMISSION_HEADERS.length).getValues();
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

function makeDirectDownloadUrl_(url) {
  var safe = safeUrl_(url);
  if (!safe) return '';
  if (!/drive\.google\.com/i.test(safe)) return safe;

  var match = safe.match(/\/file\/d\/([A-Za-z0-9_-]+)/) ||
    safe.match(/[?&]id=([A-Za-z0-9_-]+)/) ||
    safe.match(/\/d\/([A-Za-z0-9_-]+)/);
  return match ? 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(match[1]) : safe;
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
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw new Error('Spreadsheet is not configured. Run setupTrevSystem first.');
  return active;
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
  sheet.setColumnWidth(6, 130);
  sheet.getRange(2, 7, Math.max(sheet.getMaxRows() - 1, 1), 1).insertCheckboxes();
  sheet.getRange(2, 1, Math.max(sheet.getMaxRows() - 1, 1), 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(['ALL', 'STARTER', 'PROFESSIONAL', 'VIP'], true)
      .setAllowInvalid(false)
      .build()
  );
}

function addStarterResourceRows_(sheet) {
  if (sheet.getLastRow() > 1) return;
  sheet.getRange(2, 1, 4, RESOURCE_HEADERS.length).setValues([
    ['ALL', 'Orientation', 'Start Here', 'Add the general student welcome guide or orientation file in this row.', '', 'Download Guide', true, 1],
    ['STARTER', 'Course Materials', 'Starter Learning Manual', 'Add the Starter package manual, lesson files, or downloadable resources here.', '', 'Download Manual', true, 10],
    ['PROFESSIONAL', 'Course Materials', 'Professional Learning Library', 'Add Professional package lessons, templates, coaching files, and updates here.', '', 'Download Materials', true, 20],
    ['VIP', 'Executive Resources', 'VIP Executive Workspace', 'Add private strategy, consulting, team, and automation-audit files here.', '', 'Download Resources', true, 30]
  ]);
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
  sheet.setColumnWidth(4, 420);
  sheet.setColumnWidth(5, 120);
  sheet.setColumnWidth(6, 250);
  sheet.getRange(2, 8, Math.max(sheet.getMaxRows() - 1, 1), 1).insertCheckboxes();
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

function addStarterAssignmentRows_(sheet) {
  if (sheet.getLastRow() > 1) return;
  sheet.getRange(2, 1, 4, ASSIGNMENT_HEADERS.length).setValues([
    ['GENERAL-PRACTICE', 'ALL', 'AI Workflow Practice', 'Upload a short document showing one practical workflow you completed with an AI tool.', '', '.pdf,.doc,.docx', 10, true, 1],
    ['STARTER-CAPSTONE', 'STARTER', 'Starter Capstone Project', 'Submit your completed Starter capstone using the assignment brief provided in your learning materials.', '', '.pdf,.doc,.docx,.ppt,.pptx,.zip', 10, true, 10],
    ['PRO-CAPSTONE', 'PROFESSIONAL', 'Professional Capstone Project', 'Submit your complete professional workflow, supporting documentation, and any relevant output files.', '', '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip', 10, true, 20],
    ['VIP-PROJECT', 'VIP', 'VIP Executive Project', 'Submit your strategy, automation audit, or team implementation project for review.', '', '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip', 10, true, 30]
  ]);
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
    'Your payment is now awaiting manual verification. Once approved, your personal student-portal access code will be sent to this email address.\n\n' +
    'TREV AI Support\n' + TREV.ADMIN_EMAIL;
  var html = emailShell_(
    'Registration received',
    '<p>Hi ' + escapeHtml_(firstName_(name)) + ',</p>' +
    '<p>We received your registration for the <strong>' + escapeHtml_(packageInfo.label) + '</strong> (' + escapeHtml_(packageInfo.price) + ').</p>' +
    detailBox_([
      ['Registration reference', registrationId],
      ['Status', 'Payment verification pending']
    ]) +
    '<p>Once the transfer is verified, your personal student-portal access code will be sent to this email address.</p>'
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
    'Registration ID: ' + registrationId + '\n\n' +
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
    detailBox_([['Registration ID', registrationId], ['Approved package', packageInfo.label]]) +
    '<p style="text-align:center"><a href="' + escapeHtml_(TREV.PORTAL_URL) + '" style="display:inline-block;background:#f2b705;color:#111;text-decoration:none;font-weight:800;padding:13px 22px;border-radius:999px">Open Student Portal</a></p>' +
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
  var codeList = codes.map(function(code, index) {
    return isTeam
      ? (index + 1) + '. *' + code + '*'
      : '*' + code + '*';
  }).join('\n');

  return 'Hello ' + firstName_(name) + ', your payment has been confirmed and your ' +
    packageInfo.label + ' enrollment is approved.\n\n' +
    (isTeam ? 'Your five unique team access codes are:\n' : 'Your personal TREV AI access code is: ') + codeList +
    '\n\nStudent portal: ' + TREV.PORTAL_URL +
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
