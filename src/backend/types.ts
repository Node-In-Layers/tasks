import { JsonObj, JsonAble, PrimaryKeyType } from 'functional-models'
import {
  AnnotatedFunctionProps,
  Response,
  FeaturesContext,
  LayerFunction,
  LayerContext,
  Config,
  CrossLayerProps,
  LogLevelNames,
  System,
  NilAnnotatedFunction,
  XOR,
} from '@node-in-layers/core'
import { TasksNamespace } from '../types.js'
import {
  CoreServicesLayer,
  TaskPriority,
  TaskRetryConfig,
  TaskExecutionResponse,
  Task,
  TaskCallbackConditions,
  TaskFeatureProps,
} from '../core/types.js'

// Request to create a new task
export type CreateTaskProps<
  TConfig extends ConfigWithTasks = ConfigWithTasks,
  TContext extends FeaturesContext<TConfig> = FeaturesContext<TConfig>,
> = Readonly<{
  context: TContext
  name: string
  description?: string
  domain: string
  feature: string
  scheduledAt?: Date
  rootTaskId?: PrimaryKeyType
  parentTaskId?: PrimaryKeyType
  taskPriority?: TaskPriority
  payload?: Record<string, JsonAble>
  retryConfig?: TaskRetryConfig
  userId?: string
  /**
   * For internal use only. Don't provide.
   */
  _id?: PrimaryKeyType
}>

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

export type TaskQueueRegistration = Readonly<{
  domain: string
  feature: string
}>

export type StartTaskPollingServiceProps = Readonly<{
  queues: readonly TaskQueueRegistration[]
  handler: LayerFunction<(props: { taskId: PrimaryKeyType }) => Promise<void>>
  abortSignal?: AbortSignal
}>

export type QueueService = Readonly<{
  enqueueTask: LayerFunction<(props: { task: Task }) => Promise<Response<void>>>
  dequeueTask: LayerFunction<
    (props: { taskId: PrimaryKeyType }) => Promise<Response<void>>
  >
  startTaskPolling: LayerFunction<
    (props: StartTaskPollingServiceProps) => Promise<Response<void>>
  >
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

export type TasksConfig = Readonly<{
  [TasksNamespace.Backend]: {
    queue: TaskQueueConfig
    bullMq: BullMqTaskQueueConfig
    callbacks: CallbackConfig
  }
}>

export type ConfigWithTasks = TasksConfig & Config

export type TasksServices = QueueService & Readonly<object>

export type TasksServicesLayer = CoreServicesLayer &
  Readonly<{
    [TasksNamespace.Backend]: TasksServices
  }>

export type CreateTaskFeatureMethod = {
  <TProps extends JsonObj, TOutput extends JsonObj = JsonObj>(
    props: AnnotatedFunctionProps<TProps, TOutput>,
    implementation: XOR<
      LayerFunction<(props: TProps) => Promise<Response<TOutput>>>,
      NilAnnotatedFunction<TProps, TOutput>
    >
  ): NilAnnotatedFunction<TaskFeatureProps<TProps>, TaskExecutionResponse>
  <TProps extends JsonObj, TOutput extends JsonObj = JsonObj>(
    implementation: NilAnnotatedFunction<TProps, TOutput>
  ): NilAnnotatedFunction<TaskFeatureProps<TProps>, TaskExecutionResponse>
}

export type RegisterTaskCallbackProps = Readonly<{
  sourceDomain: string
  sourceFeature: string
  targetDomain: string
  targetFeature: string
  conditions: TaskCallbackConditions
  retryConfig?: TaskRetryConfig
  method: LayerFunction<(props: { task: Task }) => Promise<void>>
}>

export type StartTaskPollingFeatureProps = Readonly<{
  abortSignal?: AbortSignal
}>

export type TasksFeatures = Readonly<{
  createTaskFeature: CreateTaskFeatureMethod
  registerTaskCallback: LayerFunction<
    (props: RegisterTaskCallbackProps) => void
  >
  startTaskPolling: LayerFunction<
    (props: StartTaskPollingFeatureProps) => Promise<Response<void>>
  >
  awaitTask: <TResult extends JsonObj = JsonObj>(
    props: {
      taskId: PrimaryKeyType
      timeoutMs?: number
      pollIntervalMs?: number
      maxPolls?: number
    },
    crossLayerProps?: CrossLayerProps
  ) => Promise<Response<TResult>>
  executeTaskAndWait: <
    TProps extends JsonObj,
    TResult extends JsonObj = JsonObj,
  >(
    props: {
      taskFunction: NilAnnotatedFunction<
        TaskFeatureProps<TProps>,
        TaskExecutionResponse
      >
      payload: TaskFeatureProps<TProps>
      timeoutMs?: number
      pollIntervalMs?: number
      maxPolls?: number
    },
    crossLayerProps?: CrossLayerProps
  ) => Promise<Response<TResult>>
}>

export type TasksFeaturesLayer = Readonly<{
  [TasksNamespace.Backend]: TasksFeatures
}>

export type TaskSystem = System<
  ConfigWithTasks,
  TasksServicesLayer,
  TasksFeaturesLayer
> &
  LayerContext<ConfigWithTasks>
