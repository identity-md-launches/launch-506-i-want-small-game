import { formatDuration } from '../lib/puzzle.ts'

interface Props {
  elapsedMs: number
  running: boolean
  moves: number
  hints: number
}

export function Readouts({ elapsedMs, running, moves, hints }: Props) {
  return (
    <dl className="readouts" aria-label="Game readouts">
      <div className={`readout${running ? ' readout--live' : ''}`}>
        <dt>
          Time
          {running ? <span className="pulse" aria-hidden="true" /> : null}
          {running ? <span className="visually-hidden">(running)</span> : null}
        </dt>
        <dd>{formatDuration(elapsedMs)}</dd>
      </div>
      <div className="readout">
        <dt>Moves</dt>
        <dd>{moves}</dd>
      </div>
      <div className="readout">
        <dt>Hints</dt>
        <dd>{hints}</dd>
      </div>
    </dl>
  )
}
