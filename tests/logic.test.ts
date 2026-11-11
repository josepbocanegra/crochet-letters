import {
  commitInkPercent,
  commitStitchCount,
  firstLetter,
  heading,
  pdfFilename,
  rowStartsOnRight,
} from '../src/model.ts'
import { backgroundFor, hexToRgb, normalizeHex, rgbToHex, rgbToHsl, hslToRgb, type DerivedMode } from '../src/color.ts'
import { buildPdf, pdfLiteral } from '../src/pdf.ts'
import { blankGrid, inkBounds, traceInk } from '../src/trace.ts'

let failed = 0

function assert(condition: boolean, message: string): void {
  if (condition) return
  failed += 1
  console.error(`FAIL ${message}`)
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (Object.is(actual, expected)) return
  failed += 1
  console.error(`FAIL ${message}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`)
}

assertEqual(commitInkPercent(50, 40), 50, '50% stays 50%')
assertEqual(commitInkPercent(50.6, 40), 51, 'ink percent rounds to the nearest whole number')
assertEqual(commitInkPercent(1, 50), 5, 'ink percent below 5 snaps to 5')
assertEqual(commitInkPercent(100, 50), 95, 'ink percent above 95 snaps to 95')
assertEqual(commitInkPercent(Number.NaN, 50), 50, 'a blank ink percent keeps the current value')

assertEqual(commitStitchCount('', 16), 16, 'empty size keeps the current value')
assertEqual(commitStitchCount('   ', 16), 16, 'blank size keeps the current value')
assertEqual(commitStitchCount('abc', 16), 16, 'words are not a size')
assertEqual(commitStitchCount('3', 16), 8, 'below 8 snaps to 8')
assertEqual(commitStitchCount('0', 20), 8, 'zero snaps to 8')
assertEqual(commitStitchCount('81', 16), 80, 'above 80 snaps to 80')
assertEqual(commitStitchCount('80', 16), 80, '80 stays 80')
assertEqual(commitStitchCount('8', 16), 8, '8 stays 8')
assertEqual(commitStitchCount('16.4', 10), 16, '16.4 rounds to 16')
assertEqual(commitStitchCount('16.6', 10), 17, '16.6 rounds to 17')

assertEqual(firstLetter('g'), 'g', 'a single letter is kept')
assertEqual(firstLetter('Abc'), 'A', 'paste keeps the first letter')
assertEqual(firstLetter('123b'), '1', 'paste keeps the first digit')
assertEqual(firstLetter('éA'), 'é', 'paste keeps a Spanish accent')
assertEqual(firstLetter(''), null, 'empty paste has no letter')
assertEqual(firstLetter('9'), '9', 'a single digit is kept')
assertEqual(firstLetter('!!0'), '0', 'paste skips symbols before a digit')
for (const character of ['Ñ', 'ñ', 'Ç', 'ç', 'á', 'é', 'í', 'ó', 'ú', 'à', 'è', 'ì', 'ò', 'ù', 'ü', 'Á', 'Ü']) {
  assertEqual(firstLetter(`¿${character}!`), character, `${character} is kept`)
}
assertEqual(firstLetter('ßA'), 'A', 'paste skips characters outside the set')
assertEqual(firstLetter('a\u0301'), 'á', 'a decomposed acute becomes á')
assertEqual(firstLetter('n\u0303'), 'ñ', 'a decomposed tilde becomes ñ')
assertEqual(firstLetter('u\u0308'), 'ü', 'a decomposed diaeresis becomes ü')
assertEqual(firstLetter('c\u0327'), 'ç', 'a decomposed cedilla becomes ç')
assertEqual(firstLetter('A\u0300'), 'À', 'a decomposed grave becomes À')
assertEqual(firstLetter('\u0301', 'a'), 'á', 'an acute mark combines with the current letter')
assertEqual(firstLetter('\u0303', 'N'), 'Ñ', 'a tilde mark combines with the current letter')
assertEqual(firstLetter('\u0301', '8'), '8', 'a mark on a digit stays the digit')

assertEqual(rowStartsOnRight(1), true, 'row 1 starts on the right')
assertEqual(rowStartsOnRight(2), false, 'row 2 starts on the left')
assertEqual(rowStartsOnRight(20), false, 'even rows start on the left')

assertEqual(heading('A', 'Archivo Black', 16, 20), 'A · Archivo Black · 16×20', 'heading')
assertEqual(pdfFilename('A', 'Archivo Black', 16, 20), 'A-Archivo-Black-16x20.pdf', 'filename')
assertEqual(pdfLiteral('A · B × C'), '(A \\267 B \\327 C)', 'pdf escapes middle dot and times')
assertEqual(pdfLiteral('Ññáüç'), '(\\321\\361\\341\\374\\347)', 'pdf encodes Spanish letters')

assertEqual(normalizeHex('#ABC'), '#aabbcc', 'short hex expands and lowercases')
assertEqual(normalizeHex('#32435f'), '#32435f', 'six digit hex is kept')
assertEqual(normalizeHex('  #32435f '), '#32435f', 'surrounding blanks are ignored')
assertEqual(normalizeHex('red'), null, 'a colour name is not hex')
assertEqual(normalizeHex('#12345'), null, 'five digits are not hex')
assertEqual(normalizeHex('#gggggg'), null, 'letters outside a-f are not hex')
assertEqual(normalizeHex(''), null, 'blank is not a colour')

assertEqual(
  JSON.stringify(hexToRgb('#32243f')),
  JSON.stringify({ r: 50, g: 36, b: 63 }),
  'hex to rgb',
)
assertEqual(hexToRgb('#ffffff').r, 255, 'white red channel')
assertEqual(hexToRgb('#000000').g, 0, 'black green channel')
assertEqual(rgbToHex({ r: 50, g: 36, b: 63 }), '#32243f', 'rgb to hex')
assertEqual(rgbToHex({ r: 300, g: -4, b: 300 }), '#ff00ff', 'channels are clamped')
assertEqual(
  JSON.stringify(rgbToHsl({ r: 255, g: 0, b: 0 })),
  JSON.stringify({ h: 0, s: 1, l: 0.5 }),
  'red is hue 0',
)
assertEqual(rgbToHsl({ r: 0, g: 0, b: 0 }).l, 0, 'black has no lightness')
assertEqual(rgbToHsl({ r: 255, g: 255, b: 255 }).l, 1, 'white is full lightness')
assertEqual(rgbToHsl({ r: 128, g: 128, b: 128 }).s, 0, 'grey has no saturation')

for (const hex of ['#32243f', '#fbf8fd', '#863267', '#000000', '#ffffff', '#17a2b8', '#e2b714']) {
  assertEqual(rgbToHex(hslToRgb(rgbToHsl(hexToRgb(hex)))), hex, `${hex} survives the HSL round trip`)
}

function hueGap(from: string, to: string): number {
  const raw = rgbToHsl(hexToRgb(to)).h - rgbToHsl(hexToRgb(from)).h
  const wrapped = ((raw % 360) + 360) % 360
  return wrapped > 180 ? 360 - wrapped : wrapped
}

const INK_SAMPLE = '#32243f'
const derived: Array<[DerivedMode, number]> = [
  ['complementary', 180],
  ['split-complementary', 150],
  ['triadic', 120],
  ['analogous', 30],
  ['monochrome', 0],
]

for (const [mode, expectedHue] of derived) {
  const colour = backgroundFor(INK_SAMPLE, mode)
  assertEqual(normalizeHex(colour), colour, `${mode} returns a clean hex colour`)
  assert(
    Math.abs(hueGap(INK_SAMPLE, colour) - expectedHue) <= 2,
    `${mode} rotates the hue by about ${expectedHue} degrees`,
  )
  const inkLight = rgbToHsl(hexToRgb(INK_SAMPLE)).l
  const backLight = rgbToHsl(hexToRgb(colour)).l
  assert(
    Math.abs(backLight - inkLight) > 0.3,
    `${mode} separates the background lightness from the letter`,
  )
  assertEqual(backgroundFor(INK_SAMPLE, mode), colour, `${mode} is deterministic`)
}

const paleInk = backgroundFor('#f2e9d8', 'complementary')
assert(
  rgbToHsl(hexToRgb(paleInk)).l < rgbToHsl(hexToRgb('#f2e9d8')).l,
  'a pale letter gets a darker background',
)

const solid = new Uint8Array(4 * 4).fill(255)
const solidBox = inkBounds(solid, 4, 4)
assert(solidBox !== null && solidBox.w === 4 && solidBox.h === 4, 'solid ink box')
const fitted = traceInk(solid, 4, 4, solidBox!, 4, 4, 0.34)
assertEqual(fitted.length, 4, 'grid height')
assertEqual(fitted[0].length, 4, 'grid width')
for (let y = 0; y < 4; y++) {
  for (let x = 0; x < 4; x++) {
    const margin = x === 0 || y === 0 || x === 3 || y === 3
    assertEqual(fitted[y][x], !margin, `solid glyph margin cell ${x},${y}`)
  }
}

const half = new Uint8Array(4 * 4)
for (let y = 0; y < 4; y++) {
  half[y * 4] = 255
  half[y * 4 + 1] = 255
}
const halfGrid = traceInk(half, 4, 4, { x: 0, y: 0, w: 4, h: 4 }, 4, 4, 0.34)
assertEqual(halfGrid[1][1], true, 'left inner cell is ink')
assertEqual(halfGrid[1][2], false, 'right inner cell is background')
assertEqual(halfGrid[0][1], false, 'top margin stays empty')

const halo = new Uint8Array(4 * 4).fill(80)
halo[0] = 255
const haloGrid = traceInk(halo, 4, 4, { x: 0, y: 0, w: 4, h: 4 }, 4, 4, 0.5)
assert(
  haloGrid.every((row) => row.every((cell) => cell === false)),
  'a gray fringe does not thicken the stroke',
)

const empty = inkBounds(new Uint8Array(16), 4, 4)
assertEqual(empty, null, 'blank bitmap has no ink')
assertEqual(blankGrid(2, 3).length, 3, 'blank grid height')
assert(blankGrid(2, 3).every((row) => row.every((cell) => cell === false)), 'blank grid is background')

function pdfText(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes)
}

const portrait = pdfText(
  buildPdf({
    letter: 'A',
    fontName: 'Archivo Black',
    width: 16,
    height: 20,
    cells: blankGrid(16, 20).map((row, y) => row.map((_, x) => y === 2 && x === 2)),
  }),
)
assert(portrait.startsWith('%PDF-1.4'), 'pdf header')
assert(portrait.includes('/MediaBox [0 0 595.28 841.89]'), 'portrait A4')
assert(portrait.includes('(A \\267 Archivo Black \\267 16\\32720)'), 'portrait heading')
assert(portrait.includes('/Encoding /WinAnsiEncoding'), 'heading can use the times sign')
assert(portrait.trimEnd().endsWith('%%EOF'), 'pdf eof')
const portraitStart = Number(portrait.match(/startxref\n(\d+)/)?.[1])
assertEqual(portrait.slice(portraitStart, portraitStart + 4), 'xref', 'portrait startxref')
const portraitStream = portrait.match(/stream\n([\s\S]*?)\nendstream/)?.[1] ?? ''
const portraitLength = Number(portrait.match(/\/Length (\d+)/)?.[1])
assertEqual(portraitStream.length, portraitLength, 'portrait stream length')
assert(portraitStream.includes('\nf\n'), 'letter cells are filled')

const landscape = pdfText(
  buildPdf({
    letter: 'g',
    fontName: 'Nunito',
    width: 30,
    height: 12,
    cells: blankGrid(30, 12),
  }),
)
assert(landscape.includes('/MediaBox [0 0 841.89 595.28]'), 'landscape A4 when the chart is wider')
assert(landscape.includes('(1) Tj'), 'row 1 is numbered')
assert(landscape.includes('(12) Tj'), 'last row is numbered')

const coloured = pdfText(
  buildPdf({
    letter: 'A',
    fontName: 'Archivo',
    width: 8,
    height: 8,
    cells: blankGrid(8, 8).map((row, y) => row.map((_, x) => y === 4 && x === 4)),
    inkColor: '#ff0000',
    paperColor: '#00ff00',
  }),
)
assert(coloured.includes('1 0 0 rg'), 'pdf paints the letter with the chosen colour')
assert(coloured.includes('0 1 0 rg'), 'pdf paints the background with the chosen colour')

const defaultColoured = pdfText(
  buildPdf({
    letter: 'A',
    fontName: 'Archivo',
    width: 8,
    height: 8,
    cells: blankGrid(8, 8),
  }),
)
assert(defaultColoured.includes('0.2 0.14 0.25 rg'), 'pdf falls back to the default ink colour')

if (failed > 0) {
  console.error(`${failed} failed`)
  process.exit(1)
}
console.log('ok')
