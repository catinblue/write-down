# write-down

[![License: TBD](https://img.shields.io/badge/license-TBD-lightgrey)]()
[![Stack: React 19 · Vite 7 · TypeScript 5.7](https://img.shields.io/badge/stack-React%2019%20%C2%B7%20Vite%207%20%C2%B7%20TypeScript%205.7-lightgrey)]()
[![Backend: none](https://img.shields.io/badge/backend-none-lightgrey)]()

A single-page browser writing app where **typing drives the weather and drafts can be released as a ritual** — built for the act of writing, not just the artifact.

## How It Works

```text
   ┌──────────┐    keystrokes    ┌──────────────┐    u_pulse    ┌──────────────────┐
   │ writing  │─────────────────▶│ pulse tracker│──────────────▶│ WebGL2 ambient   │
   │ surface  │                  │ (3s rolling) │               │ rain·snow·star·  │
   └──────────┘                  └──────────────┘               │ hearth           │
        │                                                       └──────────────────┘
        │ text
        ▼
   ┌──────────────┐    debounce 500ms    ┌──────────────┐
   │ textarea +   │─────────────────────▶│ localStorage │
   │ mirror layer │                      │ writedown:*  │
   └──────────────┘                      └──────────────┘
        │
        │  user action
        ├──── Cmd/Ctrl+S ────▶ exportAs()  ──▶ download .md / .txt / .docx
        │
        └──── Release ───▶ briefing ─▶ animation ─▶ text cleared, session reset
```

The writing surface paints transparent text on top of a paragraph-dimming mirror, so only the paragraph the caret sits in stays at full opacity. Keystrokes feed a 3-second rolling pulse that modulates the shader behind the card. Drafts auto-persist; deliberate save and deliberate release are the only two ways out.

## App Overview

| Module | Purpose | Files |
|--------|---------|-------|
| **Atmosphere** | WebGL2 ambient background, 4 modes, keystroke-pulse modulation | `src/canvas/`, `src/shaders/`, `src/modes/MeteorOverlay.tsx` |
| **Writing surface** | textarea, mirror layer, typewriter scroll, paragraph dimming, IME | `src/components/Deck.tsx` |
| **Save** | export to `.md`, `.txt`, `.docx` (custom font baked in) | `src/lib/export.ts` |
| **Release** | 4-mode "letting go" ritual (burn / vapor / melt / ember) | `src/components/Deck.tsx`, `src/index.css` |
| **Zen Timer** | 25-min run / 5-min rest ring around the writing card | `src/timer/ZenTimer.tsx` |
| **Mode picker** | top-edge hover zone + Tab cycling | `src/modes/ModeSwitcher.tsx` |
| **Font controls** | hand · serif · sans typeface, 14–32 px size step | `src/components/FontControls.tsx` |
| **Persistence** | drafts, prefs, milestones, timer state | `src/lib/prefs.ts` |

## Quick Start

**Prerequisites**
- Node.js 20 or newer — check with `node --version`. If you see `command not found`, install from [nodejs.org](https://nodejs.org/).
- A modern browser with WebGL 2 (Chrome, Firefox, Safari 15+, Edge 79+).

### Run from source (recommended)

```bash
git clone https://github.com/catinblue/write-down.git
cd write-down
npm install
npm run dev
```

Vite prints a local URL — open it in your browser. The default is `http://127.0.0.1:5173/`. The page hot-reloads as you edit anything under `src/`.

### Build a static bundle

```bash
npm install
npm run build      # output → dist/
npm run preview    # serves dist/ at http://127.0.0.1:4173/
```

`dist/` can also be uploaded to any static host. No backend, no environment variables, no build-time secrets.

### Why double-clicking `dist/index.html` does not work

The bundle uses absolute paths (`/assets/index-XXXX.js`) which the `file://` protocol cannot resolve — the page renders blank. Use `npm run preview` or any static server (`npx serve dist`).

### If something fails

| Symptom | Cause and fix |
|---------|---------------|
| `'npm' is not recognized` | Node.js is not installed or not on PATH. Install from [nodejs.org](https://nodejs.org) and reopen your terminal. |
| `Error: Cannot find module 'vite'` | `npm install` did not complete. Re-run it from the repository root. |
| Page is blank, no console errors | Browser may not support WebGL 2. Test at <https://get.webgl.org/webgl2/>. |
| `EACCES` / permission errors during install | Antivirus or write-protected folder. Move the repository to your home directory and retry. |
| Port 5173 already in use | Vite picks the next free port — read the URL it prints, do not rely on the default. |

---

## Atmosphere

The WebGL2 background reacts to keystroke rhythm and reflects one of four chosen "weathers." Switch modes via Tab cycling or by hovering the top edge of the viewport.

| Trigger | Result |
|---------|--------|
| Tab / Shift+Tab | Cycle forward / backward through modes |
| Hover top 60 px | Reveal the mode label row |
| Click a mode label | Switch with a 1500 ms cross-fade |

### Modes

| Code | Name | Atmosphere | Briefing phrase |
|------|------|------------|-----------------|
| A1 | Rain | Falling streaks | "under the rain" |
| A2 | Snow | Drifting flakes | "in the snow" |
| A3 | Star | Slow sky, meteor milestones | "beneath the stars" |
| A4 | Hearth | Embers and warm haze | "by the hearth" |

**Capabilities**

- Per-mode shader uniforms (`u_intensity`, `u_blur`) tuned for the feel of each weather
- Keystroke pulse modulates intensity in real time (~3-second rolling window, ~18 keys ≈ full pulse)
- 1500 ms cross-fade between modes — the outgoing canvas fades while the incoming one fades in
- In Star mode, every 100 lifetime characters fires a meteor overlay
- Honors `prefers-reduced-motion` (skips meteor + briefing animations)

**Shader uniforms**

```text
u_intensity   0.0 – 1.0   base density (rain), volume (snow), brightness (hearth)
u_blur        0.0 – 1.0   softness factor
u_pulse       0.0 – 1.0   live keystroke rhythm modulator
```

## Release

A second output path beside Save. Instead of exporting, the draft is animated away — a deliberate "letting go" ritual after the writing is done. Triggered by the Release button (current mode) or by clicking a release chip (pick a mode and fire).

### Modes

| Code | Name | Animation | Duration | Screen-reader verb |
|------|------|-----------|----------|--------------------|
| R1 | Burn | SVG fire-displacement filter | 1650 ms | burned |
| R2 | Vapor | Evaporate upward | 1850 ms | evaporated |
| R3 | Melt | Melt downward | 2250 ms | melted |
| R4 | Ember | Scatter outward | 2450 ms | scattered |

**Phases**

| Phase | Name | Description |
|-------|------|-------------|
| P1 | Briefing | 2-second fade-in/hold/fade-out: "{duration} {atmosphere}. {char count} characters. Letting go." |
| P2 | Animation | Mode-specific keyframes (1650–2450 ms). Textarea is read-only throughout. |
| P3 | Cleanup | Clear text, reset session clock, persist milestone, boost shader pulse |
| P4 | Announce | aria-live region announces "Draft {verb}." |

**Capabilities**

- Briefing reads the session: time elapsed, atmosphere, character count
- Reduced-motion path skips P1 and shortens P2 to an 800 ms fade
- Lifetime character count survives release (so re-typing-after-delete cannot farm meteors)
- Session clock restarts after release; the next briefing reports time from that moment

## The Writing Cycle

```text
     ┌───────────────────────────┐
     │  open                     │
     │  last draft restored      │
     │  fresh 25-min Zen timer   │
     └─────────────┬─────────────┘
                   │
                   ▼
     ┌───────────────────────────┐
     │  pick atmosphere          │◀──── Tab cycle ────┐
     │  rain · snow · star ·     │                    │
     │  hearth                   │                    │
     └─────────────┬─────────────┘                    │
                   │                                  │
                   ▼                                  │
     ┌───────────────────────────┐                    │
     │  write                    │                    │
     │  typewriter scroll        │                    │
     │  paragraph dimming        │                    │
     │  shader pulses with WPM   │                    │
     │  (star mode: meteor every │                    │
     │   100 lifetime chars)     │                    │
     └─────────────┬─────────────┘                    │
                   │                                  │
                   ▼                                  │
     ┌───────────────────────────┐                    │
     │  choose                   │                    │
     │  ┌─ Save ────────┐        │                    │
     │  │ md / txt /    │        │                    │
     │  │ docx download │        │                    │
     │  └───────────────┘        │                    │
     │  ┌─ Release ─────┐        │                    │
     │  │ burn / vapor /│        │                    │
     │  │ melt / ember  │        │                    │
     │  └───────────────┘        │                    │
     └─────────────┬─────────────┘                    │
                   │                                  │
                   ▼                                  │
     ┌───────────────────────────┐                    │
     │  session ends             │─── new session ────┘
     │  text cleared             │
     │  draft buffer reset       │
     │  session clock restarts   │
     │  shader pulse spike fades │
     └───────────────────────────┘
```

The cycle is intentional. Save and Release are not redundant — Save preserves, Release dissolves. A session that ends in Release commits to the act over the artifact.

## Environment Variables

None. write-down is a pure-frontend app with no API calls, no remote services, and no build-time secrets. The repository is safe to clone, fork, or audit without leaking configuration.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React 19 |
| Bundler | Vite 7 |
| Language | TypeScript 5.7 |
| Styling | Tailwind CSS 4 |
| Graphics | WebGL 2 (custom GLSL fragment shaders) |
| Word export | [docx](https://www.npmjs.com/package/docx) 9 |
| Persistence | `localStorage` (drafts, prefs, milestones) + `sessionStorage` (timer) |
| Backend | None |
| Auth | None |
| Telemetry | None |

## Browser Storage

| Key | Storage | Contents |
|-----|---------|----------|
| `writedown:draft` | localStorage | Current draft text (debounced 500 ms) |
| `writedown:prefs` | localStorage | Font, size, mode, export format, release mode |
| `writedown:milestones` | localStorage | `{ pastReleaseTotal, lastBucket }` for meteor cadence |
| `writedown:timer` | sessionStorage | `{ phase, endTime }` — survives accidental refresh, resets on new tab |

## Requirements

- [Node.js 20+](https://nodejs.org/) and bundled npm
- A WebGL 2-capable browser ([compatibility table](https://caniuse.com/webgl2))

## Repository Structure

```text
write-down/
├── src/
│   ├── App.tsx                       # mode switching, keystroke pulse tracker
│   ├── canvas/
│   │   └── ShaderCanvas.tsx          # WebGL2 rendering wrapper
│   ├── components/
│   │   ├── Deck.tsx                  # writing card, mirror layer, release orchestration
│   │   ├── FontControls.tsx          # font picker + size stepper
│   │   └── SaveRelease.tsx           # save/release button cluster
│   ├── lib/
│   │   ├── export.ts                 # md / txt / docx blob builders
│   │   ├── prefs.ts                  # types + localStorage persistence
│   │   └── usePrefersReducedMotion.ts
│   ├── modes/
│   │   ├── MeteorOverlay.tsx         # star-mode milestone celebration
│   │   └── ModeSwitcher.tsx          # top-edge hover mode picker
│   ├── shaders/
│   │   ├── hearth.ts                 # GLSL fragment shaders
│   │   ├── rain.ts
│   │   ├── snow.ts
│   │   └── star.ts
│   ├── timer/
│   │   └── ZenTimer.tsx              # 25/5 ring around the writing card
│   ├── index.css                     # Tailwind + animation keyframes
│   ├── main.tsx                      # entry
│   └── vite-env.d.ts
├── public/                           # static assets (currently empty)
├── index.html
├── vite.config.ts
├── package.json
└── tsconfig.json
```

## Uninstall

write-down stores all state inside the browser. Removing the app cleanly:

1. Delete the local repository:
   ```bash
   rm -rf write-down
   ```
2. Clear browser-side data (DevTools → Application → Storage → clear, or remove these keys manually):
   - `localStorage`: `writedown:draft`, `writedown:prefs`, `writedown:milestones`
   - `sessionStorage`: `writedown:timer`

There is no remote server, no cloud account, and no third-party SDK. Removing those two stores plus the directory leaves nothing behind.

## License

Not yet assigned.
