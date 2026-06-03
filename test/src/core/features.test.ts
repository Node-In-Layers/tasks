import { assert } from 'chai'
import * as sinon from 'sinon'
import { DatastoreValueType, EqualitySymbol } from 'functional-models'
import { TasksNamespace } from '../../../src/types.js'
import { create } from '../../../src/core/features.js'

describe('/src/core/features.ts', () => {
  describe('#cleanUpTasks()', () => {
    it('should return deletedCount 0 when no expired tasks are found', async () => {
      const input = {
        config: {},
        services: {
          [TasksNamespace.Core]: {
            cruds: {
              Tasks: {
                search: sinon.stub().resolves({ instances: [] }),
                bulkDelete: sinon.stub().resolves(),
              },
            },
          },
        },
      }
      const features = create(input as any)
      const actual = await features.cleanUpTasks({})
      const expected = { deletedCount: 0 }
      assert.deepEqual(actual, expected)
      assert.equal(
        input.services[TasksNamespace.Core].cruds.Tasks.search.callCount,
        1
      )
      assert.equal(
        input.services[TasksNamespace.Core].cruds.Tasks.bulkDelete.callCount,
        0
      )
    })

    it('should search for tasks with ttl less than or equal to now', async () => {
      const clock = sinon.useFakeTimers({
        now: new Date('2026-06-03T12:00:00.000Z').getTime(),
      })
      const search = sinon.stub().resolves({ instances: [] })
      const input = {
        config: {
          [TasksNamespace.Core]: {
            cleanupBatchSize: 25,
          },
        },
        services: {
          [TasksNamespace.Core]: {
            cruds: {
              Tasks: {
                search,
                bulkDelete: sinon.stub().resolves(),
              },
            },
          },
        },
      }
      const features = create(input as any)
      await features.cleanUpTasks({})
      const actual = search.firstCall.args[0]
      const expected = {
        take: 25,
        query: [
          {
            type: 'property',
            key: 'ttl',
            value: Math.floor(
              new Date('2026-06-03T12:00:00.000Z').getTime() / 1000
            ),
            options: {},
            valueType: DatastoreValueType.number,
            equalitySymbol: EqualitySymbol.lte,
          },
        ],
      }
      assert.deepEqual(actual, expected)
      clock.restore()
    })

    it('should bulk delete expired tasks in batches until none remain', async () => {
      const search = sinon.stub()
      search.onFirstCall().resolves({
        instances: [
          { getPrimaryKey: () => 'task-1' },
          { getPrimaryKey: () => 'task-2' },
        ],
      })
      search.onSecondCall().resolves({
        instances: [{ getPrimaryKey: () => 'task-3' }],
      })
      search.onThirdCall().resolves({
        instances: [],
      })
      const bulkDelete = sinon.stub().resolves()
      const input = {
        config: {},
        services: {
          [TasksNamespace.Core]: {
            cruds: {
              Tasks: {
                search,
                bulkDelete,
              },
            },
          },
        },
      }
      const features = create(input as any)
      const actual = await features.cleanUpTasks({})
      const expected = { deletedCount: 3 }
      assert.deepEqual(actual, expected)
      assert.equal(search.callCount, 3)
      assert.equal(bulkDelete.callCount, 2)
      assert.deepEqual(bulkDelete.firstCall.args[0], ['task-1', 'task-2'])
      assert.deepEqual(bulkDelete.secondCall.args[0], ['task-3'])
    })
  })
})
