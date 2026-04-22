import { useEffect, useRef, useState } from 'react';
import { loadTimer, saveTimer } from '../lib/prefs';

const SESSION_MS = 25 * 60 * 1000;
const REST_MS = 5 * 60 * 1000;
const LONG_PRESS_MS = 2000;
const CORNER_RADIUS = 28;

type Phase = 'running' | 'resting';

interface Dims { w: number; h: number }

// Restore from sessionStorage only if the saved endTime is still in the
// future. Otherwise treat as expired and start a fresh running session.
function loadInitialTimer(): { phase: Phase; endTime: number } {
  const saved = loadTimer();
  if (saved && saved.endTime > Date.now()) {
    return { phase: saved.phase, endTime: saved.endTime };
  }
  return { phase: 'running', endTime: Date.now() + SESSION_MS };
}

export function ZenTimer() {
  const [phase, setPhase] = useState<Phase>(() => loadInitialTimer().phase);
  const [endTime, setEndTime] = useState<number>(() => loadInitialTimer().endTime);
  const [now, setNow] = useState<number>(() => Date.now());
  const [pressProgress, setPressProgress] = useState(0);
  const [dims, setDims] = useState<Dims>({ w: 0, h: 0 });

  // Persist phase + endTime to sessionStorage on change so an accidental
  // refresh within the same tab restores mid-session progress.
  useEffect(() => {
    saveTimer({ phase, endTime });
  }, [phase, endTime]);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const pressRafRef = useRef<number | null>(null);
  const pressStartRef = useRef<number>(0);

  // ---- size tracking ----
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;
    const update = () => setDims({ w: parent.clientWidth, h: parent.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  // ---- tick ----
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  // ---- phase transition on expiry ----
  useEffect(() => {
    if (now < endTime) return;
    if (phase === 'running') {
      setPhase('resting');
      setEndTime(now + REST_MS);
    } else {
      setPhase('running');
      setEndTime(now + SESSION_MS);
    }
  }, [now, endTime, phase]);

  const duration = phase === 'running' ? SESSION_MS : REST_MS;
  const remaining = Math.max(0, endTime - now);
  const progress = Math.max(0, Math.min(1, remaining / duration));

  // ---- long-press to reset ----
  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pressStartRef.current = performance.now();
    const step = () => {
      const elapsed = performance.now() - pressStartRef.current;
      const p = Math.min(1, elapsed / LONG_PRESS_MS);
      setPressProgress(p);
      if (p >= 1) {
        setPhase('running');
        setEndTime(Date.now() + SESSION_MS);
        setPressProgress(0);
        pressRafRef.current = null;
        return;
      }
      pressRafRef.current = requestAnimationFrame(step);
    };
    step();
  };

  const cancelPress = () => {
    if (pressRafRef.current !== null) {
      cancelAnimationFrame(pressRafRef.current);
      pressRafRef.current = null;
    }
    setPressProgress(0);
  };

  if (dims.w === 0 || dims.h === 0) {
    return <div ref={wrapperRef} className="absolute inset-0 pointer-events-none" />;
  }

  const { w, h } = dims;
  const r = CORNER_RADIUS;
  const pathD = buildRoundedPath(w, h, r);

  // During press, ring gets a brief brightness boost ramping up to the reset.
  const pressGlow = pressProgress > 0;
  const baseOpacity = phase === 'resting' ? 0.55 : 0.28;
  const strokeOpacity = pressGlow
    ? baseOpacity + pressProgress * (1 - baseOpacity)
    : baseOpacity;
  const strokeColor = phase === 'resting'
    ? `rgba(195, 215, 255, ${strokeOpacity})`
    : `rgba(255, 255, 255, ${strokeOpacity})`;

  return (
    <div ref={wrapperRef} className="absolute inset-0">
      <svg
        width={w}
        height={h}
        className="absolute inset-0 overflow-visible"
        style={{ pointerEvents: 'none' }}
      >
        {/* Hit zone — invisible fat stroke that captures pointer events only along the ring path */}
        <path
          d={pathD}
          fill="none"
          stroke="transparent"
          strokeWidth={14}
          style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
          onPointerDown={onPointerDown}
          onPointerUp={cancelPress}
          onPointerCancel={cancelPress}
          onPointerLeave={cancelPress}
        />
        {/* Visible progress ring */}
        <path
          d={pathD}
          fill="none"
          stroke={strokeColor}
          strokeWidth={1.5}
          pathLength={1}
          strokeDasharray={`${progress} 1`}
          strokeDashoffset={-(1 - progress)}
          className={phase === 'resting' ? 'zen-ring-pulse' : ''}
          style={{
            transition: 'stroke 600ms ease-out',
            filter: pressGlow ? `drop-shadow(0 0 ${6 * pressProgress}px rgba(200,220,255,${0.6 * pressProgress}))` : undefined,
          }}
        />
      </svg>
    </div>
  );
}

// Build a rounded-rect path that starts at top-center and traces clockwise.
// Returning to top-center = exactly one trip around the perimeter, so
// progress=1 renders the full ring, progress=0 renders nothing.
function buildRoundedPath(w: number, h: number, r: number): string {
  const mx = w / 2;
  return [
    `M ${mx} 0`,
    `L ${w - r} 0`,
    `A ${r} ${r} 0 0 1 ${w} ${r}`,
    `L ${w} ${h - r}`,
    `A ${r} ${r} 0 0 1 ${w - r} ${h}`,
    `L ${r} ${h}`,
    `A ${r} ${r} 0 0 1 0 ${h - r}`,
    `L 0 ${r}`,
    `A ${r} ${r} 0 0 1 ${r} 0`,
    `L ${mx} 0`,
  ].join(' ');
}
