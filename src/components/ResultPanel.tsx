import { useEffect, useState, type RefObject } from 'react'
import { canvasToPngBlob, renderResultCard } from '../lib/card.ts'
import type { TokenAttribute } from '../lib/chain.ts'
import { etherscanTokenUrl } from '../lib/chain.ts'
import { formatDuration } from '../lib/puzzle.ts'
import type { PixelGrid } from '../lib/svgGrid.ts'
import { DownloadIcon, ShuffleIcon } from './Icons.tsx'

interface Props {
  tokenId: number
  name: string
  imageDataUrl: string
  grid: PixelGrid | null
  attributes: readonly TokenAttribute[]
  boardSize: number
  moves: number
  elapsedMs: number
  hints: number
  solvedAt: number
  headingRef: RefObject<HTMLHeadingElement | null>
  onPlayAgain: () => void
  onPickAnother: () => void
}

type CardState = { kind: 'rendering' } | { kind: 'ready'; url: string } | { kind: 'failed'; message: string }

export function ResultPanel({
  tokenId,
  name,
  imageDataUrl,
  grid,
  attributes,
  boardSize,
  moves,
  elapsedMs,
  hints,
  solvedAt,
  headingRef,
  onPlayAgain,
  onPickAnother,
}: Props) {
  const [card, setCard] = useState<CardState>({ kind: 'rendering' })

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    setCard({ kind: 'rendering' })
    renderResultCard({
      grid,
      imageDataUrl,
      tokenId,
      name,
      attributes,
      boardSize,
      moves,
      elapsedMs,
      hints,
      solvedAt: new Date(solvedAt),
    })
      .then(canvasToPngBlob)
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setCard({ kind: 'ready', url: objectUrl })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setCard({ kind: 'failed', message: error instanceof Error ? error.message : 'Unable to draw the card' })
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [grid, imageDataUrl, tokenId, name, attributes, boardSize, moves, elapsedMs, hints, solvedAt])

  const time = formatDuration(elapsedMs)
  const fileName = `pepe-pixel-puzzle-${tokenId}.png`

  return (
    <section className="result" aria-labelledby="result-title">
      <div>
        <h2 id="result-title" className="result__title" ref={headingRef} tabIndex={-1}>
          Solved in {time} with {moves} {moves === 1 ? 'move' : 'moves'}
        </h2>
      </div>
      <div className="result__grid">
        <img className="result__art" src={imageDataUrl} alt={`${name}, the completed pixel art`} />
        <div>
          <p className="section-label">Revealed</p>
          <h3 className="result__name">{name}</h3>
          <p className="panel__hint">
            Token #{tokenId} ·{' '}
            <a href={etherscanTokenUrl(tokenId)} target="_blank" rel="noreferrer">
              View token #{tokenId} on Etherscan
            </a>
          </p>
          <dl className="traits" style={{ marginBlockStart: 'var(--space-4)' }}>
            {attributes.map((trait) => (
              <div key={trait.trait_type} style={{ display: 'contents' }}>
                <dt>{trait.trait_type}</dt>
                <dd>{trait.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="result__card">
        <p className="section-label">Result card</p>
        {card.kind === 'ready' ? (
          <img
            src={card.url}
            alt={`Result card: ${name}, solved in ${time} with ${moves} moves on a ${boardSize} by ${boardSize} board using ${hints} hints`}
            width={1200}
            height={630}
          />
        ) : card.kind === 'rendering' ? (
          <p className="panel__hint" role="status">
            Drawing your result card…
          </p>
        ) : (
          <p className="field__error" role="alert">
            Unable to draw the result card ({card.message}). You can still screenshot this page.
          </p>
        )}
        <div className="result__actions">
          {card.kind === 'ready' ? (
            <a className="btn btn--primary" href={card.url} download={fileName}>
              <DownloadIcon />
              Save card as PNG
            </a>
          ) : (
            <button type="button" className="btn btn--primary" disabled>
              <DownloadIcon />
              Save card as PNG
            </button>
          )}
          <button type="button" className="btn" onClick={onPlayAgain}>
            <ShuffleIcon />
            Play again
          </button>
          <button type="button" className="btn btn--quiet" onClick={onPickAnother}>
            Pick another Pepe
          </button>
        </div>
      </div>
    </section>
  )
}
