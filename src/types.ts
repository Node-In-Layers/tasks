import { Config, LogLevelNames } from '@node-in-layers/core'

export enum TasksNamespace {
  Core = '@node-in-layers/tasks',
  Backend = '@node-in-layers/tasks/backend',
  Memory = '@node-in-layers/tasks/memory',
  Workflows = '@node-in-layers/tasks/workflows',
}

type RedisConfig = Readonly<{
  host: string
  port: number
  password?: string
  username?: string
  database?: number
}>

export enum TaskQueueType {
  BullMq = 'bullmq',
}

export type BullMqTaskQueueConfig = Readonly<{
  type: TaskQueueType.BullMq
  redis: RedisConfig
}>

export type TaskQueueConfig = Readonly<{
  /**
   * The enqueue/dequeue service domain to use.
   * This service should support the following functions:
   * - enqueueTask
   * - dequeueTask
   * If not provided, the default (BullMQ/Redis) will be used.
   * Format: domain.
   */
  enqueueService?: string
}>

export const NoneType = 'none'

export type CallbackConfig = Readonly<{
  callbackFailedLogLevel?: LogLevelNames | typeof NoneType
}>

export type MemoryQueueConfig = Readonly<{
  /**
   * Poll interval (ms) used by in-memory queue polling loops.
   * Set to 0 for maximum responsiveness (busy polling).
   */
  pollIntervalMs?: number
}>

export type MemoryTasksConfig = Readonly<{
  queue?: MemoryQueueConfig
}>

export type TasksConfig = Readonly<{
  [TasksNamespace.Backend]?: {
    /**
     * If true, no task will ever be enqueued. It will always be executed immediately.
     * This is useful for development / local execution.
     */
    executeNow?: boolean
    queue?: TaskQueueConfig
    bullMq?: BullMqTaskQueueConfig
    callbacks?: CallbackConfig
  }
  [TasksNamespace.Memory]?: MemoryTasksConfig
}>

export type ConfigWithTasks = TasksConfig & Config
