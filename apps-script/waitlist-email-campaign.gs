/**
 * TREV AI — Email-only Waitlist Campaign
 *
 * Install in the Google Sheet linked to the waitlist Google Form.
 * Run setupWaitlistEmailCampaign(), then installWaitlistEmailTriggers().
 * Deploy as a Web App for one-click unsubscribe links.
 */

var WAITLIST = {
  SUBSCRIBERS_SHEET: 'Waitlist Subscribers',
  CAMPAIGN_SHEET: 'Waitlist Campaign',
  SETTINGS_SHEET: 'Waitlist Settings',
  TIMEZONE: 'Africa/Lagos'
};

var WAITLIST_SUBSCRIBER_HEADERS = [
  'Name','Email','Date Joined','Current Step','Last Email Sent',
  'Registered','Unsubscribed','Status','Unsubscribe Token','Last Error'
];

var WAITLIST_CAMPAIGN_HEADERS = [
  'Step','Timing','Subject','Email Body','Graphic Path','CTA Label','Active','Sent Count'
];

var WAITLIST_SETTING_HEADERS = ['Key','Value','Notes'];
var WAITLIST_CACHE = {};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('TREV Waitlist Email')
    .addItem('Set Up / Repair Campaign', 'setupWaitlistEmailCampaign')
    .addItem('Install Email Triggers', 'installWaitlistEmailTriggers')
    .addSeparator()
    .addItem('Process Due Emails Now', 'processWaitlistEmails')
    .addItem('Sync Registered Students', 'syncRegisteredSubscribers')
    .addItem('Send Test to Support Email', 'sendWaitlistTestEmail')
    .addToUi();
}

function setupWaitlistEmailCampaign() {
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Open this script from the waitlist response Google Sheet.');
  PropertiesService.getScriptProperties().setProperty('WAITLIST_SPREADSHEET_ID',ss.getId());
  ss.setSpreadsheetTimeZone(WAITLIST.TIMEZONE);
  var subscribers=getOrCreateWaitlistSheet_(ss,WAITLIST.SUBSCRIBERS_SHEET,WAITLIST_SUBSCRIBER_HEADERS);
  var campaign=getOrCreateWaitlistSheet_(ss,WAITLIST.CAMPAIGN_SHEET,WAITLIST_CAMPAIGN_HEADERS);
  var settings=getOrCreateWaitlistSheet_(ss,WAITLIST.SETTINGS_SHEET,WAITLIST_SETTING_HEADERS);
  formatWaitlistSheets_(subscribers,campaign,settings);
  seedWaitlistCampaign_(campaign);
  seedWaitlistSettings_(settings);
  SpreadsheetApp.getUi().alert('Waitlist email campaign prepared. Add PUBLIC_SITE_URL and WEB_APP_URL in Waitlist Settings, upload the six graphics, then install triggers.');
}

function installWaitlistEmailTriggers() {
  var ss=getWaitlistSpreadsheet_();
  ScriptApp.getProjectTriggers().forEach(function(trigger){
    if (['onWaitlistFormSubmit','processWaitlistEmails'].indexOf(trigger.getHandlerFunction())!==-1) ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('onWaitlistFormSubmit').forSpreadsheet(ss).onFormSubmit().create();
  ScriptApp.newTrigger('processWaitlistEmails').timeBased().everyHours(1).create();
  SpreadsheetApp.getUi().alert('Triggers installed: immediate welcome on form submission and hourly campaign processing.');
}

function onWaitlistFormSubmit(e) {
  try {
    var values=(e&&e.namedValues)||{};
    var name=findNamedValue_(values,['Name','Full Name','Your Name']);
    var email=findNamedValue_(values,['Email','Email Address','Your Email']);
    if (!email && e && e.range) {
      var sheet=e.range.getSheet();
      var headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];
      var row=e.range.getValues()[0];
      headers.forEach(function(header,index){
        if (!name && /name/i.test(header)) name=String(row[index]||'').trim();
        if (!email && /email/i.test(header)) email=String(row[index]||'').trim();
      });
    }
    if (!isValidWaitlistEmail_(email)) throw new Error('No valid email was found in the form response.');
    var result=upsertWaitlistSubscriber_(name||'Subscriber',email);
    if (result.currentStep===0 && !result.unsubscribed) sendCampaignStepToRow_(result.row,1);
  } catch(error) {
    console.error(error&&error.stack?error.stack:error);
  }
}

function processWaitlistEmails() {
  syncRegisteredSubscribers();
  var ss=getWaitlistSpreadsheet_();
  var sheet=ss.getSheetByName(WAITLIST.SUBSCRIBERS_SHEET);
  var campaign=getWaitlistCampaignMap_();
  var settings=getWaitlistSettings_();
  var now=new Date();
  var earlyEnd=new Date(settings.EARLY_BIRD_END||'2026-07-28T23:59:59+01:00');
  if (now>earlyEnd) return;
  var rows=getWaitlistDataRows_(sheet,WAITLIST_SUBSCRIBER_HEADERS.length,2);
  var quota=MailApp.getRemainingDailyQuota();
  for (var i=0;i<rows.length&&quota>0;i++) {
    var row=rows[i]; var sheetRow=i+2;
    if (toBool_(row[5])||toBool_(row[6])||String(row[7]).toUpperCase()==='INVALID') continue;
    var current=Number(row[3]||0);
    var desired=selectDueWaitlistStep_(row,current,campaign,settings,now);
    if (desired>current && campaign[desired] && sendCampaignStepToRow_(sheetRow,desired)) quota--;
  }
}

function selectDueWaitlistStep_(subscriber,current,campaign,settings,now) {
  var joined=subscriber[2] instanceof Date?subscriber[2]:new Date(subscriber[2]);
  var earlyEnd=new Date(settings.EARLY_BIRD_END||'2026-07-28T23:59:59+01:00');
  var hoursLeft=(earlyEnd-now)/3600000;
  if (hoursLeft<=24 && current<6) return 6;
  if (hoursLeft<=72 && current<5) return 5;
  var next=current+1;
  if (!campaign[next]) return current;
  var timing=String(campaign[next].timing||'').toUpperCase();
  if (timing==='IMMEDIATE') return next;
  var match=timing.match(/^DELAY_(\d+)H$/);
  if (match && !isNaN(joined.getTime()) && now.getTime()>=joined.getTime()+Number(match[1])*3600000) return next;
  return current;
}

function sendCampaignStepToRow_(sheetRow,step) {
  var ss=getWaitlistSpreadsheet_();
  var subscribers=ss.getSheetByName(WAITLIST.SUBSCRIBERS_SHEET);
  var campaign=getWaitlistCampaignMap_()[step];
  var settings=getWaitlistSettings_();
  if (!campaign||!campaign.active) return false;
  var row=subscribers.getRange(sheetRow,1,1,WAITLIST_SUBSCRIBER_HEADERS.length).getValues()[0];
  var name=cleanWaitlist_(row[0],100)||'there';
  var email=cleanWaitlist_(row[1],150).toLowerCase();
  var token=cleanWaitlist_(row[8],100);
  if (!isValidWaitlistEmail_(email)||toBool_(row[5])||toBool_(row[6])) return false;
  var base=cleanWaitlist_(settings.PUBLIC_SITE_URL,500).replace(/\/$/,'');
  if (!/^https?:\/\//i.test(base)) {
    subscribers.getRange(sheetRow,10).setValue('PUBLIC_SITE_URL is not configured.');
    return false;
  }
  var graphicUrl=base+campaign.graphicPath;
  var ctaUrl=base+'/register.html?utm_source=waitlist&utm_medium=email&utm_campaign=august_cohort&utm_content=step_'+step;
  var unsubscribeUrl=buildWaitlistUnsubscribeUrl_(settings,token,email);
  var subject=campaign.subject;
  var text='Hi '+firstNameWaitlist_(name)+',\n\n'+campaign.body+'\n\n'+campaign.ctaLabel+': '+ctaUrl+'\n\nTo stop campaign emails: '+unsubscribeUrl+'\n\n— TREV AI Academy';
  var html=waitlistEmailHtml_(name,campaign,graphicUrl,ctaUrl,unsubscribeUrl,settings);
  try {
    MailApp.sendEmail({to:email,subject:subject,body:text,htmlBody:html,name:settings.SENDER_NAME||'TREV AI Academy',replyTo:settings.SUPPORT_EMAIL||'trevaisupport01@gmail.com'});
    subscribers.getRange(sheetRow,4,1,7).setValues([[step,new Date(),row[5],row[6],'ACTIVE',token,'']]);
    var sentCell=ss.getSheetByName(WAITLIST.CAMPAIGN_SHEET).getRange(campaign.row,8);
    sentCell.setValue(Number(sentCell.getValue()||0)+1);
    return true;
  } catch(error) {
    subscribers.getRange(sheetRow,10).setValue(String(error));
    return false;
  }
}

function sendWaitlistTestEmail() {
  var settings=getWaitlistSettings_();
  var email=settings.SUPPORT_EMAIL||'trevaisupport01@gmail.com';
  var subscribers=getWaitlistSpreadsheet_().getSheetByName(WAITLIST.SUBSCRIBERS_SHEET);
  var row=subscribers.getLastRow()+1;
  subscribers.getRange(row,1,1,WAITLIST_SUBSCRIBER_HEADERS.length).setValues([['Test Subscriber',email,new Date(),0,'',false,false,'TEST','TEST-'+Utilities.getUuid(),'']]);
  sendCampaignStepToRow_(row,1);
  subscribers.deleteRow(row);
  SpreadsheetApp.getUi().alert('Test welcome email sent to '+email+'.');
}

function syncRegisteredSubscribers() {
  var settings=getWaitlistSettings_();
  var registrationId=cleanWaitlist_(settings.REGISTRATION_SPREADSHEET_ID,200);
  if (!registrationId) return;
  try {
    var regSheet=SpreadsheetApp.openById(registrationId).getSheetByName(settings.REGISTRATION_SHEET||'Registrations');
    if (!regSheet||regSheet.getLastRow()<2) return;
    var registered={};
    regSheet.getRange(2,1,regSheet.getLastRow()-1,Math.min(regSheet.getLastColumn(),17)).getDisplayValues().forEach(function(row){
      var email=String(row[3]||'').trim().toLowerCase(); if (email) registered[email]=true;
    });
    var sheet=getWaitlistSpreadsheet_().getSheetByName(WAITLIST.SUBSCRIBERS_SHEET);
    var rows=getWaitlistDataRows_(sheet,WAITLIST_SUBSCRIBER_HEADERS.length,2);
    rows.forEach(function(row,index){ if (registered[String(row[1]).toLowerCase()]) sheet.getRange(index+2,6).setValue(true); });
  } catch(error) { console.error('Registration sync failed: '+error); }
}

function doGet(e) {
  var action=cleanWaitlist_(e&&e.parameter&&e.parameter.action,30).toLowerCase();
  if (action!=='unsubscribe') return HtmlService.createHtmlOutput('<h2>TREV AI Waitlist Email Service</h2>');
  var token=cleanWaitlist_(e.parameter.token,100);
  var sheet=getWaitlistSpreadsheet_().getSheetByName(WAITLIST.SUBSCRIBERS_SHEET);
  var row=findWaitlistRow_(sheet,9,token);
  if (row) {
    sheet.getRange(row,7).setValue(true);
    sheet.getRange(row,8).setValue('UNSUBSCRIBED');
  }
  return HtmlService.createHtmlOutput('<!doctype html><meta name="viewport" content="width=device-width"><div style="max-width:600px;margin:80px auto;padding:32px;border:1px solid #ddd;border-radius:12px;font-family:Arial"><div style="font-weight:900;font-size:24px"><span style="color:#d4a100">TREV</span> AI</div><h1>Email preferences updated</h1><p>You will no longer receive TREV AI waitlist campaign emails.</p></div>').setTitle('TREV AI Email Preferences');
}

function waitlistEmailHtml_(name,campaign,graphicUrl,ctaUrl,unsubscribeUrl,settings) {
  var body=escapeWaitlistHtml_(campaign.body).replace(/\n/g,'<br>');
  return '<div style="margin:0;background:#f3f2ee;padding:24px 10px;font-family:Arial,sans-serif;color:#171717"><div style="max-width:640px;margin:auto;background:#fff;border:1px solid #ddd;border-radius:14px;overflow:hidden">'+
    '<div style="padding:18px 24px;background:#090909;color:#fff;font-size:20px;font-weight:900"><span style="color:#f2b705">TREV</span> AI ACADEMY</div>'+
    '<img src="'+escapeWaitlistHtml_(graphicUrl)+'" alt="'+escapeWaitlistHtml_(campaign.subject)+'" style="display:block;width:100%;height:auto">'+
    '<div style="padding:28px 24px"><p>Hi '+escapeWaitlistHtml_(firstNameWaitlist_(name))+',</p><div style="line-height:1.7;color:#333">'+body+'</div>'+
    '<p style="margin:26px 0;text-align:center"><a href="'+escapeWaitlistHtml_(ctaUrl)+'" style="display:inline-block;padding:14px 24px;background:#f2b705;color:#111;text-decoration:none;border-radius:999px;font-weight:900">'+escapeWaitlistHtml_(campaign.ctaLabel)+'</a></p>'+
    '<p style="font-size:13px;color:#666">Questions? Reply to this email at '+escapeWaitlistHtml_(settings.SUPPORT_EMAIL||'trevaisupport01@gmail.com')+'.</p>'+
    '<p style="margin-top:28px;padding-top:18px;border-top:1px solid #eee;font-size:11px;color:#888">You joined the TREV AI waitlist. <a href="'+escapeWaitlistHtml_(unsubscribeUrl)+'" style="color:#666">Unsubscribe from campaign emails</a>.</p></div></div></div>';
}

function buildWaitlistUnsubscribeUrl_(settings,token,email) {
  var web=cleanWaitlist_(settings.WEB_APP_URL,500);
  if (/^https?:\/\//i.test(web)) return web+'?action=unsubscribe&token='+encodeURIComponent(token);
  return 'mailto:'+(settings.SUPPORT_EMAIL||'trevaisupport01@gmail.com')+'?subject='+encodeURIComponent('Unsubscribe '+email);
}

function upsertWaitlistSubscriber_(name,email) {
  var sheet=getWaitlistSpreadsheet_().getSheetByName(WAITLIST.SUBSCRIBERS_SHEET);
  var row=findWaitlistRow_(sheet,2,email.toLowerCase());
  if (row) {
    var existing=sheet.getRange(row,1,1,WAITLIST_SUBSCRIBER_HEADERS.length).getValues()[0];
    return {row:row,currentStep:Number(existing[3]||0),unsubscribed:toBool_(existing[6])};
  }
  var token=Utilities.getUuid().replace(/-/g,'');
  sheet.appendRow([cleanWaitlist_(name,100),email.toLowerCase(),new Date(),0,'',false,false,'ACTIVE',token,'']);
  return {row:sheet.getLastRow(),currentStep:0,unsubscribed:false};
}

function getWaitlistCampaignMap_() {
  if (WAITLIST_CACHE.campaign) return WAITLIST_CACHE.campaign;
  var sheet=getWaitlistSpreadsheet_().getSheetByName(WAITLIST.CAMPAIGN_SHEET);
  var rows=getWaitlistDataRows_(sheet,WAITLIST_CAMPAIGN_HEADERS.length,1); var map={};
  rows.forEach(function(row,index){ var step=Number(row[0]); if(step) map[step]={row:index+2,step:step,timing:row[1],subject:row[2],body:row[3],graphicPath:row[4],ctaLabel:row[5],active:toBool_(row[6])}; });
  WAITLIST_CACHE.campaign=map; return map;
}

function getWaitlistSettings_() {
  if (WAITLIST_CACHE.settings) return WAITLIST_CACHE.settings;
  var sheet=getWaitlistSpreadsheet_().getSheetByName(WAITLIST.SETTINGS_SHEET); var map={};
  getWaitlistDataRows_(sheet,WAITLIST_SETTING_HEADERS.length,1).forEach(function(row){ if(row[0]) map[String(row[0]).trim()]=String(row[1]||'').trim(); });
  WAITLIST_CACHE.settings=map; return map;
}

function seedWaitlistCampaign_(sheet) {
  if (sheet.getLastRow()>1) return;
  var rows=[
    [1,'IMMEDIATE','You’re on the TREV AI waitlist','Thanks for joining the TREV AI Academy waitlist. You’ll receive practical information about the August cohort, package options, student resources and the early-bird deadline.\n\nAI tip: Better prompts include context, a clear task, useful constraints and the format you want.','/assets/email-campaign/01-welcome-created-with-ai-email.jpg','Explore TREV AI',true,0],
    [2,'DELAY_12H','What could become easier if you understood AI?','AI can help you research faster, create with more confidence, reduce repetitive work and build reusable workflows—without coding. TREV AI focuses on practical transformation, not tool hype.','/assets/email-campaign/02-transformation-email.jpg','See the August Cohort',true,0],
    [3,'DELAY_24H','Which TREV AI package is right for you?','Starter builds confidence with foundational tools. Professional develops advanced research, content and automation workflows. VIP Executive focuses on strategy, proposals, audits and organizational implementation.','/assets/email-campaign/03-package-comparison-email.jpg','Compare Packages',true,0],
    [4,'DELAY_36H','This is what the TREV AI learning experience looks like','Approved students receive a package-specific portal with a timetable, prompt library, downloadable materials, assignment uploads, instructor feedback, community access and certificate tracking.','/assets/email-campaign/04-portal-proof-email.jpg','View the Learning Experience',true,0],
    [5,'EARLY_72H','Early-bird registration ends in 72 hours','Early-bird pricing is ₦8,000 for Starter, ₦30,000 for Professional, ₦70,000 for VIP Individual and ₦225,000 for a VIP Team of up to five. Prices return to normal after the deadline.','/assets/email-campaign/05-early-bird-72-hours-email.jpg','Secure Early-Bird Pricing',true,0],
    [6,'EARLY_24H','Final hours to secure early-bird pricing','Early-bird registration ends tonight at 11:59 PM WAT. If the August cohort is right for you, complete your registration before the deadline.','/assets/email-campaign/06-final-24-hours-email.jpg','Register Before 11:59 PM',true,0]
  ];
  sheet.getRange(2,1,rows.length,WAITLIST_CAMPAIGN_HEADERS.length).setValues(rows);
}

function seedWaitlistSettings_(sheet) {
  if (sheet.getLastRow()>1) return;
  var rows=[
    ['PUBLIC_SITE_URL','','Final Cloudflare Pages or custom-domain base URL, no trailing slash.'],
    ['WEB_APP_URL','','Waitlist campaign Web App /exec URL for unsubscribe links.'],
    ['SUPPORT_EMAIL','trevaisupport01@gmail.com','Reply-to and support email.'],
    ['SENDER_NAME','TREV AI Academy','Name displayed in recipients’ inboxes.'],
    ['EARLY_BIRD_END','2026-07-28T23:59:59+01:00','WAT deadline.'],
    ['COHORT_START','2026-08-04T00:00:00+01:00','WAT cohort start.'],
    ['REGISTRATION_SPREADSHEET_ID','','Optional: Sheet ID containing the Registrations tab.'],
    ['REGISTRATION_SHEET','Registrations','Registration tab name.']
  ];
  sheet.getRange(2,1,rows.length,WAITLIST_SETTING_HEADERS.length).setValues(rows);
}

function formatWaitlistSheets_(subscribers,campaign,settings) {
  [subscribers,campaign,settings].forEach(function(sheet){ sheet.setFrozenRows(1); sheet.getRange(1,1,1,sheet.getLastColumn()).setBackground('#111111').setFontColor('#ffffff').setFontWeight('bold'); });
  subscribers.setColumnWidth(1,180); subscribers.setColumnWidth(2,220); subscribers.setColumnWidth(10,300);
  subscribers.getRange(2,6,Math.max(subscribers.getMaxRows()-1,1),2).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  campaign.setColumnWidth(2,120); campaign.setColumnWidth(3,300); campaign.setColumnWidth(4,600); campaign.setColumnWidth(5,330);
  campaign.getRange(2,7,Math.max(campaign.getMaxRows()-1,1),1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  settings.setColumnWidth(1,250); settings.setColumnWidth(2,420); settings.setColumnWidth(3,450);
}

function getOrCreateWaitlistSheet_(ss,name,headers) { var sheet=ss.getSheetByName(name)||ss.insertSheet(name); sheet.getRange(1,1,1,headers.length).setValues([headers]); return sheet; }
function getWaitlistSpreadsheet_() { if(WAITLIST_CACHE.ss)return WAITLIST_CACHE.ss;var id=PropertiesService.getScriptProperties().getProperty('WAITLIST_SPREADSHEET_ID');var ss=id?SpreadsheetApp.openById(id):SpreadsheetApp.getActiveSpreadsheet();if(!ss)throw new Error('Run setupWaitlistEmailCampaign first.');WAITLIST_CACHE.ss=ss;return ss; }
function getWaitlistDataRows_(sheet,count,keyColumn) { var last=sheet.getLastRow();if(last<2)return[];var values=sheet.getRange(2,1,last-1,count).getValues();var key=(keyColumn||1)-1;while(values.length&&!String(values[values.length-1][key]||'').trim())values.pop();return values; }
function findWaitlistRow_(sheet,column,value) { if(!value||sheet.getLastRow()<2)return 0;var found=sheet.getRange(2,column,sheet.getLastRow()-1,1).createTextFinder(String(value)).matchEntireCell(true).matchCase(false).findNext();return found?found.getRow():0; }
function findNamedValue_(map,names) { for(var i=0;i<names.length;i++){var value=map[names[i]];if(value&&value[0])return String(value[0]).trim();}return''; }
function isValidWaitlistEmail_(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email||'').trim()); }
function cleanWaitlist_(value,max) { return String(value==null?'':value).replace(/[\u0000-\u001F\u007F]/g,' ').trim().slice(0,max||1000); }
function firstNameWaitlist_(name) { return cleanWaitlist_(name,100).split(/\s+/)[0]||'there'; }
function toBool_(value) { return value===true||String(value).toUpperCase()==='TRUE'; }
function escapeWaitlistHtml_(value) { return String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
