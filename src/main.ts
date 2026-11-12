import {
  CELL_PX,
  DEFAULT_FONT_ID,
  DEFAULT_HEIGHT,
  DEFAULT_INK_PERCENT,
  DEFAULT_LETTER,
  DEFAULT_WIDTH,
  FONTS,
  GRID_LINE,
  INK,
  PAPER,
  commitInkPercent,
  commitStitchCount,
  firstLetter,
  fontById,
  pdfFilename,
  rowStartsOnRight,
  type Pattern,
} from './model.ts'
import { buildPdf } from './pdf.ts'
import { traceLetter } from './raster.ts'
import { BACKGROUND_MODES, backgroundFor, normalizeHex, type BackgroundMode } from './color.ts'
import { fitCellSize, type FitBox } from './layout.ts'

const letterInput = document.querySelector<HTMLInputElement>('#letter')
const widthInput = document.querySelector<HTMLInputElement>('#width')
const heightInput = document.querySelector<HTMLInputElement>('#height')
const fontSelect = document.querySelector<HTMLSelectElement>('#font')
const letterColorInput = document.querySelector<HTMLInputElement>('#letter-color')
const paperModeSelect = document.querySelector<HTMLSelectElement>('#paper-mode')
const paperColorInput = document.querySelector<HTMLInputElement>('#paper-color')
const inkInput = document.querySelector<HTMLInputElement>('#ink')
const inkValue = document.querySelector<HTMLElement>('#ink-value')
const downloadButton = document.querySelector<HTMLButtonElement>('#download')
const status = document.querySelector<HTMLElement>('#status')
const chart = document.querySelector<HTMLElement>('#chart')
const scroller = document.querySelector<HTMLElement>('main')
const form = document.querySelector<HTMLFormElement>('#controls')

if (
  !letterInput ||
  !widthInput ||
  !heightInput ||
  !fontSelect ||
  !letterColorInput ||
  !paperModeSelect ||
  !paperColorInput ||
  !inkInput ||
  !inkValue ||
  !downloadButton ||
  !status ||
  !chart ||
  !scroller ||
  !form
) {
  throw new Error('The page is missing a control.')
}

document.documentElement.style.setProperty('--ink', INK)
document.documentElement.style.setProperty('--grid-line', GRID_LINE)

for (const font of FONTS) {
  const option = document.createElement('option')
  option.value = font.id
  option.textContent = font.name
  option.style.fontFamily = `"${font.family}"`
  fontSelect.append(option)
}

for (const mode of BACKGROUND_MODES) {
  const option = document.createElement('option')
  option.value = mode.id
  option.textContent = mode.label
  paperModeSelect.append(option)
}

const state = {
  letter: DEFAULT_LETTER,
  fontId: DEFAULT_FONT_ID,
  width: DEFAULT_WIDTH,
  height: DEFAULT_HEIGHT,
  inkPercent: DEFAULT_INK_PERCENT,
  letterColor: INK,
  paperColor: PAPER,
  paperMode: 'custom' as BackgroundMode,
  cells: null as boolean[][] | null,
  tracing: false,
}

letterInput.value = state.letter
widthInput.value = String(state.width)
heightInput.value = String(state.height)
fontSelect.value = state.fontId
letterColorInput.value = state.letterColor
paperModeSelect.value = state.paperMode
paperColorInput.value = state.paperColor
inkInput.value = String(state.inkPercent)
inkValue.textContent = `${state.inkPercent}%`

let generation = 0

function setStatus(message: string): void {
  status!.textContent = message
}

function pattern(): Pattern | null {
  if (!state.cells) return null
  return {
    letter: state.letter,
    fontName: fontById(state.fontId).name,
    width: state.width,
    height: state.height,
    cells: state.cells,
    inkColor: state.letterColor,
    paperColor: state.paperColor,
  }
}

function applyColors(): void {
  const root = document.documentElement.style
  root.setProperty('--letter-color', state.letterColor)
  root.setProperty('--paper-color', state.paperColor)
  if (!chart) return
  chart.dataset.letterColor = state.letterColor
  chart.dataset.paperColor = state.paperColor
  chart.dataset.paperMode = state.paperMode
}

/** Keeps the swatch and the chart in step with the background rule. */
function syncPaperColor(): void {
  const mode = state.paperMode
  if (mode === 'custom') {
    paperColorInput!.disabled = false
  } else {
    state.paperColor = backgroundFor(state.letterColor, mode)
    paperColorInput!.disabled = true
  }
  paperColorInput!.value = state.paperColor
  applyColors()
}

function paintCell(button: HTMLButtonElement, y: number, x: number, on: boolean): void {
  const rowNumber = state.height - y
  button.classList.toggle('on', on)
  button.dataset.on = String(on)
  button.setAttribute('aria-pressed', String(on))
  button.setAttribute(
    'aria-label',
    `Row ${rowNumber}, stitch ${x + 1}, ${on ? 'letter' : 'background'}`,
  )
}

/** Smallest square worth tapping, in pixels. */
const CELL_MIN = 8
/** Below this the squares stop being squares; better to let the page scroll. */
const CELL_COMFORTABLE = 12

function toPx(value: string): number {
  return parseFloat(value) || 0
}

/** Space the chart may use: the scrolling area minus every padding in the way. */
function chartSpace(): { width: number; height: number } {
  const sheet = chart!.parentElement
  if (!sheet) return { width: 0, height: 0 }
  const mainStyle = getComputedStyle(scroller!)
  const sheetStyle = getComputedStyle(sheet)
  const legend = sheet.querySelector<HTMLElement>('.legend')
  const legendStyle = legend ? getComputedStyle(legend) : null
  const legendHeight =
    legend && legendStyle
      ? legend.getBoundingClientRect().height + toPx(legendStyle.marginTop) + toPx(legendStyle.marginBottom)
      : 0

  return {
    width:
      scroller!.clientWidth -
      toPx(mainStyle.paddingLeft) -
      toPx(mainStyle.paddingRight) -
      toPx(sheetStyle.paddingLeft) -
      toPx(sheetStyle.paddingRight),
    height:
      scroller!.clientHeight -
      toPx(mainStyle.paddingTop) -
      toPx(mainStyle.paddingBottom) -
      toPx(sheetStyle.paddingTop) -
      toPx(sheetStyle.paddingBottom) -
      legendHeight,
  }
}

/**
 * Sizes the squares so the whole chart — row numbers and legend included — is
 * on screen. The maths lives in layout.ts; this only measures the page, and it
 * measures the scrolling area rather than the card, which grows with the chart.
 */
let paintedCell = 0
function fitChart(): void {
  const space = chartSpace()
  const chartStyle = getComputedStyle(chart!)
  const box: FitBox = {
    columns: state.width,
    rows: state.height,
    availableWidth: space.width,
    availableHeight: space.height,
    labelWidth: toPx(getComputedStyle(document.documentElement).getPropertyValue('--label-w')),
    gap: toPx(chartStyle.columnGap) || 1,
    padding: toPx(chartStyle.paddingTop) || 1,
    min: CELL_MIN,
    max: CELL_PX,
    comfortable: CELL_COMFORTABLE,
  }
  const cell = fitCellSize(box)
  // Only write when it changes: the observer below would otherwise react to its
  // own layout changes.
  if (cell > 0 && cell !== paintedCell) {
    paintedCell = cell
    document.documentElement.style.setProperty('--cell', `${cell}px`)
  }
}

// Rotating the phone or resizing the window changes the room available without
// changing the chart, so the fit has to be redone. No rAF here: a dropped frame
// would leave the chart at the wrong size for good.
new ResizeObserver(() => fitChart()).observe(scroller!)
window.addEventListener('resize', fitChart)
window.addEventListener('orientationchange', fitChart)

function renderChart(): void {
  const scrollTop = scroller!.scrollTop
  const scrollLeft = scroller!.scrollLeft
  chart!.replaceChildren()
  chart!.style.gridTemplateColumns = `var(--label-w) repeat(${state.width}, var(--cell)) var(--label-w)`
  chart!.dataset.ready = state.cells ? 'true' : 'false'
  chart!.dataset.letter = state.letter
  chart!.dataset.font = state.fontId
  chart!.dataset.width = String(state.width)
  chart!.dataset.height = String(state.height)
  chart!.dataset.ink = String(state.inkPercent)
  if (!state.cells) return

  for (let y = 0; y < state.height; y++) {
    const rowNumber = state.height - y
    const onRight = rowStartsOnRight(rowNumber)
    chart!.append(rowLabel(rowNumber, 'left', !onRight), ...cellsForRow(y), rowLabel(rowNumber, 'right', onRight))
  }
  fitChart()
  scroller!.scrollTop = scrollTop
  scroller!.scrollLeft = scrollLeft
}

function rowLabel(rowNumber: number, side: 'left' | 'right', visible: boolean): HTMLDivElement {
  const label = document.createElement('div')
  label.className = 'row-num'
  label.dataset.row = String(rowNumber)
  label.dataset.side = side
  if (visible) label.textContent = String(rowNumber)
  return label
}

function cellsForRow(y: number): HTMLButtonElement[] {
  const buttons: HTMLButtonElement[] = []
  for (let x = 0; x < state.width; x++) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'cell'
    button.dataset.y = String(y)
    button.dataset.x = String(x)
    button.dataset.row = String(state.height - y)
    button.dataset.col = String(x + 1)
    paintCell(button, y, x, state.cells![y][x])
    buttons.push(button)
  }
  return buttons
}

async function retrace(): Promise<void> {
  const gen = ++generation
  state.tracing = true
  downloadButton!.disabled = true
  setStatus('Drawing the chart…')
  try {
    const font = fontById(state.fontId)
    const cells = await withTimeout(
      traceLetter(state.letter, font, state.width, state.height, state.inkPercent / 100),
      15000,
      `Could not load ${font.name}. Check your connection and try again.`,
    )
    if (gen !== generation) return
    state.cells = cells
    renderChart()
    setStatus('')
  } catch (error) {
    if (gen !== generation) return
    setStatus(error instanceof Error ? error.message : 'Could not draw the chart.')
  } finally {
    if (gen === generation) {
      state.tracing = false
      downloadButton!.disabled = state.cells === null
    }
  }
}

function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms)
    work.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        window.clearTimeout(timer)
        reject(error)
      },
    )
  })
}

let composing = false

function chooseLetter(raw: string): void {
  const letter = firstLetter(raw, state.letter)
  if (!letter || letter === state.letter) {
    if (!composing) letterInput!.value = state.letter
    return
  }
  state.letter = letter
  letterInput!.value = letter
  void retrace()
}

function commitSizeOnEnter(event: KeyboardEvent): void {
  if (event.key !== 'Enter') return
  commitSizes()
}

function commitSizes(): void {
  const width = commitStitchCount(widthInput!.value, state.width)
  const height = commitStitchCount(heightInput!.value, state.height)
  widthInput!.value = String(width)
  heightInput!.value = String(height)
  if (width === state.width && height === state.height) return
  state.width = width
  state.height = height
  void retrace()
}

letterInput.addEventListener('compositionstart', () => {
  composing = true
})

letterInput.addEventListener('compositionend', (event) => {
  composing = false
  chooseLetter(event.data || letterInput.value)
})

letterInput.addEventListener('beforeinput', (event) => {
  const input = event as InputEvent
  if (composing || input.inputType === 'insertCompositionText') return
  if (
    input.inputType === 'insertText' ||
    input.inputType === 'insertReplacementText' ||
    input.inputType === 'insertFromPaste'
  ) {
    event.preventDefault()
    if (input.data) chooseLetter(input.data)
  }
  // Deletions fall through untouched: the field has to be clearable with
  // Backspace/Delete. An empty field keeps showing the last committed letter
  // (and the blur handler puts it back), so the chart never goes blank.
})

letterInput.addEventListener('input', () => {
  if (composing) return
  if (!letterInput.value) return
  chooseLetter(letterInput.value)
})

letterInput.addEventListener('blur', () => {
  if (!letterInput.value) letterInput.value = state.letter
})

letterInput.addEventListener('paste', (event) => {
  event.preventDefault()
  chooseLetter(event.clipboardData?.getData('text') ?? '')
})

letterInput.addEventListener('focus', () => letterInput!.select())

widthInput.addEventListener('change', commitSizes)
heightInput.addEventListener('change', commitSizes)
widthInput.addEventListener('keydown', commitSizeOnEnter)
heightInput.addEventListener('keydown', commitSizeOnEnter)
for (const input of [widthInput, heightInput]) {
  input.addEventListener('wheel', (event) => event.preventDefault(), { passive: false })
}

form.addEventListener('submit', (event) => {
  event.preventDefault()
  commitSizes()
})

fontSelect.addEventListener('change', () => {
  if (fontSelect!.value === state.fontId) return
  state.fontId = fontSelect!.value
  void retrace()
})

letterColorInput.addEventListener('input', () => {
  const colour = normalizeHex(letterColorInput!.value)
  if (!colour) return
  state.letterColor = colour
  syncPaperColor()
})

paperColorInput.addEventListener('input', () => {
  if (state.paperMode !== 'custom') return
  const colour = normalizeHex(paperColorInput!.value)
  if (!colour) return
  state.paperColor = colour
  applyColors()
})

paperModeSelect.addEventListener('change', () => {
  const mode = paperModeSelect!.value
  if (!BACKGROUND_MODES.some((item) => item.id === mode)) return
  if (mode === state.paperMode) return
  state.paperMode = mode as BackgroundMode
  syncPaperColor()
})

let inkTimer = 0
inkInput.addEventListener('input', () => {
  const percent = commitInkPercent(Number(inkInput!.value), state.inkPercent)
  inkValue!.textContent = `${percent}%`
  if (percent === state.inkPercent) return
  window.clearTimeout(inkTimer)
  inkTimer = window.setTimeout(() => {
    state.inkPercent = percent
    void retrace()
  }, 120)
})

chart.addEventListener('click', (event) => {
  if (state.tracing || !state.cells) return
  const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('button.cell')
  if (!button) return
  const y = Number(button.dataset.y)
  const x = Number(button.dataset.x)
  state.cells[y][x] = !state.cells[y][x]
  paintCell(button, y, x, state.cells[y][x])
})

downloadButton.addEventListener('click', () => {
  const current = pattern()
  if (!current) return
  const bytes = buildPdf(current)
  const blob = new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = pdfFilename(current.letter, current.fontName, current.width, current.height)
  link.click()
  URL.revokeObjectURL(url)
})

fitChart()
applyColors()
void retrace()

