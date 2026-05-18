# Bibliogon Mobile Strategy Exploration

**Status:** Open Brainstorming, Decisions Pending
**Last Updated:** 2026-05-19
**Trigger:** User feedback from family member ("is there an app for this on the phone?")

## Context

Bibliogon is currently a Desktop-only Self-Publishing application. A real-world user signal indicates Mobile-First expectations in the target audience (Gen-Z and mainstream users). Desktop authoring remains the primary use-case, but the absence of any mobile presence reduces user reach and differentiation.

This document analyzes mobile options without committing to implementation. Decisions will be made in a future session once the vision is clear.

## User Signal Source

Anecdotal evidence:

The author showed Bibliogon to a Gen-Z family member (representative of the target audience). The immediate reaction was: "Is there an app for this on the phone?" This represents a typical mobile-first expectation. The desktop-only answer was perceived as a limitation.

An important observation: the question was not "can you write books on a phone with this?" but rather "is there an app for this on the phone?" The expectation was about presence (app icon, mobile-installable), not necessarily full authoring functionality.

## Real-World Mobile Use Cases for Picture-Book Authoring

Not every use case suits mobile. A realistic separation between mobile-native use cases and desktop-mandatory use cases is needed.

### Mobile-Native Use Cases (where mobile is better or equivalent)

**1. Reading and Showcase**
- Author shows finished picture-book to friends, family, school children
- Matches the family member episode directly
- Matches real author use-case (showing work wherever you are)
- Mobile screen size is well-suited for picture-book format
- Zero authoring friction issues

**2. Quick-Capture Inspiration**
- Author has an idea in a café, while walking, before sleep
- Mobile camera for visual inspiration
- Voice memo for text ideas
- Processed later on desktop
- Matches industry tool patterns (Notes apps, Evernote, Bear, etc.)

**3. Review and Approval**
- Author reviews own drafts on the go
- Beta-reader or editor gives feedback via mobile
- Co-author workflow asynchronously
- Mobile pace suits review workflow

**4. Project Status Overview**
- Author checks status of book projects
- Number of pages, deadlines, progress
- Project management light on mobile
- Zero authoring, visibility only

**5. Public Showcase and Marketing**
- Bibliogon as marketing tool for author brand
- Reader buys book on KDP and can follow author
- Author profile and bibliography on mobile

### Desktop-Mandatory Use Cases (mobile unsuitable)

- Picture-book layout selection and configuration (touch friction)
- Multi-page image upload workflow
- PDF export and KDP preparation
- Complex text editing with TipTap toolbar
- Bulk operations (rename, reorder, etc.)
- Author-database management
- Comments admin

## Technical Mobile Strategies

### Option A: Native iOS and Android Apps

**Description:** Separate dedicated apps in Swift/Kotlin, React Native, or Flutter.

**Pros:**
- Maximum performance and platform-specific UX
- Full access to mobile hardware (camera, push notifications, etc.)
- Real app-store listing for discoverability
- Native feel matches user expectations

**Cons:**
- Substantial development effort (2 codebases for native, 1 for cross-platform)
- App-store friction (reviews, Apple at 100 USD/year, Google at 25 USD one-time)
- Platform policies and update compliance
- Solo-dev maintenance overhead is substantial
- Sync layer required (cloud backend instead of SQLite-only)

**Implementation Effort:** 3 to 6 months of solo-dev work

**Realistic for Bibliogon:** Low (solo-dev bandwidth constraint)

### Option B: Progressive Web App (PWA)

**Description:** The Bibliogon frontend becomes PWA-capable. Users can "install" Bibliogon via browser and get a home-screen icon. Runs like a native app.

**Pros:**
- Existing React code is reused
- Matches "use what already exists" rule on the cross-platform level
- Zero app-store friction
- Single codebase for web and mobile
- Both iOS and Android support PWAs (significantly improved in 2024+)
- Service-worker for offline capability
- Matches Bibliogon's local-first philosophy

**Cons:**
- iOS PWA limitations (no official push notifications, storage limits)
- PWA discoverability is weaker than app-store listings
- User education required ("how do I install a PWA?")
- Less native-feel than real apps

**Implementation Effort:** 2 to 4 weeks (mobile-responsive plus service-worker plus manifest)

**Realistic for Bibliogon:** High (matches tech stack and solo-dev bandwidth)

### Option C: Mobile-Web-Responsive (no PWA)

**Description:** The Bibliogon frontend becomes mobile-optimized. Users open it in a browser without a home-screen icon.

**Pros:**
- Lowest implementation effort
- Existing frontend simply becomes mobile-friendly
- Zero additional infrastructure

**Cons:**
- No app feel, user expectation not met
- Every access requires browser-open and URL input
- Offline capabilities limited
- Does NOT match the user expectation of "app on the phone"

**Implementation Effort:** 1 to 2 weeks

**Realistic for Bibliogon:** Sensible building block for PWA, insufficient alone

### Option D: Hybrid - Desktop plus Companion App

**Description:** Desktop remains primary authoring tool. A separate mobile app handles only reading, quick-capture, and review. Two codebases with a sync layer.

**Pros:**
- Clear separation between authoring (desktop) and mobile-native use cases
- Native mobile app can be focused and optimal
- Matches industry tool patterns (Photoshop Desktop plus Adobe Capture Mobile)

**Cons:**
- Two codebases to maintain
- Sync-layer complexity
- Author switches between two apps
- Substantial development effort

**Implementation Effort:** 4 to 8 months

**Realistic for Bibliogon:** Medium (substantial but concretely focused)

### Option E: Sync to Existing Mobile Reader Apps

**Description:** Bibliogon exports to standard formats (EPUB for Kindle, Apple Books, Google Play Books). Readers use existing mobile reader apps.

**Pros:**
- Zero Bibliogon mobile effort
- Matches industry standard for e-book distribution
- Users work with apps they already know

**Cons:**
- No Bibliogon-branded experience on mobile
- Author discovery via app store is lost
- Does NOT match user expectation of "Bibliogon app"
- Sustainability (donations) has no mobile touchpoint

**Implementation Effort:** Picture-book EPUB export is non-trivial (current PDF export is the primary path)

**Realistic for Bibliogon:** Complementary to other options, not standalone

## Phased Mobile Roadmap (Sketch)

Not all phases must be executed. A phased approach allows incremental investment and user-feedback-driven escalation.

### Phase 1: Mobile-Responsive Web (Quick Win)

**Scope:**
- Bibliogon frontend becomes mobile-responsive
- PWA manifest plus service-worker
- Home-screen installation works
- Existing features accessible on mobile (read-only reading mode prioritized)

**User Value:**
- Family members can "install" Bibliogon on their phones
- User expectation "app on phone" is met
- Reading and showcase use-case works

**Effort:** 2 to 4 weeks

**Risk:** Low

### Phase 2: Reader Mode Optimization

**Scope:**
- Picture-book reader mode optimized for mobile
- Swipe navigation between pages
- Full-screen mode
- Read-aloud integration (possibly TTS)

**User Value:**
- Mobile-first reading experience for picture books
- Author can show book while friends read on mobile

**Effort:** 1 to 2 weeks on top of Phase 1

**Risk:** Low

### Phase 3: Quick-Capture Companion Features

**Scope:**
- Camera upload directly to Bibliogon mobile
- Voice memo recording for story ideas
- Sketch drawing (possibly)
- Desktop sync (camera-roll sync or direct API upload)

**User Value:**
- Author can capture inspiration on the go
- Matches real author workflow

**Effort:** 2 to 4 weeks

**Risk:** Medium (cross-platform sync architecture)

### Phase 4: Native Apps (likely NEVER)

**Scope:**
- Dedicated native iOS and Android apps
- App-store listing
- Native-feel optimization

**User Value:**
- Maximum mobile experience
- App-store discoverability

**Effort:** 3 to 6 months

**Risk:** High (solo-dev bandwidth issue)

**Likelihood:** Low - PWA approach covers mobile need sufficiently

## Bibliogon Architecture Implications

### Current Desktop Architecture

- SQLite local database (offline-first)
- FastAPI backend (Python, runs locally)
- React/TypeScript frontend (browser-served)
- Plugin system via PluginForge

### Mobile Implications per Option

**Option B (PWA):**
- Backend must become remote-reachable (cloud hosting plus auth layer)
- OR PWA runs as "reader-only mode" with static export of books
- Current local-first architecture partially fits already

**Option D (Companion App):**
- Cloud sync layer required
- Auth system required (Bibliogon currently has no login)
- Sync conflict resolution

**Option E (Sync to Reader Apps):**
- EPUB export pipeline (in addition to PDF export)
- Zero mobile-specific architecture

## Sustainability and Business Model

Bibliogon is donation-based. A mobile strategy needs a sustainability justification.

**Pro Mobile Investment:**
- Extended user base (more potential donors)
- Differentiation from pure desktop self-publishing tools
- Matches industry expectation of "software has mobile presence"
- Family member episode and similar real-world user signals

**Contra Mobile Investment:**
- Solo-dev time investment must justify sustainability
- Bibliogon's core value (authoring) is desktop-first
- Mobile maintenance is an ongoing cost

**Mobile Tipping Point:**
An honest question: at what user-base size does mobile investment become justified? With 10 active users, mobile investment is premature. With 1000+ active users, mobile strategy is overdue. Current Bibliogon user base is unknown.

## Open Questions for Future Decision

**Strategic Vision:**
1. How important is Bibliogon's mobile presence for long-term success?
2. Which mobile use-cases are primary versus nice-to-have?
3. Does mobile strategy match Bibliogon's self-publishing-tool positioning?

**Technical:**
4. PWA versus native - what fits the solo-dev reality?
5. Existing FastAPI backend - make it cloud-capable or stay local-only?
6. Sync strategy for multi-device use-cases?

**Resource:**
7. How much dev time can be invested in mobile without blocking other Bibliogon features?
8. Is monetary investment for app-store fees worthwhile?

**User Research:**
9. Are additional user signals required before deciding?
10. Is a user survey regarding mobile expectations sensible?

## Recommended Next Steps (once decided)

**If Phase 1 (PWA) is chosen:**
- Bibliogon frontend audit on responsive coverage
- PWA manifest creation plus icons
- Service-worker for offline capability
- Mobile-specific UI polish
- Testing on real mobile devices

**If Phase 2 (Reader Mode) is chosen:**
- Picture-book reading component optimized for mobile
- Swipe navigation plus full-screen
- Possibly TTS integration

**If Native (Phase 4) is chosen:**
- Cross-platform framework decision (React Native versus Flutter)
- Cloud backend architecture decision
- App-store account setup
- Substantial project plan (3 to 6 months)

## Related Bibliogon Discipline Patterns

Matches existing Bibliogon patterns:

- **Use What Already Exists Rule:** PWA approach maximizes existing React code reuse
- **Single-Source-of-Truth:** Mobile and desktop share backend and data layer
- **Recurring-Component Unification:** Mobile components as reusable and desktop-compatible
- **Half-Wired Feature Lifecycle Prevention:** Mobile features should be shipped completely, not partially (e.g. reader mode complete or not at all, not half-implemented)

## User Signal Documentation

A lessons-learned observation: real-user reactions are valuable strategic signals. The family member episode is a single instance, but it points to systematic user expectations. Future real-user testing should explicitly inquire about mobile expectations.

Bibliogon currently has one user test (the author plus the family member episode). Formal user research would be a sensible investment before any major mobile investment.
