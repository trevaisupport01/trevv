/*
 * TREV AI registration configuration
 *
 * SETUP REQUIRED:
 * After deploying apps-script/trev-registration-backend.gs as a Google Apps
 * Script Web App, replace PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE below with
 * the /exec URL. Do not use the /dev testing URL.
 */
window.TREV_CONFIG = Object.freeze({
  appsScriptUrl: 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE',
  supportEmail: 'trevaisupport01@gmail.com',
  supportWhatsApp: '2348139908559',
  portalUrl: 'https://trevaisupport01.github.io/Trev/portal.html',
  bank: Object.freeze({
    name: 'OPAY',
    accountName: 'DANIEL GBENGA OLUTIMEHIN',
    accountNumber: '6109478874'
  }),
  packages: Object.freeze({
    starter: Object.freeze({
      key: 'STARTER',
      label: 'Starter Package',
      price: '₦10,000',
      accessLevel: 'STARTER'
    }),
    professional: Object.freeze({
      key: 'PROFESSIONAL',
      label: 'Professional Package',
      price: '₦35,000',
      accessLevel: 'PROFESSIONAL'
    }),
    'vip-seat': Object.freeze({
      key: 'VIP_SEAT',
      label: 'VIP Executive — Individual Seat',
      price: '₦75,000',
      accessLevel: 'VIP'
    }),
    'vip-team': Object.freeze({
      key: 'VIP_TEAM',
      label: 'VIP Executive — Team of up to 5',
      price: '₦250,000',
      accessLevel: 'VIP'
    })
  })
});
