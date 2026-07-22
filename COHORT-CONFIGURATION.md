# TREV AI Cohort Configuration — August 2026

## Confirmed schedule

- Cohort begins: **4 August 2026**
- Rotation: **Starter → Professional → VIP**
- Class duration: **90 minutes**
- Timezone: **WAT**
- Class time: **To be announced after onboarding**
- Core teaching timetable ends: **24 August 2026**
- Capstone deadline: **29 August 2026**
- Certificate release target: **31 August 2026**
- Class links: shared in the relevant WhatsApp group **30–60 minutes before class**

## Communities

| Package | Group | Support hours |
|---|---|---|
| Starter | TrevAI Starters | Monday–Friday, 11:00 AM–5:00 PM WAT |
| Professional | TrevAI Professionals | Monday–Friday, 10:00 AM–5:00 PM WAT |
| VIP | TrevAI Executives | Monday–Saturday, 9:00 AM–6:00 PM WAT |

## Still required from Daniel

Paste the three real WhatsApp invitation links into the **Portal Settings** sheet:

- `STARTER_GROUP_LINK`
- `PROFESSIONAL_GROUP_LINK`
- `VIP_GROUP_LINK`

When the final daily class time is chosen, update:

- `CLASS_TIME` in **Portal Settings**
- The **Class Time** column in **Timetable**

## Payment process

- Method: manual OPAY transfer
- Normal verification: 5 minutes to 1 hour
- Wrong amount: refunded after verification
- Different transfer/registration name: student contacts support to verify identity and payment
- Payment support: official WhatsApp link

## Certificate eligibility

- All packages receive a Certificate of Completion
- Minimum attendance: 75%
- Capstone must be approved
- IDs:
  - `TREV-STA-2026-0001`
  - `TREV-PRO-2026-0001`
  - `TREV-VIP-2026-0001`
- Verification page: `verify.html`

## Deployment order

1. Replace Apps Script `Code.gs` with the updated backend.
2. Run `setupTrevSystem` to migrate Assignments and create the new tabs.
3. Add the WhatsApp invitation links in Portal Settings.
4. Deploy a **new Apps Script version** while retaining the same `/exec` URL.
5. Upload the website contents to the GitHub repository root.
6. Verify the dot animation and complete the end-to-end test.
