import { JsonObj, JsonAble } from 'functional-models'
import { 
  Response, 
  FeaturesContext, 
  LayerFunction, 
  LayerContext, 
  Config,
  ModelCrudsFunctions,
  CrossLayerProps,
  LogLevelNames,
  System,
  NilAnnotatedFunction,
} from '@node-in-layers/core'

/**
 * Everything within the repo is under this namespace.
 */
export const TasksNamespace = '@node-in-layers/tasks'
export const InfiniteRetries = -1

/**
 * Represents the current status of the task.
 */
export enum TaskStatus {
  Pending='pending',
  Scheduled='scheduled',
  Running='running',
  Completed='completed',
  Failed='failed',
  Cancelled='cancelled'
}
  
/**
 * Level of priority.
 */
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
  maxRetries: number,
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
   * The task that this callback is for.
   */
  taskId: string
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
  conditions: TaskCallbackConditions
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
export type TaskExecutionResponse<TOutput extends JsonObj = {}> = Response<{
  taskId: string
  result?: TOutput
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
  
  // Execution metadata
  executionNode?: string
  /**
   * Retry configurations.
   */
  retryConfig?: TaskRetryConfig
  
  // Tracking
  userId?: string // User or system that created this task
  createdAt?: string // ISO timestamp
  updatedAt?: string // ISO timestamp
}>

export type TaskCallbackConditions = Readonly<{
  onSuccess?: boolean
  onFailure?: boolean
  onAnyCompletion?: boolean
}>

export type CallbackProps = Readonly<{
  domain: string,
  feature: string,
  payload?: Record<string, JsonAble>,
  conditions: TaskCallbackConditions,
  retryConfig?: TaskRetryConfig,
}>

// Request to create a new task
export type CreateTaskProps<
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
  /**
   * For internal use only. Don't provide.
   */
  _id?: string
}>


export type RunTaskCallbacksProps<
  TConfig extends ConfigWithTasks=ConfigWithTasks,
  TContext extends FeaturesContext<TConfig>=FeaturesContext<TConfig>
> = Readonly<{
  context: TContext,
  taskId: string,
}>



export enum TaskRunner {
  Local='local',
  Docker='docker',
  Custom='custom'
}

export type LocalTaskConfig = {
  type: TaskRunner.Local,
  command?: string
  runTaskBinPath?: string
  args?: readonly string[]
}

export type DockerTaskConfig = {
  type: TaskRunner.Docker,
  imageName: string
  workingDirectory: string
  command?: string
  runTaskBinPath?: string
  args?: readonly string[]
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

type RedisConfig = Readonly<{
  host: string
  port: number
  password?: string,
  username?: string,
  database?: number,
}>

export enum TaskQueueType {
  BullMq='bullmq'
}

export type BullMqTaskQueueConfig = Readonly<{
  type: TaskQueueType.BullMq,
  redis: RedisConfig
}>

export type QueueService = Readonly<{
  enqueueTask: LayerFunction<(props: { task: Task }) => Promise<Response<void>>>
  dequeueTask: LayerFunction<(props: { taskId: string }) => Promise<Response<void>>>
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
  enqueueService?: string,
}>

export const NoneType = 'none'

export type CallbackConfig = Readonly<{
  callbackFailedLogLevel?: LogLevelNames | typeof NoneType
}>

export type TasksConfig = Readonly<{
  [TasksNamespace]: {
    runner: Readonly<{
      failedTaskLogLevel?: LogLevelNames | typeof NoneType
    }> & (LocalTaskConfig | DockerTaskConfig | CustomTaskConfig)
    queue: TaskQueueConfig 
    bullMq: BullMqTaskQueueConfig
    callbacks: CallbackConfig
  }
}>

export type ConfigWithTasks = TasksConfig & Config

export type TasksServices = QueueService & Readonly<{
  runTaskLocal: LayerFunction<(task: Task) => Promise<Response<void>>>
  runTaskDocker: LayerFunction<(task: Task) => Promise<Response<void>>>
  evaluateTaskBySubTasks: LayerFunction<(taskId: string) => Promise<Response<{
    completed: boolean,
    status: (TaskStatus.Completed | TaskStatus.Failed | TaskStatus.Cancelled)
  }>>>
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
  TConfig extends ConfigWithTasks=ConfigWithTasks,
  TContext extends FeaturesContext<TConfig>=FeaturesContext<TConfig>,
  TOutput extends JsonObj={}
>(args: CreateTaskProps<TConfig, TContext>, crossLayerProps?: CrossLayerProps) => Promise<TaskExecutionResponse<TOutput>>

export type RunExistingTaskMethod = <
  TConfig extends ConfigWithTasks=ConfigWithTasks,
  TContext extends FeaturesContext<TConfig>=FeaturesContext<TConfig>
>(context: TContext, task: Task, crossLayerProps?: CrossLayerProps) => Promise<Response<void>>|Response<void>

export type RunTaskMethod = <
  TConfig extends ConfigWithTasks=ConfigWithTasks,
  TContext extends FeaturesContext<TConfig>=FeaturesContext<TConfig>
>(context: TContext, task: Task, crossLayerProps?: CrossLayerProps) => Promise<Response<void>>|Response<void>

export type SubTaskMethod = <T extends JsonObj={}>(name: string, method: LayerFunction<(props: { task: Task, factory: SubTaskMethodFactory }) => Promise<Response<T>>>) => void
export type SubTaskMethodFactory = {
  create: SubTaskMethod
} 

export type TaskFeatureProps<TProps extends JsonObj> = TProps & {
  tasks?: {
    executeSync?: boolean
  }
}

export type RegisterTaskFeatureProps<
  TProps extends JsonObj,
  TOutput extends JsonObj={}
> = Readonly<{
  domain?: string,
  feature?: string,
  method: (LayerFunction<(props: TProps) => Promise<Response<TOutput>>>) | NilAnnotatedFunction<TProps, TOutput>
}>

export type RegisterTaskCallbackProps = Readonly<{
  domain: string,
  feature: string,
  method: LayerFunction<(props: { taskCallback: TaskCallback }) => Promise<void>>
}>

export type TasksFeatures = Readonly<{
  runTask: BaseRunTaskMethod
  enqueueTask: BaseRunTaskMethod
  runTaskCallbacks: <
    TConfig extends ConfigWithTasks=ConfigWithTasks,
    TContext extends FeaturesContext<TConfig>=FeaturesContext<TConfig>
  >(props: RunTaskCallbacksProps<TConfig, TContext>) => Promise<void>

  registerTaskFeature: <
    TProps extends JsonObj,
    TOutput extends JsonObj={}
  >(props: RegisterTaskFeatureProps<TProps, TOutput>) => NilAnnotatedFunction<TaskFeatureProps<TProps>, TaskExecutionResponse<TOutput>>
  registerTaskCallback: (props: RegisterTaskCallbackProps) => LayerFunction<(props: { taskCallbackId: string }) => Promise<void>>

  executeRegisteredTaskFeature: <TOutput extends JsonObj={}>(props: { taskId: string }) => Promise<Response<TOutput>>
  registerTaskConsumer: () => LayerFunction<(props: { taskId: string }) => Promise<void>>
}>

export type TasksFeaturesLayer = Readonly<{
  [TasksNamespace]: TasksFeatures & {
    cruds: {
      Tasks: ModelCrudsFunctions<Task>,
      TaskCallbacks: ModelCrudsFunctions<TaskCallback>
    }
  }
}>

export type TaskSystem = System<ConfigWithTasks, TasksServicesLayer, TasksFeaturesLayer> & LayerContext<ConfigWithTasks>