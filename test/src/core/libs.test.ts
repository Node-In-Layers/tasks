import { assert } from 'chai'
import { createTTL } from '../../../src/core/libs.js'

describe('/src/core/libs.ts', () => {
  describe('#createTTL()', () => {
    it('should return the Unix timestamp in seconds for a Date input', () => {
      const input = {
        datetime: new Date('2026-06-03T12:00:00.000Z'),
      }
      const actual = createTTL(input)
      const expected = 1780488000
      assert.equal(actual, expected)
    })

    it('should return the Unix timestamp in seconds for an ISO string input', () => {
      const input = {
        datetime: '2026-06-03T12:00:00.000Z',
      }
      const actual = createTTL(input)
      const expected = 1780488000
      assert.equal(actual, expected)
    })

    it('should floor fractional seconds from millisecond precision', () => {
      const input = {
        datetime: new Date('2026-06-03T12:00:00.999Z'),
      }
      const actual = createTTL(input)
      const expected = 1780488000
      assert.equal(actual, expected)
    })
  })
})
