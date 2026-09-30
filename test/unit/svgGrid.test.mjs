// Run with: npm test — parses a Swarm-Pepe-shaped SVG with a minimal DOMParser stand-in.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSvgGrid, svgTextFromDataUrl, tileSignatures } from '../../src/lib/svgGrid.ts'

/** Tiny DOMParser replacement that understands flat `<svg><rect …/></svg>` markup. */
class MiniParser {
  parseFromString(text) {
    const attrs = (tag) => {
      const out = {}
      for (const m of tag.matchAll(/([\w:-]+)="([^"]*)"/g)) out[m[1]] = m[2]
      return out
    }
    const element = (name, a) => ({
      tagName: name,
      getAttribute: (k) => (k in a ? a[k] : null),
      children: [],
    })
    const svgTag = /<svg\b[^>]*>/.exec(text)
    const root = element('svg', attrs(svgTag ? svgTag[0] : ''))
    const inner = text.slice(svgTag ? svgTag.index + svgTag[0].length : 0)
    for (const m of inner.matchAll(/<([a-zA-Z]+)\b([^>]*?)\/?>/g)) {
      if (m[1] === 'svg') continue
      root.children.push(element(m[1], attrs(m[2])))
    }
    return { documentElement: root, getElementsByTagName: () => [] }
  }
}

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 24 24" shape-rendering="crispEdges">' +
  '<rect x="0" y="0" width="24" height="24" fill="#8d6f9e"/>' +
  '<rect x="8" y="5" width="8" height="1" fill="#8ecb63"/>' +
  '<rect x="6" y="8" width="12" height="9" fill="#8ecb63"/>' +
  '</svg>'

test('parses rect-only SVG into a 24×24 grid', () => {
  const grid = parseSvgGrid(svg, new MiniParser())
  assert.ok(grid)
  assert.equal(grid.width, 24)
  assert.equal(grid.cells.length, 576)
  assert.equal(grid.cells[0], '#8d6f9e')
  assert.equal(grid.cells[5 * 24 + 8], '#8ecb63')
  assert.equal(grid.cells[16 * 24 + 17], '#8ecb63')
  assert.equal(grid.cells[17 * 24 + 17], '#8d6f9e')
})

test('rejects non-rect content so the caller falls back to plain images', () => {
  const withPath = svg.replace('</svg>', '<path d="M0 0h1v1z"/></svg>')
  assert.equal(parseSvgGrid(withPath, new MiniParser()), null)
})

test('tile signatures identify identical-looking tiles', () => {
  const grid = parseSvgGrid(svg, new MiniParser())
  const sig3 = tileSignatures(grid, 3)
  assert.equal(sig3.length, 9)
  assert.equal(sig3[8], 'blank')
  // Top-left and top-right corners of this simple picture are plain background.
  assert.equal(sig3[0], sig3[2])
  assert.notEqual(sig3[0], sig3[4])
  const sig4 = tileSignatures(grid, 4)
  assert.equal(sig4.length, 16)
  assert.equal(sig4[0].split(',').length, 36)
})

test('decodes base64 and percent-encoded SVG data URLs', () => {
  const b64 = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
  assert.equal(svgTextFromDataUrl(b64), svg)
  assert.equal(svgTextFromDataUrl('data:image/svg+xml;utf8,' + encodeURIComponent('<svg/>')), '<svg/>')
  assert.equal(svgTextFromDataUrl('data:image/png;base64,AAAA'), null)
})
