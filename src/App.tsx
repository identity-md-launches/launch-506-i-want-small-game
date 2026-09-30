import { useCallback, useEffect, useRef, useState } from 'react'
import { Board } from './components/Board.tsx'
import { EyeIcon, ShuffleIcon } from './components/Icons.tsx'
import { Notice } from './components/Notice.tsx'
import { Readouts } from './components/Readouts.tsx'
import { ResultPanel } from './components/ResultPanel.tsx'
import { TokenForm } from './components/TokenForm.tsx'
import { Waveform } from './components/Waveform.tsx'
import {
  CONTRACT_ADDRESS,
  lookupToken,
  pickRandomRevealedId,
  type TokenAttribute,
} from './lib/chain.ts'
import {
  formatDuration,
  isSolved,
  moveInDirection,
  moveTile,
  shuffle,
  type BoardSize,
  type Direction,
  type PuzzleState,
} from './lib/puzzle.ts'
import { parseRoute, routeToHash, type Route } from './lib/route.ts'
import { parseSvgGrid, svgTextFromDataUrl, tileSignatures, type PixelGrid } from './lib/svgGrid.ts'

interface LoadedToken {
  id: number
  name: string
  imageDataUrl: string
  attributes: TokenAttribute[]
  grid: PixelGrid | null
  /** Surprise mode: hide the ID until solved */
  mystery: boolean
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'loading'; label: string }
  | { kind: 'error'; message: string; retry: Route }
  | { kind: 'missing'; id: number; totalMinted: number | null }
  | { kind: 'unrevealed'; id: number; imageDataUrl: string; revealableAt: number | null }
  | { kind: 'play'; token: LoadedToken }

interface Game {
  size: BoardSize
  state: PuzzleState
  signatures: string[] | undefined
  moves: number
  startedAt: number | null
  solvedAt: number | null
  hints: number
}

const HINT_SECONDS = 3

function newGame(size: BoardSize, grid: PixelGrid | null): Game {
  const signatures = grid ? tileSignatures(grid, size) : undefined
  return {
    size,
    state: shuffle(size, Math.random, signatures),
    signatures,
    moves: 0,
    startedAt: null,
    solvedAt: null,
    hints: 0,
  }
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [active])
  return now
}

export function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash))
  const [size, setSize] = useState<BoardSize>(() => {
    const r = parseRoute(window.location.hash)
    return r.kind === 'home' ? 3 : r.size
  })
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [game, setGame] = useState<Game | null>(null)
  const [hintUntil, setHintUntil] = useState<number | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const inputRef = useRef<HTMLInputElement | null>(null)
  const boardRef = useRef<HTMLDivElement | null>(null)
  const noticeRef = useRef<HTMLDivElement | null>(null)
  const resultHeadingRef = useRef<HTMLHeadingElement | null>(null)
  const requestSeq = useRef(0)
  const initialLoadDone = useRef(false)

  const running = game !== null && game.startedAt !== null && game.solvedAt === null
  const now = useNow(running || hintUntil !== null)
  const hintVisible = hintUntil !== null && now < hintUntil
  const hintSecondsLeft = hintUntil === null ? 0 : Math.ceil((hintUntil - now) / 1000)

  useEffect(() => {
    if (hintUntil !== null && now >= hintUntil) setHintUntil(null)
  }, [hintUntil, now])

  // ---- routing -----------------------------------------------------------
  const load = useCallback(async (target: Route) => {
    const seq = ++requestSeq.current
    setHintUntil(null)
    setGame(null)
    if (target.kind === 'home') {
      setPhase({ kind: 'idle' })
      return
    }
    const boardSize = target.size
    setSize(boardSize)
    setPhase({
      kind: 'loading',
      label: target.kind === 'token' ? `Loading Swarm Pepe #${target.id} from Ethereum…` : 'Picking a random Pepe…',
    })
    try {
      let id: number
      if (target.kind === 'mystery') {
        const picked = await pickRandomRevealedId()
        if (seq !== requestSeq.current) return
        if (picked === null) {
          setPhase({
            kind: 'error',
            message: 'Unable to find a revealed Pepe right now. Try again, or enter a token ID.',
            retry: target,
          })
          return
        }
        id = picked
      } else {
        id = target.id
      }
      const result = await lookupToken(id)
      if (seq !== requestSeq.current) return
      if (result.status === 'missing') {
        setPhase({ kind: 'missing', id, totalMinted: result.totalMinted })
        setAnnouncement(`Swarm Pepe #${id} does not exist yet.`)
        return
      }
      if (result.status === 'unrevealed') {
        setPhase({ kind: 'unrevealed', id, imageDataUrl: result.metadata.image, revealableAt: result.revealableAt })
        setAnnouncement(`Swarm Pepe #${id} is not revealed yet and cannot be played.`)
        return
      }
      const svgText = svgTextFromDataUrl(result.metadata.image)
      const grid = svgText ? parseSvgGrid(svgText) : null
      const token: LoadedToken = {
        id,
        name: result.metadata.name || `Swarm Pepe #${id}`,
        imageDataUrl: result.metadata.image,
        attributes: result.metadata.attributes,
        grid,
        mystery: target.kind === 'mystery',
      }
      setPhase({ kind: 'play', token })
      setGame(newGame(boardSize, grid))
      const tiles = boardSize * boardSize - 1
      setAnnouncement(
        `${token.mystery ? 'Mystery Pepe' : token.name} loaded. ${boardSize} by ${boardSize} board with ${tiles} tiles. Use the arrow keys to slide a tile into the empty space.`,
      )
    } catch (error) {
      if (seq !== requestSeq.current) return
      setPhase({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        retry: target,
      })
    }
  }, [])

  // Initial load from the URL, then back/forward navigation.
  useEffect(() => {
    if (!initialLoadDone.current) {
      initialLoadDone.current = true
      void load(parseRoute(window.location.hash))
    }
    const onPopState = () => {
      const next = parseRoute(window.location.hash)
      setRoute(next)
      void load(next)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [load])

  // Focus management after phase changes
  useEffect(() => {
    if (phase.kind === 'play') boardRef.current?.focus({ preventScroll: false })
    else if (phase.kind === 'missing' || phase.kind === 'unrevealed' || phase.kind === 'error') noticeRef.current?.focus()
  }, [phase])

  useEffect(() => {
    if (game?.solvedAt) resultHeadingRef.current?.focus()
  }, [game?.solvedAt])

  // ---- actions -----------------------------------------------------------
  /** Update the address bar when the environment allows it; the game never depends on it. */
  function syncHistory(target: Route, mode: 'push' | 'replace') {
    const hash = routeToHash(target)
    if (window.location.hash === hash) return
    try {
      if (mode === 'push') window.history.pushState(null, '', hash)
      else window.history.replaceState(null, '', hash)
    } catch {
      // Sandboxed or opaque origins may refuse; state already drives the UI.
    }
  }

  function navigate(target: Route) {
    setRoute(target)
    syncHistory(target, 'push')
    void load(target)
  }

  function onLoadToken(id: number) {
    navigate({ kind: 'token', id, size })
  }

  function onMystery() {
    navigate({ kind: 'mystery', size })
  }

  function onSizeChange(next: BoardSize) {
    setSize(next)
    if (phase.kind === 'play') {
      const target: Route = phase.token.mystery ? { kind: 'mystery', size: next } : { kind: 'token', id: phase.token.id, size: next }
      setRoute(target)
      syncHistory(target, 'replace')
      setHintUntil(null)
      setGame(newGame(next, phase.token.grid))
      setAnnouncement(`New ${next} by ${next} game.`)
      boardRef.current?.focus()
    }
  }

  function reshuffle() {
    if (phase.kind !== 'play') return
    setHintUntil(null)
    setGame(newGame(size, phase.token.grid))
    setAnnouncement('Board shuffled. New game.')
    boardRef.current?.focus()
  }

  function applyMove(next: PuzzleState | null, direction: Direction | null) {
    if (!game || game.solvedAt !== null) return
    if (!next) {
      setAnnouncement('No tile can move that way.')
      return
    }
    const t = Date.now()
    const moves = game.moves + 1
    const solved = isSolved(next, game.signatures)
    const startedAt = game.startedAt ?? t
    setGame({ ...game, state: next, moves, startedAt, solvedAt: solved ? t : null })
    if (solved) {
      setHintUntil(null)
      setAnnouncement(`Solved in ${formatDuration(t - startedAt)} with ${moves} moves.`)
    } else {
      setAnnouncement(`${direction ? `Tile moved ${direction}. ` : ''}${moves} ${moves === 1 ? 'move' : 'moves'}.`)
    }
  }

  function onMoveTile(pos: number) {
    if (!game) return
    const next = moveTile(game.state, pos)
    if (!next) {
      setAnnouncement('That tile is not next to the empty space.')
      return
    }
    applyMove(next, null)
  }

  function onMoveDirection(direction: Direction) {
    if (!game) return
    applyMove(moveInDirection(game.state, direction), direction)
  }

  function showHint() {
    if (!game || game.solvedAt !== null || hintVisible) return
    setHintUntil(Date.now() + HINT_SECONDS * 1000)
    setGame({ ...game, hints: game.hints + 1 })
    setAnnouncement(`Hint: showing the completed picture for ${HINT_SECONDS} seconds.`)
  }

  function pickAnother() {
    inputRef.current?.focus()
    inputRef.current?.select()
  }

  // ---- render ------------------------------------------------------------
  const busy = phase.kind === 'loading'
  const solved = game?.solvedAt !== null && game?.solvedAt !== undefined
  const elapsedMs = game?.startedAt ? (game.solvedAt ?? now) - game.startedAt : 0
  const stageVisible = phase.kind !== 'idle'
  const initialInput = route.kind === 'token' ? String(route.id) : ''

  return (
    <div className="page">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="brand">
          <span className="brand__signal" aria-hidden="true" />
          <h1 className="brand__title">Pepe Pixel Puzzle</h1>
        </div>
        <p className="lede">
          Slide the tiles to rebuild a Swarm Pepe from its on-chain pixel art. Pick a token, choose a board, and
          beat the clock.
        </p>
        <Waveform />
      </header>

      <main id="main" className={`layout ${stageVisible ? 'layout--active' : 'layout--idle'}`}>
        {stageVisible ? (
          <section className="stage" aria-labelledby="stage-title">
            {phase.kind === 'loading' ? (
              <Notice title={phase.label}>
                <div className="loading-bar" aria-hidden="true" />
                <p style={{ marginBlockStart: 'var(--space-3)' }}>
                  Reading <code>tokenURI</code> from the Swarm Pepe contract through a public Ethereum node.
                </p>
              </Notice>
            ) : null}

            {phase.kind === 'error' ? (
              <Notice
                title="Unable to reach Ethereum"
                tone="warning"
                focusRef={noticeRef}
                actions={
                  <>
                    <button type="button" className="btn btn--primary" onClick={() => void load(phase.retry)}>
                      Try again
                    </button>
                    <button type="button" className="btn" onClick={pickAnother}>
                      Change token
                    </button>
                  </>
                }
              >
                <p>Check your connection and try again. Every public node we know about declined the request.</p>
                <p className="panel__hint" style={{ marginBlockStart: 'var(--space-2)' }}>
                  <code style={{ overflowWrap: 'anywhere' }}>{phase.message}</code>
                </p>
              </Notice>
            ) : null}

            {phase.kind === 'missing' ? (
              <Notice
                title={`Swarm Pepe #${phase.id} does not exist yet`}
                tone="warning"
                focusRef={noticeRef}
                actions={
                  <>
                    <button type="button" className="btn btn--primary" onClick={pickAnother}>
                      Change token
                    </button>
                    <button type="button" className="btn" onClick={onMystery}>
                      Surprise me
                    </button>
                  </>
                }
              >
                <p>
                  {phase.totalMinted !== null ? (
                    <>
                      Minted tokens run from <strong>#1</strong> to <strong>#{phase.totalMinted}</strong>. Enter an ID in
                      that range.
                    </>
                  ) : (
                    <>Enter the ID of a minted token.</>
                  )}
                </p>
              </Notice>
            ) : null}

            {phase.kind === 'unrevealed' ? (
              <Notice
                title={`Swarm Pepe #${phase.id} cannot be played yet`}
                tone="warning"
                focusRef={noticeRef}
                art={{ src: phase.imageDataUrl, alt: 'Unrevealed placeholder: a dark silhouette waiting for its reveal' }}
                actions={
                  <>
                    <button type="button" className="btn btn--primary" onClick={pickAnother}>
                      Change token
                    </button>
                    <button type="button" className="btn" onClick={onMystery}>
                      Surprise me
                    </button>
                  </>
                }
              >
                <p>
                  This token has not been revealed on chain, so its art does not exist yet. Once anyone calls{' '}
                  <code>reveal()</code>
                  {phase.revealableAt ? (
                    <>
                      {' '}
                      (possible from block <strong>{phase.revealableAt.toLocaleString('en-US')}</strong>)
                    </>
                  ) : null}
                  , come back and play it.
                </p>
              </Notice>
            ) : null}

            {phase.kind === 'play' && game ? (
              <>
                <div className="stage__heading">
                  <h2 id="stage-title" className={`stage__title${phase.token.mystery && !solved ? ' stage__title--mono' : ''}`}>
                    {phase.token.mystery && !solved ? 'Swarm Pepe #????' : phase.token.name}
                  </h2>
                  <p className="stage__meta">
                    {game.size}×{game.size} board · {game.size * game.size - 1} tiles
                    {phase.token.mystery && !solved ? ' · token ID hidden until solved' : ''}
                  </p>
                </div>

                <div className="board-wrap">
                  <Board
                    state={game.state}
                    imageDataUrl={phase.token.imageDataUrl}
                    solved={solved}
                    hintVisible={hintVisible}
                    hintSecondsLeft={hintSecondsLeft}
                    artName={phase.token.mystery && !solved ? 'mystery Swarm Pepe' : phase.token.name}
                    boardRef={boardRef}
                    onMoveTile={onMoveTile}
                    onMoveDirection={onMoveDirection}
                  />
                  <p id="board-help" className="board-help">
                    Tap or click a tile next to the empty space to slide it. Swipe on the board or use the arrow keys
                    to move a tile in that direction.
                  </p>
                  <Readouts elapsedMs={elapsedMs} running={running} moves={game.moves} hints={game.hints} />
                  <div className="stage__actions">
                    <button
                      type="button"
                      className="btn"
                      onClick={showHint}
                      disabled={solved || hintVisible}
                      aria-describedby="hint-help"
                    >
                      <EyeIcon />
                      {hintVisible ? `Hint showing (${hintSecondsLeft}s)` : 'Show hint'}
                    </button>
                    <span id="hint-help" className="visually-hidden">
                      Shows the completed picture for {HINT_SECONDS} seconds and adds one to the hint count.
                    </span>
                    <button type="button" className="btn btn--quiet" onClick={reshuffle}>
                      <ShuffleIcon />
                      Shuffle again
                    </button>
                  </div>
                </div>

                {solved && game.solvedAt !== null ? (
                  <ResultPanel
                    tokenId={phase.token.id}
                    name={phase.token.name}
                    imageDataUrl={phase.token.imageDataUrl}
                    grid={phase.token.grid}
                    attributes={phase.token.attributes}
                    boardSize={game.size}
                    moves={game.moves}
                    elapsedMs={elapsedMs}
                    hints={game.hints}
                    solvedAt={game.solvedAt}
                    headingRef={resultHeadingRef}
                    onPlayAgain={reshuffle}
                    onPickAnother={pickAnother}
                  />
                ) : null}
              </>
            ) : null}
          </section>
        ) : null}

        <TokenForm
          key={initialInput}
          size={size}
          busy={busy}
          initialValue={initialInput}
          inputRef={inputRef}
          onSizeChange={onSizeChange}
          onLoad={onLoadToken}
          onMystery={onMystery}
        />
      </main>

      <footer className="site-footer">
        <p>
          Art and traits are read live from the Swarm Pepe contract{' '}
          <a href={`https://etherscan.io/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">
            <code>{CONTRACT_ADDRESS}</code> on Etherscan
          </a>{' '}
          through public Ethereum nodes. No wallet is needed and nothing is stored.
        </p>
        <p>Every Pepe is drawn on chain, pixel by pixel, by the contract itself.</p>
      </footer>

      <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </div>
  )
}
