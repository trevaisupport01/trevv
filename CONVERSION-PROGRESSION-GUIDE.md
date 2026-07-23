# TREV AI Conversion & Portal Progression Release

## Included homepage improvements

- Live student-portal product mockup in the hero
- Transformation-focused hero copy
- Larger primary CTA
- Accurate facts: 30+ graduates, 7 sessions, 10+ tools, 3 package paths
- Graduate social proof near the top
- Real seven-session learning roadmap
- TREV versus self-directed online videos comparison
- Strategic CTA bands
- Premium spacing and typography refinements
- Consistent icon sizing/stroke treatment
- Gold page-scroll progress indicator
- No founder-story section was added

## Included portal improvements

- Attendance Sheet
- Weighted progress calculation
- Personalized progress overview
- Continue Learning logic
- Session/assignment metrics
- Next live-class card
- Certificate status
- Completed/current/upcoming timetable states
- Instructor panel with package support hours

## Progress formula

- Onboarding checklist: 10%
- Attendance: 30%
- Approved required assignments: 35%
- Approved capstone: 25%

Onboarding progress is stored on the student’s device. Attendance, assignments, capstone, and certificate information come from Google Sheets.

## Attendance Sheet

Run `setupTrevSystem` to create the Attendance tab. Add one row per student/session:

- Date
- Session (`Session 1`, `Session 2`, etc.)
- Access Level
- Registration ID
- Student Name
- Present checkbox
- Minutes Attended
- Notes

Starter requires 4 core sessions. Professional and VIP require 7. Certificate eligibility requires at least 75% attendance and an approved capstone.

## Continue Learning priority

1. Incomplete onboarding
2. Revision requested
3. Required assignments pending
4. Next live class
5. Course resources

## Deployment

1. Replace Apps Script `Code.gs` with the included backend.
2. Run `setupTrevSystem`.
3. Redeploy the Apps Script Web App as a new version.
4. Upload the complete website to the GitHub repository root.
5. Hard-refresh the website.
6. Test homepage desktop/mobile layouts.
7. Add a test Attendance row and verify portal progress.
8. Approve a capstone and verify certificate eligibility.
