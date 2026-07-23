/* TREV AI public registration and pricing configuration. */
window.TREV_CONFIG = Object.freeze({
  appsScriptUrl: 'https://script.google.com/macros/s/AKfycbz_oyQWP8kZ4lWjChn0V2GDC2DzILmyMhA9scAjlp_W_2Yyb_08icF0UDPgPskfLq85zg/exec',
  supportEmail: 'trevaisupport01@gmail.com',
  supportWhatsApp: '2348139908559',
  portalUrl: 'https://trevaisupport01.github.io/Trev/portal.html',
  pricing: Object.freeze({
    earlyBirdEnds: '2026-07-28T23:59:59+01:00',
    cohortStarts: '2026-08-04T00:00:00+01:00'
  }),
  bank: Object.freeze({
    name: 'OPAY',
    accountName: 'DANIEL GBENGA OLUTIMEHIN',
    accountNumber: '6109478874'
  }),
  packages: Object.freeze({
    starter: Object.freeze({
      key: 'STARTER', label: 'Starter Package', accessLevel: 'STARTER',
      earlyPrice: '₦8,000', normalPrice: '₦10,000', earlyUsd: '≈ $6 USD', normalUsd: '≈ $7 USD'
    }),
    professional: Object.freeze({
      key: 'PROFESSIONAL', label: 'Professional Package', accessLevel: 'PROFESSIONAL',
      earlyPrice: '₦30,000', normalPrice: '₦35,000', earlyUsd: '≈ $22 USD', normalUsd: '≈ $25 USD'
    }),
    'vip-seat': Object.freeze({
      key: 'VIP_SEAT', label: 'VIP Executive — Individual Seat', accessLevel: 'VIP',
      earlyPrice: '₦70,000', normalPrice: '₦75,000', earlyUsd: '≈ $51 USD', normalUsd: '≈ $54 USD'
    }),
    'vip-team': Object.freeze({
      key: 'VIP_TEAM', label: 'VIP Executive — Team of up to 5', accessLevel: 'VIP',
      earlyPrice: '₦225,000', normalPrice: '₦250,000', earlyUsd: '≈ $163 USD', normalUsd: '≈ $181 USD'
    })
  })
});
