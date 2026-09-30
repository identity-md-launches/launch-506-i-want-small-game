/**
 * Framework-free sliding puzzle engine.
 *
 * A board of `size × size` positions holds `size² - 1` picture tiles plus one
 * blank. `tiles[pos]` is the index of the tile sitting at `pos`; tile index
 * `k` belongs at position `k` when solved, and the blank tile has index
 * `size² - 1` (so it belongs bottom-right).
 *
 * Because pixel art often contains identical-looking tiles (for example
 * plain background corners), "solved" can be judged by tile *signatures*
 * rather than indices: a board is solved when every position shows a tile
 * whose pixels equal the pixels that belong there.
 */

export type BoardSize = 3 | 4

export type Direction = 'up' | 'down' | 'left' | 'right'

export interface PuzzleState {
  readonly size: number
  /** tiles[position] = tile index; blank index is size*size-1 */
  readonly tiles: readonly number[]
  /** position of the blank */
  readonly blank: number
}

export type Rng = () => number

export function blankIndex(size: number): number {
  return size * size - 1
}

export function solvedState(size: number): PuzzleState {
  const tiles = Array.from({ length: size * size }, (_, i) => i)
  return { size, tiles, blank: size * size - 1 }
}

export function rowOf(pos: number, size: number): number {
  return Math.floor(pos / size)
}

export function colOf(pos: number, size: number): number {
  return pos % size
}

/** True when `pos` is orthogonally adjacent to the blank. */
export function canMove(state: PuzzleState, pos: number): boolean {
  const { size, blank } = state
  if (pos < 0 || pos >= size * size || pos === blank) return false
  const dr = Math.abs(rowOf(pos, size) - rowOf(blank, size))
  const dc = Math.abs(colOf(pos, size) - colOf(blank, size))
  return dr + dc === 1
}

/** Slide the tile at `pos` into the blank. Returns null when not adjacent. */
export function moveTile(state: PuzzleState, pos: number): PuzzleState | null {
  if (!canMove(state, pos)) return null
  const tiles = state.tiles.slice()
  const moving = tiles[pos]
  const blankTile = tiles[state.blank]
  if (moving === undefined || blankTile === undefined) return null
  tiles[state.blank] = moving
  tiles[pos] = blankTile
  return { size: state.size, tiles, blank: pos }
}

/**
 * Slide a tile in `direction` (the direction the *tile* travels, which is how a
 * finger swipe or an arrow key reads). Moving right means the tile to the
 * left of the blank slides right into it.
 */
export function moveInDirection(state: PuzzleState, direction: Direction): PuzzleState | null {
  const { size, blank } = state
  const r = rowOf(blank, size)
  const c = colOf(blank, size)
  let from: number | null = null
  switch (direction) {
    case 'right':
      from = c > 0 ? blank - 1 : null
      break
    case 'left':
      from = c < size - 1 ? blank + 1 : null
      break
    case 'down':
      from = r > 0 ? blank - size : null
      break
    case 'up':
      from = r < size - 1 ? blank + size : null
      break
  }
  return from === null ? null : moveTile(state, from)
}

/** Which direction does the tile at `pos` travel if it moves into the blank? */
export function directionOfMove(state: PuzzleState, pos: number): Direction | null {
  if (!canMove(state, pos)) return null
  const { size, blank } = state
  if (pos === blank - 1) return 'right'
  if (pos === blank + 1) return 'left'
  if (pos === blank - size) return 'down'
  return 'up'
}

/**
 * Solved check. With `signatures` (one string per tile index, blank included)
 * two tiles with equal signatures are interchangeable.
 */
export function isSolved(state: PuzzleState, signatures?: readonly string[]): boolean {
  const { tiles } = state
  for (let pos = 0; pos < tiles.length; pos++) {
    const tile = tiles[pos]
    if (tile === undefined) return false
    if (signatures) {
      if (signatures[tile] !== signatures[pos]) return false
    } else if (tile !== pos) {
      return false
    }
  }
  return true
}

export function inversionCount(values: readonly number[]): number {
  let count = 0
  for (let i = 0; i < values.length; i++) {
    const a = values[i]
    if (a === undefined) continue
    for (let j = i + 1; j < values.length; j++) {
      const b = values[j]
      if (b !== undefined && a > b) count++
    }
  }
  return count
}

/**
 * Solvability of a permutation whose blank sits in the last position: for any
 * width the inversion count of the non-blank tiles must be even.
 * (For even widths the blank's row from the bottom is 1, which is odd, so the
 * usual "inversions + blank row" rule reduces to "inversions even".)
 */
export function isSolvablePermutation(tiles: readonly number[], size: number): boolean {
  const blank = blankIndex(size)
  if (tiles[tiles.length - 1] !== blank) return false
  const withoutBlank = tiles.filter((t) => t !== blank)
  return inversionCount(withoutBlank) % 2 === 0
}

function fisherYates(values: number[], rng: Rng): number[] {
  const out = values.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const a = out[i]
    const b = out[j]
    if (a !== undefined && b !== undefined) {
      out[i] = b
      out[j] = a
    }
  }
  return out
}

/**
 * Produce a uniformly random *solvable* arrangement with the blank bottom-right
 * that is not already (visually) solved.
 */
export function shuffle(size: number, rng: Rng = Math.random, signatures?: readonly string[]): PuzzleState {
  const blank = blankIndex(size)
  const picture = Array.from({ length: blank }, (_, i) => i)
  for (let attempt = 0; attempt < 1000; attempt++) {
    const perm = fisherYates(picture, rng)
    if (inversionCount(perm) % 2 === 1) {
      // Fix parity by swapping the first two tiles.
      const a = perm[0]
      const b = perm[1]
      if (a !== undefined && b !== undefined) {
        perm[0] = b
        perm[1] = a
      }
    }
    const tiles = [...perm, blank]
    const state: PuzzleState = { size, tiles, blank }
    if (!isSolved(state, signatures)) return state
  }
  // Practically unreachable (would need every arrangement to look solved).
  return solvedState(size)
}

/** mm:ss formatting for the timer readout. */
export function formatDuration(totalMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(totalMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
