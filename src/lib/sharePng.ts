/**
 * Renders the share card to a 1200×630 PNG and the portrait Instagram card to
 * 1080×1350 (4:5), then downloads them. Hand-rolled canvas drawing only — no
 * image libraries, no external fonts. Every colour is read from the live theme
 * tokens, so both PNGs follow Paper or Stone. Rounded, shadowed boxes carry the
 * structure; there are no divider rules and no gradients.
 */
import { contributionCells, HEAT_COLORS, type ShareSnapshot } from './flexStats';
import { formatNumber } from './format';
import { localDayKey } from './time';
import type { CalendarDay } from './types';

const WIDTH = 1200;
const HEIGHT = 630;
const INSTA_WIDTH = 1080;
/** 4:5 portrait, the tallest crop Instagram shows in feed. */
const INSTA_HEIGHT = 1350;
const INSTA_MARGIN = 72;
/** 56 × 56 square cells, 6px apart: the 13-week strip is 800 × 428 at 140, 660. */
const INSTA_CELL = 56;
const INSTA_GAP = 6;
const INSTA_STEP = INSTA_CELL + INSTA_GAP;
const INSTA_WEEKS = 13;
const INSTA_DAYS = INSTA_WEEKS * 7;
const INSTA_GRID_LEFT = 140;
const INSTA_GRID_TOP = 660;
const INSTA_GRID_RIGHT = INSTA_GRID_LEFT + INSTA_WEEKS * INSTA_CELL + (INSTA_WEEKS - 1) * INSTA_GAP;
const DAY_MS = 86_400_000;
const INSTA_STAT_ROOM = 200;
/** The two hero boxes sit 20px apart; the second figure opens 30px inside its box. */
const INSTA_HERO_SPLIT = 576;
const INSTA_HERO_LABEL_Y = 150;
const INSTA_HERO_VALUE_Y = 270;
const INSTA_STAT_LEFT = 40;
const INSTA_STAT_COLUMN = 250;
const INSTA_STAT_WIDTH = 232;
const INSTA_STAT_HEIGHT = 100;
const INSTA_STAT_ROWS = [
  { boxY: 330, labelY: 360, valueY: 408 },
  { boxY: 446, labelY: 476, valueY: 524 },
];
const INSTA_CAPTION_Y = 610;
const INSTA_MONTH_Y = 636;
/** Legend and summary share one line 28px below the strip box's 1100 bottom. */
const INSTA_LEGEND_Y = 1128;
const INSTA_LEGEND_SWATCH = 14;
const INSTA_LEGEND_SWATCH_GAP = 4;
const INSTA_LEGEND_TEXT_GAP = 8;
/** 44px above the card's 1334 bottom edge; 52px below the band's 1238 bottom. */
const INSTA_FOOTER_Y = 1290;
/** Three 304px cells 12px apart under the legend: x 72, 388, 704; bottom 1238. */
const INSTA_BAND_Y = 1158;
const INSTA_BAND_W = 304;
const INSTA_BAND_H = 80;
const INSTA_BAND_GAP = 12;
const INSTA_BAND_PAD = 16;
const INSTA_BAND_LABEL_Y = 1174;
/** The value block is centred in this region — 6px under the label's 1174
 *  baseline — rather than hung under the label or parked on the cell's bottom,
 *  so a single line and a wrapped pair share one optical centre. */
const INSTA_BAND_REGION_TOP = INSTA_BAND_LABEL_Y + 6;
/** The region closes on the ink line: the cells' 1238 bottom minus 6. */
const INSTA_BAND_REGION_BOTTOM = INSTA_BAND_Y + INSTA_BAND_H - 6;
/** The last line's ink must stop at this line: 6px above the cells' 1238 bottom.
 *  A block centred in the region clears it by construction, so the guard only
 *  picks the size when an over-tall block falls back to top-anchoring. */
const INSTA_BAND_INK_LIMIT = INSTA_BAND_REGION_BOTTOM;
/** A tenth of a pixel of measureText rounding must not cost a 1px size step. */
const INSTA_BAND_INK_SLACK = 0.1;
const INSTA_BAND_BOXES = [0, 1, 2].map((index) => ({
  x: INSTA_MARGIN + index * (INSTA_BAND_W + INSTA_BAND_GAP), y: INSTA_BAND_Y, w: INSTA_BAND_W, h: INSTA_BAND_H, r: 12,
}));
/** Canvas, card and content boxes; the shadow carries the only edge between them. */
const DESKTOP_CARD = { x: 16, y: 16, w: 1168, h: 598, r: 20 };
const DESKTOP_HERO_BOXES = [
  { x: 40, y: 92, w: 544, h: 158, r: 14 },
  { x: 616, y: 92, w: 544, h: 158, r: 14 },
];
const DESKTOP_STAT_BOX = { x: 56, y: 270, w: 256, h: 54, r: 12, column: 272, row: 66 };
/** 7 square cells per column, 3px apart; the column count follows the cells. */
const DESKTOP_CELL = 17;
const DESKTOP_GAP = 3;
const DESKTOP_GRID_TOP = 419;
const DESKTOP_STRIP_BOX = { x: 40, y: 410, w: 1120, h: 156, r: 14 };
const INSTA_CARD = { x: 16, y: 16, w: 1048, h: 1318, r: 24 };
const INSTA_HERO_BOXES = [
  { x: 40, y: 110, w: 486, h: 180, r: 14 },
  { x: 546, y: 110, w: 486, h: 180, r: 14 },
];
const INSTA_STRIP_BOX = { x: 128, y: 648, w: 824, h: 452, r: 14 };
/** Field labels carry 0.12em of tracking; figures, legend and footer do not. */
const TRACKING = 0.12;
const BG = '#0A0A0A';
const PANEL = '#141414';
const EMPTY = '#1E1E1E';
const LINE = '#282828';
const SHADOW_STONE = 'rgba(0,0,0,0.45)';
const SHADOW_PAPER = 'rgba(20,20,19,0.10)';
const INK = '#EEEEEE';
const IVORY = '#FFF7F1';
const MUTED = '#808080';
const INK_SOFT = '#C9C7C3';
const ACCENT = '#EC5B2B';
const MONO = "Consolas, 'Cascadia Mono', 'Courier New', monospace";
// Palatino has lining figures; Georgia's old-style figures give 4/5/7/9 a
// different ascent and a descender, which makes a canvas hero look broken.
const SERIF = "'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, 'Times New Roman', serif";
const STAT_LABEL_WIDTH = 232;
const MONTH_LABELS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

interface Palette {
  bg: string; panel: string; ink: string; ivory: string; muted: string; inkSoft: string; accent: string; empty: string; zero: string;
  shadow: string;
  heat: string[];
}

/** Reads the active theme once per render; the constants are the Stone fallbacks. */
function readPalette(): Palette {
  const css = typeof getComputedStyle === 'function' ? getComputedStyle(document.documentElement) : null;
  const token = (name: string, fallback: string): string => css?.getPropertyValue(name).trim() || fallback;
  const theme = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : null;
  return {
    bg: token('--bg', BG),
    panel: token('--panel', PANEL),
    ink: token('--ink', INK),
    ivory: token('--ivory', IVORY),
    muted: token('--muted', MUTED),
    inkSoft: token('--ink-soft', INK_SOFT),
    accent: token('--accent', ACCENT),
    empty: token('--elem', EMPTY),
    // Box fills stay --elem, so a no-usage day and a pad cell sit on the box
    // tone, not the Activity panel's: --cell-empty-box is the neutral that
    // matches an --elem backdrop and is deliberately not a heat tint, so an
    // empty day never reads as level 1. The fallback is Stone's --line, for a
    // theme that predates the token.
    zero: token('--cell-empty-box', LINE),
    shadow: theme === 'paper' ? SHADOW_PAPER : SHADOW_STONE,
    heat: HEAT_COLORS.map((fallback, index) => token(`--h${index}`, fallback)),
  };
}

interface Box {
  x: number; y: number; w: number; h: number; r: number;
}

/** Fills one rounded box with a soft drop shadow; every caller restores its own state. */
function fillBox(ctx: CanvasRenderingContext2D, box: Box, fill: string, palette: Palette, blur: number, offsetY: number): void {
  ctx.save();
  ctx.shadowColor = palette.shadow;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = offsetY;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.w, box.h, box.r);
  ctx.fill();
  ctx.restore();
}

function spacedWidth(ctx: CanvasRenderingContext2D, text: string, spacing: number): number {
  let width = 0;
  for (const character of text) width += ctx.measureText(character).width + spacing;
  return Math.max(0, width - spacing);
}

function drawSpaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number): void {
  let cursor = x;
  for (const character of text) {
    ctx.fillText(character, cursor, y);
    cursor += ctx.measureText(character).width + spacing;
  }
}

/**
 * Largest integer size ≤ base whose width still fits `maxWidth`; never below
 * min. `tracking` is the letter spacing in px at `base`, scaled with the size,
 * and 0 means the text is drawn unspaced.
 */
function fitSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: (size: number) => string,
  tracking: number,
  maxWidth: number,
  base: number,
  min: number,
): number {
  const widthAt = (size: number): number => {
    ctx.font = font(size);
    const spacing = tracking * (size / base);
    return spacing > 0 ? spacedWidth(ctx, text, spacing) : ctx.measureText(text).width;
  };
  for (let size = Math.max(min, Math.floor(base)); size > min; size -= 1) {
    if (widthAt(size) <= maxWidth) return size;
  }
  widthAt(min);
  return min;
}

/** Break opportunities inside a long token, tried before a raw character cut. */
const BREAK_AFTER = '/-._';

/**
 * Greedy wrap at spaces, preferring a slash break when the rest of the token
 * fits, then the last of `/ - . _`; a token wider than the line is hard-broken
 * by characters. Returns at most `maxLines`, non-empty lines, and ellipsises
 * the last one only when the text does not fit.
 */
function wrapToLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const measure = (value: string): number => ctx.measureText(value).width;
  const breakToken = (token: string): string[] => {
    const chunks: string[] = [];
    let rest = token;
    while (measure(rest) > maxWidth) {
      let cut = 1;
      for (let index = 2; index <= rest.length; index += 1) {
        if (measure(rest.slice(0, index)) > maxWidth) break;
        cut = index;
      }
      // Prefer a slash when the remainder still fits one line, then the last
      // of `/ - . _` at or before the hard cut, then a raw character cut.
      const slash = rest.lastIndexOf('/', cut - 1);
      if (slash > 0 && measure(rest.slice(slash + 1)) <= maxWidth) {
        cut = slash + 1;
      } else {
        for (let index = cut; index > 1; index -= 1) {
          if (BREAK_AFTER.includes(rest[index - 1])) {
            cut = index;
            break;
          }
        }
      }
      chunks.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    if (rest) chunks.push(rest);
    return chunks;
  };

  const lines: string[] = [];
  let line = '';
  for (const token of text.split(/\s+/).filter(Boolean)) {
    if (measure(token) <= maxWidth && (!line || measure(`${line} ${token}`) <= maxWidth)) {
      line = line ? `${line} ${token}` : token;
      continue;
    }
    if (line) {
      lines.push(line);
      line = '';
    }
    if (measure(token) <= maxWidth) {
      line = token;
      continue;
    }
    const chunks = breakToken(token);
    lines.push(...chunks.slice(0, -1));
    line = chunks[chunks.length - 1] ?? '';
  }
  if (line) lines.push(line);
  if (lines.length === 0) return [''];
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last.length > 0 && measure(`${last}…`) > maxWidth) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last.trimEnd()}…`;
  return kept;
}

/** UTC-midnight of the Monday that opens the week containing `date`. */
function mondayOf(date: Date): Date {
  const midnight = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return new Date(midnight - ((new Date(midnight).getUTCDay() + 6) % 7) * DAY_MS);
}

/** The first Monday of the 13-week strip: 12 weeks before this week's. */
function windowStart(today: Date): Date {
  return new Date(mondayOf(today).getTime() - (INSTA_WEEKS - 1) * 7 * DAY_MS);
}

/**
 * 13 Monday-started weeks ending with the current week: the Monday 12 weeks
 * back through the coming Sunday. There is no leading pad, so column 0 is a
 * full Mon–Sun week and only the future days of this week stay empty.
 */
function instagramCells(days: CalendarDay[], today: Date = new Date()): (CalendarDay | null)[] {
  const first = windowStart(today);
  const byDate = new Map(days.map((day) => [day.date, day]));
  return Array.from({ length: INSTA_DAYS }, (_, index) => {
    const date = new Date(first.getTime() + index * DAY_MS).toISOString().slice(0, 10);
    return byDate.get(date) ?? null;
  });
}

/**
 * Each month's first column in the 13-week strip, labelled above the grid.
 * Comparing against the Monday before the window skips a partial leading week
 * (Jul here) instead of labelling a month that only starts before the strip.
 */
function monthStarts(start: Date): { column: number; label: string }[] {
  const starts: { column: number; label: string }[] = [];
  let previous = new Date(start.getTime() - 7 * DAY_MS).getUTCMonth();
  for (let column = 0; column < INSTA_WEEKS; column += 1) {
    const month = new Date(start.getTime() + column * 7 * DAY_MS).getUTCMonth();
    if (month !== previous) starts.push({ column, label: MONTH_LABELS[month] });
    previous = month;
  }
  return starts;
}

/** Active days and the longest consecutive run, both in one pass over the strip. */
function activitySummary(days: CalendarDay[]): { activeDays: number; streak: number } {
  let activeDays = 0;
  let streak = 0;
  let run = 0;
  let previous = Number.NaN;
  for (const day of days) {
    const date = Date.parse(`${day.date}T00:00:00.000Z`);
    if (day.level > 0) activeDays += 1;
    run = day.level > 0 ? (date - previous === DAY_MS ? run + 1 : 1) : 0;
    if (run > streak) streak = run;
    previous = date;
  }
  return { activeDays, streak };
}

/**
 * True for a real day outside the selected window. A cell with usage keeps
 * its place and recedes to the Activity calendar's 22%, the on-screen
 * .cellOut weight; a level-0 day and a pad never dim. Both strips share this
 * check.
 */
function outsideRange(day: CalendarDay | null, share: ShareSnapshot): boolean {
  return day !== null && (day.date < share.rangeFrom || day.date > share.rangeTo);
}

async function savePng(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadPng(share: ShareSnapshot): Promise<void> {
  if (typeof document === 'undefined') return;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const palette = readPalette();
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Card surface, then the content boxes: every edge is a soft shadow, no rules.
    fillBox(ctx, DESKTOP_CARD, palette.panel, palette, 32, 10);
    DESKTOP_HERO_BOXES.forEach((box) => fillBox(ctx, box, palette.empty, palette, 18, 6));
    fillBox(ctx, DESKTOP_STRIP_BOX, palette.empty, palette, 18, 6);
    share.stats.forEach((_, index) => {
      const column = index % 4;
      const row = Math.floor(index / 4);
      fillBox(
        ctx,
        { x: DESKTOP_STAT_BOX.x + column * DESKTOP_STAT_BOX.column, y: DESKTOP_STAT_BOX.y + row * DESKTOP_STAT_BOX.row, w: DESKTOP_STAT_BOX.w, h: DESKTOP_STAT_BOX.h, r: DESKTOP_STAT_BOX.r },
        palette.empty,
        palette,
        14,
        4,
      );
    });
    ctx.textBaseline = 'alphabetic';

    // Wordmark, with the period in the single accent.
    ctx.font = `500 20px ${MONO}`;
    ctx.fillStyle = palette.ivory;
    const mark = 'opencode';
    ctx.fillText(mark, 56, 58);
    ctx.fillStyle = palette.accent;
    ctx.fillText('.', 56 + ctx.measureText(mark).width, 58);

    // Kicker, right-aligned inside the half the wordmark leaves free.
    const kicker = `USAGE DASHBOARD / ${share.year || '—'}`;
    const kickerSize = fitSize(ctx, kicker, (size) => `${size}px ${MONO}`, 2, WIDTH / 2 - 56, 11, 8);
    const kickerSpacing = 2 * (kickerSize / 11);
    ctx.font = `${kickerSize}px ${MONO}`;
    ctx.fillStyle = palette.muted;
    drawSpaced(ctx, kicker, WIDTH - 56 - spacedWidth(ctx, kicker, kickerSpacing), 58, kickerSpacing);

    // Two heroes: the labels sit above their values, like the card does. The
    // figure is the active card's computed total, never the provider invoice.
    const metered = share.card === 'metered';
    const heroes = [
      { label: 'TOKENS', value: share.tokensLabel },
      { label: metered ? 'METERED COST' : 'ESTIMATED COST', value: share.costLabel },
    ];
    heroes.forEach((hero, index) => {
      const x = 56 + index * 574;
      const room = (index === 0 ? 584 : 1160) - x - 16;
      const labelSize = fitSize(ctx, hero.label, (size) => `${size}px ${MONO}`, 1.56, room, 13, 9);
      ctx.fillStyle = palette.inkSoft;
      ctx.font = `${labelSize}px ${MONO}`;
      drawSpaced(ctx, hero.label, x, 128, 1.56 * (labelSize / 13));
      const valueSize = fitSize(ctx, hero.value, (size) => `400 ${size}px ${SERIF}`, 0, room, 100, 40);
      ctx.fillStyle = palette.ivory;
      ctx.font = `400 ${valueSize}px ${SERIF}`;
      ctx.fillText(hero.value, x, 216);
    });

    // Stats: the same 4 × 2 adaptive set the DOM card renders, one size for all.
    share.stats.forEach((stat, index) => {
      const column = index % 4;
      const row = Math.floor(index / 4);
      const x = DESKTOP_STAT_BOX.x + column * DESKTOP_STAT_BOX.column + 12;
      const labelY = DESKTOP_STAT_BOX.y + 20 + row * DESKTOP_STAT_BOX.row;
      const valueY = labelY + 26;
      const labelSize = fitSize(ctx, stat.label, (size) => `${size}px ${MONO}`, 1.2, STAT_LABEL_WIDTH, 9, 7);
      ctx.fillStyle = palette.muted;
      ctx.font = `${labelSize}px ${MONO}`;
      drawSpaced(ctx, stat.label, x, labelY, 1.2 * (labelSize / 9));
      const valueSize = fitSize(ctx, stat.value, (size) => `400 ${size}px ${SERIF}`, 0, STAT_LABEL_WIDTH, 27, 15);
      ctx.fillStyle = palette.ink;
      ctx.font = `400 ${valueSize}px ${SERIF}`;
      ctx.fillText(stat.value, x, valueY);
    });

    // Contribution strip: seven rows of square cells, Monday-first, one column
    // per week and centred in the strip box at the dashboard's proportions.
    // Days with usage outside the selected range draw at 22%: the strip box
    // behind them is `palette.empty`, so plain alpha reproduces the DOM's
    // opacity without a canvas filter. A level-0 day keeps full opacity, on
    // `palette.zero`.
    const cells = contributionCells(share.days);
    const weeks = Math.max(1, Math.ceil(cells.length / 7));
    const step = DESKTOP_CELL + DESKTOP_GAP;
    const gridWidth = weeks * DESKTOP_CELL + (weeks - 1) * DESKTOP_GAP;
    const left = (WIDTH - gridWidth) / 2;
    cells.forEach((day, index) => {
      const x = left + Math.floor(index / 7) * step;
      const y = DESKTOP_GRID_TOP + (index % 7) * step;
      ctx.globalAlpha = day !== null && day.level > 0 && outsideRange(day, share) ? 0.22 : 1;
      ctx.fillStyle = day && day.level > 0 ? palette.heat[day.level] : palette.zero;
      ctx.fillRect(x, y, DESKTOP_CELL, DESKTOP_CELL);
    });
    ctx.globalAlpha = 1;

    // Footer: the selected range, never a lifetime span.
    const footerSize = fitSize(ctx, share.footer, (size) => `${size}px ${MONO}`, 0, 1088, 10, 8);
    ctx.fillStyle = palette.muted;
    ctx.font = `${footerSize}px ${MONO}`;
    ctx.fillText(share.footer, 56, 590);

    // The model rides the footer's baseline on the right: this card has no band
    // to carry it. It keeps a 32px gutter from the range, easing from 10px to
    // 8px and only trimming when even that cannot fit.
    if (share.topModelEntry) {
      const right = WIDTH - 56;
      const room = right - (56 + ctx.measureText(share.footer).width) - 32;
      let entry = `TOP MODEL · ${share.topModelEntry.name}`;
      const entrySize = fitSize(ctx, entry, (size) => `${size}px ${MONO}`, 0, room, 10, 8);
      ctx.font = `${entrySize}px ${MONO}`;
      if (ctx.measureText(entry).width > room) {
        while (entry.length > 0 && ctx.measureText(`${entry}…`).width > room) entry = entry.slice(0, -1);
        entry = `${entry.trimEnd()}…`;
      }
      ctx.fillText(entry, right - ctx.measureText(entry).width, 590);
    }

    // The filename follows the export's local day, like the CSV exports, not
    // the last data day: a quiet day must not freeze the name.
    await savePng(canvas, `opencode-usage-${localDayKey(Date.now())}.png`);
  } catch {
    /* a blocked download or canvas must not break the tab */
  }
}

/**
 * Vertical geometry of one band cell's value block at `size`: the first
 * baseline that centres the block's ink between the region top and bottom, and
 * the last line's ink bottom. Measuring the real ascent of the first line and
 * descent of the last centres the ink itself, so `FAM`, `73,913` and a wrapped
 * two-line name share one optical centre even though their ink heights differ.
 * A block taller than the region falls back to top-anchoring, and the size
 * search's guard then shrinks it.
 */
function bandValueBlock(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  size: number,
): { firstBaseline: number; inkBottom: number } {
  const ascent = ctx.measureText(lines[0]).actualBoundingBoxAscent;
  const descent = ctx.measureText(lines[lines.length - 1]).actualBoundingBoxDescent;
  const height = (lines.length - 1) * size * 1.08 + ascent + descent;
  const region = INSTA_BAND_REGION_BOTTOM - INSTA_BAND_REGION_TOP;
  const firstBaseline = height > region
    ? INSTA_BAND_REGION_TOP + ascent
    : INSTA_BAND_REGION_TOP + (region - height) / 2 + ascent;
  return { firstBaseline, inkBottom: firstBaseline + (lines.length - 1) * size * 1.08 + descent };
}

/** 1080 × 1350 portrait card: two heroes on one row, 13 weeks of 56px squares. */
export async function downloadInstagram(share: ShareSnapshot): Promise<void> {
  if (typeof document === 'undefined') return;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = INSTA_WIDTH;
    canvas.height = INSTA_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const palette = readPalette();
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, INSTA_WIDTH, INSTA_HEIGHT);

    // Card and rounded content boxes; no hairlines anywhere.
    fillBox(ctx, INSTA_CARD, palette.panel, palette, 32, 10);
    INSTA_HERO_BOXES.forEach((box) => fillBox(ctx, box, palette.empty, palette, 18, 6));
    share.stats.forEach((_, index) => {
      const column = index % 4;
      const row = INSTA_STAT_ROWS[Math.floor(index / 4)] ?? INSTA_STAT_ROWS[0];
      fillBox(
        ctx,
        { x: INSTA_STAT_LEFT + column * INSTA_STAT_COLUMN, y: row.boxY, w: INSTA_STAT_WIDTH, h: INSTA_STAT_HEIGHT, r: 12 },
        palette.empty,
        palette,
        14,
        4,
      );
    });
    fillBox(ctx, INSTA_STRIP_BOX, palette.empty, palette, 18, 6);
    INSTA_BAND_BOXES.forEach((box) => fillBox(ctx, box, palette.empty, palette, 14, 4));
    ctx.textBaseline = 'alphabetic';

    const right = INSTA_WIDTH - INSTA_MARGIN;

    // Wordmark, with the period in the single accent.
    ctx.font = `500 26px ${MONO}`;
    ctx.fillStyle = palette.ivory;
    const mark = 'opencode';
    ctx.fillText(mark, INSTA_MARGIN, 64);
    ctx.fillStyle = palette.accent;
    ctx.fillText('.', INSTA_MARGIN + ctx.measureText(mark).width, 64);

    // Kicker, right-aligned on the wordmark's baseline.
    ctx.font = `12px ${MONO}`;
    ctx.fillStyle = palette.muted;
    const kicker = `USAGE DASHBOARD / ${share.year || '—'}`;
    drawSpaced(ctx, kicker, right - spacedWidth(ctx, kicker, 2), 64, 2);

    // Both heroes share one row, labels above their figures. The figure is the
    // active card's computed total, never the provider invoice. Each figure
    // shrinks inside its own box; a long total never crosses the gutter.
    const metered = share.card === 'metered';
    const heroes = [
      { x: INSTA_MARGIN, label: 'TOKENS', value: share.tokensLabel },
      { x: INSTA_HERO_SPLIT, label: metered ? 'METERED COST' : 'ESTIMATED COST', value: share.costLabel },
    ];
    heroes.forEach((hero, index) => {
      const room = (index === 0 ? 526 : 1032) - hero.x - 16;
      const labelSize = fitSize(ctx, hero.label, (size) => `${size}px ${MONO}`, 16 * TRACKING, room, 16, 12);
      ctx.fillStyle = palette.inkSoft;
      ctx.font = `${labelSize}px ${MONO}`;
      drawSpaced(ctx, hero.label, hero.x, INSTA_HERO_LABEL_Y, 16 * TRACKING * (labelSize / 16));
      const valueSize = fitSize(ctx, hero.value, (size) => `400 ${size}px ${SERIF}`, 0, room, 132, 60);
      ctx.fillStyle = palette.ivory;
      ctx.font = `400 ${valueSize}px ${SERIF}`;
      ctx.fillText(hero.value, hero.x, INSTA_HERO_VALUE_Y);
    });

    // The same 8 adaptive cells, 50px figures on 12px labels. Labels are
    // single-line and shrink before they can cross their box; figures fit per
    // cell, so `11:00–12:00` only eases down as far as it needs.
    share.stats.forEach((stat, index) => {
      const column = index % 4;
      const row = INSTA_STAT_ROWS[Math.floor(index / 4)] ?? INSTA_STAT_ROWS[0];
      const x = INSTA_STAT_LEFT + column * INSTA_STAT_COLUMN + 16;
      const label = stat.label.toUpperCase();
      const labelSize = fitSize(ctx, label, (size) => `${size}px ${MONO}`, 12 * TRACKING, INSTA_STAT_ROOM, 12, 9);
      ctx.fillStyle = palette.muted;
      ctx.font = `${labelSize}px ${MONO}`;
      drawSpaced(ctx, label, x, row.labelY, 12 * TRACKING * (labelSize / 12));
      const valueSize = fitSize(ctx, stat.value, (size) => `400 ${size}px ${SERIF}`, 0, INSTA_STAT_ROOM, 50, 26);
      ctx.fillStyle = palette.ink;
      ctx.font = `400 ${valueSize}px ${SERIF}`;
      ctx.fillText(stat.value, x, row.valueY);
    });

    // 13 Monday-started weeks of contribution cells, 56 × 56 with 6px gaps:
    // 800 × 428, flush with the box's 12px padding. A full year is unreadable
    // on a phone, so the strip stops at the window ending this week. Days with
    // usage outside the selected range draw at 22%, like the landscape strip;
    // level-0 days stay at full opacity.
    const today = new Date();
    const cells = instagramCells(share.days, today);
    cells.forEach((day, index) => {
      const x = INSTA_GRID_LEFT + Math.floor(index / 7) * INSTA_STEP;
      const y = INSTA_GRID_TOP + (index % 7) * INSTA_STEP;
      ctx.globalAlpha = day !== null && day.level > 0 && outsideRange(day, share) ? 0.22 : 1;
      ctx.fillStyle = day && day.level > 0 ? palette.heat[day.level] : palette.zero;
      ctx.fillRect(x, y, INSTA_CELL, INSTA_CELL);
    });
    ctx.globalAlpha = 1;

    // The span caption holds its own line above the strip; the month labels sit
    // above their first column and the grid opens below them.
    const months = monthStarts(windowStart(today));
    ctx.fillStyle = palette.muted;
    ctx.font = `14px ${MONO}`;
    const span = 'LAST 3 MONTHS';
    drawSpaced(ctx, span, INSTA_MARGIN, INSTA_CAPTION_Y, 14 * TRACKING);
    ctx.font = `12px ${MONO}`;
    months.forEach((month) => drawSpaced(ctx, month.label, INSTA_GRID_LEFT + month.column * INSTA_STEP, INSTA_MONTH_Y, 12 * TRACKING));

    // Weekday gutter: Monday-first rows, every other row labelled at its centre.
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.font = `12px ${MONO}`;
    ['MON', 'WED', 'FRI'].forEach((label, index) => {
      drawSpaced(ctx, label, INSTA_MARGIN, INSTA_GRID_TOP + index * 2 * INSTA_STEP + INSTA_CELL / 2, 12 * TRACKING);
    });
    ctx.restore();

    // Active days and longest run, left on the legend's baseline. The summary
    // fits into the 700px left of the legend; the legend keeps its 12px metric.
    const summary = activitySummary(share.days);
    const summaryText = `${summary.activeDays} ACTIVE DAYS · ${summary.streak}-DAY STREAK`;
    const summarySize = fitSize(ctx, summaryText, (size) => `${size}px ${MONO}`, 0, 700, 12, 9);
    ctx.fillStyle = palette.muted;
    ctx.font = `${summarySize}px ${MONO}`;
    ctx.fillText(summaryText, INSTA_MARGIN, INSTA_LEGEND_Y);

    // GitHub-style legend, right-aligned to the grid's edge. Positions run
    // right to left so `More` ends exactly at x=940.
    ctx.font = `12px ${MONO}`;
    const swatches = [palette.zero, palette.heat[1], palette.heat[2], palette.heat[3], palette.heat[4]];
    const moreWidth = ctx.measureText('More').width;
    const moreX = INSTA_GRID_RIGHT - moreWidth;
    ctx.fillText('More', moreX, INSTA_LEGEND_Y);
    let cursor = moreX - INSTA_LEGEND_TEXT_GAP;
    // 14px squares centred on the 12px caps, whose centre sits 4px above the baseline.
    const swatchTop = INSTA_LEGEND_Y - 11;
    for (let index = swatches.length - 1; index >= 0; index -= 1) {
      cursor -= INSTA_LEGEND_SWATCH;
      ctx.fillStyle = swatches[index];
      ctx.beginPath();
      ctx.roundRect(cursor, swatchTop, INSTA_LEGEND_SWATCH, INSTA_LEGEND_SWATCH, 2);
      ctx.fill();
      cursor -= INSTA_LEGEND_SWATCH_GAP;
    }
    cursor += INSTA_LEGEND_SWATCH_GAP;
    ctx.fillStyle = palette.muted;
    ctx.fillText('Less', cursor - INSTA_LEGEND_TEXT_GAP - ctx.measureText('Less').width, INSTA_LEGEND_Y);

    // Three cells pin the range's top project, its top model and its messages.
    // Names stand alone and run in full: the row shares the one size the
    // longest name needs to wrap onto two lines, so all three stay even. Each
    // value block is centred in the space between its label and the cell's
    // 1232 ink line, so a one-line value sits as low as a wrapped pair's
    // optical middle and the row's three centres line up.
    const bandCells = [
      { label: 'TOP PROJECT', empty: !share.topProjectEntry, value: share.topProjectEntry ? share.topProjectEntry.name : '—' },
      { label: 'TOP MODEL', empty: !share.topModelEntry, value: share.topModelEntry ? share.topModelEntry.name : '—' },
      { label: 'MESSAGES', empty: false, value: formatNumber(share.messages) },
    ];
    const bandRoom = INSTA_BAND_W - INSTA_BAND_PAD * 2;
    let bandSize = 16;
    for (let size = 28; size >= 16; size -= 1) {
      ctx.font = `400 ${size}px ${SERIF}`;
      const fits = bandCells.every((cell) => {
        const lines = wrapToLines(ctx, cell.value, bandRoom, 3);
        if (lines.length > 2) return false;
        const { inkBottom } = bandValueBlock(ctx, lines, size);
        return inkBottom <= INSTA_BAND_INK_LIMIT + INSTA_BAND_INK_SLACK;
      });
      if (fits) {
        bandSize = size;
        break;
      }
    }
    const bandLine = bandSize * 1.08;
    bandCells.forEach((cell, index) => {
      const box = INSTA_BAND_BOXES[index];
      ctx.fillStyle = palette.muted;
      ctx.font = `10px ${MONO}`;
      drawSpaced(ctx, cell.label, box.x + INSTA_BAND_PAD, INSTA_BAND_LABEL_Y, 10 * TRACKING);
      ctx.fillStyle = cell.empty ? palette.muted : palette.ink;
      ctx.font = `400 ${bandSize}px ${SERIF}`;
      const lines = wrapToLines(ctx, cell.value, bandRoom, 2);
      // The block is vertically centred in the cell below the label — not hung
      // under the label — so a single line sits at the wrapped pair's optical middle.
      const { firstBaseline } = bandValueBlock(ctx, lines, bandSize);
      lines.forEach((line, lineIndex) => {
        ctx.fillText(line, box.x + INSTA_BAND_PAD, firstBaseline + lineIndex * bandLine);
      });
    });

    // Footer: the selected range, never a lifetime span.
    const footerSize = fitSize(ctx, share.footer, (size) => `${size}px ${MONO}`, 0, right - INSTA_MARGIN, 12, 9);
    ctx.fillStyle = palette.muted;
    ctx.font = `${footerSize}px ${MONO}`;
    ctx.fillText(share.footer, INSTA_MARGIN, INSTA_FOOTER_Y);

    // The filename follows the export's local day, like the CSV exports, not
    // the last data day: a quiet day must not freeze the name.
    await savePng(canvas, `opencode-instagram-${localDayKey(Date.now())}.png`);
  } catch {
    /* a blocked download or canvas must not break the tab */
  }
}
