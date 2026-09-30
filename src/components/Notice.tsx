import type { ReactNode, RefObject } from 'react'
import { WarningIcon } from './Icons.tsx'

interface Props {
  title: string
  tone?: 'neutral' | 'warning'
  children: ReactNode
  actions?: ReactNode
  art?: { src: string; alt: string } | undefined
  focusRef?: RefObject<HTMLDivElement | null>
}

/** Stateful message card for loading, missing, unrevealed and network states. */
export function Notice({ title, tone = 'neutral', children, actions, art, focusRef }: Props) {
  return (
    <div className={`notice${tone === 'warning' ? ' notice--warning' : ''}`} ref={focusRef} tabIndex={-1}>
      <h2 className="notice__title">
        {tone === 'warning' ? <WarningIcon /> : null}
        {title}
      </h2>
      {art ? <img className="notice__art" src={art.src} alt={art.alt} /> : null}
      <div className="notice__body">{children}</div>
      {actions ? <div className="notice__actions">{actions}</div> : null}
    </div>
  )
}
