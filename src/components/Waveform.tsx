/** Decorative header waveform. Drift animation is opt-in via prefers-reduced-motion. */
export function Waveform() {
  const points: string[] = []
  const steps = 160
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = t * 1000
    const envelope = Math.sin(t * Math.PI)
    const y = 24 + Math.sin(t * Math.PI * 8) * 12 * envelope + Math.sin(t * Math.PI * 23) * 2.5 * envelope
    points.push(`${x.toFixed(1)},${y.toFixed(2)}`)
  }
  const d = `M${points.join(' L')}`
  return (
    <svg className="waveform" viewBox="0 0 1000 48" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path className="waveform__base" d={d} />
      <path className="waveform__glow" d={d} />
    </svg>
  )
}
