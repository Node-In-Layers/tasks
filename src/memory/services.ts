import merge from 'lodash/merge.js'
import {
  CrossLayerProps,
  ServicesContext,
  State,
  state,
  isErrorObject,
} from '@node-in-layers/core'
import { asyncMap } from 'modern-async'
import { QueueService, StartTaskPollingServiceProps } from '../backend/types.js'
import { Task } from '../core/types.js'
import { continueUntil } from '../backend/utils.js'
import { ConfigWithTasks, TasksNamespace } from '../types.js'
import { MemoryServices } from './types.js'

const DEFAULT_POLL_INTERVAL_MS = 10

export const create = (
  context: ServicesContext<ConfigWithTasks>
): MemoryServices => {
  const queueByKey: State<Record<string, ReadonlyArray<Task>>> = state<
    Record<string, ReadonlyArray<Task>>
  >({})
  const pollIntervalMs =
    context.config[TasksNamespace.Memory]?.queue?.pollIntervalMs ??
    DEFAULT_POLL_INTERVAL_MS

  const enqueueTask = (props: { task: Task }) => {
    return Promise.resolve().then(async () => {
      const key = `${props.task.domain}.${props.task.feature}`
      const get = queueByKey.get()
      const queueContainer = get.instance() ?? {}
      const queue = queueContainer[key] ?? []
      const newQueue: Task[] = queue.concat(props.task)
      const newQueueByKey = merge({}, queueContainer, { [key]: newQueue })
      queueByKey.set(newQueueByKey)
      return undefined
    })
  }

  const dequeueTask: QueueService['dequeueTask'] = props => {
    return Promise.resolve().then(async () => {
      const get = queueByKey.get()
      const key = `${props.queue.domain}.${props.queue.feature}`
      const queueContainer = get.instance() ?? {}
      const queue = queueContainer[key] ?? []
      const first = queue[0]
      const rest = queue.slice(1)
      const newQueueByKey = merge({}, queueContainer, { [key]: rest })
      queueByKey.set(newQueueByKey)
      return first
    })
  }

  const startTaskPolling = (
    props: StartTaskPollingServiceProps,
    crossLayerProps?: CrossLayerProps
  ) => {
    const keys = props.queues.map(queue => `${queue.domain}.${queue.feature}`)
    return Promise.resolve().then(async () => {
      await continueUntil(
        async () => {
          const get = queueByKey.get()
          const queues = Object.keys(get.instance() ?? {})
          const filtered = queues.filter(queue => keys.includes(queue))
          await asyncMap(filtered, async q => {
            const [domain, feature] = q.split('.')
            await continueUntil(
              async () => {
                const task = await dequeueTask({ queue: { domain, feature } })
                if (isErrorObject(task)) {
                  return false
                }
                if (task) {
                  await props.handler({ taskId: task.id }, crossLayerProps)
                }
                return task
              },
              (_, current) => {
                if (props.abortSignal?.aborted) {
                  return false
                }
                if (current) {
                  return true
                }
                return false
              },
              {
                timeoutMs: -1,
                maxPolls: -1,
                pollIntervalMs,
              }
            )
          })
        },
        () => {
          if (props.abortSignal?.aborted) {
            return false
          }
          return true
        },
        {
          timeoutMs: -1,
          maxPolls: -1,
          pollIntervalMs,
        }
      )
      return undefined
    })
  }

  return {
    enqueueTask,
    dequeueTask,
    startTaskPolling,
  }
}
