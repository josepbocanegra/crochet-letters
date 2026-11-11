export interface InkBox {
  x: number
  y: number
  w: number
  h: number
}

export function blankGrid(width: number, height: number): boolean[][] {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => false))
}

const SOLID_INK = 128

export function inkBounds(
  alpha: Uint8Array,
  width: number,
  height: number,
  minAlpha = SOLID_INK,
): InkBox | null {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      if (alpha[row + x] <= minAlpha) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

function averageAlpha(
  alpha: Uint8Array,
  srcW: number,
  srcH: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  if (x1 <= x0 || y1 <= y0) return 0
  const left = Math.max(0, Math.floor(x0))
  const top = Math.max(0, Math.floor(y0))
  const right = Math.min(srcW, Math.ceil(x1))
  const bottom = Math.min(srcH, Math.ceil(y1))
  let weighted = 0
  let area = 0
  for (let y = top; y < bottom; y++) {
    const yOverlap = Math.min(y + 1, y1) - Math.max(y, y0)
    if (yOverlap <= 0) continue
    const row = y * srcW
    for (let x = left; x < right; x++) {
      const xOverlap = Math.min(x + 1, x1) - Math.max(x, x0)
      if (xOverlap <= 0) continue
      const weight = xOverlap * yOverlap
      if (alpha[row + x] >= SOLID_INK) weighted += weight
      area += weight
    }
  }
  return area === 0 ? 0 : weighted / area
}

/**
 * Fit the ink box inside the stitch grid, centered, with at least one stitch of
 * margin. y = 0 is the top row. A cell is the letter when at least half of it is solid ink.
 */
export function traceInk(
  alpha: Uint8Array,
  srcW: number,
  srcH: number,
  box: InkBox,
  stitchesW: number,
  stitchesH: number,
  threshold: number,
): boolean[][] {
  const innerW = Math.max(0, stitchesW - 2)
  const innerH = Math.max(0, stitchesH - 2)
  const scale = innerW === 0 || innerH === 0 ? 0 : Math.min(innerW / box.w, innerH / box.h)
  const drawnW = box.w * scale
  const drawnH = box.h * scale
  const originX = 1 + (innerW - drawnW) / 2
  const originY = 1 + (innerH - drawnH) / 2
  const cells: boolean[][] = []

  for (let row = 0; row < stitchesH; row++) {
    const line: boolean[] = []
    for (let col = 0; col < stitchesW; col++) {
      if (scale === 0) {
        line.push(false)
        continue
      }
      const ix0 = Math.max(col, originX)
      const iy0 = Math.max(row, originY)
      const ix1 = Math.min(col + 1, originX + drawnW)
      const iy1 = Math.min(row + 1, originY + drawnH)
      if (ix0 >= ix1 || iy0 >= iy1) {
        line.push(false)
        continue
      }
      const sx0 = box.x + (ix0 - originX) / scale
      const sy0 = box.y + (iy0 - originY) / scale
      const sx1 = box.x + (ix1 - originX) / scale
      const sy1 = box.y + (iy1 - originY) / scale
      const ink = averageAlpha(alpha, srcW, srcH, sx0, sy0, sx1, sy1)
      const cover = ink * (ix1 - ix0) * (iy1 - iy0)
      line.push(cover >= threshold)
    }
    cells.push(line)
  }
  return cells
}
