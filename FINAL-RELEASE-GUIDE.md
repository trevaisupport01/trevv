# TREV AI Final Release — Deployment Guide

## 1. Update Apps Script

1. Open the registration Google Sheet.
2. Choose **Extensions → Apps Script**.
3. Replace `Code.gs` with `apps-script/trev-registration-backend.gs` from this package.
4. Save.
5. Run `setupTrevSystem` once and authorize Drive/Sheets/Mail permissions.

Setup will:

- Migrate Resources to the new material schema.
- Remove the hard-coded Sample Course Material.
- Remove the hard-coded AI Education essay assignment.
- Preserve other existing resources, assignments, registrations, and submissions.
- Create the Content Updates sheet.
- Create the TREV AI Course Materials Drive folder.
- Clear the portal cache.

## 2. Redeploy Apps Script

1. Choose **Deploy → Manage deployments**.
2. Edit the current Web App deployment.
3. Choose **New version**.
4. Deploy, keeping the same `/exec` URL.

## 3. Upload the complete website

Upload the extracted contents to the GitHub repository root. Preserve all folders, particularly:

- `assets/prompt-libraries/`
- `assets/vip-templates/`
- `css/`
- `js/`

Wait for GitHub Pages and hard-refresh with **Ctrl+Shift+R**.

## 4. Content Manager

Refresh the Google Sheet. Use **TREV Content Manager** to:

- Upload Course Material
- Edit or replace a selected material
- Publish/unpublish
- Delete
- Refresh portal content

PDFs, documents, slides, templates, workbooks and ZIP files can be uploaded up to 20MB. Upload large videos directly to Google Drive, then publish the Drive link as material type `VIDEO`.

Package visibility is exact:

- ALL: everyone
- STARTER: Starter only
- PROFESSIONAL: Professional only
- VIP: VIP only

## 5. Content-update emails

Use the **Content Updates** sheet. Set Audience to `PROFESSIONAL`, `VIP`, or `BOTH`; add subject/content/resource link/scheduled date; and set Status to `SCHEDULED`.

Choose **TREV Updates → Install Daily Email Trigger** once. Professional and VIP registrations remain eligible for 24 months after approval, subject to Gmail sending quota.

## 6. Time-based pricing

- Early bird ends 28 July 2026 at 11:59 PM WAT.
- Cohort begins 4 August 2026 at 12:00 AM WAT.
- Early prices: ₦8,000 / ₦30,000 / ₦70,000 / ₦225,000 team.
- Normal prices: ₦10,000 / ₦35,000 / ₦75,000 / ₦250,000 team.

Backend registration rows capture the authoritative price at submission time.

## 7. Required testing

1. Mobile menu and backdrop.
2. Hero data-flow dots and cursor attraction.
3. Countdown stage and prices.
4. Registration and captured price.
5. Payment approval, email, and WhatsApp amount.
6. Exact package resource visibility.
7. Content Manager upload/edit/unpublish/delete.
8. Direct PDF/slide download.
9. Drive video modal.
10. Prompt search/copy/PDF for all three package codes.
11. VIP template download visible only to VIP.
12. Assignment deletion remains deleted after setup.
13. Dashboard focus border is gone.
14. Six genuine testimonial slides.
15. Content-update test email.
16. Certificate verification.
