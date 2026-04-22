export type FontFamily = 'hand' | 'serif' | 'sans';
export type Mode = 'rain' | 'snow' | 'star' | 'hearth';
export type ExportFormat = 'md' | 'txt' | 'docx';
export type ReleaseMode = 'burn' | 'vapor' | 'melt' | 'ember';

export interface Prefs {
  font: FontFamily;
  size: number;
  mode: Mode;
  exportFormat: ExportFormat;
  releaseMode: ReleaseMode;
}

/**
 * Meteor milestone progress — tracks total lifetime characters across
 * release cycles so re-typing-after-delete doesn't farm meteors.
 * Persisted so a refresh mid-session doesn't lose the celebrated milestones.
 */
export interface MilestoneState {
  pastReleaseTotal: number;
  lastBucket: number;
}

const DRAFT_KEY = 'writedown:draft';
const PREFS_KEY = 'writedown:prefs';
const MILESTONE_KEY = 'writedown:milestones';
const TIMER_KEY = 'writedown:timer';
const LEGACY_DRAFT_KEY = 'flow:draft';
const LEGACY_PREFS_KEY = 'flow:prefs';

export const MIN_SIZE = 14;
export const MAX_SIZE = 32;
export const SIZE_STEP = 2;

export const DEFAULT_PREFS: Prefs = {
  font: 'hand',
  size: 22,
  mode: 'rain',
  exportFormat: 'docx',
  releaseMode: 'burn',
};

export const DEFAULT_MILESTONES: MilestoneState = {
  pastReleaseTotal: 0,
  lastBucket: 0,
};

export function loadDraft(): string {
  try {
    const current = localStorage.getItem(DRAFT_KEY);
    if (current !== null) return current;
    const legacy = localStorage.getItem(LEGACY_DRAFT_KEY);
    if (legacy !== null) {
      localStorage.setItem(DRAFT_KEY, legacy);
      localStorage.removeItem(LEGACY_DRAFT_KEY);
      return legacy;
    }
    return '';
  } catch {
    return '';
  }
}

export function saveDraft(text: string): void {
  try {
    localStorage.setItem(DRAFT_KEY, text);
  } catch {
    /* quota or disabled */
  }
}

export function loadPrefs(): Prefs {
  try {
    let raw = localStorage.getItem(PREFS_KEY);
    if (!raw) {
      const legacy = localStorage.getItem(LEGACY_PREFS_KEY);
      if (legacy) {
        localStorage.setItem(PREFS_KEY, legacy);
        localStorage.removeItem(LEGACY_PREFS_KEY);
        raw = legacy;
      }
    }
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      font: isFontFamily(parsed.font) ? parsed.font : DEFAULT_PREFS.font,
      size: clampNum(parsed.size, MIN_SIZE, MAX_SIZE, DEFAULT_PREFS.size),
      mode: isMode(parsed.mode) ? parsed.mode : DEFAULT_PREFS.mode,
      exportFormat: isExportFormat(parsed.exportFormat) ? parsed.exportFormat : DEFAULT_PREFS.exportFormat,
      releaseMode: isReleaseMode(parsed.releaseMode) ? parsed.releaseMode : DEFAULT_PREFS.releaseMode,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* quota or disabled */
  }
}

export function loadMilestones(): MilestoneState {
  try {
    const raw = localStorage.getItem(MILESTONE_KEY);
    if (!raw) return DEFAULT_MILESTONES;
    const parsed = JSON.parse(raw) as Partial<MilestoneState>;
    return {
      pastReleaseTotal: typeof parsed.pastReleaseTotal === 'number' && parsed.pastReleaseTotal >= 0
        ? parsed.pastReleaseTotal : 0,
      lastBucket: typeof parsed.lastBucket === 'number' && parsed.lastBucket >= 0
        ? parsed.lastBucket : 0,
    };
  } catch {
    return DEFAULT_MILESTONES;
  }
}

export function saveMilestones(ms: MilestoneState): void {
  try {
    localStorage.setItem(MILESTONE_KEY, JSON.stringify(ms));
  } catch {
    /* quota or disabled */
  }
}

/**
 * Zen timer state. Persisted to sessionStorage (not localStorage) so it
 * survives accidental refresh within a tab but intentionally resets to a
 * fresh running phase when the user opens a new tab/window.
 */
export interface TimerState {
  phase: 'running' | 'resting';
  endTime: number;
}

export function loadTimer(): TimerState | null {
  try {
    const raw = sessionStorage.getItem(TIMER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TimerState>;
    if (
      (parsed.phase === 'running' || parsed.phase === 'resting') &&
      typeof parsed.endTime === 'number' &&
      Number.isFinite(parsed.endTime)
    ) {
      return { phase: parsed.phase, endTime: parsed.endTime };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveTimer(state: TimerState): void {
  try {
    sessionStorage.setItem(TIMER_KEY, JSON.stringify(state));
  } catch {
    /* quota or disabled */
  }
}

function isFontFamily(v: unknown): v is FontFamily {
  return v === 'hand' || v === 'serif' || v === 'sans';
}

function isMode(v: unknown): v is Mode {
  return v === 'rain' || v === 'snow' || v === 'star' || v === 'hearth';
}

function isExportFormat(v: unknown): v is ExportFormat {
  return v === 'md' || v === 'txt' || v === 'docx';
}

function isReleaseMode(v: unknown): v is ReleaseMode {
  return v === 'burn' || v === 'vapor' || v === 'melt' || v === 'ember';
}

function clampNum(v: unknown, lo: number, hi: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.max(lo, Math.min(hi, v));
}
