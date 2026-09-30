// Run with: npm test — exercises ABI codecs and endpoint failover with a fake fetch.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  decodeString,
  decodeUint256,
  encodeUint256,
  ethCall,
  lookupToken,
  NetworkError,
  parseTokenUri,
  RevertError,
} from '../../src/lib/chain.ts'
import { parseRoute, parseTokenId, routeToHash } from '../../src/lib/route.ts'

function abiString(text) {
  const bytes = Buffer.from(text, 'utf8')
  const len = bytes.length.toString(16).padStart(64, '0')
  const padded = bytes.toString('hex').padEnd(Math.ceil(bytes.length / 32) * 64, '0')
  return '0x' + (32).toString(16).padStart(64, '0') + len + padded
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

test('uint256 round trip and string decoding', () => {
  assert.equal(encodeUint256(1), '0'.repeat(63) + '1')
  assert.equal(decodeUint256('0x' + encodeUint256(1056)), 1056n)
  assert.equal(decodeString(abiString('Swarm Pepe')), 'Swarm Pepe')
  assert.equal(decodeString(abiString('ünïcødé ✓')), 'ünïcødé ✓')
})

test('ethCall fails over past broken endpoints and stops at a revert', async () => {
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(url)
    if (url === 'a') return new Response('bad gateway', { status: 502 })
    if (url === 'b') return jsonResponse({ jsonrpc: '2.0', id: 1, error: { code: -32005, message: 'rate limited' } })
    return jsonResponse({ jsonrpc: '2.0', id: 1, result: '0x' + encodeUint256(5) })
  }
  const result = await ethCall('0x0', '0x00', { endpoints: ['a', 'b', 'c'], fetchImpl })
  assert.equal(decodeUint256(result), 5n)
  assert.deepEqual(calls, ['a', 'b', 'c'])

  const revertFetch = async () =>
    jsonResponse({ jsonrpc: '2.0', id: 1, error: { code: 3, message: 'execution reverted', data: '0x7e273289' + encodeUint256(9) } })
  await assert.rejects(ethCall('0x0', '0x00', { endpoints: ['a', 'b'], fetchImpl: revertFetch }), RevertError)

  const deadFetch = async () => {
    throw new TypeError('fetch failed')
  }
  await assert.rejects(ethCall('0x0', '0x00', { endpoints: ['a'], fetchImpl: deadFetch }), NetworkError)
})

test('parseTokenUri decodes the on-chain base64 JSON envelope', () => {
  const json = {
    name: 'Swarm Pepe #1',
    description: 'd',
    image: 'data:image/svg+xml;base64,' + Buffer.from('<svg/>').toString('base64'),
    attributes: [{ trait_type: 'Skin', value: 'Green' }],
  }
  const uri = 'data:application/json;base64,' + Buffer.from(JSON.stringify(json)).toString('base64')
  const meta = parseTokenUri(uri)
  assert.equal(meta.name, 'Swarm Pepe #1')
  assert.deepEqual(meta.attributes, [{ trait_type: 'Skin', value: 'Green' }])
})

test('lookupToken maps revert, unrevealed flag and revealed metadata', async () => {
  const unrevealed = {
    name: 'Swarm Pepe #767',
    description: 'Not revealed yet.',
    image: 'data:image/svg+xml;base64,' + Buffer.from('<svg/>').toString('base64'),
    attributes: [{ trait_type: 'Status', value: 'Unrevealed' }],
  }
  const revealed = { ...unrevealed, name: 'Swarm Pepe #1', attributes: [{ trait_type: 'Skin', value: 'Green' }] }
  const toUri = (o) => 'data:application/json;base64,' + Buffer.from(JSON.stringify(o)).toString('base64')

  const fetchImpl = async (_url, init) => {
    const { params } = JSON.parse(init.body)
    const data = params[0].data
    const selector = data.slice(0, 10)
    const id = data.length > 10 ? Number(BigInt('0x' + data.slice(10))) : 0
    if (selector === '0xc87b56dd') {
      if (id === 9999)
        return jsonResponse({ jsonrpc: '2.0', id: 1, error: { code: 3, message: 'execution reverted', data: '0x7e273289' + encodeUint256(id) } })
      return jsonResponse({ jsonrpc: '2.0', id: 1, result: abiString(toUri(id === 767 ? unrevealed : revealed)) })
    }
    if (selector === '0x5055fbc3') return jsonResponse({ jsonrpc: '2.0', id: 1, result: '0x' + encodeUint256(id === 767 ? 0 : 1) })
    if (selector === '0xa2309ff8') return jsonResponse({ jsonrpc: '2.0', id: 1, result: '0x' + encodeUint256(1056) })
    if (selector === '0xbfc77903') return jsonResponse({ jsonrpc: '2.0', id: 1, result: '0x' + encodeUint256(26067104) })
    throw new Error('unexpected selector ' + selector)
  }
  const opts = { endpoints: ['x'], fetchImpl }
  const missing = await lookupToken(9999, opts)
  assert.deepEqual(missing, { status: 'missing', id: 9999, totalMinted: 1056 })
  const pending = await lookupToken(767, opts)
  assert.equal(pending.status, 'unrevealed')
  assert.equal(pending.revealableAt, 26067104)
  const ok = await lookupToken(1, opts)
  assert.equal(ok.status, 'revealed')
  assert.equal(ok.metadata.name, 'Swarm Pepe #1')
})

test('hash routes round trip', () => {
  assert.deepEqual(parseRoute(''), { kind: 'home' })
  assert.deepEqual(parseRoute('#/'), { kind: 'home' })
  assert.deepEqual(parseRoute('#/t/42/hard'), { kind: 'token', id: 42, size: 4 })
  assert.deepEqual(parseRoute('#/t/42'), { kind: 'token', id: 42, size: 3 })
  assert.deepEqual(parseRoute('#/t/abc'), { kind: 'home' })
  assert.deepEqual(parseRoute('#/mystery/hard'), { kind: 'mystery', size: 4 })
  assert.equal(routeToHash({ kind: 'token', id: 7, size: 3 }), '#/t/7/easy')
  assert.equal(parseTokenId(' #12 '), 12)
  assert.equal(parseTokenId('0'), null)
  assert.equal(parseTokenId('1.5'), null)
  assert.equal(parseTokenId('-3'), null)
})
