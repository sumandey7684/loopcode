/**
 * Theme tokens. Components must never hardcode colour names or glyphs.
 *
 * Accessibility contract:
 *  - NO_COLOR (any value) disables all colour.
 *  - LOOPCODE_ASCII=1 or a non-UTF-8 locale switches to ASCII glyphs.
 *  - Every state is distinguishable by glyph and text alone.
 */

export interface Palette {
  accent: string;
  accentDim: string;
  success: string;
  warning: string;
  danger: string;
  muted: string;
  text: string;
  inverseBg: string;
}

export interface Glyphs {
  marker: string;
  branch: string;
  pass: string;
  fail: string;
  pending: string;
  running: string;
  warn: string;
  prompt: string;
  bullet: string;
  arrow: string;
  spinner: string[];
  boxTopLeft: string;
  boxTopRight: string;
  boxBottomLeft: string;
  boxBottomRight: string;
  boxH: string;
  boxV: string;
}

const UNICODE_GLYPHS: Glyphs = {
  marker: '⏺',
  branch: '⎿',
  pass: '✓',
  fail: '✗',
  pending: '○',
  running: '◐',
  warn: '⚠',
  prompt: '>',
  bullet: '·',
  arrow: '→',
  spinner: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  boxTopLeft: '╭',
  boxTopRight: '╮',
  boxBottomLeft: '╰',
  boxBottomRight: '╯',
  boxH: '─',
  boxV: '│',
};

const ASCII_GLYPHS: Glyphs = {
  marker: '*',
  branch: '\\',
  pass: '+',
  fail: 'x',
  pending: 'o',
  running: '>',
  warn: '!',
  prompt: '>',
  bullet: '-',
  arrow: '->',
  spinner: ['|', '/', '-', '\\'],
  boxTopLeft: '+',
  boxTopRight: '+',
  boxBottomLeft: '+',
  boxBottomRight: '+',
  boxH: '-',
  boxV: '|',
};

const DARK: Palette = {
  accent: 'cyan',
  accentDim: 'blueBright',
  success: 'green',
  warning: 'yellow',
  danger: 'red',
  muted: 'gray',
  text: 'white',
  inverseBg: 'cyan',
};

const LIGHT: Palette = {
  accent: 'blue',
  accentDim: 'blueBright',
  success: 'green',
  warning: 'yellow',
  danger: 'red',
  muted: 'gray',
  text: 'black',
  inverseBg: 'blue',
};

const MONO: Palette = {
  accent: 'white',
  accentDim: 'gray',
  success: 'white',
  warning: 'white',
  danger: 'white',
  muted: 'gray',
  text: 'white',
  inverseBg: 'white',
};

export interface Theme {
  palette: Palette;
  glyphs: Glyphs;
  /** When false, components must pass `undefined` for every colour prop. */
  color: boolean;
}

function detectAscii(explicit: boolean): boolean {
  if (explicit) return true;
  if (process.env.LOOPCODE_ASCII === '1') return true;
  const locale = process.env.LC_ALL || process.env.LC_CTYPE || process.env.LANG || '';
  if (locale && !/utf-?8/i.test(locale)) return true;
  return false;
}

export function buildTheme(options?: { mode?: 'auto' | 'dark' | 'light' | 'mono'; ascii?: boolean }): Theme {
  const noColor = Boolean(process.env.NO_COLOR);
  const mode = options?.mode ?? 'auto';

  const palette = noColor || mode === 'mono' ? MONO : mode === 'light' ? LIGHT : DARK;

  return {
    palette,
    glyphs: detectAscii(Boolean(options?.ascii)) ? ASCII_GLYPHS : UNICODE_GLYPHS,
    color: !noColor && mode !== 'mono',
  };
}

/** Helper so components can write color={c(theme, 'success')} and get undefined when colour is off. */
export function c(theme: Theme, token: keyof Palette): string | undefined {
  return theme.color ? theme.palette[token] : undefined;
}
