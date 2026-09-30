/**
 * Result card: a 1200 × 630 PNG the player can save after solving.
 * Drawn entirely from the parsed pixel grid, so no image taint issues.
 */
import type { TokenAttribute } from './chain.ts'
import { formatDuration } from './puzzle.ts'
import { paintGrid, type PixelGrid } from './svgGrid.ts'
import { CONTRACT_ADDRESS, shortAddress } from './chain.ts'

export interface CardInput {
  grid: PixelGrid | null
  imageDataUrl: string
  tokenId: number
  name: string
  attributes: readonly TokenAttribute[]
  boardSize: number
  moves: number
  elapsedMs: number
  hints: number
  solvedAt: Date
}

export const CARD_WIDTH = 1200
export const CARD_HEIGHT = 630

const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace'
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

// Card palette mirrors the site tokens (see src/styles.css) as sRGB hex so
// the PNG is identical in every browser.
const COLORS = {
  bg: '#050b08', // --green-950
  surface: '#0c140f', // --green-900
  grid: '#232f28', // --green-800
  text: '#e6f3e8', // --green-100
  textSecondary: '#a5c8b0', // --green-400
  accent: '#5fe87c', // --signal-400
  accentDim: '#269143', // --signal-600
  outline: 'rgba(255,255,255,0.10)', // --color-image-outline
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Unable to decode token image'))
    img.src = src
  })
}

function waveformPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, seed: number) {
  ctx.beginPath()
  const steps = 96
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const px = x + t * w
    const py =
      y +
      Math.sin(t * Math.PI * 6 + seed) * 10 * Math.sin(t * Math.PI) +
      Math.sin(t * Math.PI * 17 + seed * 1.7) * 3
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
}

export async function renderResultCard(input: CardInput): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_WIDTH
  canvas.height = CARD_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is not available in this browser')

  // Background and faint control-room grid
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)
  ctx.strokeStyle = COLORS.grid
  ctx.lineWidth = 1
  for (let x = 0.5; x < CARD_WIDTH; x += 40) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, CARD_HEIGHT)
    ctx.stroke()
  }
  for (let y = 0.5; y < CARD_HEIGHT; y += 40) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(CARD_WIDTH, y)
    ctx.stroke()
  }

  // Artwork panel
  const art = 480
  const artX = 72
  const artY = (CARD_HEIGHT - art) / 2
  ctx.fillStyle = COLORS.surface
  ctx.fillRect(artX - 16, artY - 16, art + 32, art + 32)
  if (input.grid) {
    const scale = Math.floor(art / input.grid.width)
    const drawn = scale * input.grid.width
    const offset = (art - drawn) / 2
    paintGrid(ctx, input.grid, artX + offset, artY + offset, scale)
  } else {
    const img = await loadImage(input.imageDataUrl)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img, artX, artY, art, art)
  }
  ctx.strokeStyle = COLORS.outline
  ctx.lineWidth = 1
  ctx.strokeRect(artX - 0.5, artY - 0.5, art + 1, art + 1)

  // Text column
  const textX = artX + art + 72
  const textW = CARD_WIDTH - textX - 72
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = COLORS.accent
  ctx.font = `600 20px ${MONO}`
  ctx.fillText('PEPE PIXEL PUZZLE · SOLVED', textX, artY + 20)

  ctx.fillStyle = COLORS.text
  ctx.font = `700 46px ${SANS}`
  ctx.fillText(input.name || `Swarm Pepe #${input.tokenId}`, textX, artY + 78, textW)

  ctx.fillStyle = COLORS.textSecondary
  ctx.font = `400 18px ${MONO}`
  ctx.fillText(`Token #${input.tokenId} · ${shortAddress(CONTRACT_ADDRESS)}`, textX, artY + 108, textW)

  // Traits
  let ty = artY + 160
  ctx.font = `400 20px ${SANS}`
  const traits = input.attributes.slice(0, 6)
  for (const trait of traits) {
    ctx.fillStyle = COLORS.textSecondary
    ctx.fillText(trait.trait_type, textX, ty, 160)
    ctx.fillStyle = COLORS.text
    ctx.fillText(trait.value, textX + 176, ty, textW - 176)
    ty += 34
  }

  // Waveform divider
  ctx.strokeStyle = COLORS.accentDim
  ctx.lineWidth = 2
  waveformPath(ctx, textX, ty + 18, textW, input.tokenId % 97)
  ctx.stroke()

  // Stats
  const statsY = ty + 88
  const stats: [string, string][] = [
    ['TIME', formatDuration(input.elapsedMs)],
    ['MOVES', String(input.moves)],
    ['BOARD', `${input.boardSize}×${input.boardSize}`],
    ['HINTS', String(input.hints)],
  ]
  const colW = Math.floor(textW / stats.length)
  stats.forEach(([label, value], i) => {
    const sx = textX + i * colW
    ctx.fillStyle = COLORS.textSecondary
    ctx.font = `500 14px ${MONO}`
    ctx.fillText(label, sx, statsY)
    ctx.fillStyle = COLORS.accent
    ctx.font = `600 34px ${MONO}`
    ctx.fillText(value, sx, statsY + 40)
  })

  // Footer
  ctx.fillStyle = COLORS.textSecondary
  ctx.font = `400 15px ${MONO}`
  ctx.fillText(
    `Solved ${input.solvedAt.toISOString().slice(0, 10)} · art drawn on chain by the Swarm Pepe contract`,
    textX,
    artY + art - 4,
    textW,
  )

  return canvas
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Unable to encode PNG'))
    }, 'image/png')
  })
}
