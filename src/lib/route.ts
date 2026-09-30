import type { BoardSize } from './puzzle.ts'

/**
 * Hash routes, because a static export has no server to rewrite paths:
 *   #/            home
 *   #/t/123/easy  token 123 on the 3×3 board
 *   #/t/123/hard  token 123 on the 4×4 board
 *   #/mystery/easy  a random revealed token whose ID stays hidden until solved
 */
export type Route =
  | { kind: 'home' }
  | { kind: 'token'; id: number; size: BoardSize }
  | { kind: 'mystery'; size: BoardSize }

export const MAX_TOKEN_ID = 1_000_000_000

export function parseBoardSize(value: string | undefined): BoardSize {
  return value === 'hard' ? 4 : 3
}

export function boardSizeName(size: BoardSize): 'easy' | 'hard' {
  return size === 4 ? 'hard' : 'easy'
}

export function parseTokenId(text: string): number | null {
  const trimmed = text.trim().replace(/^#/, '')
  if (!/^\d+$/.test(trimmed)) return null
  const n = Number(trimmed)
  if (!Number.isSafeInteger(n) || n < 1 || n > MAX_TOKEN_ID) return null
  return n
}

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/^\/+/, '')
  const parts = path.split('/').filter(Boolean)
  if (parts[0] === 't' && parts[1] !== undefined) {
    const id = parseTokenId(parts[1])
    if (id !== null) return { kind: 'token', id, size: parseBoardSize(parts[2]) }
  }
  if (parts[0] === 'mystery') return { kind: 'mystery', size: parseBoardSize(parts[1]) }
  return { kind: 'home' }
}

export function routeToHash(route: Route): string {
  switch (route.kind) {
    case 'home':
      return '#/'
    case 'token':
      return `#/t/${route.id}/${boardSizeName(route.size)}`
    case 'mystery':
      return `#/mystery/${boardSizeName(route.size)}`
  }
}
