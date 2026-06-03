import { assert } from 'chai'
import * as sinon from 'sinon'
import { DatastoreValueType, EqualitySymbol } from 'functional-models'
import {
  TasksNamespace,
  defaultMaxTaskRunningSeconds,
} from '../../../src/types.js'
import { TaskStatus } from '../../../src/core/types.js'
import { create } from '../../../src/backend/features.js'

describe('/src/backend/features.ts', () => {
  describe('#cleanUpTasks()', () => {
    it('should return deletedCount 0 and cancelledCount 0 when nothing matches', async () => {
      const input = {
        config: {},
        services: {
          [TasksNamespace.Core]: {
            cruds: {
              Tasks: {
                search: sinon.stub().resolves({ instances: [] }),
                bulkDelete: sinon.stub().resolves(),
                update: sinon.stub().resolves({ toObj: () => ({}) }),
              },
              TaskCallbackMappings: {
                search: sinon.stub().resolves({ instances: [] }),
              },
            },
          },
          getServices: sinon.stub(),
        },
        log: {
          getInnerLogger: () => ({
            debug: sinon.stub(),
            info: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub(),
          }),
        },
      }
      const features = create(input as any)
      const actual = await features.cleanUpTasks({})
      const expected = { deletedCount: 0, cancelledCount: 0 }
      assert.deepEqual(actual, expected)
      assert.equal(
        input.services[TasksNamespace.Core].cruds.Tasks.search.callCount,
        2
      )
    })

    it('should search for expired ttl tasks and bulk delete them in batches', async () => {
      const search = sinon.stub()
      search.onCall(0).resolves({
        instances: [
          { getPrimaryKey: () => 'task-1' },
          { getPrimaryKey: () => 'task-2' },
        ],
      })
      search.onCall(1).resolves({ instances: [] })
      search.onCall(2).resolves({ instances: [] })
      const bulkDelete = sinon.stub().resolves()
      const input = {
        config: {
          [TasksNamespace.Backend]: {
            cleanupBatchSize: 25,
          },
        },
        services: {
          [TasksNamespace.Core]: {
            cruds: {
              Tasks: {
                search,
                bulkDelete,
                update: sinon.stub().resolves({ toObj: () => ({}) }),
              },
              TaskCallbackMappings: {
                search: sinon.stub().resolves({ instances: [] }),
              },
            },
          },
          getServices: sinon.stub(),
        },
        log: {
          getInnerLogger: () => ({
            debug: sinon.stub(),
            info: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub(),
          }),
        },
      }
      const features = create(input as any)
      const actual = await features.cleanUpTasks({})
      const expected = { deletedCount: 2, cancelledCount: 0 }
      assert.deepEqual(actual, expected)
      assert.deepEqual(bulkDelete.firstCall.args[0], ['task-1', 'task-2'])
      assert.equal(search.firstCall.args[0].take, 25)
    })

    it('should mark long-running tasks as failed, save them, and spawn callbacks', async () => {
      const clock = sinon.useFakeTimers({
        now: new Date('2026-06-03T12:00:00.000Z').getTime(),
      })
      try {
        const runningTask = {
          id: 'running-task-1',
          domain: 'myDomain',
          feature: 'myFeature',
          status: TaskStatus.Running,
          startedAt: '2026-06-02T11:00:00.000Z',
          payload: {},
        }
        const updatedTask = {
          ...runningTask,
          status: TaskStatus.Failed,
          completedAt: '2026-06-03T12:00:00.000Z',
          result: {
            error: {
              code: 'TASK_MAX_RUNNING_TIME_EXCEEDED',
              message: 'Cancelled',
              details:
                'The task ran beyond the maximum running time of 86400 seconds.',
            },
          },
        }
        const search = sinon.stub()
        search.onCall(0).resolves({ instances: [] })
        search.onCall(1).resolves({
          instances: [
            {
              getPrimaryKey: () => runningTask.id,
              toObj: sinon.stub().resolves(runningTask),
            },
          ],
        })
        search.onCall(2).resolves({ instances: [] })
        search.onCall(3).resolves({ instances: [] })
        const update = sinon.stub().resolves({
          toObj: sinon.stub().resolves(updatedTask),
        })
        const enqueueTask = sinon.stub().resolves({ taskId: 'callback-task-1' })
        const input = {
          config: {},
          services: {
            [TasksNamespace.Core]: {
              cruds: {
                Tasks: {
                  search,
                  bulkDelete: sinon.stub().resolves(),
                  update,
                  create: sinon.stub().resolves({
                    toObj: sinon.stub().resolves({
                      id: 'callback-task-1',
                      domain: 'callbackDomain',
                      feature: 'callbackFeature',
                      status: TaskStatus.Pending,
                      payload: updatedTask,
                    }),
                  }),
                },
                TaskCallbackMappings: {
                  search: sinon.stub().resolves({
                    instances: [
                      {
                        toObj: sinon.stub().resolves({
                          sourceDomain: runningTask.domain,
                          sourceFeature: runningTask.feature,
                          targetDomain: 'callbackDomain',
                          targetFeature: 'callbackFeature',
                          conditions: { onFailure: true },
                        }),
                      },
                    ],
                  }),
                },
              },
            },
            getServices: sinon.stub().returns({
              enqueueTask,
            }),
          },
          log: {
            getInnerLogger: () => ({
              debug: sinon.stub(),
              info: sinon.stub(),
              warn: sinon.stub(),
              error: sinon.stub(),
            }),
          },
        }
        const features = create(input as any)
        const actual = await features.cleanUpTasks({})
        const expected = { deletedCount: 0, cancelledCount: 1 }
        assert.deepEqual(actual, expected)
        assert.equal(update.callCount, 1)
        assert.equal(update.firstCall.args[0], runningTask.id)
        assert.equal(update.firstCall.args[1].status, TaskStatus.Failed)
        assert.equal(update.firstCall.args[1].result.error.message, 'Cancelled')
        assert.equal(enqueueTask.callCount, 1)
        const runningSearchQuery = search.getCall(1).args[0]
        assert.equal(runningSearchQuery.query[0].value, TaskStatus.Running)
        assert.equal(runningSearchQuery.query[2].type, 'datesBefore')
        assert.equal(
          runningSearchQuery.query[2].date,
          new Date(
            Date.now() - defaultMaxTaskRunningSeconds * 1000
          ).toISOString()
        )
      } finally {
        clock.restore()
      }
    })
  })
})
