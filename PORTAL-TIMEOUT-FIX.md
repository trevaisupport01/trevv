# Portal Timeout Fix

## Diagnosis

The access code is valid and the Apps Script endpoint is working. Direct tests returned the portal data successfully, but the response took approximately **10.8–16.0 seconds**. The website stopped waiting after **12 seconds**, which caused the message “The portal took too long to respond.”

The delay came from two sources:

1. The portal timeout was too short for an Apps Script cold start.
2. Blank checkbox rows made some Sheets appear to contain hundreds of records, so the backend read far more rows than necessary.

## Fixes included

- Portal timeout increased from 12 to 30 seconds.
- Spreadsheet connection cached during each request.
- Portal Settings loaded once per request rather than repeatedly.
- Static portal data cached for five minutes.
- Sheet queries now read only meaningful records.
- Checkbox validation no longer fills empty rows with `FALSE` values.
- Running setup removes old blank checkbox tails.
- Onboarding and Community Guidelines seed correctly.
- Added **TREV Registration → Refresh portal data cache** after manual Sheet edits.

## Apply the fix

1. Open the registration Google Sheet.
2. Choose **Extensions → Apps Script**.
3. Replace `Code.gs` with `apps-script/trev-registration-backend.gs` from the new package.
4. Save.
5. Run `setupTrevSystem` once.
6. Confirm Onboarding Checklist and Community Guidelines now contain rows.
7. Choose **Deploy → Manage deployments**.
8. Edit the current deployment.
9. Choose **New version** and deploy.
10. Upload the updated `js/portal.js` to `js/portal.js` in the GitHub repository.
11. Wait for GitHub Pages, then hard-refresh with **Ctrl+Shift+R**.
12. Test the same code again.

The first login after a cold Apps Script start can still take several seconds, but it will now remain within the 30-second portal window. Later logins should be faster because static portal data is cached.
