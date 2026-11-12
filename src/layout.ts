/**
 * Fitting the chart into the space a screen gives it.
 *
 * The chart is a grid of squares — one per stitch — flanked by two columns of
 * row numbers. Its size is therefore `2 labels + columns × cell + gaps`, and the
 * cell is the only free variable: on a phone the same 16 stitches that look
 * right on a laptop only fit at half the size.
 *
 * This module answers one question — how big can a square be — with no DOM in
 * sight, so the answer can be tested instead of eyeballed.
 */

export type FitBox = {
  /** Stitches per row. */
  columns: number
  /** Rows of stitches. */
  rows: number
  /** Width available to the whole chart, labels included. */
  availableWidth: number
  /** Height available to the whole chart, row numbers included. */
  availableHeight: number
  /** Width of one of the two row-number columns. */
  labelWidth: number
  /** Gap between two neighbouring tracks, in pixels. */
  gap: number
  /** Padding around the grid itself (the thin frame that draws the lines). */
  padding: number
  /** Never go below this: below it a cell cannot be tapped. */
  min: number
  /** Never go above this: big screens must not grow a cell past the design. */
  max: number
  /**
   * Shrinking to fit the height is only worth it down to here. Below it the
   * squares become dots, so the chart keeps its width-sized cells and the page
   * scrolls instead.
   */
  comfortable: number
}

/** Tracks in a chart: two label columns, one per stitch column. */
function tracks(columns: number): number {
  return columns + 2
}

/**
 * Largest whole-pixel cell that fits the box, clamped to `[min, max]`.
 *
 * Width is a hard limit — a chart wider than the screen means a page that
 * scrolls sideways, which is always wrong. Height is a soft limit: the squares
 * only give up size to it while they are still comfortable to tap, otherwise
 * the page scrolls down and the chart stays readable.
 *
 * Rounds down, never up: half a pixel over the available width is what turns a
 * card into a horizontally scrolling page.
 */
export function fitCellSize(fit: FitBox): number {
  const { columns, rows, availableWidth, availableHeight, labelWidth, gap, padding, min, max, comfortable } = fit
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return 0
  if (!Number.isFinite(columns) || !Number.isFinite(rows) || columns < 1 || rows < 1) return min

  const gapsAcross = (tracks(columns) - 1) * gap
  const byWidth = (availableWidth - 2 * padding - 2 * labelWidth - gapsAcross) / columns
  const byHeight = (availableHeight - 2 * padding - (rows - 1) * gap) / rows

  const widthCell = clamp(Math.floor(byWidth), min, max)
  if (!Number.isFinite(widthCell)) return min

  const heightCell = Math.floor(byHeight)
  const shrinkForHeight = Number.isFinite(heightCell) && heightCell >= Math.max(min, comfortable)
  return shrinkForHeight ? Math.min(widthCell, heightCell) : widthCell
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** Width the chart will actually occupy once `cell` is chosen, labels included. */
export function chartWidth(
  fit: Pick<FitBox, 'columns' | 'labelWidth' | 'gap' | 'padding'>,
  cell: number,
): number {
  return 2 * fit.padding + 2 * fit.labelWidth + fit.columns * cell + (tracks(fit.columns) - 1) * fit.gap
}

/** Height the chart will actually occupy once `cell` is chosen. */
export function chartHeight(fit: Pick<FitBox, 'rows' | 'gap' | 'padding'>, cell: number): number {
  return 2 * fit.padding + fit.rows * cell + (fit.rows - 1) * fit.gap
}
