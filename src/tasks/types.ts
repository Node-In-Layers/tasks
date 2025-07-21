import { JsonObj, JsonAble } from 'functional-models'
import { 
  Response, 
  FeaturesContext, 
  LayerFunction, 
  LayerContext, 
  Config,
  ModelCrudsFunctions,
  CrossLayerProps,
} from '@node-in-layers/core'


export enum TaskStatus {
  Pending='pending',
  Scheduled='scheduled',
  Running='running',
  Completed='completed',
  Failed='failed',
  Cancelled='cancelled'
}
  
export enum TaskPriority {
  Low='low',
  Normal='Normal',
  High='High',
  Urgent='Urgent'
}

export type TaskRetryConfig = Readonly<{
  /**
   * The number of retries. -1, means infinite retries.
   */
  maxRetries: number
  backoffMultiplier?: number
  initialDelayMs?: number
}>

/**
 * A callback for when a task has ended.
 * Modeled.
 * @interface
 */
export type TaskCallback = Readonly<{
  /**
   * The unique id of this object.
   */
  id: string
  /**
   * The domain the feature is in.
   */
  domain: string
  /**
   * The feature to execute.
   */
  feature: string 
  /**
   * Additional data to pass to the callback.
   */
  payload?: Record<string, JsonAble>
  /**
   * The conditions for running the callback.
   */
  conditions: {
    onSuccess?: boolean
    onFailure?: boolean
    onAnyCompletion?: boolean
  }
  /**
   * Retry configurations.
   */
  retryConfig?: TaskRetryConfig
  /**
   * The date this callback was last called.
   */
  lastCall?: string,
  createdAt?: string,
  updatedAt?: string,
}>

/**
 * The standardized response to the calling of a task based function that starts a task.
 */
export type TaskExecutionResponse = Response<{
  taskId: string
}>

export type TaskResult<T extends JsonObj={}> = Response<T>

/**
 * An asynchronous operation.
 * @interface
 */
export type Task<T extends JsonObj={}> = Readonly<{
  id: string
  /**
   * The top level root task, for aggregate gathering and tracking.
   */
  rootTaskId?: string
  /**
   * The next higher level task for hierarchical tracking.
   */
  parentTaskId?: string
  
  name: string
  description?: string
  domain: string
  feature: string
  
  status: TaskStatus
  priority: TaskPriority
  
  payload: Record<string, JsonAble>
  /**
   * The result of the task. If there is an error, its an error object inside.
   */
  result?: TaskResult<T>
  
  // Scheduling information
  scheduledAt?: string // ISO timestamp - when task should run
  startedAt?: string // When task actually started executing
  completedAt?: string // When task finished (success or failure)
  
  // Callback system
  callbackIds: ReadonlyArray<string> // What to do when this task completes
  
  // Execution metadata
  executionNode?: string // Which worker/node is processing this
  /**
   * Retry configurations.
   */
  retryConfig?: TaskRetryConfig
  
  // Tracking
  userId?: string // User or system that created this task
  createdAt?: string // ISO timestamp
  updatedAt?: string // ISO timestamp
}>

export type CallbackProps = Readonly<{
  domain: string,
  feature: string,
  payload?: Record<string, JsonAble>,
  conditions: {
    onSuccess?: boolean
    onFailure?: boolean
    onAnyCompletion?: boolean
  },
  retryConfig?: TaskRetryConfig,
}>

// Request to create a new task
export type CreateTaskProps<
  TInput extends JsonObj={}, 
  TOutput extends JsonObj={}, 
  TConfig extends ConfigWithTasks=ConfigWithTasks,
  TContext extends FeaturesContext<TConfig>=FeaturesContext<TConfig>
>= Readonly<{
  context: TContext,
  name: string,
  description?: string,
  domain: string,
  feature: string,
  scheduledAt?: Date,
  rootTaskId?: string,
  parentTaskId?: string,
  taskCallbacks?: ReadonlyArray<CallbackProps>,
  taskPriority?: TaskPriority,
  payload?: Record<string, JsonAble>,
  retryConfig?: TaskRetryConfig,
  userId?: string,
}>








// TODO: The following i'm not sure if we need.



// Event types for the eventing system
export type TaskEvent = Readonly<{
  id: string
  taskId: string
  eventType: 'created' | 'started' | 'completed' | 'failed' | 'cancelled' | 'scheduled' | 'child_spawned'
  payload?: Record<string, any>
  timestamp: string
  domain: string
  feature: string
}>

// Subscription for waiting on task completion
export type TaskSubscription = Readonly<{
  id: string
  taskId: string
  subscriberDomain: string
  subscriberFeature: string
  eventTypes: ReadonlyArray<TaskEvent['eventType']>
  callbackPayload?: Record<string, any>
  expiresAt?: string // ISO timestamp - when subscription expires
  createdAt: string
}>

// Task query filters for finding tasks
export type TaskQuery = Readonly<{
  rootTaskId?: string
  parentTaskId?: string
  status?: TaskStatus | ReadonlyArray<TaskStatus>
  domain?: string
  feature?: string
  priority?: TaskPriority
  createdBy?: string
  scheduledBefore?: string // ISO timestamp
  scheduledAfter?: string // ISO timestamp
  createdBefore?: string // ISO timestamp
  createdAfter?: string // ISO timestamp
  includeChildren?: boolean
  limit?: number
  offset?: number
}>

// Task execution context for workers
export type TaskExecutionContext = Readonly<{
  task: Task
  canSpawnChildren: boolean
  spawnChildTask: (request: CreateTaskProps) => Promise<string> // Returns child task ID
  getChildTasks: () => Promise<ReadonlyArray<Task>>
  getRootTask: () => Promise<Task>
  getParentTask: () => Promise<Task | null>
}>

// Batch operation for handling multiple tasks
export type TaskBatchOperation = Readonly<{
  operationType: 'cancel' | 'retry' | 'update_priority'
  taskIds: ReadonlyArray<string>
  parameters?: Record<string, any>
  requestedBy: string
  requestedAt: string
}>

// Task metrics and monitoring
export type TaskMetrics = Readonly<{
  domain: string
  feature?: string
  timeRange: {
    start: string // ISO timestamp
    end: string // ISO timestamp
  }
  totalTasks: number
  completedTasks: number
  failedTasks: number
  averageExecutionTimeMs: number
  averageWaitTimeMs: number // Time from creation to start
  taskThroughputPerHour: number
  errorRate: number // Percentage
  retryRate: number // Percentage
}>

// Configuration for task system behavior
export type TaskSystemConfig = Readonly<{
  domain: string
  defaultMaxRetries: number
  defaultPriority: TaskPriority
  taskTimeoutMs: number
  callbackTimeoutMs: number
  maxChildTaskDepth: number
  enableTaskMetrics: boolean
  eventRetentionDays: number
  cleanupCompletedTasksAfterDays: number
}>




export type RunTaskCallbacksProps<
  TInput extends JsonObj={}, 
  TOutput extends JsonObj={}, 
  TConfig extends ConfigWithTasks=ConfigWithTasks,
  TContext extends FeaturesContext<TConfig>=FeaturesContext<TConfig>
> = Readonly<{
  context: TContext,
  taskId: string,
}>


export const TasksNamespace = '@node-in-layers/tasks'

export enum TaskRunner {
  Local='local',
  Docker='docker',
  Custom='custom'
}

export type LocalTaskConfig = {
  type: TaskRunner.Local,
  command?: string
  runTaskBinPath?: string
}

export type DockerTaskConfig = {
  type: TaskRunner.Local,
  imageName: string
  workingDirectory: string
  command?: string
  runTaskBinPath?: string
}

/**
 * The configurations for a custom runTask method.
 * The domain:feature must have the RunTaskMethod interface.
 */
export type CustomTaskConfig = {
  type: TaskRunner.Custom
  domain: string,
  feature: string,
}

export type TasksConfig = Readonly<{
  [TasksNamespace]: LocalTaskConfig | DockerTaskConfig | CustomTaskConfig
}>

export type ConfigWithTasks = TasksConfig & Config

export type TasksServices = Readonly<{
  runTaskLocal: LayerFunction<(task: Task) => Promise<Response<void>>>
  runTaskDocker: LayerFunction<(task: Task) => Promise<Response<void>>>
}>

export type TasksServicesLayer = Readonly<{
  [TasksNamespace]: TasksServices & {
    cruds: {
      Tasks: ModelCrudsFunctions<Task>,
      TaskCallbacks: ModelCrudsFunctions<TaskCallback>
    }
  }
}>

export type BaseRunTaskMethod = <
  TInput extends JsonObj={}, 
  TOutput extends JsonObj={}, 
  TConfig extends ConfigWithTasks=ConfigWithTasks,
  TContext extends FeaturesContext<TConfig>=FeaturesContext<TConfig>
>(args: CreateTaskProps<TInput, TOutput, TConfig, TContext>, crossLayerProps?: CrossLayerProps) => Promise<TaskExecutionResponse>

export type RunTaskMethod = <
  TInput extends JsonObj={}, 
  TOutput extends JsonObj={}, 
  TConfig extends ConfigWithTasks=ConfigWithTasks,
  TContext extends FeaturesContext<TConfig>=FeaturesContext<TConfig>
>(context: TContext, task: Task, crossLayerProps?: CrossLayerProps) => Promise<Response<void>>|Response<void>

export type TasksFeatures = Readonly<{
  runTask: BaseRunTaskMethod
  runTaskCallbacks: <
    TInput extends JsonObj={}, 
    TOutput extends JsonObj={}, 
    TConfig extends ConfigWithTasks=ConfigWithTasks,
    TContext extends FeaturesContext<TConfig>=FeaturesContext<TConfig>
  >(props: RunTaskCallbacksProps<TInput, TOutput, TConfig, TContext>) => Promise<void>
}>

export type TasksFeaturesLayer = Readonly<{
  [TasksNamespace]: TasksFeatures & {
    cruds: {
      Tasks: ModelCrudsFunctions<Task>,
      TaskCallbacks: ModelCrudsFunctions<TaskCallback>
    }
  }
}>
