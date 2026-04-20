# Donation UX Strategy

Status: Planned, not yet implemented (S-01 through S-03).
Last updated: 2026-04-18

## Core principle

Bibliogon is a self-publishing tool for authors. Donation prompts
must not disturb the user, manipulate them, or stand between them
and their work. Three visibility levels, all with a hard opt-out
path and no dark patterns.

## Level 1: Permanent link in Settings

New section in Settings: **"Support Bibliogon"**.

Contents:

- Two or three sentences of project context (independent development,
  no tracking, no cloud backend, no ads)
- Link to an external donation page (see channel strategy below)
- No suggested amounts, no goals

Always available, never intrusive. Users find it when they look
for it.

## Level 2: One-time onboarding hint

After the first successful book creation or the first successful
export operation, an info card is shown:

```
Bibliogon is developed as an open-source project without
tracking, without a cloud backend, without ads. If the app
helps you and you want to support the project:

[Support project]   [Understood]

You can find this hint any time in Settings.
```

On "Understood": set flag
`bibliogon-donation-onboarding-seen = true` in localStorage.
Never shown again unless explicitly opened via Settings.

On "Support project": open external link in a new tab AND set the
flag. The user comes back after a donation and is not asked again.

## Level 3: Periodic reminder (90-day cycle)

After 90 days of active use (measured from the first book
creation), a subtle banner appears at the top of the Dashboard:

```
+--------------------------------------------------------------+
| You have been using Bibliogon for 3 months. If you enjoy     |
| the project: [Support]           [Not now]   [x]             |
+--------------------------------------------------------------+
```

Rules:

- Only on the Dashboard, not in other views
- Never during an active workflow (book creation, export, AI
  session)
- "Not now" or "Close" reset the counter by another 90 days
- "Support" opens the donation link and resets the counter by
  180 days (longer, because the user is already engaged)
- No countdown, no urgency, no color escalation

## Anti-patterns (explicitly NOT doing)

- No modal popup on app start
- No nag screens with counters ("You have opened Bibliogon 47
  times...")
- No donation prompts during active workflows (editing, export,
  AI chat)
- No animated banners or attention-grabbing colors
- No countdown timers or "limited time" framing
- No guilt-tripping ("Without your donation we must...")
- No feature gates ("Donate to unlock this feature")
- No promotion in the editor, document viewer, or any view that
  displays user content

## Technical architecture

All donation state flags are local (localStorage or IndexedDB):

```ts
interface DonationState {
  onboardingSeen: boolean;        // Level 2, one-time
  lastReminderDate: string | null; // Level 3, ISO date
  lastReminderAction: 'donated' | 'dismissed' | null;
}
```

No backend calls, no tracking, no analytics events on click. The
donation link itself points to an external page (GitHub Sponsors,
Liberapay, own landing page).

## Donation channels

Recommendation: own landing page as a central entry point, so
channels can be changed without shipping an app update.

Candidates for the landing page:

- GitHub Sponsors (developer-native platform, recurring donations
  supported)
- Liberapay (privacy-friendly, FOSS-community, recurring)
- Ko-fi (low barrier, one-time donations)
- PayPal (widest reach, one-time plus recurring)
- Direct bank transfer (often preferred by German users)

Offer multiple channels in parallel. Users choose. No preference
expressed in the app text.

## Implementation order

Three independent tasks, each small enough for a single session:

**S-01**: Settings section "Support Bibliogon" (Level 1)

- New section in SettingsScreen
- Short text + external link
- No state management needed

**S-02**: Onboarding info card (Level 2)

- Card appears after first successful book creation or export
- localStorage flag for "seen"
- Two buttons: "Support project" (external) + "Understood"

**S-03**: 90-day reminder banner (Level 3)

- Banner on Dashboard
- Check on mount of Dashboard view
- Three dismiss paths (Support, Not now, Close)

Order: S-01 first (smallest, no state logic), then S-02, then S-03.

## Timing within the release roadmap

Donation tasks come after the current Phase 2 themes stabilize and
before the project is actively promoted to a wider audience.

The rationale: asking for donations only makes sense when the tool
is stable enough that users get lasting value from it. Promoting
donations before stabilization risks asking people to pay for a
work in progress, which damages trust.

## Success metrics

No in-app analytics. Success is measured externally:

- Click-through from app to landing page (if the hosting platform
  logs visits)
- Donation volume across the channels
- Issue tracker feedback on whether the prompts feel intrusive

If users complain about reminders: soften Level 3 (longer cycle,
less visible banner).

## Pending decisions

Before implementing the S-series:

1. **Landing page URL**: own domain (bibliogon.app/support) or
   GitHub README section or both?
2. **Initial set of channels**: which two or three start as the
   first set? Proposal: GitHub Sponsors + Liberapay + bank transfer.
3. **Landing page language**: German only, English only, or both?
   (German has a specific user base for Bibliogon; English widens
   reach.)
4. **Date format for reminder logic**: ISO string or Unix
   timestamp? ISO is more readable; timestamp is simpler for
   arithmetic. Recommendation: ISO for storage, parse to Date on
   comparison.

## Related

- Strategic context (why donations instead of freemium):
  `docs/explorations/monetization.md`
- Self-publishing context:
  `docs/explorations/desktop-packaging.md`
