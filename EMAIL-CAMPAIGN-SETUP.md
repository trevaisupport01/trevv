# TREV AI Email-Only Waitlist Campaign Setup

## Before activation

You need the final Cloudflare Pages or custom-domain URL. Do not install triggers while `PUBLIC_SITE_URL` is blank.

## 1. Upload the six graphics

Copy:

`public-assets/assets/email-campaign/`

into the website’s:

`public/assets/email-campaign/`

Deploy the website and confirm each image URL opens.

## 2. Install Apps Script

1. Open the Google Sheet linked to the waitlist Google Form.
2. Choose **Extensions → Apps Script**.
3. Use a new Apps Script project or add a separate `.gs` file.
4. Paste `apps-script/waitlist-email-campaign.gs`.
5. Save.
6. Run `setupWaitlistEmailCampaign`.
7. Authorize Sheets and Gmail permissions.
8. Refresh the spreadsheet.

The script creates:

- Waitlist Subscribers
- Waitlist Campaign
- Waitlist Settings

## 3. Configure Waitlist Settings

Set:

- `PUBLIC_SITE_URL` — final Cloudflare/custom-domain base URL, without trailing slash
- `SUPPORT_EMAIL` — already set to trevaisupport01@gmail.com
- `REGISTRATION_SPREADSHEET_ID` — optional but recommended; copy the long ID from the registration Sheet URL
- `REGISTRATION_SHEET` — `Registrations`

## 4. Deploy unsubscribe Web App

1. In Apps Script select **Deploy → New deployment**.
2. Type: Web App.
3. Execute as: Me.
4. Who has access: Anyone.
5. Deploy.
6. Copy the `/exec` URL.
7. Paste it into `WEB_APP_URL` in Waitlist Settings.

## 5. Send a test

Use **TREV Waitlist Email → Send Test to Support Email**.

Verify:

- Graphic loads
- CTA opens registration
- Reply-to is correct
- Unsubscribe link works
- Mobile layout is readable

## 6. Activate

Choose **TREV Waitlist Email → Install Email Triggers**.

The form-submit trigger sends Email 1 immediately. An hourly trigger processes later emails.

## Sequence

1. Immediate welcome
2. Transformation after 12 hours
3. Package comparison after 24 hours
4. Portal/product proof after 36 hours
5. 72-hour deadline window
6. Final 24-hour window

A late subscriber skips directly to the relevant deadline email. No emails are sent after the early-bird deadline.

## Stop after registration

If `REGISTRATION_SPREADSHEET_ID` is configured, the hourly process matches subscriber emails against the Registrations sheet and stops campaign emails after registration. You can also tick `Registered` manually.

## Quotas

MailApp uses the sending Google account’s daily recipient quota. Check Apps Script executions and the Last Error column if a message is not sent.

## Disable quickly

- Uncheck `Active` for campaign rows, or
- Delete the installed triggers from Apps Script → Triggers.
