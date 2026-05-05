import { Queue, Worker } from 'bullmq'
import {
  ServicesContext,
  createErrorObject,
  CrossLayerProps,
  isErrorObject,
  state,
} from '@node-in-layers/core'
import { TasksNamespace, ConfigWithTasks } from '../types.js'
import { CoreServicesLayer, Task } from '../core/types.js'
import {
  TasksServices,
  StartTaskPollingServiceProps,
  TaskQueueRegistration,
  QueueService,
} from './types.js'
import { createQueueName } from './libs.js'

const DEFAULT_REDIS_PORT = 6379
const HOURS = 1
const MINUTES_PER_HOUR = 60
const SECONDS_PER_MINUTE = 60
const MILLISECONDS = 1000
const DEFAULT_BULLMQ_LOCK_DURATION_MS =
  HOURS * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MILLISECONDS

const create = (
  context: ServicesContext<ConfigWithTasks, CoreServicesLayer>
): TasksServices => {
  const activeWorkers = state<ReadonlyArray<Worker<Task, any, string>>>([])

  const closeActiveWorkers = () =>
    Promise.resolve().then(async () => {
      await Promise.all(
        activeWorkers
          .get()
          .instance()
          ?.map(worker => worker.close()) ?? []
      )
      activeWorkers.set([])
    })

  const _getQueueConnection = () => {
    const config = context.config[TasksNamespace.Backend]
    if (!config) {
      return createErrorObject(
        'CONFIG_ERROR',
        `Namespace ${TasksNamespace.Backend} does not exist in config.`
      )
    }

    const redis = config.bullMq?.redis || ({} as any)
    return {
      host: redis.host || '127.0.0.1',
      port: redis.port || DEFAULT_REDIS_PORT,
      password: redis.password || undefined,
      username: redis.username || undefined,
      db: typeof redis.database === 'number' ? redis.database : undefined,
    }
  }

  const _getBullMqQueueOptions = () => {
    const config = context.config[TasksNamespace.Backend]
    return (config?.bullMq?.queueOptions ?? {}) as Record<string, any>
  }

  const _getBullMqJobOptions = () => {
    const config = context.config[TasksNamespace.Backend]
    return (config?.bullMq?.jobOptions ?? {}) as Record<string, any>
  }

  const _getBullMqWorkerOptions = () => {
    const config = context.config[TasksNamespace.Backend]
    const workerOptions = (config?.bullMq?.workerOptions ?? {}) as Record<
      string,
      any
    >

    const lockDurationMsFromConfig = config?.bullMq?.lockDurationMs
    const lockDurationMs =
      typeof workerOptions.lockDuration === 'number'
        ? undefined
        : typeof lockDurationMsFromConfig === 'number'
          ? lockDurationMsFromConfig
          : DEFAULT_BULLMQ_LOCK_DURATION_MS

    return {
      ...workerOptions,
      ...(typeof lockDurationMs === 'number'
        ? { lockDuration: lockDurationMs }
        : {}),
    }
  }

  const enqueueTask = (props: { task: Task }) => {
    return Promise.resolve().then(async () => {
      const task = props.task
      const connection = _getQueueConnection()
      if (isErrorObject(connection)) {
        return connection
      }
      const environment = context.constants.environment
      const queueName = createQueueName(environment, task.domain, task.feature)
      const queue = new Queue<Task, any, string>(queueName, {
        ..._getBullMqQueueOptions(),
        connection,
      })

      const delay = task.scheduledAt
        ? Math.max(0, new Date(task.scheduledAt).getTime() - Date.now())
        : 0

      const jobOptions = _getBullMqJobOptions()
      const attempts =
        typeof jobOptions.attempts === 'number' ? jobOptions.attempts : 1
      const removeOnComplete =
        jobOptions.removeOnComplete === undefined
          ? true
          : jobOptions.removeOnComplete
      const removeOnFail =
        jobOptions.removeOnFail === undefined ? false : jobOptions.removeOnFail

      return queue
        .add(String(task.id), task, {
          ...jobOptions,
          attempts,
          jobId: String(task.id),
          delay,
          removeOnComplete,
          removeOnFail,
        })
        .then(async () => {
          await queue.close()
          return undefined
        })
        .catch(async e => {
          await queue.close().catch(() => undefined)
          return createErrorObject(
            'TASK_ENQUEUE_FAILED',
            `Failed to enqueue task ${task.id}`,
            e as Error
          )
        })
    })
  }

  const dequeueTask: QueueService['dequeueTask'] = (props: {
    queue: TaskQueueRegistration
  }) => {
    return Promise.resolve().then(async () => {
      const connection = _getQueueConnection()
      if (isErrorObject(connection)) {
        return connection
      }
      const environment = context.constants.environment
      const queueName = createQueueName(
        environment,
        props.queue.domain,
        props.queue.feature
      )
      const queue = new Queue<Task, any, string>(queueName, {
        ..._getBullMqQueueOptions(),
        connection,
      })

      return queue
        .getJobs()
        .then(async jobs => {
          const job = jobs[0]
          if (job) {
            await job.remove()
          }
          await queue.close()
          return job.data
        })
        .catch(async e => {
          await queue.close().catch(() => undefined)
          return createErrorObject(
            'TASK_DEQUEUE_FAILED',
            `Failed to dequeue task`,
            e as Error
          )
        })
    })
  }

  const startTaskPolling = (
    props: StartTaskPollingServiceProps,
    crossLayerProps?: CrossLayerProps
  ) => {
    return Promise.resolve().then(async () => {
      const connection = _getQueueConnection()
      if (isErrorObject(connection)) {
        return connection
      }

      const log = context.log.getInnerLogger(
        'startTaskPolling',
        crossLayerProps
      )
      await closeActiveWorkers()
      const environment = context.constants.environment
      const workers = props.queues.map(queueRegistration => {
        const queueName = createQueueName(
          environment,
          queueRegistration.domain,
          queueRegistration.feature
        )
        log.debug('Starting worker for queue', {
          queueName,
          domain: queueRegistration.domain,
          feature: queueRegistration.feature,
        })

        const worker = new Worker<Task, any, string>(
          queueName,
          async job => {
            await props.handler({ taskId: job.data.id }, crossLayerProps)
          },
          {
            ..._getBullMqWorkerOptions(),
            connection,
          }
        )

        worker.on('error', error => {
          log.debug(
            'Worker error',
            createErrorObject(
              'WORKER_ERROR',
              `Worker error on queue ${queueName}`,
              error
            )
          )
        })

        return worker
      })

      log.debug('Task polling started', { workerCount: workers.length })
      activeWorkers.set(workers)
      if (props.abortSignal) {
        props.abortSignal.addEventListener('abort', async () => {
          await closeActiveWorkers()
        })
        if (props.abortSignal.aborted) {
          await closeActiveWorkers()
        }
      }

      return undefined
    })
  }

  return {
    enqueueTask,
    dequeueTask,
    startTaskPolling,
  }
}

export { create }
