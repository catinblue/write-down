import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ExportFormat, FontFamily, Mode, ReleaseMode } from '../lib/prefs';
import { loadDraft, loadMilestones, saveDraft, saveMilestones } from '../lib/prefs';
import { exportAs } from '../lib/export';
import { usePrefersReducedMotion } from '../lib/usePrefersReducedMotion';
import { ZenTimer } from '../timer/ZenTimer';
import { FontControls } from './FontControls';
import { SaveRelease } from './SaveRelease';

// Reduced-motion release: skip the mode-specific choreography and briefing,
// just fade the text out. Short enough not to feel sluggish, long enough
// that the user registers the commit.
const REDUCED_RELEASE_MS = 800;

// Session briefing visible window, in ms. Fires between Release click and
// the actual release animation. Skipped under reduced-motion.
const BRIEFING_MS = 2000;

// SR-friendly verb per release mode. Read aloud via the aria-live region
// after the text is cleared — screen-reader users never see the animation.
const MODE_VERB: Record<ReleaseMode, string> = {
  burn: 'burned',
  vapor: 'evaporated',
  melt: 'melted',
  ember: 'scattered',
};

// Animation duration per release mode, in ms. Must match the @keyframes
// durations in index.css; this is what gates the "clear text + reset
// session" cleanup after the animation ends.
const RELEASE_DURATIONS: Record<ReleaseMode, number> = {
  burn: 1650,
  vapor: 1850,
  melt: 2250,
  ember: 2450,
};

// Poetic location phrase per shader mode, used in the session briefing:
// "23 minutes {location}. 1200 characters. Letting go."
const MODE_LOCATION: Record<Mode, string> = {
  rain: 'under the rain',
  snow: 'in the snow',
  star: 'beneath the stars',
  hearth: 'by the hearth',
};

function formatDuration(ms: number): string {
  const minutes = ms / 60000;
  if (minutes < 1) return 'A moment';
  if (minutes < 2) return '1 minute';
  if (minutes < 60) return `${Math.round(minutes)} minutes`;
  if (minutes < 120) return 'Over an hour';
  return 'Several hours';
}

function composeBriefing(startMs: number, chars: number, mode: Mode): string {
  const duration = formatDuration(Date.now() - startMs);
  const location = MODE_LOCATION[mode];
  return `${duration} ${location}. ${chars} characters. Letting go.`;
}

// Paragraph chunking for the dimming mirror. Splits text into alternating
// paragraph / separator chunks, preserving the ORIGINAL separator whitespace
// so the mirror layout matches the textarea pixel-for-pixel.
type Chunk = { type: 'para' | 'sep'; text: string };

function chunkText(text: string): Chunk[] {
  if (text.length === 0) return [{ type: 'para', text: '' }];
  const chunks: Chunk[] = [];
  const pattern = /\n[ \t]*\n/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > lastIdx) {
      chunks.push({ type: 'para', text: text.slice(lastIdx, m.index) });
    }
    chunks.push({ type: 'sep', text: m[0] });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) {
    chunks.push({ type: 'para', text: text.slice(lastIdx) });
  }
  // If the text ended with a separator, ensure a trailing empty paragraph
  // so the cursor can live "after" the last real paragraph visibly.
  if (chunks.length === 0 || chunks[chunks.length - 1].type === 'sep') {
    chunks.push({ type: 'para', text: '' });
  }
  return chunks;
}

// Given chunks and a cursor offset, find the index of the paragraph chunk
// that owns the cursor. Returns -1 if no paragraph chunk matches (shouldn't
// happen after chunkText's guarantees).
function findActiveParagraph(chunks: Chunk[], cursor: number): number {
  let pos = 0;
  for (let i = 0; i < chunks.length; i++) {
    const end = pos + chunks[i].text.length;
    if (cursor >= pos && cursor <= end && chunks[i].type === 'para') return i;
    pos = end;
  }
  // Fallback: the last paragraph.
  for (let i = chunks.length - 1; i >= 0; i--) {
    if (chunks[i].type === 'para') return i;
  }
  return -1;
}

interface Props {
  font: FontFamily;
  size: number;
  mode: Mode;
  format: ExportFormat;
  releaseMode: ReleaseMode;
  onFont: (f: FontFamily) => void;
  onSize: (s: number) => void;
  onFormat: (f: ExportFormat) => void;
  onReleaseMode: (m: ReleaseMode) => void;
  onMilestone: () => void;
  onTyping: () => void;
  onReleaseBoost: () => void;
}

export function Deck({
  font, size, mode, format, releaseMode,
  onFont, onSize, onFormat, onReleaseMode,
  onMilestone, onTyping, onReleaseBoost,
}: Props) {
  const [text, setText] = useState<string>(() => loadDraft());
  const [activeRelease, setActiveRelease] = useState<ReleaseMode | null>(null);
  const [briefing, setBriefing] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [cursorPos, setCursorPos] = useState(0);
  // IME composition state. CJK / accented-Latin IMEs stage pending glyphs
  // inside the textarea element until commit. Since our textarea paints
  // transparent text (the mirror renders), the composition staging would
  // be invisible without this carve-out. During composition we flip the
  // textarea text to visible and hide the mirror so the user sees their
  // staged pinyin / kana / accent cluster normally.
  const [isComposing, setIsComposing] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  const saveTimer = useRef<number | null>(null);
  const sessionHighRef = useRef<number>(0);
  const milestoneRef = useRef(loadMilestones());
  // Session clock — when this session began. Reset on release completion so
  // the next briefing reports accurate elapsed time since the last "close."
  const sessionStartRef = useRef<number>(Date.now());
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mirrorRef = useRef<HTMLDivElement | null>(null);

  // Paragraph chunks + active paragraph index for the dimming mirror.
  // Memoised on text / cursor so large drafts don't re-parse on unrelated renders.
  const chunks = useMemo(() => chunkText(text), [text]);
  const activeParaIdx = useMemo(() => findActiveParagraph(chunks, cursorPos), [chunks, cursorPos]);

  // Single source of truth for "can't type / act right now." Covers both
  // the briefing overlay window and the mode-specific release animation.
  const isReleasing = activeRelease !== null || briefing !== '';

  useEffect(() => {
    sessionHighRef.current = text.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveDraft(text);
    }, 500);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [text]);

  // Typewriter scrolling: lock the caret's line at the textarea's vertical
  // center so the writer's eyes never chase downward. Applied on input,
  // selection change, and after release clears the text.
  const scrollCaretToCenter = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta || isReleasing) return;
    const cs = getComputedStyle(ta);
    const lineHeight = parseFloat(cs.lineHeight);
    if (!Number.isFinite(lineHeight) || lineHeight === 0) return;
    const paddingTop = parseFloat(cs.paddingTop) || 0;
    const charsBefore = ta.value.slice(0, ta.selectionStart);
    const lineIdx = charsBefore.split('\n').length - 1;
    const caretY = paddingTop + lineIdx * lineHeight;
    const target = caretY - ta.clientHeight / 2 + lineHeight / 2;
    ta.scrollTop = Math.max(0, target);
  }, [isReleasing]);

  const checkMilestone = useCallback((newLen: number) => {
    if (newLen <= sessionHighRef.current) return;
    sessionHighRef.current = newLen;
    const lifetime = milestoneRef.current.pastReleaseTotal + sessionHighRef.current;
    const bucket = Math.floor(lifetime / 100);
    if (bucket > milestoneRef.current.lastBucket) {
      milestoneRef.current = { ...milestoneRef.current, lastBucket: bucket };
      saveMilestones(milestoneRef.current);
      onMilestone();
    }
  }, [onMilestone]);

  const handleTextChange = useCallback((newText: string) => {
    onTyping();
    setText(newText);
    checkMilestone(newText.length);
    // Defer cursor + scroll sync until after React flushes the value.
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) setCursorPos(ta.selectionStart);
      scrollCaretToCenter();
    });
  }, [checkMilestone, onTyping, scrollCaretToCenter]);

  // Keep the mirror div scrolled in sync with the textarea so paragraph
  // dimming aligns vertically with whatever line the caret is on.
  useEffect(() => {
    const ta = textareaRef.current;
    const mirror = mirrorRef.current;
    if (!ta || !mirror) return;
    const sync = () => { mirror.scrollTop = ta.scrollTop; };
    ta.addEventListener('scroll', sync, { passive: true });
    // Initial sync in case content/scroll was restored on mount.
    sync();
    return () => ta.removeEventListener('scroll', sync);
  }, []);

  const handleSave = useCallback(async (formatOverride?: ExportFormat) => {
    if (!text.trim()) return;
    const fmt = formatOverride ?? format;
    if (formatOverride && formatOverride !== format) {
      onFormat(formatOverride);
    }
    await exportAs(text, fmt, font, size);
  }, [text, format, font, size, onFormat]);

  // Global Cmd/Ctrl+S — save in current format. Ref pattern keeps the
  // window listener registered once across text-change re-renders.
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const startAnimation = useCallback((releaseTarget: ReleaseMode) => {
    setActiveRelease(releaseTarget);
    const duration = reducedMotion ? REDUCED_RELEASE_MS : RELEASE_DURATIONS[releaseTarget];
    window.setTimeout(() => {
      milestoneRef.current = {
        pastReleaseTotal: milestoneRef.current.pastReleaseTotal + sessionHighRef.current,
        lastBucket: milestoneRef.current.lastBucket,
      };
      saveMilestones(milestoneRef.current);
      sessionHighRef.current = 0;
      sessionStartRef.current = Date.now();
      setText('');
      setActiveRelease(null);
      // Boost the shader pulse — gives the next few seconds a "lingering
      // warmth" afterglow that naturally decays back to idle.
      onReleaseBoost();
      // SR announcement: clear then re-set so aria-live re-announces even
      // when the same mode fires twice consecutively.
      setAnnouncement('');
      window.setTimeout(() => setAnnouncement(`Draft ${MODE_VERB[releaseTarget]}.`), 80);
    }, duration);
  }, [reducedMotion, onReleaseBoost]);

  const handleRelease = useCallback((modeOverride?: ReleaseMode) => {
    if (!text.trim() || isReleasing) return;
    const releaseTarget = modeOverride ?? releaseMode;
    if (modeOverride && modeOverride !== releaseMode) {
      onReleaseMode(modeOverride);
    }
    // Reduced-motion path: skip the briefing overlay entirely.
    if (reducedMotion) {
      startAnimation(releaseTarget);
      return;
    }
    // Phase 1: briefing overlay. textarea is already readOnly (isReleasing).
    setBriefing(composeBriefing(sessionStartRef.current, text.length, mode));
    window.setTimeout(() => {
      setBriefing('');
      // Phase 2: mode-specific release animation.
      startAnimation(releaseTarget);
    }, BRIEFING_MS);
  }, [text, isReleasing, releaseMode, onReleaseMode, reducedMotion, startAnimation, mode]);

  const fontClass =
    font === 'hand' ? 'font-hand'
    : font === 'serif' ? 'font-serif'
    : 'font-sans';

  const canAct = text.trim().length > 0 && !isReleasing;

  // Card warm-glow intensity grows with character count. Starts cool (0.05)
  // for empty sessions, caps at 0.30 around ~2500 chars so long drafts don't
  // saturate the glow. Drives the `--warm-alpha` CSS var consumed by
  // `.card-surface` in index.css.
  const warmAlpha = Math.min(0.30, 0.05 + text.length / 10000);

  return (
    <div className="group relative h-full w-full flex items-center justify-center p-6 md:p-10">
      {/* Screen-reader live region */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
      {/* SVG fire filter for the burn release — mounted only during a burn */}
      {activeRelease === 'burn' && (
        <svg
          aria-hidden
          style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}
        >
          <filter id="fire-filter" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.04 0.08" numOctaves="2" seed="7" result="turb">
              <animate attributeName="baseFrequency" from="0.04 0.08" to="0.12 0.22" dur="1.6s" fill="freeze" />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="turb" scale="8">
              <animate attributeName="scale" from="8" to="32" dur="1.6s" fill="freeze" />
            </feDisplacementMap>
          </filter>
        </svg>
      )}
      <div
        className="
          card-surface
          relative
          w-[min(900px,92vw)] h-[min(720px,82vh)]
          rounded-[28px]
          bg-white/[0.045]
          backdrop-blur-2xl
          border border-white/[0.12]
          transition-all duration-700 ease-out
          focus-within:border-white/[0.2]
        "
        style={{ '--warm-alpha': warmAlpha.toFixed(3) } as React.CSSProperties}
      >
        <ZenTimer />
        {/* Mirror layer — renders the text with per-paragraph dimming.
            The release class lives here, not on the textarea, so the
            animation works on the styled paragraph spans.
            Textarea sits on top with transparent text + preserved caret.
            Hidden during IME composition so staged glyphs (which live only
            in the textarea) aren't ghost-rendered underneath. */}
        <div
          ref={mirrorRef}
          aria-hidden
          className={`
            mirror-layer
            absolute inset-0
            rounded-[28px]
            px-8 md:px-14 py-8 md:py-12
            text-white/90
            ${fontClass}
            ${activeRelease ? `release-${activeRelease}` : ''}
          `}
          style={{
            fontSize: `${size}px`,
            lineHeight: 1.75,
            opacity: isComposing ? 0 : 1,
            transition: 'opacity 140ms ease-out',
          }}
        >
          {chunks.map((c, i) => {
            if (c.type === 'sep') {
              return <span key={i}>{c.text}</span>;
            }
            // Release phase: all paragraphs at full opacity so the animation
            // affects the entire draft uniformly.
            const dim = !isReleasing && i !== activeParaIdx;
            return (
              <span
                key={i}
                className="para-chunk"
                style={{ opacity: dim ? 0.3 : 1 }}
              >
                {c.text}
              </span>
            );
          })}
        </div>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          onSelect={(e) => {
            setCursorPos(e.currentTarget.selectionStart);
            scrollCaretToCenter();
          }}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          spellCheck={false}
          autoFocus
          placeholder="…"
          className={`
            absolute inset-0
            w-full h-full
            resize-none
            bg-transparent
            rounded-[28px]
            px-8 md:px-14 py-8 md:py-12
            placeholder:text-white/20
            focus:outline-none
            ${fontClass}
          `}
          style={{
            fontSize: `${size}px`,
            lineHeight: 1.75,
            // Transparent by default so the mirror renders the visible text.
            // During IME composition, flip to visible so the staged pinyin /
            // kana / accent cluster shows up natively in the textarea.
            color: isComposing ? 'rgba(255, 255, 255, 0.9)' : 'transparent',
            caretColor: 'rgba(200, 220, 255, 0.75)',
            transition: 'color 140ms ease-out',
            pointerEvents: isReleasing ? 'none' : 'auto',
          }}
          readOnly={isReleasing}
        />
        {/* Session briefing — 2 s fade-in/hold/fade-out between Release click
            and the mode-specific animation. Skipped under reduced-motion.
            Rendered above the textarea; pointer-events: none so clicks
            during the briefing window still pass through where relevant. */}
        {briefing && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none session-briefing"
            aria-hidden
          >
            <p className="font-serif italic text-white/75 text-center max-w-md px-8 text-[19px] leading-relaxed tracking-wide">
              {briefing}
            </p>
          </div>
        )}
      </div>
      {/* Bottom bar — FontControls + SaveRelease consolidated at center so
          flyouts above Save / Release never clip the viewport edge. Stacks
          vertically on narrow screens with Save/Release on top so their
          flyouts have clear headroom above. */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex flex-col-reverse sm:flex-row items-center gap-4 sm:gap-10 pointer-events-none z-20">
        <div className="pointer-events-auto">
          <FontControls font={font} size={size} onFontChange={onFont} onSizeChange={onSize} />
        </div>
        <div className="pointer-events-auto">
          <SaveRelease
            canAct={canAct}
            format={format}
            releaseMode={releaseMode}
            onSave={handleSave}
            onRelease={handleRelease}
          />
        </div>
      </div>
    </div>
  );
}
