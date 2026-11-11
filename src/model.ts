export const MIN_STITCHES = 8
export const MAX_STITCHES = 80
export const DEFAULT_WIDTH = 16
export const DEFAULT_HEIGHT = 20
export const DEFAULT_LETTER = 'A'
export const CELL_PX = 20
export const MIN_INK_PERCENT = 5
export const MAX_INK_PERCENT = 95
export const DEFAULT_INK_PERCENT = 50

export const INK = '#32243f'
export const PAPER = '#fbf8fd'
export const GRID_LINE = '#d5c6e4'

export interface FontChoice {
  id: string
  name: string
  family: string
  weight: number
}

export const FONTS: readonly FontChoice[] = [
  { id: 'archivo', name: 'Archivo', family: 'Archivo', weight: 700 },
  { id: 'lilita-one', name: 'Lilita One', family: 'Lilita One', weight: 400 },
  { id: 'fraunces', name: 'Fraunces', family: 'Fraunces', weight: 700 },
  { id: 'nunito', name: 'Nunito', family: 'Nunito', weight: 700 },
  { id: 'roboto-mono', name: 'Roboto Mono', family: 'Roboto Mono', weight: 500 },
  { id: 'silkscreen', name: 'Silkscreen', family: 'Silkscreen', weight: 400 },
  { id: 'oswald', name: 'Oswald', family: 'Oswald', weight: 600 },
  { id: 'fredoka', name: 'Fredoka', family: 'Fredoka', weight: 600 },
  { id: 'bungee', name: 'Bungee', family: 'Bungee', weight: 400 },
  { id: 'luckiest-guy', name: 'Luckiest Guy', family: 'Luckiest Guy', weight: 400 },
  { id: 'black-ops-one', name: 'Black Ops One', family: 'Black Ops One', weight: 400 },
]

export const DEFAULT_FONT_ID = FONTS[0].id

export function fontById(id: string): FontChoice {
  const font = FONTS.find((item) => item.id === id)
  if (!font) throw new Error(`Unknown font: ${id}`)
  return font
}

export function fontShorthand(font: FontChoice, sizePx: number): string {
  return `${font.weight} ${sizePx}px "${font.family}"`
}

export function commitInkPercent(raw: number, current: number): number {
  if (!Number.isFinite(raw)) return current
  const rounded = Math.round(raw)
  return Math.min(MAX_INK_PERCENT, Math.max(MIN_INK_PERCENT, rounded))
}

export function commitStitchCount(raw: string, current: number): number {
  const trimmed = raw.trim()
  if (!/^[0-9]+(?:\.[0-9]+)?$/.test(trimmed)) return current
  const rounded = Math.round(Number(trimmed))
  if (!Number.isFinite(rounded)) return current
  return Math.min(MAX_STITCHES, Math.max(MIN_STITCHES, rounded))
}

const LETTER = /[A-Za-z0-9ÑñÇçáéíóúàèìòùüÁÉÍÓÚÀÈÌÒÙÜ]/
const MARK_ONLY = /^[\u0300\u0301\u0303\u0308\u0327]+$/

export function firstLetter(raw: string, current = ''): string | null {
  const source = MARK_ONLY.test(raw) && current ? current + raw : raw
  const match = source.normalize('NFC').match(LETTER)
  return match ? match[0] : null
}

export function rowStartsOnRight(rowNumber: number): boolean {
  return rowNumber % 2 === 1
}

export function heading(letter: string, fontName: string, width: number, height: number): string {
  return `${letter} · ${fontName} · ${width}×${height}`
}

export function pdfFilename(letter: string, fontName: string, width: number, height: number): string {
  return `${letter}-${fontName.replace(/ /g, '-')}-${width}x${height}.pdf`
}

export interface Pattern {
  letter: string
  fontName: string
  width: number
  height: number
  /** `cells[y][x]` with y = 0 at the top of the chart. The top row is the highest row number. */
  cells: boolean[][]
  /** Colour of the inked squares. Falls back to `INK`. */
  inkColor?: string
  /** Colour of the empty squares. Falls back to `PAPER`. */
  paperColor?: string
}
