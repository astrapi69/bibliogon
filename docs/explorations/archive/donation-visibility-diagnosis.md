# Donation Visibility Diagnosis

Datum: 2026-04-30. Status: Diagnosis only, no code changes.

User reports zero donation UI visible in running app despite all
three S-series components (SupportSection, DonationOnboardingDialog,
DonationReminderBanner) shipping with tests.

This document maps the dependency chain that gates each visibility
level and lists every reason the UI is silent on Aster's machine.

---

## Side-finding (not a security incident)

`backend/config/app.yaml` carries a real Anthropic API key in
plain text. The file is in `.gitignore`, so there is no public
exposure via git history or shared commits.

Rotation is only warranted if any of these apply:

- Multi-user dev machine (default file mode `644` lets other local
  users read it)
- Off-box backup tooling that sweeps `backend/` (rsync, Time
  Machine, Borg, cloud sync)
- Screen-sharing or pair-programming streams that have shown the
  file
- Future intent to `git add -f` or check the file into a different
  repo

If none apply, the key is fine where it is. No action required.

---

## 1. The single primary cause

**`backend/config/app.yaml` has NO `donations:` block.**

`grep -A 30 "^donations:" backend/config/app.yaml` returns empty.

Only `backend/config/app.yaml.example` carries the block (lines
visible in the audit). The active config the running backend loads
omits it entirely.

### Consequence chain

`SupportSection.getDonationsConfig()` ([SupportSection.tsx:31-43](../../frontend/src/components/SupportSection.tsx#L31)):

```ts
export function getDonationsConfig(
  appConfig: Record<string, unknown>,
): DonationsConfig | null {
  const raw = appConfig.donations as Record<string, unknown> | undefined;
  if (!raw || raw.enabled !== true) return null;
  ...
}
```

`raw` is `undefined` → returns `null` → every consumer hides.

| Consumer | Gate | Behaviour with null |
|----------|------|---------------------|
| Settings tab "Unterstützen" | [Settings.tsx:107](../../frontend/src/pages/Settings.tsx#L107) `{getDonationsConfig(appConfig) ? <Tabs.Trigger> : null}` | Tab does not render |
| SupportSection content | [Settings.tsx:238](../../frontend/src/pages/Settings.tsx#L238) `{getDonationsConfig(appConfig) ? <SupportSection .../> : null}` | Section hidden |
| DonationOnboardingDialog (S-02) | [Dashboard.tsx:97](../../frontend/src/pages/Dashboard.tsx#L97) `if (!donationsConfig) return;` | Never opens |
| DonationReminderBanner (S-03) | [Dashboard.tsx:270](../../frontend/src/pages/Dashboard.tsx#L270) `donationsConfig && reminderVisible && !showTrash` | Never renders |

All three visibility levels short-circuit on the same null check.
Fix the YAML, all three become candidates.

---

## 2. Mount points (verified present)

### SupportSection (S-01)

[Settings.tsx:107-109](../../frontend/src/pages/Settings.tsx#L107):

```tsx
{getDonationsConfig(appConfig) ? (
  <Tabs.Trigger value="support" className="radix-tab-trigger" data-testid="settings-tab-support">{t("ui.donations.tab", "Unterstützen")}</Tabs.Trigger>
) : null}
```

[Settings.tsx:238-240](../../frontend/src/pages/Settings.tsx#L238):

```tsx
{getDonationsConfig(appConfig) ? (
  <Tabs.Content value="support">
    <SupportSection config={getDonationsConfig(appConfig)!} />
  </Tabs.Content>
) : null}
```

Wired correctly. Hidden by gate #1.

### DonationOnboardingDialog (S-02)

[Dashboard.tsx:30](../../frontend/src/pages/Dashboard.tsx#L30):
```ts
import DonationOnboardingDialog, {shouldShowDonationOnboarding} from "../components/DonationOnboardingDialog";
```

[Dashboard.tsx:48](../../frontend/src/pages/Dashboard.tsx#L48):
```ts
const [showDonationOnboarding, setShowDonationOnboarding] = useState(false);
```

Mount [Dashboard.tsx:517-518](../../frontend/src/pages/Dashboard.tsx#L517):
```tsx
<DonationOnboardingDialog
  open={showDonationOnboarding}
  onClose={() => setShowDonationOnboarding(false)}
  ...
/>
```

Trigger [Dashboard.tsx:95-100, 102-108](../../frontend/src/pages/Dashboard.tsx#L95):
```ts
const maybeShowDonationOnboarding = (wasFirstBook: boolean) => {
  if (!wasFirstBook) return;
  if (!donationsConfig) return;
  if (!shouldShowDonationOnboarding()) return;
  setShowDonationOnboarding(true);
};
const handleCreate = async (data: BookCreate) => {
  const wasFirstBook = books.length === 0;
  const book = await api.books.create(data);
  setBooks((prev) => [book, ...prev]);
  setShowModal(false);
  maybeShowDonationOnboarding(wasFirstBook);
};
```

Wired correctly. **Three gates** to fire:
1. `wasFirstBook=true` (i.e. user had zero books before this create)
2. `donationsConfig` non-null (blocked by primary cause #1)
3. `shouldShowDonationOnboarding()` returns true (i.e. localStorage flag NOT set)

On a dev DB with existing books, gate #1 already blocks. To trigger:
delete every book + clear `bibliogon-donation-onboarding-seen` from
localStorage + create fresh book.

### DonationReminderBanner (S-03)

[Dashboard.tsx:31](../../frontend/src/pages/Dashboard.tsx#L31):
```ts
import DonationReminderBanner, {shouldShowReminder} from "../components/DonationReminderBanner";
```

[Dashboard.tsx:49](../../frontend/src/pages/Dashboard.tsx#L49):
```ts
const [reminderVisible, setReminderVisible] = useState(false);
```

Mount [Dashboard.tsx:270-272](../../frontend/src/pages/Dashboard.tsx#L270):
```tsx
{donationsConfig && reminderVisible && !showTrash ? (
  <DonationReminderBanner ... />
) : null}
```

Trigger ([DonationReminderBanner.tsx:65-81](../../frontend/src/components/DonationReminderBanner.tsx#L65)):

```ts
export function shouldShowReminder(
  donations: DonationsConfig | null,
  now: Date = new Date(),
): boolean {
  if (!donations) return false;
  try {
    if (localStorage.getItem(DONATION_ONBOARDING_SEEN_KEY) !== "true") return false;
  } catch {
    return false;
  }
  const firstUse = readDate(FIRST_USE_DATE_KEY);
  if (!firstUse) return false;
  if (daysBetween(firstUse, now) < DAYS_90) return false;
  const nextAllowed = readDate(REMINDER_NEXT_ALLOWED_KEY);
  if (nextAllowed && nextAllowed.getTime() > now.getTime()) return false;
  return true;
}
```

Wired correctly. **Five gates** to fire:
1. `donations` non-null (blocked by primary cause #1)
2. `localStorage[bibliogon-donation-onboarding-seen] === "true"` (blocked: S-02 must have fired AND been dismissed first)
3. `localStorage[bibliogon-first-use-date]` set (auto-set on App mount via `ensureFirstUseDate()` in [App.tsx:34](../../frontend/src/App.tsx#L34))
4. `daysBetween(firstUse, now) >= 90` (a fresh dev install can NEVER pass this gate before 90 calendar days have elapsed)
5. `nextAllowed` missing or in past (default: missing, so passes)

---

## 3. localStorage state inventory

Three keys involved:

| Key | Set when | Cleared when |
|-----|----------|--------------|
| `bibliogon-donation-onboarding-seen` | S-02 dismissed any way (Support / Verstanden / X / Esc / overlay click) | Manually via DevTools |
| `bibliogon-first-use-date` | App mount via `ensureFirstUseDate()` (idempotent, only sets if absent) | Manually via DevTools |
| `bibliogon-donation-reminder-next-allowed` | Reminder dismissed (Support: +180d, Not now / X: +90d) | Manually |

To inspect on Aster's browser: DevTools → Application → Local
Storage → `http://localhost:5173`. Look for any `bibliogon-donation-*`
or `bibliogon-first-use-date` key. If `onboarding-seen=true` survives
from earlier testing, S-02 will not re-fire even after fixing the
YAML; need to delete the key.

---

## 4. README check

`grep -i "donat\|sponsor\|funding\|support" README.md` returns one
line:

```
Beyond books, Bibliogon supports article authoring with multi-platform publication tracking.
```

Single hit on the verb "supports", unrelated to donation. **No
README link to DONATE.md, no Sponsors badge, no funding mention.**
This is a separate visibility-zero issue at the project level (not
in-app).

---

## 5. Concrete reasons user sees nothing — ranked

1. `backend/config/app.yaml` lacks `donations:` block (single primary cause; blocks all 3 levels).
2. README has no donation/support link (no surface outside the app).
3. S-02 onboarding only fires when book count goes from 0 → 1 (so a dev DB with any existing books bypasses S-02 even after fix #1).
4. S-03 reminder requires `firstUseDate >= 90 days ago` AND S-02 already acked (impossible on a fresh dev install).
5. If localStorage from an earlier test session has `bibliogon-donation-onboarding-seen=true`, S-02 is permanently skipped on that browser until the key is deleted.

---

## 6. Steps to make UI visible (no commits, no code changes)

1. Copy the `donations:` block from `backend/config/app.yaml.example` into `backend/config/app.yaml` (insert at top level, alphabetic position is fine).
2. Restart backend (`make dev-down && make dev`).
3. Hard-reload frontend.
4. **Settings tab "Unterstützen" appears** — verify SupportSection renders the channel list (Liberapay, GitHub Sponsors, Ko-fi, PayPal).
5. **For S-02:** browser DevTools → Local Storage → delete `bibliogon-donation-onboarding-seen` if present. Trash every existing book (or use a fresh DB). Create a new book → onboarding dialog fires once.
6. **For S-03:** in DevTools, set `bibliogon-first-use-date` to a date 91+ days ago (e.g. `2026-01-01T00:00:00.000Z`). Set `bibliogon-donation-onboarding-seen` to `"true"`. Reload Dashboard → banner appears.

Step 5 + 6 are dev-only verification recipes. Real users hit S-02 organically on first book creation; S-03 hits organically after 90 days of use post-S-02.

---

## 7. Out of scope for this diagnosis

- Why `app.yaml` was created without the donations block (likely seed-time artifact; user pasted minimal config).
- Whether onboarding should also fire on first article creation, not only first book (current code: book-only trigger).
- Whether a "fresh-install banner" should fire ahead of the 90-day reminder for users who have not seen S-02 (current code: silent until both gates pass).
- Phylax-domain copy that survived the rebrand commit (43895c7 already cleaned DONATE.md/DONATE-de.md).

---

## 8. STOP

Diagnosis done. Wait for instruction before any code change or
config edit. The single recommended action — adding the `donations:`
block to `app.yaml` — is a config edit on Aster's local machine,
not a commit (since `app.yaml` is gitignored and contains the
Anthropic key as well).
