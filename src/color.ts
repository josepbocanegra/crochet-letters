/** Colour handling for the pattern: hex <-> HSL, and the colour-theory rules
 *  used to pick a background from the letter colour. Pure functions, no DOM. */

export interface Rgb {
  r: number
  g: number
  b: number
}

/** `h` in degrees (0-360), `s` and `l` in 0-1. */
export interface Hsl {
  h: number
  s: number
  l: number
}

/** Background rules that are computed from the letter colour. */
export type DerivedMode =
  | 'complementary'
  | 'split-complementary'
  | 'triadic'
  | 'analogous'
  | 'monochrome'

/** How the background colour is obtained: hand-picked or derived. */
export type BackgroundMode = 'custom' | DerivedMode

export const BACKGROUND_MODES: readonly { id: BackgroundMode; label: string }[] = [
  { id: 'custom', label: 'Custom' },
  { id: 'complementary', label: 'Complementary' },
  { id: 'split-complementary', label: 'Split complementary' },
  { id: 'analogous', label: 'Analogous' },
  { id: 'triadic', label: 'Triadic' },
  { id: 'monochrome', label: 'Monochrome' },
]

const HUE_STEP: Record<DerivedMode, number> = {
  complementary: 180,
  'split-complementary': 150,
  triadic: 120,
  analogous: 30,
  monochrome: 0,
}

/** How far the background lightness is pushed away from the letter's. */
const LIGHTNESS_GAP = 0.42

/** `#abc` or `#AABBCC` -> `#aabbcc`; anything else -> `null`. */
export function normalizeHex(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase()
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(trimmed)
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`
  return /^#[0-9a-f]{6}$/.test(trimmed) ? trimmed : null
}

export function hexToRgb(hex: string): Rgb {
  const clean = normalizeHex(hex)
  if (!clean) throw new Error(`Not a colour: ${hex}`)
  return {
    r: Number.parseInt(clean.slice(1, 3), 16),
    g: Number.parseInt(clean.slice(3, 5), 16),
    b: Number.parseInt(clean.slice(5, 7), 16),
  }
}

function channel(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)))
}

export function rgbToHex(rgb: Rgb): string {
  const part = (value: number): string => channel(value).toString(16).padStart(2, '0')
  return `#${part(rgb.r)}${part(rgb.g)}${part(rgb.b)}`
}

export function rgbToHsl(rgb: Rgb): Hsl {
  const r = channel(rgb.r) / 255
  const g = channel(rgb.g) / 255
  const b = channel(rgb.b) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const delta = max - min
  if (delta === 0) return { h: 0, s: 0, l }
  const s = delta / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === r) h = ((g - b) / delta) % 6
  else if (max === g) h = (b - r) / delta + 2
  else h = (r - g) / delta + 4
  h *= 60
  if (h < 0) h += 360
  return { h, s, l }
}

export function hslToRgb(hsl: Hsl): Rgb {
  const h = ((hsl.h % 360) + 360) % 360
  const s = Math.min(1, Math.max(0, hsl.s))
  const l = Math.min(1, Math.max(0, hsl.l))
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    h < 60 ? [c, x, 0]
    : h < 120 ? [x, c, 0]
    : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c]
    : h < 300 ? [x, 0, c]
    : [c, 0, x]
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }
}

/**
 * Background for a letter colour, by colour theory: the hue is rotated
 * (0/30/120/150/180 degrees) and the lightness is pushed to the opposite side
 * of the letter's, so the squares stay readable whatever the user picks.
 */
export function backgroundFor(inkHex: string, mode: DerivedMode): string {
  const ink = rgbToHsl(hexToRgb(inkHex))
  const h = ink.h + HUE_STEP[mode]
  const l =
    ink.l < 0.5
      ? Math.min(0.96, ink.l + LIGHTNESS_GAP)
      : Math.max(0.06, ink.l - LIGHTNESS_GAP)
  return rgbToHex(hslToRgb({ h, s: ink.s, l }))
}
