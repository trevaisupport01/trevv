(() => {
  'use strict';
  const config = window.TREV_CONFIG;
  if (!config) return;
  const early = Date.now() <= new Date(config.pricing.earlyBirdEnds).getTime();
  const numberOnly = (price) => price.replace(/[^0-9,]/g, '');

  document.querySelectorAll('[data-package-card]').forEach((card) => {
    const key = card.dataset.packageCard;
    const item = config.packages[key];
    if (!item) return;
    const price = early ? item.earlyPrice : item.normalPrice;
    const usd = early ? item.earlyUsd : item.normalUsd;
    const amount = card.querySelector('.js-price');
    const usdLabel = card.querySelector('.js-usd');
    const normal = card.querySelector('.js-normal-price');
    if (amount) amount.textContent = numberOnly(price);
    if (usdLabel) usdLabel.textContent = `${usd}${key === 'vip-seat' ? '/seat' : ''} — international reference`;
    if (normal) normal.textContent = item.normalPrice;
    card.querySelectorAll('.early-price-badge').forEach((badge) => { badge.hidden = !early; });
    card.querySelectorAll('.normal-price-note').forEach((note) => { note.hidden = !early; });
  });

  const team = config.packages['vip-team'];
  const teamPrice = document.querySelector('.js-team-price');
  const teamNormal = document.querySelector('.js-team-normal');
  if (teamPrice) teamPrice.textContent = early ? team.earlyPrice : team.normalPrice;
  if (teamNormal) {
    teamNormal.textContent = early ? `(normal ${team.normalPrice})` : '';
    teamNormal.hidden = !early;
  }

  const banner = document.getElementById('pricingStatusBanner');
  if (banner) {
    banner.hidden = !early;
    if (early) {
      const remaining = new Date(config.pricing.earlyBirdEnds).getTime() - Date.now();
      const days = Math.max(0, Math.ceil(remaining / 86400000));
      const strong = banner.querySelector('strong');
      if (strong) strong.textContent = `Ends 28 July 2026 at 11:59 PM WAT · ${days} day${days === 1 ? '' : 's'} remaining`;
    }
  }
})();
