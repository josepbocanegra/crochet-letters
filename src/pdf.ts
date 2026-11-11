import { GRID_LINE, INK, PAPER, heading, rowStartsOnRight, type Pattern } from './model.ts'

const PT_PER_MM = 72 / 25.4
const A4_SHORT = 210 * PT_PER_MM
const A4_LONG = 297 * PT_PER_MM
const MARGIN = 12 * PT_PER_MM
const HELVETICA_DIGIT = 0.556

function n(value: number): string {
  const rounded = Math.round(value * 100) / 100
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

function hexChannel(hex: string, index: number): number {
  return Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255
}

function rgb(hex: string): string {
  return `${n(hexChannel(hex, 0))} ${n(hexChannel(hex, 1))} ${n(hexChannel(hex, 2))}`
}

/** WinAnsi literal string. The heading uses middle dot and multiplication sign. */
export function pdfLiteral(text: string): string {
  let out = ''
  for (const char of text) {
    const code = char.charCodeAt(0)
    if (char === '(' || char === ')' || char === '\\') {
      out += `\\${char}`
    } else if (code >= 32 && code <= 126) {
      out += char
    } else if (code <= 255) {
      out += `\\${code.toString(8).padStart(3, '0')}`
    } else {
      throw new Error(`Cannot encode “${char}” in the PDF.`)
    }
  }
  return `(${out})`
}

function pageStream(pattern: Pattern, pageW: number, pageH: number): string {
  const margin = MARGIN
  const titleSize = 13
  const title = heading(pattern.letter, pattern.fontName, pattern.width, pattern.height)
  const boxTop = pageH - margin - 22
  const boxBottom = margin
  const boxLeft = margin
  const boxRight = pageW - margin
  const gutter = 20
  const availW = boxRight - boxLeft - gutter * 2
  const availH = boxTop - boxBottom
  const cell = Math.min(availW / pattern.width, availH / pattern.height)
  const gridW = cell * pattern.width
  const gridH = cell * pattern.height
  const gridLeft = boxLeft + gutter + (availW - gridW) / 2
  const gridBottom = boxBottom + (availH - gridH) / 2
  const inkColor = pattern.inkColor ?? INK
  const paperColor = pattern.paperColor ?? PAPER
  const ops: string[] = []

  ops.push('BT')
  ops.push(`/F1 ${titleSize} Tf`)
  ops.push(`${rgb(INK)} rg`)
  ops.push(`1 0 0 1 ${n(gridLeft)} ${n(pageH - margin - titleSize)} Tm`)
  ops.push(`${pdfLiteral(title)} Tj`)
  ops.push('ET')

  // The chart keeps the colours chosen on screen: background first, then the
  // inked squares on top of it.
  ops.push(`${rgb(paperColor)} rg`)
  ops.push(`${n(gridLeft)} ${n(gridBottom)} ${n(gridW)} ${n(gridH)} re`)
  ops.push('f')

  const letterCells: string[] = []
  for (let y = 0; y < pattern.height; y++) {
    const rowFromBottom = pattern.height - 1 - y
    for (let x = 0; x < pattern.width; x++) {
      if (!pattern.cells[y][x]) continue
      const px = gridLeft + x * cell
      const py = gridBottom + rowFromBottom * cell
      letterCells.push(`${n(px)} ${n(py)} ${n(cell)} ${n(cell)} re`)
    }
  }
  if (letterCells.length > 0) {
    ops.push(`${rgb(inkColor)} rg`)
    ops.push(...letterCells)
    ops.push('f')
  }

  ops.push(`${rgb(GRID_LINE)} RG`)
  ops.push('0.6 w')
  for (let col = 0; col <= pattern.width; col++) {
    const x = n(gridLeft + col * cell)
    ops.push(`${x} ${n(gridBottom)} m ${x} ${n(gridBottom + gridH)} l`)
  }
  for (let row = 0; row <= pattern.height; row++) {
    const y = n(gridBottom + row * cell)
    ops.push(`${n(gridLeft)} ${y} m ${n(gridLeft + gridW)} ${y} l`)
  }
  ops.push('S')

  const numSize = Math.max(5, Math.min(11, cell * 0.5))
  ops.push('BT')
  ops.push(`/F1 ${n(numSize)} Tf`)
  ops.push(`${rgb(INK)} rg`)
  for (let rowNumber = 1; rowNumber <= pattern.height; rowNumber++) {
    const label = String(rowNumber)
    const baseline = gridBottom + (rowNumber - 1) * cell + cell / 2 - numSize * 0.35
    const width = label.length * numSize * HELVETICA_DIGIT
    const x = rowStartsOnRight(rowNumber)
      ? gridLeft + gridW + 4
      : gridLeft - 4 - width
    ops.push(`1 0 0 1 ${n(x)} ${n(baseline)} Tm`)
    ops.push(`${pdfLiteral(label)} Tj`)
  }
  ops.push('ET')
  return ops.join('\n')
}

function assemble(pageW: number, pageH: number, stream: string): Uint8Array {
  const header = '%PDF-1.4\n'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(pageW)} ${n(pageH)}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ]

  let cursor = header.length
  const offsets = [0]
  const chunks = [header]
  for (let index = 0; index < objects.length; index++) {
    offsets.push(cursor)
    const body = `${index + 1} 0 obj\n${objects[index]}\nendobj\n`
    chunks.push(body)
    cursor += body.length
  }

  const xrefAt = cursor
  const xref = [
    'xref',
    `0 ${objects.length + 1}`,
    '0000000000 65535 f ',
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `),
    'trailer',
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    'startxref',
    String(xrefAt),
    '%%EOF',
    '',
  ].join('\n')
  chunks.push(xref)

  const file = chunks.join('')
  if ([...file].some((char) => char.charCodeAt(0) > 255)) {
    throw new Error('PDF contained a character outside Latin-1.')
  }
  return new TextEncoder().encode(file)
}

export function buildPdf(pattern: Pattern): Uint8Array {
  const landscape = pattern.width > pattern.height
  const pageW = landscape ? A4_LONG : A4_SHORT
  const pageH = landscape ? A4_SHORT : A4_LONG
  return assemble(pageW, pageH, pageStream(pattern, pageW, pageH))
}
