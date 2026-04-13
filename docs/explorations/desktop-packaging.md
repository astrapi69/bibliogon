# Desktop Packaging Exploration

Status: Exploration, not decided.  
Last updated: 2026-04-12

## Context

Bibliogon currently ships as:
- Docker container (primary distribution)
- Source (clone + manual setup)

Both require technical knowledge. The Medium article acknowledged 
this directly: "Docker-Installation und Plugin-Verwaltung erfordern 
Grundverstaendnis". This is a real barrier for the self-publishing 
target audience, who are writers, not developers.

A desktop app distribution would lower the barrier significantly. 
This document explores the options without committing to any.

---

## Options evaluated

### 1. Electron

Chromium + Node.js bundled as a desktop app. Mature, widely used 
(VS Code, Slack, Discord, Obsidian).

**Pros:**
- Mature ecosystem, lots of documentation and examples
- Auto-update mechanisms built in
- Full OS integration (menus, dock, file dialogs, notifications)
- Well-understood distribution model

**Cons:**
- Large binary size: 100-150 MB base + 50 MB Python runtime + 
  Pandoc binary. Per platform.
- Python bundling is non-trivial. Need pyinstaller for backend 
  binary, handle native deps (SQLite, Pillow), manage Pandoc as 
  external binary.
- Three platform builds per release (Mac, Windows, Linux)
- Apple Notarization requires paid Developer account
- Security history: frequent Chromium CVEs require regular updates
- Fast release cycle means breaking changes to track

**Realistic effort:** 2-3 weeks for a stable first version.

### 2. Tauri

Rust-based alternative to Electron. Uses native OS WebView instead 
of bundling Chromium.

**Pros:**
- Tiny binary: 5-15 MB vs 100+ MB
- Modern architecture, active development
- Better security story (smaller attack surface)
- Sidecar pattern for bundling non-Rust binaries (our Python backend)
- Apple Notarization still applies but is standard

**Cons:**
- Less mature than Electron (but production-ready)
- Rust knowledge needed for Tauri-side code, though minimal
- Different WebViews on different OSes can show subtle rendering 
  differences
- Smaller community than Electron

**Realistic effort:** 1-2 weeks for a prototype, 2-3 weeks for 
production-ready.

### 3. Neutralino.js

Lighter than Tauri. Uses system WebView, bundles almost nothing.

**Pros:**
- Smallest binary size
- Simple architecture
- Pure JavaScript/TypeScript on the app side

**Cons:**
- Less mature than both Electron and Tauri
- Smaller community
- Fewer features out of the box (no built-in auto-update)

**Realistic effort:** Similar to Tauri, but with more DIY work 
for features that Electron/Tauri provide.

### 4. PyWebView

Python-native solution. Wraps a system WebView in a Python process.

**Pros:**
- Python-native, integrates directly with existing FastAPI backend
- Smallest architecture change from current codebase
- Simple to prototype

**Cons:**
- Less polished than Electron/Tauri for end-user distribution
- Fewer advanced features (auto-update needs custom work)
- Bundling Python+FastAPI for distribution has same challenges 
  as Electron

**Realistic effort:** 1 week for a basic version.

### 5. Better Docker installer

Not a desktop app, but improves the current distribution path.

**Pros:**
- No architecture change required
- Keeps deployment consistent between dev and production
- Minimal maintenance burden

**Cons:**
- Still requires Docker Desktop installation
- Still feels like "a server running in the background" to users
- Doesn't provide true OS integration

**Realistic effort:** 2-3 days for a polished installer script.

### 6. Simple Launcher (pragmatic intermediate step)

Small Python script or binary that:
1. Starts the Docker container if not running
2. Opens browser on localhost:8000
3. Stops the container when the launcher closes

Packaged as a platform-specific binary (pyinstaller for Windows/Mac/Linux).

**Pros:**
- Quick to build (weekend project)
- User sees "desktop app behavior" - click icon, use app, close
- Docker runs invisibly in the background
- Keeps Bibliogon's deployment model intact
- No Electron/Tauri complexity

**Cons:**
- Still requires Docker to be installed
- Not a true native app
- No OS-level integration beyond the icon

**Realistic effort:** 2-3 days.

---

## Comparison matrix

| Criterion | Electron | Tauri | PyWebView | Launcher |
|-----------|----------|-------|-----------|----------|
| Binary size | 150+ MB | 15 MB | 50 MB | 20 MB |
| Effort to first release | 2-3 weeks | 2-3 weeks | 1 week | 2-3 days |
| Auto-update | Built-in | Built-in | DIY | DIY |
| OS integration | Excellent | Excellent | Basic | Minimal |
| Python backend integration | Complex | Sidecar | Native | Docker subprocess |
| Security story | Medium | Good | Good | Inherits Docker |
| Requires Docker on user machine | No | No | No | Yes |
| Three-platform build complexity | High | Medium | Medium | Low |

---

## Recommendation path

### Immediate (next sessions)
**Do nothing on desktop packaging.** Current focus is coverage and 
stability. Desktop packaging is a distraction right now.

### Short-term (post v0.14.0 or v0.15.0)
**Build the Simple Launcher.** Two-to-three day investment that 
immediately solves 70% of the UX problem for non-technical users. 
Docker still required but runs invisibly. Users get "click icon, 
use app" experience.

### Medium-term (post v0.20.0 or when a real user base demands it)
**Tauri prototype.** If the launcher approach is insufficient and 
users are asking for a "real" desktop app, evaluate Tauri as the 
path. Weekend prototype first. If the prototype works, plan a 
multi-week focused effort.

### Long-term (v1.0.0 target?)
**Production Tauri distribution.** If Tauri prototype validates 
the approach, invest in signed builds for all three platforms, 
auto-update infrastructure, and distribution channels (direct 
download, possibly package managers like winget/homebrew).

### Not recommended at any point
**Electron.** The size penalty alone is disqualifying for a 
writing tool that should feel lightweight. Tauri covers the same 
use cases with 10% of the binary size and better security.

---

## Open questions

Before committing to any desktop path, answer these:

1. **Is there actual user demand?** Not assumed, measured. Does 
   feedback from the Medium article mention Docker as a barrier? 
   Do beta testers request a desktop app specifically?

2. **What's the distribution channel?** Direct download from a 
   website? Package managers? App stores (Mac App Store has strict 
   sandboxing that might conflict with Pandoc usage)?

3. **Who handles Apple Notarization and Windows code signing?** 
   Both cost money and require ongoing maintenance. Who has the 
   Developer accounts?

4. **Update frequency?** Desktop apps need auto-updates or users 
   get stuck on old versions. What's the acceptable frequency 
   (monthly, per release, per patch)?

5. **Does Bibliogon stay offline-first with a desktop app?** Some 
   auto-update mechanisms require server communication that 
   contradicts the offline-first principle. Need a design that 
   respects this.

---

## Triggers for reconsidering

Re-evaluate this document when:

- Bibliogon has 100+ active users and 10%+ of feedback mentions 
  installation difficulty
- A specific publishing event (major release, press coverage) 
  would benefit from desktop-app-as-primary-distribution
- Tauri ecosystem reaches a maturity milestone (e.g., Tauri 2.0 
  stable with sidecar Python well-documented)
- Contributor offers to handle the desktop build process

Without one of these triggers, staying on Docker-plus-Launcher is 
the right decision.

---

## Related

- Medium article mentioning installation barriers
- Offline-first architectural principle in CONCEPT.md
- Current distribution approach documented in README.md