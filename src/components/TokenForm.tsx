import { useId, useState, type FormEvent, type RefObject } from 'react'
import type { BoardSize } from '../lib/puzzle.ts'
import { parseTokenId, MAX_TOKEN_ID } from '../lib/route.ts'
import { CheckIcon, DiceIcon, WarningIcon } from './Icons.tsx'

interface Props {
  size: BoardSize
  busy: boolean
  initialValue: string
  inputRef: RefObject<HTMLInputElement | null>
  onSizeChange: (size: BoardSize) => void
  onLoad: (id: number) => void
  onMystery: () => void
}

export function TokenForm({ size, busy, initialValue, inputRef, onSizeChange, onLoad, onMystery }: Props) {
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState<string | null>(null)
  const inputId = useId()
  const errorId = useId()

  function submit(event: FormEvent) {
    event.preventDefault()
    const id = parseTokenId(value)
    if (id === null) {
      setError(`Enter a whole number from 1 to ${MAX_TOKEN_ID.toLocaleString('en-US')}, such as 42.`)
      inputRef.current?.focus()
      return
    }
    setError(null)
    onLoad(id)
  }

  return (
    <form className="panel" onSubmit={submit} noValidate aria-labelledby="setup-title">
      <h2 id="setup-title" className="panel__title">
        Pick a Pepe
      </h2>
      <div className="field">
        <label className="field__label" htmlFor={inputId}>
          Token ID
        </label>
        <input
          ref={inputRef}
          id={inputId}
          className="field__input"
          name="tokenId"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          placeholder="42"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            if (error) setError(null)
          }}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        {error ? (
          <p id={errorId} className="field__error">
            <WarningIcon />
            <span>{error}</span>
          </p>
        ) : null}
      </div>

      <fieldset className="segments">
        <legend className="segments__legend">Board</legend>
        <div className="segments__row">
          <label className="segment">
            <input
              type="radio"
              name="board"
              value="easy"
              checked={size === 3}
              onChange={() => onSizeChange(3)}
            />
            <span className="segment__name">
              <CheckIcon />
              Easy
            </span>
            <span className="segment__meta">3×3 · 8 tiles</span>
          </label>
          <label className="segment">
            <input
              type="radio"
              name="board"
              value="hard"
              checked={size === 4}
              onChange={() => onSizeChange(4)}
            />
            <span className="segment__name">
              <CheckIcon />
              Hard
            </span>
            <span className="segment__meta">4×4 · 15 tiles</span>
          </label>
        </div>
      </fieldset>

      <div className="form-actions">
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? 'Loading…' : 'Load puzzle'}
        </button>
        <button type="button" className="btn" onClick={onMystery} disabled={busy}>
          <DiceIcon />
          Surprise me
        </button>
      </div>
      <p className="panel__hint">
        Surprise me picks a random revealed Pepe and hides its token ID until you solve it. Switching the board
        starts a new game.
      </p>
    </form>
  )
}
