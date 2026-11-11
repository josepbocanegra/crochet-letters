import { fontShorthand, type FontChoice } from './model.ts'
import { inkBounds, traceInk, blankGrid, type InkBox } from './trace.ts'

export interface Raster {
  alpha: Uint8Array
  width: number
  height: number
  box: InkBox | null
}

export async function rasterizeLetter(letter: string, font: FontChoice): Promise<Raster> {
  const shorthand = fontShorthand(font, 400)
  await document.fonts.load(shorthand, letter)
  if (!document.fonts.check(shorthand)) {
    throw new Error(`Could not load ${font.name}. Check your connection and try again.`)
  }

  const canvas = document.createElement('canvas')
  canvas.width = 1600
  canvas.height = 1600
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Could not draw the letter.')
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#000'
  context.font = shorthand
  context.textBaseline = 'alphabetic'
  context.fillText(letter, 200, 1000)

  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  const alpha = new Uint8Array(canvas.width * canvas.height)
  for (let i = 0; i < alpha.length; i++) alpha[i] = image.data[i * 4 + 3]
  const box = inkBounds(alpha, canvas.width, canvas.height)
  if (
    box &&
    (box.x <= 1 ||
      box.y <= 1 ||
      box.x + box.w >= canvas.width - 1 ||
      box.y + box.h >= canvas.height - 1)
  ) {
    throw new Error('The letter was clipped while drawing. Try another font.')
  }
  return { alpha, width: canvas.width, height: canvas.height, box }
}

export async function traceLetter(
  letter: string,
  font: FontChoice,
  width: number,
  height: number,
  threshold: number,
): Promise<boolean[][]> {
  const raster = await rasterizeLetter(letter, font)
  if (!raster.box) return blankGrid(width, height)
  return traceInk(raster.alpha, raster.width, raster.height, raster.box, width, height, threshold)
}
