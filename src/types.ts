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
  /**
   * Default worker lock duration (ms). If your tasks can run longer than BullMQ's
   * default lock, increase this to avoid "lock has expired" failures.
   *
   * This is applied to BullMQ `Worker` as `lockDuration` unless overridden by
   * `workerOptions.lockDuration`.
   */
  lockDurationMs?: number
  /**
   * Passthrough options for BullMQ `Queue` construction (excluding connection).
   * This is useful for advanced BullMQ tuning without changing code.
   */
  queueOptions?: Readonly<Record<string, unknown>>
  /**
   * Passthrough options for BullMQ `Worker` construction (excluding connection).
   * This is useful for advanced BullMQ tuning without changing code.
   */
  workerOptions?: Readonly<Record<string, unknown>>
  /**
   * Passthrough options for `.add()` calls (job options). Common examples:
   * `removeOnComplete`, `removeOnFail`, `attempts`, `backoff`, etc.
   *
   * NOTE: `jobId` and `delay` are always set by the tasks system.
   */
  jobOptions?: Readonly<Record<string, unknown>>
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

const hoursPerDay = 24
const minutesPerHour = 60
const secondsPerMinute = 60
const defaultTaskTtlDays = 90

export const defaultTaskTtlSeconds =
  defaultTaskTtlDays * hoursPerDay * minutesPerHour * secondsPerMinute

export const defaultMaxTaskRunningSeconds =
  hoursPerDay * minutesPerHour * secondsPerMinute

export const defaultCleanupBatchSize = 100

export type CoreTasksConfig = Readonly<{
  /**
   * Default TTL offset in seconds from task creation time. Defaults to 90 days.
   * Applied when `noTTL` is not true and the task record has no explicit `ttl`.
   * Stored on the task as a Unix timestamp (seconds).
   */
  defaultTtl?: number
  /**
   * When true, task records are created without a TTL even when `defaultTtl` is set.
   */
  noTTL?: boolean
}>

export type BackendTasksConfig = Readonly<{
  /**
   * If true, no task will ever be enqueued. It will always be executed immediately.
   * This is useful for development / local execution.
   */
  executeNow?: boolean
  queue?: TaskQueueConfig
  bullMq?: BullMqTaskQueueConfig
  callbacks?: CallbackConfig
  /**
   * Maximum number of task records to fetch and process per search batch in `cleanUpTasks`.
   */
  cleanupBatchSize?: number
  /**
   * Maximum running time in seconds before `cleanUpTasks` marks a running task as failed.
   * Defaults to 24 hours.
   */
  maxTaskRunningSeconds?: number
}>

export type TasksConfig = Readonly<{
  [TasksNamespace.Core]?: CoreTasksConfig
  [TasksNamespace.Backend]?: BackendTasksConfig
  [TasksNamespace.Memory]?: MemoryTasksConfig
}>

export type ConfigWithTasks = TasksConfig & Config
