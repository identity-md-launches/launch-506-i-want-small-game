/**
 * Turn the on-chain Swarm Pepe SVG (a flat list of integer-aligned `<rect>`
 * elements inside a square viewBox) into a pixel grid we can slice into
 * puzzle tiles, compare, and paint onto a canvas without touching the DOM
 * image pipeline.
 */

export interface PixelGrid {
  readonly width: number
  readonly height: number
  /** row-major fill colors; null = unpainted (transparent) */
  readonly cells: readonly (string | null)[]
}

const PASSIVE_TAGS = new Set(['title', 'desc', 'metadata', 'defs', 'style'])

function num(value: string | null): number | null {
  if (value === null || value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Decode a `data:image/svg+xml;...` URL to SVG text. Returns null for other URLs. */
export function svgTextFromDataUrl(dataUrl: string): string | null {
  const match = /^data:image\/svg\+xml(;[^,]*)?,(.*)$/s.exec(dataUrl)
  if (!match) return null
  const params = match[1] ?? ''
  const payload = match[2] ?? ''
  try {
    if (/;base64/i.test(params)) return decodeBase64Utf8(payload)
    return decodeURIComponent(payload)
  } catch {
    return null
  }
}

export function decodeBase64Utf8(b64: string): string {
  const binary = atob(b64.replace(/\s+/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder('utf-8').decode(bytes)
}

/**
 * Parse an SVG made only of axis-aligned integer rects. Returns null when the
 * document uses anything else (paths, groups, transforms, gradients), so the
 * caller can fall back to plain image rendering.
 */
export function parseSvgGrid(svgText: string, parser: DOMParser = new DOMParser()): PixelGrid | null {
  const doc = parser.parseFromString(svgText, 'image/svg+xml')
  const root = doc.documentElement
  if (!root || root.tagName.toLowerCase() !== 'svg') return null
  if (doc.getElementsByTagName('parsererror').length > 0) return null

  const viewBox = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number)
  let width: number
  let height: number
  if (viewBox.length === 4 && viewBox.every((v) => Number.isFinite(v))) {
    const [minX, minY, w, h] = viewBox as [number, number, number, number]
    if (minX !== 0 || minY !== 0) return null
    width = w
    height = h
  } else {
    const w = num(root.getAttribute('width'))
    const h = num(root.getAttribute('height'))
    if (w === null || h === null) return null
    width = w
    height = h
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return null
  if (width > 512 || height > 512) return null

  const cells: (string | null)[] = new Array(width * height).fill(null)

  for (const child of Array.from(root.children)) {
    const tag = child.tagName.toLowerCase()
    if (PASSIVE_TAGS.has(tag)) continue
    if (tag !== 'rect') return null
    if (child.getAttribute('transform')) return null
    const x = num(child.getAttribute('x')) ?? 0
    const y = num(child.getAttribute('y')) ?? 0
    const w = num(child.getAttribute('width'))
    const h = num(child.getAttribute('height'))
    if (w === null || h === null) return null
    if (![x, y, w, h].every(Number.isInteger)) return null
    const fill = child.getAttribute('fill') ?? '#000000'
    if (fill === 'none') continue
    const opacity = num(child.getAttribute('fill-opacity') ?? child.getAttribute('opacity'))
    if (opacity !== null && opacity <= 0) continue
    for (let row = Math.max(0, y); row < Math.min(height, y + h); row++) {
      for (let col = Math.max(0, x); col < Math.min(width, x + w); col++) {
        cells[row * width + col] = fill
      }
    }
  }

  return { width, height, cells }
}

/**
 * Signature of every tile index for an `n × n` board. Signatures are equal
 * when two tiles show identical pixels. The blank tile (index n²-1) gets a
 * unique signature so it must return home.
 */
export function tileSignatures(grid: PixelGrid, size: number): string[] {
  const out: string[] = []
  const total = size * size
  for (let index = 0; index < total; index++) {
    if (index === total - 1) {
      out.push('blank')
      continue
    }
    out.push(tileSignature(grid, size, index))
  }
  return out
}

export function tileSignature(grid: PixelGrid, size: number, index: number): string {
  const tileRow = Math.floor(index / size)
  const tileCol = index % size
  const x0 = Math.floor((tileCol * grid.width) / size)
  const x1 = Math.floor(((tileCol + 1) * grid.width) / size)
  const y0 = Math.floor((tileRow * grid.height) / size)
  const y1 = Math.floor(((tileRow + 1) * grid.height) / size)
  const parts: string[] = []
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      parts.push(grid.cells[y * grid.width + x] ?? '-')
    }
  }
  return parts.join(',')
}

/** Paint the grid onto a 2D context at integer scale, crisp-edged. */
export function paintGrid(
  ctx: CanvasRenderingContext2D,
  grid: PixelGrid,
  x: number,
  y: number,
  scale: number,
): void {
  for (let row = 0; row < grid.height; row++) {
    for (let col = 0; col < grid.width; col++) {
      const fill = grid.cells[row * grid.width + col]
      if (!fill) continue
      ctx.fillStyle = fill
      ctx.fillRect(x + col * scale, y + row * scale, scale, scale)
    }
  }
}
