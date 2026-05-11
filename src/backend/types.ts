import { JsonObj, JsonAble, PrimaryKeyType } from 'functional-models'
import {
  AnnotatedFunctionProps,
  Response,
  FeaturesContext,
  LayerFunction,
  LayerContext,
  CrossLayerProps,
  System,
  NilAnnotatedFunction,
  XOR,
} from '@node-in-layers/core'
import { TasksNamespace } from '../types.js'
import type { ConfigWithTasks } from '../types.js'
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
  crossLayerProps?: CrossLayerProps<Record<string, JsonAble>>
  retryConfig?: TaskRetryConfig
  userId?: string
  /**
   * For internal use only. Don't provide.
   */
  _id?: PrimaryKeyType
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
    (props: { queue: TaskQueueRegistration }) => Promise<Response<Task | void>>
  >
  startTaskPolling: LayerFunction<
    (props: StartTaskPollingServiceProps) => Promise<Response<void>>
  >
}>

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
