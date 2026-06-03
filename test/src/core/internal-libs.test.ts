import { assert } from 'chai'
import * as sinon from 'sinon'
import { defaultTaskTtlSeconds } from '../../../src/types.js'
import { createTaskTtlLazyLoadMethod } from '../../../src/core/internal-libs.js'

describe('/src/core/internal-libs.ts', () => {
  describe('#createTaskTtlLazyLoadMethod()', () => {
    it('should return the existing ttl value when one is provided', () => {
      const input = {
        coreConfig: {
          defaultTtl: 3600,
        },
        value: 1700000000,
      }
      const lazyLoadMethod = createTaskTtlLazyLoadMethod({
        coreConfig: input.coreConfig,
      })
      const actual = lazyLoadMethod(input.value)
      const expected = 1700000000
      assert.equal(actual, expected)
    })

    it('should leave ttl undefined when noTTL is true', () => {
      const input = {
        coreConfig: {
          noTTL: true,
          defaultTtl: 3600,
        },
        value: undefined as number | undefined,
      }
      const lazyLoadMethod = createTaskTtlLazyLoadMethod({
        coreConfig: input.coreConfig,
      })
      const actual = lazyLoadMethod(input.value)
      const expected = undefined
      assert.equal(actual, expected)
    })

    it('should compute ttl from the 90 day default when core config is missing', () => {
      const clock = sinon.useFakeTimers({
        now: new Date('2026-06-03T12:00:00.000Z').getTime(),
      })
      const input = {
        coreConfig: undefined,
        value: undefined as number | undefined,
      }
      const lazyLoadMethod = createTaskTtlLazyLoadMethod({
        coreConfig: input.coreConfig,
      })
      const actual = lazyLoadMethod(input.value)
      const expected = Math.floor(
        new Date('2026-06-03T12:00:00.000Z').getTime() / 1000 +
          defaultTaskTtlSeconds
      )
      assert.equal(actual, expected)
      clock.restore()
    })

    it('should compute ttl from the 90 day default when defaultTtl is not configured', () => {
      const clock = sinon.useFakeTimers({
        now: new Date('2026-06-03T12:00:00.000Z').getTime(),
      })
      const input = {
        coreConfig: {},
        value: undefined as number | undefined,
      }
      const lazyLoadMethod = createTaskTtlLazyLoadMethod({
        coreConfig: input.coreConfig,
      })
      const actual = lazyLoadMethod(input.value)
      const expected = Math.floor(
        new Date('2026-06-03T12:00:00.000Z').getTime() / 1000 +
          defaultTaskTtlSeconds
      )
      assert.equal(actual, expected)
      clock.restore()
    })

    it('should compute ttl from configured defaultTtl seconds when value is undefined', () => {
      const clock = sinon.useFakeTimers({
        now: new Date('2026-06-03T12:00:00.000Z').getTime(),
      })
      const input = {
        coreConfig: {
          defaultTtl: 3600,
        },
        value: undefined as number | undefined,
      }
      const lazyLoadMethod = createTaskTtlLazyLoadMethod({
        coreConfig: input.coreConfig,
      })
      const actual = lazyLoadMethod(input.value)
      const expected = Math.floor(
        new Date('2026-06-03T13:00:00.000Z').getTime() / 1000
      )
      assert.equal(actual, expected)
      clock.restore()
    })
  })
})
