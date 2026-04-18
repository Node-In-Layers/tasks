import { Queue, Worker } from 'bullmq'
import {
  ServicesContext,
  createErrorObject,
  CrossLayerProps,
  isErrorObject,
  getModel,
} from '@node-in-layers/core'
import { PrimaryKeyType } from 'functional-models'
import { TasksNamespace } from '../types.js'
import { CoreServicesLayer, Task } from '../core/types.js'
import {
  TasksServices,
  ConfigWithTasks,
  StartTaskPollingServiceProps,
} from './types.js'
import { createQueueName } from './libs.js'

const DEFAULT_REDIS_PORT = 6379

const create = (
  context: ServicesContext<ConfigWithTasks, CoreServicesLayer>
): TasksServices => {
  const _getQueueConnection = () => {
    const config = context.config[TasksNamespace.Backend]
    if (!config) {
      return createErrorObject(
        'CONFIG_ERROR',
        `Namespace ${TasksNamespace.Backend} does not exist in config.`
      )
    }

    const redis = config.bullMq.redis || ({} as any)
    return {
      host: redis.host || '127.0.0.1',
      port: redis.port || DEFAULT_REDIS_PORT,
      password: redis.password || undefined,
      username: redis.username || undefined,
      db: typeof redis.database === 'number' ? redis.database : undefined,
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
      const queue = new Queue<Task, any, string>(queueName, { connection })

      const delay = task.scheduledAt
        ? Math.max(0, new Date(task.scheduledAt).getTime() - Date.now())
        : 0

      return queue
        .add(String(task.id), task, {
          jobId: String(task.id),
          delay,
          removeOnComplete: true,
          removeOnFail: false,
        })
        .then(() => undefined)
        .catch(e =>
          createErrorObject(
            'TASK_ENQUEUE_FAILED',
            `Failed to enqueue task ${task.id}`,
            e as Error
          )
        )
    })
  }

  const dequeueTask = (props: { taskId: PrimaryKeyType }) => {
    return Promise.resolve().then(async () => {
      const TaskModel = getModel<Task>(context, TasksNamespace.Core, 'Tasks')
      const taskModel = await TaskModel.retrieve(props.taskId)
      const task = await taskModel?.toObj<Task>()
      if (!task) {
        return createErrorObject(
          'TASK_NOT_FOUND',
          `Task ${props.taskId} not found.`
        )
      }

      const connection = _getQueueConnection()
      if (isErrorObject(connection)) {
        return connection
      }
      const environment = context.constants.environment
      const queueName = createQueueName(environment, task.domain, task.feature)
      const queue = new Queue<Task, any, string>(queueName, { connection })

      return queue
        .getJob(String(props.taskId))
        .then(async job => {
          if (job) {
            await job.remove()
          }

          return undefined
        })
        .catch(e =>
          createErrorObject(
            'TASK_DEQUEUE_FAILED',
            `Failed to dequeue task ${props.taskId}`,
            e as Error
          )
        )
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
      const environment = context.constants.environment
      const workers = props.queues.map(queueRegistration => {
        const queueName = createQueueName(
          environment,
          queueRegistration.domain,
          queueRegistration.feature
        )
        log.info('Starting worker for queue', {
          queueName,
          domain: queueRegistration.domain,
          feature: queueRegistration.feature,
        })

        const worker = new Worker<Task, any, string>(
          queueName,
          async job => {
            await props.handler({ taskId: job.data.id }, crossLayerProps)
          },
          { connection }
        )

        worker.on('error', error => {
          log.error(
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

      log.info('Task polling started', { workerCount: workers.length })
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
