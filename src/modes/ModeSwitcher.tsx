import { useEffect, useState } from 'react';
import type { Mode } from '../lib/prefs';

interface Props {
  mode: Mode;
  onChange: (m: Mode) => void;
}

const MODES: { key: Mode; label: string }[] = [
  { key: 'rain', label: 'Rain' },
  { key: 'snow', label: 'Snow' },
  { key: 'star', label: 'Star' },
  { key: 'hearth', label: 'Hearth' },
];

/**
 * Top-50px hover zone. Idle: fully invisible. On cursor entering the
 * zone: three mode labels fade in. Click selects. Leaving the zone fades
 * everything back to transparent.
 */
export function ModeSwitcher({ mode, onChange }: Props) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      setShown(e.clientY <= 60);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  return (
    <div
      className={`
        chrome-cluster
        fixed top-0 left-1/2 -translate-x-1/2
        flex items-center gap-8
        px-6 py-4
        select-none
        transition-opacity duration-700 ease-out
        ${shown ? 'opacity-90' : 'opacity-0 pointer-events-none'}
      `}
      style={{ zIndex: 30 }}
    >
      {MODES.map((m) => (
        <button
          key={m.key}
          type="button"
          onClick={() => onChange(m.key)}
          className={`
            text-[11px] uppercase tracking-[0.35em]
            transition-colors duration-300
            ${mode === m.key ? 'text-white' : 'text-white/40 hover:text-white/85'}
          `}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
