import type { ExportFormat, ReleaseMode } from '../lib/prefs';

const BTN_W = 78;
const BTN_H = 28;

const FORMATS: readonly ExportFormat[] = ['md', 'txt', 'docx'];
const RELEASE_MODES: readonly ReleaseMode[] = ['vapor', 'melt', 'burn', 'ember'];

interface Props {
  canAct: boolean;
  format: ExportFormat;
  releaseMode: ReleaseMode;
  onSave: (format?: ExportFormat) => void;
  onRelease: (mode?: ReleaseMode) => void;
}

export function SaveRelease({ canAct, format, releaseMode, onSave, onRelease }: Props) {
  return (
    <div
      className="
        chrome-cluster
        flex items-center gap-3
        opacity-60 hover:!opacity-100
        transition-opacity duration-500
        select-none
      "
    >
      {/* Save group */}
      <div className="relative group/save">
        <div
          className="
            absolute left-1/2 -translate-x-1/2 bottom-full
            pt-1 pb-2
            opacity-0 group-hover/save:opacity-100
            pointer-events-none group-hover/save:pointer-events-auto
            [body.chrome-shown_&]:opacity-100
            [body.chrome-shown_&]:pointer-events-auto
            transition-opacity duration-300
          "
        >
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            {FORMATS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => canAct && onSave(f)}
                disabled={!canAct}
                aria-label={`Save as .${f}`}
                aria-pressed={format === f}
                className={chipClass(canAct, format === f)}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={canAct ? () => onSave() : undefined}
          disabled={!canAct}
          aria-label={`Save as .${format}`}
          title={canAct ? `Save as .${format} (⌘/Ctrl+S)` : undefined}
          className={buttonClass(canAct)}
          style={{ width: BTN_W, height: BTN_H }}
        >
          Save
        </button>
      </div>

      {/* Release group — mirrors Save: main click fires current mode, chips
          pick a mode and fire directly. */}
      <div className="relative group/release">
        <div
          className="
            absolute left-1/2 -translate-x-1/2 bottom-full
            pt-1 pb-2
            opacity-0 group-hover/release:opacity-100
            pointer-events-none group-hover/release:pointer-events-auto
            [body.chrome-shown_&]:opacity-100
            [body.chrome-shown_&]:pointer-events-auto
            transition-opacity duration-300
          "
        >
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            {RELEASE_MODES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => canAct && onRelease(m)}
                disabled={!canAct}
                aria-label={`Release via ${m}`}
                aria-pressed={releaseMode === m}
                className={chipClass(canAct, releaseMode === m)}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={canAct ? () => onRelease() : undefined}
          disabled={!canAct}
          aria-label={`Release via ${releaseMode}`}
          title={canAct ? `Release via ${releaseMode}` : undefined}
          className={buttonClass(canAct)}
          style={{ width: BTN_W, height: BTN_H }}
        >
          Release
        </button>
      </div>
    </div>
  );
}

function buttonClass(canAct: boolean): string {
  const base = `
    flex items-center justify-center
    tracking-[0.2em] uppercase text-[11px]
    transition-colors duration-300
  `;
  const enabled = 'text-white/70 hover:text-white cursor-pointer';
  const disabled = 'text-white/20 cursor-default';
  return `${base} ${canAct ? enabled : disabled}`;
}

function chipClass(canAct: boolean, isCurrent: boolean): string {
  const base = 'px-1.5 py-0.5 text-[10px] tracking-[0.22em] uppercase border-b transition-colors duration-200';
  if (!canAct) return `${base} text-white/20 border-transparent cursor-default`;
  return isCurrent
    ? `${base} text-white border-white/60`
    : `${base} text-white/50 border-transparent hover:text-white/90 hover:border-white/25`;
}
