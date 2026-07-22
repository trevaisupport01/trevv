# TREV AI Registration & Student Portal Setup

The website pages and backend code are complete, but **registration will not work until the Google Apps Script Web App is deployed and its URL is added to `js/config.js`.**

## What the system does

1. A student chooses Starter, Professional, VIP Seat, or VIP Team on `pricing.html`.
2. The button opens `register.html` with the correct package selected.
3. The student transfers to:
   - **Bank:** OPAY
   - **Account name:** DANIEL GBENGA OLUTIMEHIN
   - **Account number:** 6109478874
4. The student submits their details and payment reference.
5. A new `PENDING` row appears in your Google Sheet, and both you and the student receive an email.
6. You check OPAY and confirm that the transfer is genuine.
7. From the Google Sheet menu, you approve the selected student.
8. The system creates a unique personal code, sends it by email, and puts a ready-to-send WhatsApp link in the student's row. A VIP Team approval creates five unique seat codes.
9. The student enters the code on `portal.html`, downloads package materials directly, and uploads assignments without using WhatsApp.
10. Submissions are stored privately in your Google Drive, logged in the Sheet, and emailed to you for review.

## Part 1 — Install the backend in Google Sheets

You can use a new Google Sheet or the existing Sheet connected to your waitlist.

1. Open the Google Sheet.
2. Choose **Extensions → Apps Script**.
3. Delete the starter content in `Code.gs`.
4. Open `apps-script/trev-registration-backend.gs` from this project and copy all of it into `Code.gs`.
5. Save the project. Name it **TREV Registration Backend**.
6. At the top of the Apps Script editor, select the function `setupTrevSystem`.
7. Click **Run**.
8. Approve Google's authorization prompts. The script needs permission to manage the Sheet, create private assignment folders in Google Drive, and send notification emails from your Google account.
9. Return to the Sheet and refresh it.

You should now have:

- A **Registrations** tab
- A **Resources** tab
- An **Assignments** tab, including the new **Guidelines** and **Grading Rubric** columns
- An **Assignment Submissions** tab
- A **Timetable** tab
- An **Onboarding Checklist** tab
- A **Community Guidelines** tab
- A **Portal Settings** tab
- A **Certificates** registry tab
- A private Google Drive folder named **TREV AI Assignment Uploads**
- A top menu named **TREV Registration**

## Part 2 — Deploy as a Web App

1. In Apps Script, click **Deploy → New deployment**.
2. Click the gear icon and select **Web app**.
3. Description: `TREV Registration API`.
4. **Execute as:** Me.
5. **Who has access:** Anyone.
6. Click **Deploy** and authorize if requested.
7. Copy the **Web app URL**. It must end in `/exec`, not `/dev`.

If you are updating an existing deployment, run `setupTrevSystem` again first, then choose **Deploy → Manage deployments → Edit → New version → Deploy** so the assignment features become live.

Example format:

```text
https://script.google.com/macros/s/AKfycb.../exec
```

## Part 3 — Connect the website

The supplied Apps Script `/exec` URL is already entered in `js/config.js`. If you create a different deployment later, replace only the URL while keeping the quotation marks and comma.

If your final GitHub Pages address changes, update `PORTAL_URL` near the top of `apps-script/trev-registration-backend.gs`, save, and deploy a **new version** of the Web App.

### Add the three WhatsApp invitation links

Open the **Portal Settings** sheet and paste the real group links into:

- `STARTER_GROUP_LINK`
- `PROFESSIONAL_GROUP_LINK`
- `VIP_GROUP_LINK`

The group names and support hours are already configured. Until these three links are added, the portal displays **Invite link pending** rather than exposing a broken button.

The timetable is preloaded for 4–24 August 2026. When the final class time is chosen, update `CLASS_TIME` in **Portal Settings** and the Class Time column in **Timetable**.

## Part 4 — Upload the website

Upload the contents of this project to the root of the GitHub repository. Keep these paths intact:

```text
css/style.css
js/script.js
js/config.js
js/registration.js
js/portal.js
assets/...
register.html
portal.html
```

Do not upload only the HTML files. After GitHub Pages redeploys, hard-refresh with **Ctrl+Shift+R**.

## Your daily approval workflow

1. A registration arrives as `PENDING` in the **Registrations** sheet.
2. Match the **Payment Reference**, name, amount, and package against the OPAY transaction.
3. Click any cell in that student's row.
4. Choose **TREV Registration → Approve selected registration**.
5. Confirm the prompt.
6. The student's unique code is created and emailed automatically. For a VIP Team row, five different seat codes are created and sent to the team coordinator.
7. In column **P — WhatsApp Approval Link**, click the short label **Send code on WhatsApp**. The long pre-filled `wa.me` address is hidden behind this label.
8. WhatsApp opens with the student's package, bold access code, and portal address already filled in. Review it and press **Send**.

A normal webpage cannot silently send WhatsApp messages. The final send must be pressed manually unless you later set up the paid Meta WhatsApp Business API.

For a row that already contains a long raw WhatsApp URL, select that row and choose **TREV Registration → Rebuild selected WhatsApp link**. It changes the cell to the short clickable label without resending the approval email.

### If a code is shared or should stop working

1. Select the student's row.
2. Choose **TREV Registration → Suspend selected access**.
3. The code stops working immediately.

Running **Approve selected registration** again restores access and keeps the existing code.

## Adding course materials

Use the **Resources** sheet. Do not put protected resource links directly inside `portal.html`.

Columns:

| Column | Purpose |
|---|---|
| Access Level | `ALL`, `STARTER`, `PROFESSIONAL`, or `VIP` |
| Category | Example: `Session Recordings`, `Manuals`, `Templates` |
| Title | Resource name shown to the student |
| Description | Short explanation |
| URL | Google Drive, YouTube, Zoom, Notion, or another `https://` link |
| Button Label | Example: `Watch Lesson` or `Download Manual` |
| Visible | Tick to show; untick to hide without deleting |
| Sort Order | Lower numbers appear first |

Access is cumulative:

- **Starter:** `ALL` + `STARTER`
- **Professional:** `ALL` + `STARTER` + `PROFESSIONAL`
- **VIP:** all four access levels

The four starter rows are placeholders. Replace their descriptions and URLs as your materials become ready. Students do not need a new access code when you add or update a resource.

### Direct downloads

For downloadable PDFs, manuals, templates, and workbooks:

1. Upload the finished file to Google Drive.
2. Set the Drive file to **Anyone with the link → Viewer**.
3. Copy its normal Drive sharing link into the Resources sheet.
4. Use a button label beginning with **Download**, such as `Download Manual`.
5. Tick **Visible**.

The backend converts normal Google Drive file links into direct-download links, so the student does not have to visit the Drive preview page. Use uploaded PDF/Office files rather than native Google Docs when you want a predictable direct download. Very large Drive files may still show Google's virus-scan confirmation page.

## Managing assignments

Use the **Assignments** sheet to publish package-specific work.

| Column | Purpose |
|---|---|
| Assignment ID | A permanent unique ID such as `STARTER-CAPSTONE` |
| Access Level | `ALL`, `STARTER`, `PROFESSIONAL`, or `VIP` |
| Title | Assignment title displayed in the portal |
| Instructions | The task students should complete |
| Due Date | Optional deadline |
| Accepted Files | Example: `.pdf,.doc,.docx,.ppt,.pptx,.zip` |
| Max Size MB | Use 1–10; the system never permits more than 10MB |
| Visible | Tick to publish the assignment |
| Sort Order | Lower numbers display first |

Assignment access is package-specific rather than cumulative: `ALL` assignments appear to everyone, while a package assignment appears only to that package level.

When a student submits:

1. Their access code is verified again on the server.
2. The file is checked for type and size.
3. It is saved privately under `TREV AI Assignment Uploads / Package / Registration ID / Assignment ID` in your Google Drive.
4. A row is added to **Assignment Submissions**.
5. An email with the private Drive file link is sent to `trevaisupport01@gmail.com`.
6. The student sees a submission receipt and history inside the portal.

You can update the submission **Status** to `UNDER REVIEW`, `REVISION REQUESTED`, or `APPROVED`. Enter written comments in the **Feedback** column; the feedback appears in the student's portal the next time it refreshes.

## Certificate verification registry

The public verification page is `verify.html`. A certificate appears as valid only after you add a row to the **Certificates** sheet.

Required values include:

- Certificate ID, such as `TREV-PRO-2026-0001`
- Student name
- Registration ID
- Package key and package label
- Attendance percentage (minimum 75%)
- Capstone status (`APPROVED`)
- Issue date
- Status (`ISSUED`; use `REVOKED` to invalidate it)
- Optional PDF URL

A verification link follows this format:

`https://trevaisupport01.github.io/Trev/verify.html?id=TREV-PRO-2026-0001`

## Required end-to-end test

Before announcing registration:

1. Submit a test registration from `register.html`.
2. Confirm it appears in the Sheet.
3. Confirm the pending email arrives.
4. Approve the test row.
5. Confirm the approval email contains a code.
6. Open the WhatsApp link in column P.
7. Enter the code on `portal.html`.
8. Confirm the correct package name, resources, and assignments appear.
9. Upload a small test PDF from the portal.
10. Confirm the file appears in the private Drive folder and in **Assignment Submissions**.
11. Add test feedback in the Sheet and refresh the portal to confirm it appears.
12. Test a material's direct-download button.
13. Suspend the test registration and confirm the same code is rejected.

## Security notes

- Codes are random and unique to each student; they are not stored in the public website files.
- Portal resource links are returned by Apps Script only after code verification.
- This is practical access control for a small course, not full digital-rights management. A student who can view or download a resource can still copy it or share its final URL.
- For sensitive files, use Google Drive permissions carefully. Do not store confidential student data inside website files or public GitHub commits.
- Never approve a registration until the payment is visible in your own OPAY transaction history.
