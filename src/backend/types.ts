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

/**
 * Backend task layer contracts: how tasks are created, queued (BullMQ), executed
 * by registered runners, and chained via callbacks. Shapes here mirror
 * `features.ts` (orchestration + persistence) and `services.ts` (Redis/BullMQ).
 */

/**
 * Input for persisting a task row then optionally enqueueing or running it inline.
 * @interface
 */
export type CreateTaskProps<
  TConfig extends ConfigWithTasks = ConfigWithTasks,
  TContext extends FeaturesContext<TConfig> = FeaturesContext<TConfig>,
> = Readonly<{
  /** Features context (config, services, log). Required for CRUD and queue resolution. */
  context: TContext
  /** Human-oriented label; also used when auto-naming from `createTaskFeature` (`domain:functionName`). */
  name: string
  /** Human-oriented description. Stored as `Task.description` on the row. */
  description?: string
  /**
   * Logical owner of the task. Combined with `feature` it selects the registered runner
   * (`taskRunners[domain][feature]`) and must match a queue worker registration when polling.
   */
  domain: string
  /**
   * Handler id within `domain`. With `domain`, forms the BullMQ queue name (see `createQueueName`)
   * and must match the runner registered for that pair.
   */
  feature: string
  /**
   * When the job should become eligible. Stored as ISO on the `Task`; the queue service turns it
   * into BullMQ `delay` (ms until `scheduledAt`). Omit for immediate eligibility after enqueue.
   */
  scheduledAt?: Date
  /**
   * Top of a task tree. Callback tasks copy the parent's `rootTaskId` or default it to the
   * parent's own id when the parent had no root, so descendant work stays grouped.
   */
  rootTaskId?: PrimaryKeyType
  /**
   * Direct predecessor. Callback tasks set this to the completed source task's id; unrelated
   * tasks leave it unset. Independent of `rootTaskId` except that callbacks normalize root.
   */
  parentTaskId?: PrimaryKeyType
  /** Stored as `Task.priority`; defaults to `TaskPriority.Normal` when omitted. */
  taskPriority?: TaskPriority
  /**
   * Business input for the runner. Stripped of task-control metadata before execution; the runner
   * receives only this object (see `_createTaskFeatureRunner`).
   */
  payload?: Record<string, JsonAble>
  /**
   * Persisted on the `Task` and merged with per-call `crossLayerProps` during execution
   * (`createTaskCrossLayerProps`), so logging and tracing can carry request-scoped ids across enqueue
   * and worker boundaries.
   */
  crossLayerProps?: CrossLayerProps<Record<string, JsonAble>>
  /**
   * Stored on the task record. Spawned callback tasks use the mapping's `retryConfig` when present,
   * otherwise this shape applies to the created row only as stored metadata (BullMQ attempts also
   * come from config `bullMq.jobOptions` in the queue service).
   */
  retryConfig?: TaskRetryConfig
  /**
   * Optional Unix timestamp (seconds) for automatic database roll-out. When omitted, the Tasks
   * model applies `config[TasksNamespace.Core].defaultTtl` seconds from now unless `noTTL` is true.
   */
  ttl?: number
  /** Copied onto the row and onto callback-spawned tasks so downstream work keeps the same actor. */
  userId?: string
  /**
   * Internal or advanced: fix the primary key before insert (e.g. tests). Normally omit so the ORM
   * generates an id. When set, enqueue uses this id as the BullMQ job id (`String(task.id)`).
   */
  _id?: PrimaryKeyType
}>

/**
 * Identifies a BullMQ queue: must match `domain`/`feature` keys used in `enqueueTask` and worker setup.
 * @interface
 */
export type TaskQueueRegistration = Readonly<{
  /** Domain segment of the BullMQ queue name; must match the task row's `domain`. */
  domain: string
  /** Feature segment of the BullMQ queue name; must match the task row's `feature`. */
  feature: string
}>

/**
 * Argument object passed to the polling `handler` when a worker dequeues a job (`services.ts`).
 * @interface
 */
export type TaskPollingHandlerProps = Readonly<{
  /** Primary key of the persisted `Task` row to load and execute. */
  taskId: PrimaryKeyType
}>

/**
 * Argument to `QueueService.enqueueTask`.
 * @interface
 */
export type EnqueueTaskServiceProps = Readonly<{
  /** Task row to serialize as BullMQ job data; `id`, `domain`, and `feature` drive queue routing. */
  task: Task
}>

/**
 * Argument to `QueueService.dequeueTask`.
 * @interface
 */
export type DequeueTaskServiceProps = Readonly<{
  /** Which logical queue to read from (env + domain + feature). */
  queue: TaskQueueRegistration
}>

/**
 * Argument passed to `RegisterTaskCallbackProps.method` when the callback task runs.
 * @interface
 */
export type RegisterTaskCallbackHandlerProps = Readonly<{
  /** The callback task row; its `payload` holds the snapshot of the completed source task. */
  task: Task
}>

/**
 * First argument to `TasksFeatures.awaitTask`: identifies the task and bounds the poll loop.
 * @interface
 */
export type AwaitTaskProps = Readonly<{
  /** Task row primary key to poll via CRUD until a terminal status or limits hit. */
  taskId: PrimaryKeyType
  /** Maximum wall time for polling before `continueUntil` stops with a timeout error. */
  timeoutMs?: number
  /** Delay between reads of the task row while waiting for completion. */
  pollIntervalMs?: number
  /** Hard cap on how many times the row is fetched; combined with `timeoutMs` by `continueUntil`. */
  maxPolls?: number
}>

/**
 * First argument to `TasksFeatures.executeTaskAndWait`: enqueue-or-run plus wait bounds.
 * @interface
 */
export type ExecuteTaskAndWaitProps<TProps extends JsonObj> = Readonly<{
  /** Annotated task feature used to create or run the task and return a `taskId`. */
  taskFunction: NilAnnotatedFunction<
    TaskFeatureProps<TProps>,
    TaskExecutionResponse
  >
  /** Inputs for that task feature, including optional task-control metadata for inline execution. */
  payload: TaskFeatureProps<TProps>
  /** Maximum wall time for the wait phase only (after `taskFunction` returns a `taskId`). */
  timeoutMs?: number
  /** Delay between CRUD reads while waiting for the task to finish. */
  pollIntervalMs?: number
  /** Maximum poll iterations during the wait phase. */
  maxPolls?: number
}>

/**
 * Passed from features into the queue service's `startTaskPolling`. The feature layer builds
 * `queues` from every registered `domain`/`feature` pair that has a task runner.
 * @interface
 */
export type StartTaskPollingServiceProps = Readonly<{
  /** One worker per entry; each listens on the queue name derived from env + domain + feature. */
  queues: readonly TaskQueueRegistration[]
  /**
   * Invoked with the persisted task's id when a BullMQ job runs. Typically wires to `_executeTask`,
   * which loads the row, requires `Pending` status, then dispatches to the runner for that domain/feature.
   */
  handler: LayerFunction<(props: TaskPollingHandlerProps) => Promise<void>>
  /**
   * When aborted, the service closes all workers it created for this polling session. If already
   * aborted at start, workers are closed immediately after registration.
   */
  abortSignal?: AbortSignal
}>

/**
 * Infrastructure surface for Redis/BullMQ (`services.ts`). Each method is a `LayerFunction`, so
 * callers pass optional `crossLayerProps` for logging and tracing (used on `startTaskPolling`).
 * @interface
 */
export type QueueService = Readonly<{
  /**
   * Adds a job named by `String(task.id)` to the queue for `task.domain`/`task.feature`.
   * Uses `task.scheduledAt` for delay. On failure, the feature layer marks the task `Failed` with
   * the error in `result`.
   */
  enqueueTask: LayerFunction<
    (props: EnqueueTaskServiceProps) => Promise<Response<void>>
  >
  /**
   * Peeks/removes the first job from the named queue (diagnostics or custom tooling); not used on
   * the main execute path, which is worker-driven.
   */
  dequeueTask: LayerFunction<
    (props: DequeueTaskServiceProps) => Promise<Response<Task | void>>
  >
  /**
   * Replaces active workers: closes any previous workers from this service instance, then starts
   * one BullMQ worker per `queues` entry. Each worker runs `handler` with the deserialized `Task`'s id.
   */
  startTaskPolling: LayerFunction<
    (props: StartTaskPollingServiceProps) => Promise<Response<void>>
  >
}>

/**
 * Task queue operations only; the backend services object is this type for now.
 * @interface
 */
export type TasksServices = QueueService & Readonly<object>

/**
 * Services the task feature layer expects: core CRUDs (tasks, callback mappings) plus
 * `[TasksNamespace.Backend]` for queue I/O. Queue resolution can target another domain's
 * `QueueService` when `config[TasksNamespace.Backend].queue.enqueueService` is set.
 * @interface
 */
export type TasksServicesLayer = CoreServicesLayer &
  Readonly<{
    /**
     * Task backend services: BullMQ-backed `QueueService` for enqueue, dequeue, and polling workers.
     */
    [TasksNamespace.Backend]: TasksServices
  }>

/**
 * Factory overload used by `createTask` feature wiring:
 * - Registers a runner for `(annotationProps.domain, annotationProps.functionName)` that invokes
 *   the provided `implementation` with the task payload.
 * - Returns a `NilAnnotatedFunction` that creates a `Task` row, then either runs inline when
 *   `payload[TaskControlProp].executeNow` or `config[TasksNamespace.Backend].executeNow` is true,
 *   or enqueues via the configured queue service; return type is always `TaskExecutionResponse`
 *   (`{ taskId }` or an error).
 * @interface
 */
export type CreateTaskFeatureMethod = {
  <TProps extends JsonObj, TOutput extends JsonObj = JsonObj>(
    /** Zod schemas and metadata (`domain`, `functionName`, etc.) for the generated task feature. */
    props: AnnotatedFunctionProps<TProps, TOutput>,
    /** Code that runs when a worker executes the task; receives stripped `payload` only. */
    implementation: XOR<
      LayerFunction<(props: TProps) => Promise<Response<TOutput>>>,
      NilAnnotatedFunction<TProps, TOutput>
    >
  ): NilAnnotatedFunction<TaskFeatureProps<TProps>, TaskExecutionResponse>
  <TProps extends JsonObj, TOutput extends JsonObj = JsonObj>(
    /** Nil-annotated implementation; domain and function name come from the annotation on this value. */
    implementation: NilAnnotatedFunction<TProps, TOutput>
  ): NilAnnotatedFunction<TaskFeatureProps<TProps>, TaskExecutionResponse>
}

/**
 * Declares that when a task in `sourceDomain`/`sourceFeature` finishes (subject to `conditions`),
 * a new pending task is created for `targetDomain`/`targetFeature` with payload equal to the full
 * completed source `Task`, `parentTaskId` set to the source id, and `rootTaskId` carried or defaulted.
 *
 * In-memory registrations are merged at runtime with ORM `TaskCallbackMappings` rows for the same source pair.
 * @interface
 */
export type RegisterTaskCallbackProps = Readonly<{
  /** Domain of the task whose completion can trigger callback scheduling. */
  sourceDomain: string
  /** Feature name within `sourceDomain` that identifies the triggering task handler. */
  sourceFeature: string
  /** Domain for the newly created callback task row and runner lookup. */
  targetDomain: string
  /** Feature name within `targetDomain` for the callback runner registered alongside `method`. */
  targetFeature: string
  /**
   * Predicate flags on `TaskCallbackConditions` evaluated after the source task finishes.
   */
  conditions: TaskCallbackConditions
  /** Applied to the spawned callback task row; overrides are not inherited from the source task's retry. */
  retryConfig?: TaskRetryConfig
  /**
   * Invoked when a callback task row reaches execution; argument shape is `RegisterTaskCallbackHandlerProps`.
   */
  method: LayerFunction<
    (props: RegisterTaskCallbackHandlerProps) => Promise<void>
  >
}>

/**
 * Feature-level options for starting workers; forwarded to the queue service as part of polling props.
 * @interface
 */
export type StartTaskPollingFeatureProps = Readonly<{
  /**
   * When fired, closes workers started for this polling session; if already aborted before start,
   * workers shut down immediately after registration.
   */
  abortSignal?: AbortSignal
}>

export type CleanUpTasksResponse = Readonly<{
  deletedCount: number
  cancelledCount: number
}>

export type CleanUpTasksProps = Readonly<JsonObj>

/**
 * Public task API on the backend namespace. All `LayerFunction` members accept trailing `crossLayerProps`
 * for tracing; pass them through on every nested service call.
 * @interface
 */
export type TasksFeatures = Readonly<{
  /**
   * Registers a task runner and returns a nil-annotated function that persists a `Task` then either
   * runs it immediately or enqueues it, depending on task control flags and config.
   */
  createTaskFeature: CreateTaskFeatureMethod
  /**
   * Registers an in-code callback mapping and ensures `targetDomain`/`targetFeature` has a runner
   * that delegates to `method` (separate from domain-defined `createTaskFeature` runners).
   */
  registerTaskCallback: LayerFunction<
    (props: RegisterTaskCallbackProps) => void
  >
  /**
   * Resolves the queue service, derives `queues` from all registered runners, and starts polling.
   * If no runners exist yet, polling still runs but logs a warning. Idempotent workers are recreated
   * each call on the service side (previous workers for this service instance are closed first).
   */
  startTaskPolling: LayerFunction<
    (props: StartTaskPollingFeatureProps) => Promise<Response<void>>
  >
  /**
   * Polls an existing task row until it reaches a terminal status or polling limits apply.
   * On `Completed`, returns `task.result`. On `Failed` or `Cancelled`, returns a structured error
   * when `result.error` exists. Does not enqueue or run the task.
   */
  awaitTask: <TResult extends JsonObj = JsonObj>(
    /** Which task to watch and how long or how often to poll the CRUD store. */
    props: AwaitTaskProps,
    /**
     * Optional tracing and logging context for API symmetry with other feature methods; the wait
     * loop implementation currently reads only `props` from persistence.
     */
    crossLayerProps?: CrossLayerProps
  ) => Promise<Response<TResult>>
  /**
   * Runs a nil-annotated task feature to obtain a `taskId`, then polls that task to completion
   * using the same rules as `awaitTask`. Polling limits apply only after `taskFunction` resolves.
   */
  executeTaskAndWait: <
    TProps extends JsonObj,
    TResult extends JsonObj = JsonObj,
  >(
    /** Task feature reference, payload, and optional wait-phase polling limits. */
    props: ExecuteTaskAndWaitProps<TProps>,
    /**
     * Passed as the second argument to `taskFunction` for cross-layer tracing; not consulted by the
     * built-in wait loop when polling the task row.
     */
    crossLayerProps?: CrossLayerProps
  ) => Promise<Response<TResult>>
  /**
   * Deletes expired tasks and marks long-running tasks as failed, then enqueues matching callbacks.
   */
  cleanUpTasks: NilAnnotatedFunction<CleanUpTasksProps, CleanUpTasksResponse>
}>

/**
 * Features exposed under the tasks backend namespace key.
 * @interface
 */
export type TasksFeaturesLayer = Readonly<{
  /**
   * Task backend features: task feature factory, callbacks, polling, and wait helpers.
   */
  [TasksNamespace.Backend]: TasksFeatures
}>

/**
 * Fully typed system: `ConfigWithTasks` supplies backend/task settings; services include core CRUDs
 * and the queue implementation; features expose task creation, callbacks, polling, and wait helpers.
 * Intersects `LayerContext` so callers also see config, log, and constants on the loaded system object.
 * @interface
 */
export type TaskSystem = System<
  ConfigWithTasks,
  TasksServicesLayer,
  TasksFeaturesLayer
> &
  LayerContext<ConfigWithTasks>
