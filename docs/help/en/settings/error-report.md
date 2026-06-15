# Error reports

When something goes wrong, Bibliogon can prepare a ready-to-file bug report for you — with enough technical detail to be actionable, and a strict guarantee that nothing private leaves your machine.

## Where to find it

Open **Settings → About** and click **Create error report** (*Fehlerbericht erstellen*). This opens the report dialog without needing a crash first, so you can use it any time to describe a problem.

The same dialog also appears automatically after Bibliogon catches an error, this time pre-filled with the error message and stack trace.

## What the report contains

The dialog shows you exactly what will be included before you do anything with it. You choose, via checkboxes, which parts to attach:

- **Error message and stack trace** — only present when the report follows an actual error (it is then mandatory and the checkbox is locked on).
- **Environment information** — Bibliogon version, browser, and operating system. On by default.
- **Action history** — a short log of your most recent actions (clicks, navigation, dialogs opened, API calls and their status). You can expand it to read every entry before deciding to include it.

## What is recorded — and what is NOT

To make the action history useful, Bibliogon keeps a small rolling log of recent events in memory. The privacy guarantees around it are deliberate and strict:

- **No book content is ever recorded.** Your chapters, articles, and any editor text never enter the log.
- **No keystrokes are recorded.** Keyboard input is never captured.
- **Sensitive fields are redacted.** Anything that looks like a password, token, API key, license, or credential is replaced with `[REDACTED]` before it is even stored.
- **URLs are stripped of query parameters**, and every log entry is truncated to a short length.
- **Nothing is sent anywhere automatically.** The log lives in RAM only and is discarded when you close the tab.

The dialog states it plainly: no book content, no passwords, and no license keys are ever sent.

## What you can do with the report

The dialog gives you three independent ways to use it — none of them sends data on its own:

- **Create issue on GitHub** — opens a pre-filled GitHub issue in a new tab. You review it there and decide whether to submit. (Long reports are trimmed automatically to fit GitHub's URL limit.)
- **Copy preview** — copies the full report text to your clipboard so you can paste it wherever you like.
- **Download as JSON** — saves the report as a `bibliogon-fehlerbericht-…json` file you can attach to an email or keep for your records.

**Show preview** lets you read the complete report body before any of the above.

## Related topics

- [Settings navigation](sidebar.md) — where the About tab sits
- [Troubleshooting](../troubleshooting.md) — common problems and fixes
