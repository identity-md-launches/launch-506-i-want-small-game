/**
 * Minimal read-only Ethereum JSON-RPC client for the Swarm Pepe contract.
 * No wallet, no signing: only `eth_call` against public endpoints, with
 * failover when an endpoint is down or rate limited.
 */
import { decodeBase64Utf8 } from './svgGrid.ts'

export const CONTRACT_ADDRESS = '0x999ce0ce8c5f7661e0c74a568ffe27ceb9177bdb'
export const CHAIN_ID = 1

/** Public endpoints that answer CORS requests from a static site. Tried in order. */
export const RPC_ENDPOINTS: readonly string[] = [
  'https://ethereum-rpc.publicnode.com',
  'https://cloudflare-eth.com',
  'https://eth.drpc.org',
  'https://1rpc.io/eth',
]

/** keccak256 selectors, precomputed */
export const SELECTORS = {
  tokenURI: '0xc87b56dd', // tokenURI(uint256)
  isRevealed: '0x5055fbc3', // isRevealed(uint256)
  totalMinted: '0xa2309ff8', // totalMinted()
  revealableAt: '0xbfc77903', // revealableAt(uint256)
} as const

/** ERC721NonexistentToken(uint256) error selector (OpenZeppelin 5) */
const NONEXISTENT_TOKEN_SELECTOR = '0x7e273289'

export class RevertError extends Error {
  readonly data: string
  constructor(message: string, data: string) {
    super(message)
    this.name = 'RevertError'
    this.data = data
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NetworkError'
  }
}

export function encodeUint256(value: bigint | number): string {
  const big = typeof value === 'number' ? BigInt(value) : value
  if (big < 0n) throw new RangeError('uint256 cannot be negative')
  return big.toString(16).padStart(64, '0')
}

export function decodeUint256(hex: string): bigint {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  if (clean.length === 0) return 0n
  return BigInt('0x' + clean.slice(0, 64))
}

export function decodeBool(hex: string): boolean {
  return decodeUint256(hex) !== 0n
}

/** ABI-decode a single dynamic `string` return value. */
export function decodeString(hex: string): string {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  if (clean.length < 128) return ''
  const offset = Number(BigInt('0x' + clean.slice(0, 64))) * 2
  const length = Number(BigInt('0x' + clean.slice(offset, offset + 64))) * 2
  const body = clean.slice(offset + 64, offset + 64 + length)
  const bytes = new Uint8Array(body.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(body.slice(i * 2, i * 2 + 2), 16)
  return new TextDecoder('utf-8').decode(bytes)
}

interface RpcResponse {
  result?: string
  error?: { code?: number; message?: string; data?: unknown }
}

export interface CallOptions {
  endpoints?: readonly string[]
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

function revertDataOf(error: NonNullable<RpcResponse['error']>): string | null {
  const data = error.data
  if (typeof data === 'string' && data.startsWith('0x')) return data
  if (data && typeof data === 'object' && 'data' in data) {
    const inner = (data as { data?: unknown }).data
    if (typeof inner === 'string' && inner.startsWith('0x')) return inner
  }
  if (error.code === 3 || /revert/i.test(error.message ?? '')) return '0x'
  return null
}

/**
 * `eth_call` with endpoint failover. A contract revert is returned as a
 * RevertError immediately (every endpoint would agree); transport failures
 * move on to the next endpoint.
 */
export async function ethCall(to: string, data: string, options: CallOptions = {}): Promise<string> {
  const endpoints = options.endpoints ?? RPC_ENDPOINTS
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 12_000
  const failures: string[] = []

  for (const url of endpoints) {
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!response.ok) {
        failures.push(`${url}: HTTP ${response.status}`)
        continue
      }
      const json = (await response.json()) as RpcResponse
      if (json.error) {
        const revert = revertDataOf(json.error)
        if (revert !== null) throw new RevertError(json.error.message ?? 'execution reverted', revert)
        failures.push(`${url}: ${json.error.message ?? 'RPC error'}`)
        continue
      }
      if (typeof json.result !== 'string') {
        failures.push(`${url}: malformed response`)
        continue
      }
      return json.result
    } catch (error) {
      if (error instanceof RevertError) throw error
      failures.push(`${url}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  throw new NetworkError(`Unable to reach Ethereum. ${failures.join('; ')}`)
}

export interface TokenAttribute {
  trait_type: string
  value: string
}

export interface TokenMetadata {
  name: string
  description: string
  image: string
  attributes: TokenAttribute[]
}

export function parseTokenUri(uri: string): TokenMetadata {
  const match = /^data:application\/json(;[^,]*)?,(.*)$/s.exec(uri)
  if (!match) throw new Error('tokenURI is not an inline data URL')
  const params = match[1] ?? ''
  const payload = match[2] ?? ''
  const text = /;base64/i.test(params) ? decodeBase64Utf8(payload) : decodeURIComponent(payload)
  const raw = JSON.parse(text) as Partial<TokenMetadata> & { attributes?: unknown }
  const attributes: TokenAttribute[] = []
  if (Array.isArray(raw.attributes)) {
    for (const entry of raw.attributes as unknown[]) {
      if (typeof entry !== 'object' || entry === null) continue
      const record = entry as Record<string, unknown>
      attributes.push({ trait_type: String(record.trait_type ?? ''), value: String(record.value ?? '') })
    }
  }
  return {
    name: typeof raw.name === 'string' ? raw.name : '',
    description: typeof raw.description === 'string' ? raw.description : '',
    image: typeof raw.image === 'string' ? raw.image : '',
    attributes,
  }
}

export type TokenLookup =
  | { status: 'revealed'; id: number; metadata: TokenMetadata }
  | { status: 'unrevealed'; id: number; metadata: TokenMetadata; revealableAt: number | null }
  | { status: 'missing'; id: number; totalMinted: number | null }

export async function fetchTotalMinted(options?: CallOptions): Promise<number> {
  const result = await ethCall(CONTRACT_ADDRESS, SELECTORS.totalMinted, options)
  return Number(decodeUint256(result))
}

export async function fetchIsRevealed(id: number, options?: CallOptions): Promise<boolean> {
  const result = await ethCall(CONTRACT_ADDRESS, SELECTORS.isRevealed + encodeUint256(id), options)
  return decodeBool(result)
}

/** Load a token. Nonexistent tokens resolve to `missing`, not an exception. */
export async function lookupToken(id: number, options?: CallOptions): Promise<TokenLookup> {
  let uri: string
  try {
    uri = decodeString(await ethCall(CONTRACT_ADDRESS, SELECTORS.tokenURI + encodeUint256(id), options))
  } catch (error) {
    if (error instanceof RevertError) {
      if (error.data === '0x' || error.data.startsWith(NONEXISTENT_TOKEN_SELECTOR)) {
        let totalMinted: number | null = null
        try {
          totalMinted = await fetchTotalMinted(options)
        } catch {
          totalMinted = null
        }
        return { status: 'missing', id, totalMinted }
      }
    }
    throw error
  }
  const metadata = parseTokenUri(uri)
  const flaggedUnrevealed = metadata.attributes.some(
    (a) => a.trait_type === 'Status' && /unrevealed/i.test(a.value),
  )
  let revealed = !flaggedUnrevealed
  if (revealed) {
    try {
      revealed = await fetchIsRevealed(id, options)
    } catch {
      // The metadata already told us it is revealed; the flag call is a cross-check only.
    }
  }
  if (!revealed) {
    let revealableAt: number | null = null
    try {
      const raw = await ethCall(CONTRACT_ADDRESS, SELECTORS.revealableAt + encodeUint256(id), options)
      revealableAt = Number(decodeUint256(raw))
    } catch {
      revealableAt = null
    }
    return { status: 'unrevealed', id, metadata, revealableAt }
  }
  return { status: 'revealed', id, metadata }
}

/** Pick a random revealed token ID, or null when none could be found in a few tries. */
export async function pickRandomRevealedId(
  rng: () => number = Math.random,
  options?: CallOptions,
  attempts = 6,
): Promise<number | null> {
  const total = await fetchTotalMinted(options)
  if (total < 1) return null
  for (let i = 0; i < attempts; i++) {
    const id = 1 + Math.floor(rng() * total)
    if (await fetchIsRevealed(id, options)) return id
  }
  return null
}

export function etherscanTokenUrl(id: number): string {
  return `https://etherscan.io/nft/${CONTRACT_ADDRESS}/${id}`
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}
