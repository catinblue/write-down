import { useCallback, useEffect, useRef, useState } from 'react';
import { ShaderCanvas } from './canvas/ShaderCanvas';
import { Deck } from './components/Deck';
import type { Mode, Prefs } from './lib/prefs';
import { loadPrefs, savePrefs } from './lib/prefs';
import { MeteorOverlay } from './modes/MeteorOverlay';
import { ModeSwitcher } from './modes/ModeSwitcher';
import { HEARTH_FRAG } from './shaders/hearth';
import { RAIN_FRAG } from './shaders/rain';
import { SNOW_FRAG } from './shaders/snow';
import { STAR_FRAG } from './shaders/star';

const CROSS_FADE_MS = 1500;

// Canonical order of shader modes. Drives Tab-cycling direction and any UI
// iteration that needs a deterministic sequence.
const SHADER_MODES: Mode[] = ['rain', 'snow', 'star', 'hearth'];

function fragFor(mode: Mode): string {
  switch (mode) {
    case 'rain': return RAIN_FRAG;
    case 'snow': return SNOW_FRAG;
    case 'star': return STAR_FRAG;
    case 'hearth': return HEARTH_FRAG;
  }
}

// Each mode owns the baseline "feel" of its shader. u_intensity and
// u_blur have different meanings per mode (rain density vs snow volume
// vs star density vs ember brightness), and these defaults are what the
// Safe Haven edit committed to instead of exposing sliders.
const MODE_UNIFORMS: Record<Mode, { u_intensity: number; u_blur: number }> = {
  rain:   { u_intensity: 0.65, u_blur: 0.25 },
  snow:   { u_intensity: 0.80, u_blur: 0.20 },
  star:   { u_intensity: 0.75, u_blur: 0.45 },
  hearth: { u_intensity: 0.85, u_blur: 0.30 },
};

export function App() {
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs());

  const [outgoingMode, setOutgoingMode] = useState<Mode | null>(null);
  const fadeTimerRef = useRef<number | null>(null);
  const [meteorTrigger, setMeteorTrigger] = useState(0);

  useEffect(() => {
    savePrefs(prefs);
  }, [prefs]);

  // Chrome auto-hide: on touch devices, tap the background to reveal; 3 s idle
  // or any keystroke hides. Desktop (hover: hover) ignores this entirely —
  // see the CSS guard in index.css.
  const [chromeShown, setChromeShown] = useState(false);
  const chromeTimerRef = useRef<number | null>(null);

  const revealChrome = useCallback(() => {
    setChromeShown(true);
    if (chromeTimerRef.current) window.clearTimeout(chromeTimerRef.current);
    chromeTimerRef.current = window.setTimeout(() => {
      setChromeShown(false);
      chromeTimerRef.current = null;
    }, 3000);
  }, []);

  const [chromeStealth, setChromeStealth] = useState(false);

  // Keystroke rhythm → shader pulse. Single uniform u_pulse ∈ [0, 1] that
  // feeds every shader's intensity modulation. Typing bumps pulse up (natural
  // WPM smoothing); release triggers a 1.0 spike that decays naturally (the
  // "lingering warmth afterglow"). Counted at window level so the textarea's
  // key events naturally feed in without prop drilling.
  const [pulse, setPulse] = useState(0);
  const keystrokeTimesRef = useRef<number[]>([]);
  const pulseOverrideRef = useRef<number | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = performance.now();
      keystrokeTimesRef.current = keystrokeTimesRef.current.filter((t) => now - t < 3000);
      const count = keystrokeTimesRef.current.length;
      // ~18 keys in 3s ≈ full pulse (~72 WPM sustained). Tuned soft so casual
      // typing hovers around 0.3–0.5 and heavy flow pushes 0.8+.
      const typingTarget = Math.min(1, count / 18);
      setPulse((prev) => {
        const override = pulseOverrideRef.current;
        if (override !== null) {
          pulseOverrideRef.current = null;
          return override;
        }
        return prev * 0.92 + typingTarget * 0.08;
      });
    }, 100);
    return () => window.clearInterval(id);
  }, []);

  const boostPulseForRelease = useCallback(() => {
    pulseOverrideRef.current = 1.0;
  }, []);

  const hideChrome = useCallback(() => {
    if (chromeTimerRef.current) window.clearTimeout(chromeTimerRef.current);
    chromeTimerRef.current = null;
    setChromeShown(false);
    setChromeStealth(false);
  }, []);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('textarea')) return;
      revealChrome();
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [revealChrome]);

  // Keep the Tab-cycle handler fresh without re-registering the window
  // listener every render. The listener reads the ref at fire time.
  const tabCycleRef = useRef<(dir: 1 | -1) => void>(() => {});
  tabCycleRef.current = (direction: 1 | -1) => {
    const idx = SHADER_MODES.indexOf(prefs.mode);
    const next = SHADER_MODES[(idx + direction + SHADER_MODES.length) % SHADER_MODES.length];
    handleModeChange(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Keystroke rhythm tracking. Counts anything that produces input —
      // single characters, Enter, Backspace — regardless of which element
      // has focus. Non-input keys (Shift alone, arrows) don't bump pulse.
      const isInput = e.key.length === 1 || e.key === 'Enter' || e.key === 'Backspace';
      if (isInput) {
        keystrokeTimesRef.current.push(performance.now());
      }

      if (e.key === 'Escape') {
        setChromeStealth((s) => !s);
        return;
      }
      if (e.key === 'Tab') {
        // Hijack Tab only when the user is in the textarea or nothing in
        // particular has focus. Preserves native focus-cycling when they
        // deliberately Tab out of the writing surface into chrome.
        const focused = document.activeElement;
        const inTextarea = focused?.tagName === 'TEXTAREA';
        const onBody = focused === document.body || focused === null;
        if (inTextarea || onBody) {
          e.preventDefault();
          tabCycleRef.current(e.shiftKey ? -1 : 1);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (chromeShown) document.body.classList.add('chrome-shown');
    else document.body.classList.remove('chrome-shown');
    return () => document.body.classList.remove('chrome-shown');
  }, [chromeShown]);

  useEffect(() => {
    if (chromeStealth) document.body.classList.add('chrome-stealth');
    else document.body.classList.remove('chrome-stealth');
    return () => document.body.classList.remove('chrome-stealth');
  }, [chromeStealth]);

  const update = useCallback(<K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setPrefs((p) => ({ ...p, [key]: value }));
  }, []);

  const handleModeChange = useCallback((next: Mode) => {
    setPrefs((p) => {
      if (p.mode === next) return p;
      setOutgoingMode(p.mode);
      if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = window.setTimeout(() => {
        setOutgoingMode(null);
        fadeTimerRef.current = null;
      }, CROSS_FADE_MS);
      return { ...p, mode: next };
    });
  }, []);

  const handleMilestone = useCallback(() => {
    setMeteorTrigger((n) => n + 1);
  }, []);

  return (
    <div className="relative h-full w-full">
      {outgoingMode && (
        <ShaderCanvas
          key={`out-${outgoingMode}`}
          frag={fragFor(outgoingMode)}
          uniforms={{ ...MODE_UNIFORMS[outgoingMode], u_pulse: pulse }}
          className="fixed inset-0 w-full h-full block animate-shader-out"
        />
      )}
      <ShaderCanvas
        key={`in-${prefs.mode}`}
        frag={fragFor(prefs.mode)}
        uniforms={{ ...MODE_UNIFORMS[prefs.mode], u_pulse: pulse }}
        className="fixed inset-0 w-full h-full block animate-shader-in"
      />
      <MeteorOverlay trigger={meteorTrigger} active={prefs.mode === 'star'} />
      <div className="relative z-10 h-full w-full">
        <Deck
          font={prefs.font}
          size={prefs.size}
          mode={prefs.mode}
          format={prefs.exportFormat}
          releaseMode={prefs.releaseMode}
          onFont={(f) => update('font', f)}
          onSize={(s) => update('size', s)}
          onFormat={(f) => update('exportFormat', f)}
          onReleaseMode={(m) => update('releaseMode', m)}
          onMilestone={handleMilestone}
          onTyping={hideChrome}
          onReleaseBoost={boostPulseForRelease}
        />
      </div>
      <ModeSwitcher mode={prefs.mode} onChange={handleModeChange} />
    </div>
  );
}
