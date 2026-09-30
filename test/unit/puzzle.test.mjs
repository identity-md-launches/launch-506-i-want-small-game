// Run with: npm test   (Node 22.18+ / 24 strips TypeScript types natively)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  blankIndex,
  canMove,
  directionOfMove,
  formatDuration,
  inversionCount,
  isSolvablePermutation,
  isSolved,
  moveInDirection,
  moveTile,
  shuffle,
  solvedState,
} from '../../src/lib/puzzle.ts'

function seeded(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

test('solved state is solved and blank is bottom-right', () => {
  for (const size of [3, 4]) {
    const s = solvedState(size)
    assert.equal(s.blank, size * size - 1)
    assert.equal(isSolved(s), true)
  }
})

test('only orthogonal neighbours of the blank can move', () => {
  const s = solvedState(3) // blank at 8 (row 2, col 2)
  assert.equal(canMove(s, 5), true) // above
  assert.equal(canMove(s, 7), true) // left
  assert.equal(canMove(s, 4), false) // diagonal
  assert.equal(canMove(s, 8), false) // the blank itself
  assert.equal(moveTile(s, 4), null)
})

test('moveTile swaps tile and blank', () => {
  const s = solvedState(3)
  const n = moveTile(s, 5)
  assert.ok(n)
  assert.equal(n.blank, 5)
  assert.equal(n.tiles[8], 5)
  assert.equal(n.tiles[5], 8)
  assert.equal(isSolved(n), false)
  // moving back restores the solved state
  const back = moveTile(n, 8)
  assert.ok(back)
  assert.equal(isSolved(back), true)
})

test('moveInDirection reads as the direction the tile travels', () => {
  const s = solvedState(3) // blank bottom-right
  // The tile left of the blank (pos 7) slides right.
  const right = moveInDirection(s, 'right')
  assert.ok(right)
  assert.equal(right.blank, 7)
  assert.equal(right.tiles[8], 7)
  // The tile above the blank (pos 5) slides down.
  const down = moveInDirection(s, 'down')
  assert.ok(down)
  assert.equal(down.blank, 5)
  // Nothing sits to the right or below the blank.
  assert.equal(moveInDirection(s, 'left'), null)
  assert.equal(moveInDirection(s, 'up'), null)
  assert.equal(directionOfMove(s, 7), 'right')
  assert.equal(directionOfMove(s, 5), 'down')
})

test('shuffle produces solvable, unsolved boards for both sizes', () => {
  const rng = seeded(7)
  for (const size of [3, 4]) {
    for (let i = 0; i < 200; i++) {
      const s = shuffle(size, rng)
      assert.equal(s.blank, blankIndex(size))
      assert.equal(isSolvablePermutation(s.tiles, size), true, `size ${size} iteration ${i}`)
      assert.equal(isSolved(s), false)
      const sorted = [...s.tiles].sort((a, b) => a - b)
      assert.deepEqual(sorted, Array.from({ length: size * size }, (_, k) => k))
    }
  }
})

test('inversion parity detects the classic unsolvable 15-puzzle swap', () => {
  const tiles = Array.from({ length: 16 }, (_, i) => i)
  ;[tiles[13], tiles[14]] = [tiles[14], tiles[13]]
  assert.equal(inversionCount(tiles.slice(0, 15)), 1)
  assert.equal(isSolvablePermutation(tiles, 4), false)
})

test('signatures make identical-looking tiles interchangeable', () => {
  // 3×3 board where tiles 0 and 1 look identical ("bg") and the rest are unique.
  const sig = ['bg', 'bg', 'c', 'd', 'e', 'f', 'g', 'h', 'blank']
  const swapped = { size: 3, tiles: [1, 0, 2, 3, 4, 5, 6, 7, 8], blank: 8 }
  assert.equal(isSolved(swapped), false)
  assert.equal(isSolved(swapped, sig), true)
  const rng = seeded(11)
  for (let i = 0; i < 100; i++) {
    const s = shuffle(3, rng, sig)
    assert.equal(isSolved(s, sig), false)
  }
})

test('formatDuration pads mm:ss', () => {
  assert.equal(formatDuration(0), '00:00')
  assert.equal(formatDuration(59_999), '00:59')
  assert.equal(formatDuration(61_000), '01:01')
  assert.equal(formatDuration(3_600_000), '60:00')
})
