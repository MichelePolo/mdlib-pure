// Tests every plugin needs: positive cases, negative cases, interaction with
// core syntax, the AST shape, and adversarial input (linear time).
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createMarkdown } from '../../src/index.ts'
import { emoji } from './plugin.ts'

// Linear-time check with a 3x allowance on slow CI machines (GitHub sets CI).
const budget = (ms: number): number => (process.env.CI ? ms * 3 : ms)

const md = createMarkdown({ plugins: [emoji({ emoji: { custom: '🧩' } })] })

describe('template plugin: emoji', () => {
  test('renders known shortcodes', () => {
    assert.equal(md.render('ship it :rocket:'), '<p>ship it <span class="md-emoji" role="img" aria-label="rocket">🚀</span></p>\n')
    assert.equal(md.render(':custom:'), '<p><span class="md-emoji" role="img" aria-label="custom">🧩</span></p>\n')
  })

  test('leaves unknown or malformed shortcodes alone', () => {
    assert.equal(md.render(':nope: : tada: 10:30:00'), '<p>:nope: : tada: 10:30:00</p>\n')
    assert.equal(md.render(':constructor: :toString:'), '<p>:constructor: :toString:</p>\n')
  })

  test('does not apply inside code', () => {
    assert.equal(md.render('`:tada:`'), '<p><code>:tada:</code></p>\n')
  })

  test('works inside other inlines', () => {
    assert.equal(md.render('*:tada:*'), '<p><em><span class="md-emoji" role="img" aria-label="tada">🎉</span></em></p>\n')
  })

  test('AST shape', () => {
    assert.deepEqual(md.parse(':tada:').children[0], { type: 'paragraph', children: [{ type: 'emoji', name: 'tada', value: '🎉' }] })
  })

  test('adversarial input stays linear', () => {
    for (const input of [':'.repeat(100_000), ':a'.repeat(50_000), ':tada'.repeat(30_000)]) {
      const t0 = performance.now()
      md.render(input)
      assert.ok(performance.now() - t0 < budget(1000))
    }
  })
})
