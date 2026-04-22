import type { FontFamily } from '../lib/prefs';
import { MAX_SIZE, MIN_SIZE, SIZE_STEP } from '../lib/prefs';

const FONTS: { key: FontFamily; className: string }[] = [
  { key: 'hand', className: 'font-hand' },
  { key: 'serif', className: 'font-serif' },
  { key: 'sans', className: 'font-sans' },
];

interface Props {
  font: FontFamily;
  size: number;
  onFontChange: (f: FontFamily) => void;
  onSizeChange: (s: number) => void;
}

export function FontControls({ font, size, onFontChange, onSizeChange }: Props) {
  return (
    <div
      className="
        chrome-cluster
        flex items-center gap-3
        opacity-55 hover:!opacity-100
        transition-opacity duration-700 ease-out
        text-white/70 select-none
      "
    >
      <div className="flex items-center gap-1">
        {FONTS.map((f) => (
          <button
            key={f.key}
            onClick={() => onFontChange(f.key)}
            aria-label={`Font ${f.key}`}
            className={`
              ${f.className}
              w-9 h-9 flex items-center justify-center
              rounded-full
              text-[22px] leading-none
              ${font === f.key ? 'text-white bg-white/10' : 'text-white/40 hover:text-white/80'}
              transition-all duration-300
            `}
          >
            A
          </button>
        ))}
      </div>
      <div className="w-px h-5 bg-white/10" aria-hidden />
      <div className="flex items-center gap-1 text-xs">
        <button
          onClick={() => onSizeChange(Math.max(MIN_SIZE, size - SIZE_STEP))}
          aria-label="Decrease size"
          className="w-7 h-7 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition"
        >
          −
        </button>
        <span className="w-7 text-center tabular-nums text-white/60">{size}</span>
        <button
          onClick={() => onSizeChange(Math.min(MAX_SIZE, size + SIZE_STEP))}
          aria-label="Increase size"
          className="w-7 h-7 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition"
        >
          +
        </button>
      </div>
    </div>
  );
}
