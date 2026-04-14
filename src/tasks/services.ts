import { Queue } from 'bullmq'
import { Queue } from 'bullmq'
import {
  ServicesContext,
  createErrorObject,
} from '@node-in-layers/core/index.js'
import {
  TasksServices,
  Task,
  TasksNamespace,
  TaskStatus,
  ConfigWithTasks,
} from './types.js'
import { queryBuilder } from 'functional-models'
import { createQueueName, createRedisDatabaseName } from './libs.js'

const create = (context: ServicesContext<ConfigWithTasks>): TasksServices => {
  const runTaskLocal = (task: Task) => {
    return Promise.resolve().then(async () => {
      const config = context.config[TasksNamespace]
      if (!config) {
        return createErrorObject('CONFIG_ERROR', `Namespace ${TasksNamespace} does not exist in config.`)
      }
      if (config[TasksNamespace]?.runner?.type !== 'local' && config.runner?.type !== 'local') {
        const type = (config[TasksNamespace] as any)?.runner?.type ?? (config as any).runner?.type
        return createErrorObject('LOCAL_CONFIG_ERROR', `Configured task runner was not local. Received ${type}.`)
      }

      const features = (context as any).features?.[TasksNamespace]
      if (!features || !features.registerTaskConsumer) {
        return createErrorObject('TASK_CONSUMER_NOT_FOUND', `registerTaskConsumer feature not found on ${TasksNamespace}.`)
      }

      const consumer = features.registerTaskConsumer() as (props: { taskId: string }) => Promise<void>

      await consumer({ taskId: task.id })
      return {}
    })
  }

  const runTaskDocker = (task: Task) => {
    return Promise.resolve().then(() => {
      const config = context.config[TasksNamespace]
      if (!config) {
        return createErrorObject('CONFIG_ERROR', `Namespace ${TasksNamespace} does not exist in config.`)
      }
      if (config[TasksNamespace]?.runner?.type !== 'docker' && config.runner?.type !== 'docker') {
        const type = (config[TasksNamespace] as any)?.runner?.type ?? (config as any).runner?.type
        return createErrorObject('DOCKER_CONFIG_ERROR', `Configured task runner was not docker. Received ${type}.`)
      }

      return createErrorObject('DOCKER_NOT_IMPLEMENTED', 'Docker task runner is not implemented yet.')
    })
  }

  const enqueueTask = (props: { task: Task }) => {
    return Promise.resolve().then(async () => {
      const config = context.config[TasksNamespace]
      if (!config) {
        return createErrorObject('CONFIG_ERROR', `Namespace ${TasksNamespace} does not exist in config.`)
      }

      const task = props.task
      const redis = config.bullMq.redis || ({} as any)
      const environment = context.constants.environment
      const systemName = context.config.systemName

      const connection = {
        host: redis.host || '127.0.0.1',
        port: redis.port || 6379,
        password: redis.password || undefined,
        username: redis.username || undefined,
        db: typeof redis.database === 'number' ? redis.database : undefined,
      }

      const queueName = createQueueName(task.domain, task.feature, environment)

      const queue = new Queue<Task>(queueName, { connection })

      const delay = task.scheduledAt
        ? Math.max(0, new Date(task.scheduledAt).getTime() - Date.now())
        : 0

      try {
        await queue.add(task.id, task, {
          jobId: task.id,
          delay,
          removeOnComplete: true,
          removeOnFail: false,
        })
        return {}
      } catch (e) {
        return createErrorObject('TASK_ENQUEUE_FAILED', `Failed to enqueue task ${task.id}`, e as Error)
      }
    })
  }

  const dequeueTask = (props: { taskId: string }) => {
    return Promise.resolve().then(async () => {
      const config = context.config[TasksNamespace]
      if (!config) {
        return createErrorObject('CONFIG_ERROR', `Namespace ${TasksNamespace} does not exist in config.`)
      }

      const taskModel = await context.services[TasksNamespace].cruds.Tasks.retrieve(props.taskId)
      const task = taskModel?.toObj<Task>()
      if (!task) {
        return createErrorObject('TASK_NOT_FOUND', `Task ${props.taskId} not found.`)
      }

      const redis = config.bullMq.redis || ({} as any)
      const environment = context.constants.environment
      const systemName = context.config.systemName

      const connection = {
        host: redis.host || '127.0.0.1',
        port: redis.port || 6379,
        password: redis.password || undefined,
        username: redis.username || undefined,
        db: typeof redis.database === 'number' ? redis.database : undefined,
      }

      const queueName = createQueueName(task.domain, task.feature, environment)

      const queue = new Queue<Task>(queueName, { connection })

      try {
        const job = await queue.getJob(props.taskId)
        if (job) {
          await job.remove()
        }
        return {}
      } catch (e) {
        return createErrorObject('TASK_DEQUEUE_FAILED', `Failed to dequeue task ${props.taskId}`, e as Error)
      }
    })
  }

  const evaluateTaskBySubTasks = (taskId: string) => {
    return Promise.resolve().then(async () => {
      const taskModel = await context.services[TasksNamespace].cruds.Tasks.retrieve(taskId)
      const task = taskModel?.toObj<Task>()
      if (!task) {
        return createErrorObject('TASK_NOT_FOUND', `Task ${taskId} not found.`)
      }

      const search = queryBuilder()
        .property('parentTaskId', taskId)
        .compile()

      const searchResult = await context.services[TasksNamespace].cruds.Tasks.search(search)
      const children = await Promise.all(searchResult.instances.map((x) => x.toObj<Task>()))

      if (children.length === 0) {
        return {
          completed: true,
          status: task.status as TaskStatus.Completed | TaskStatus.Failed | TaskStatus.Cancelled,
        }
      }

      const hasRunningOrPending = children.some((c) =>
        [TaskStatus.Pending, TaskStatus.Running, TaskStatus.Scheduled].includes(c.status)
      )

      if (hasRunningOrPending) {
        return {
          completed: false,
          status: task.status as TaskStatus.Completed | TaskStatus.Failed | TaskStatus.Cancelled,
        }
      }

      const hasFailed = children.some((c) => c.status === TaskStatus.Failed)
      const hasCancelled = children.some((c) => c.status === TaskStatus.Cancelled)

      const status: TaskStatus.Completed | TaskStatus.Failed | TaskStatus.Cancelled =
        hasFailed ? TaskStatus.Failed : hasCancelled ? TaskStatus.Cancelled : TaskStatus.Completed

      return {
        completed: true,
        status,
      }
    })
  }

  return {
    enqueueTask,
    dequeueTask,
    runTaskLocal,
    runTaskDocker,
    evaluateTaskBySubTasks,
  }
}

export { create }
