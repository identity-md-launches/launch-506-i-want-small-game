import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
import {
  blankIndex,
  canMove,
  colOf,
  rowOf,
  type Direction,
  type PuzzleState,
} from '../lib/puzzle.ts'

interface Props {
  state: PuzzleState
  imageDataUrl: string
  solved: boolean
  hintVisible: boolean
  hintSecondsLeft: number
  artName: string
  boardRef: RefObject<HTMLDivElement | null>
  onMoveTile: (pos: number) => void
  onMoveDirection: (direction: Direction) => void
}

const SWIPE_THRESHOLD_PX = 24
const KEY_TO_DIRECTION: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

export function Board({
  state,
  imageDataUrl,
  solved,
  hintVisible,
  hintSecondsLeft,
  artName,
  boardRef,
  onMoveTile,
  onMoveDirection,
}: Props) {
  const { size, tiles } = state
  const blankTile = blankIndex(size)
  const pointerStart = useRef<{ id: number; x: number; y: number } | null>(null)
  const lastSwipeAt = useRef(0)

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (solved) return
    pointerStart.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    const start = pointerStart.current
    pointerStart.current = null
    if (!start || start.id !== e.pointerId || solved) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD_PX) return
    lastSwipeAt.current = performance.now()
    const direction: Direction =
      Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
    onMoveDirection(direction)
  }

  function onPointerCancel() {
    pointerStart.current = null
  }

  function onTileClick(pos: number) {
    // A swipe ends with a click on whichever tile the finger lifted from; ignore it.
    if (performance.now() - lastSwipeAt.current < 400) return
    if (!solved) onMoveTile(pos)
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (solved) return
    const direction = KEY_TO_DIRECTION[e.key]
    if (!direction) return
    e.preventDefault()
    onMoveDirection(direction)
  }

  const boardStyle = { '--n': size } as CSSProperties
  const hintSeconds = Math.max(0, hintSecondsLeft)

  return (
    <div
      ref={boardRef}
      className={`board${solved ? ' board--solved' : ''}`}
      style={boardStyle}
      role="group"
      tabIndex={0}
      aria-label={solved ? `Completed puzzle, ${artName}` : `Puzzle board, ${size} by ${size}`}
      aria-describedby="board-help"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={onKeyDown}
    >
      {tiles.map((tile, pos) => {
        if (tile === blankTile && !solved) return null
        const row = rowOf(pos, size)
        const col = colOf(pos, size)
        const tileRow = rowOf(tile, size)
        const tileCol = colOf(tile, size)
        const denom = size - 1
        const style: CSSProperties = {
          transform: `translate(${col * 100}%, ${row * 100}%)`,
          backgroundImage: `url("${imageDataUrl}")`,
          backgroundPosition: `${(tileCol * 100) / denom}% ${(tileRow * 100) / denom}%`,
        }
        const movable = !solved && canMove(state, pos)
        return (
          <button
            key={tile}
            type="button"
            className="tile"
            style={style}
            tabIndex={-1}
            aria-label={`Tile ${tile + 1}, row ${row + 1} column ${col + 1}${movable ? ', can slide' : ''}`}
            onClick={() => onTileClick(pos)}
          />
        )
      })}
      <div className={`board__hint${hintVisible ? ' board__hint--visible' : ''}`} aria-hidden={!hintVisible}>
        <img src={imageDataUrl} alt={`Completed ${artName}`} draggable={false} />
        <span className="board__hint-label">Hint · {hintSeconds}s</span>
      </div>
    </div>
  )
}
