import {
  AnnotatedFunctionProps,
  CrossLayerProps,
  LayerFunction,
  ModelCrudsFunctions,
  Response,
  jsonAbleSchema,
} from '@node-in-layers/core'
import { JsonAble, JsonObj, PrimaryKeyType } from 'functional-models'
import { z } from 'zod'
import { TasksNamespace } from '../types.js'

export const InfiniteRetries = -1

export enum TaskStatus {
  Pending = 'pending',
  Scheduled = 'scheduled',
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

export enum TaskPriority {
  Low = 'Low',
  Normal = 'Normal',
  High = 'High',
  Urgent = 'Urgent',
}

export type TaskRetryConfig = Readonly<{
  maxRetries: number
  backoffMultiplier?: number
  initialDelayMs?: number
}>

export type TaskResult<T extends JsonObj = JsonObj> = Response<T>

export type TaskExecutionResponse = Response<{
  taskId: PrimaryKeyType
}>

export const primaryKeySchema: z.ZodType<PrimaryKeyType> = z.union([
  z.string(),
  z.number().int(),
])

export const taskCallbackMappingIdPropsSchema = z.object({
  taskCallbackMappingId: primaryKeySchema,
})

export const taskIdPropsSchema = z.object({
  taskId: primaryKeySchema,
})

export const taskExecutionResponseSchema = () =>
  z.object({
    taskId: primaryKeySchema,
  }) as z.ZodType<{
    taskId: PrimaryKeyType
  }>

export const TaskControlProp = '_@node-in-layers/tasks' as const

export type TaskControlProps = Readonly<
  {
    executeNow?: boolean
  } & Record<string, JsonAble>
>

export type TaskFeatureProps<TProps extends JsonObj> = TProps &
  Readonly<{
    [TaskControlProp]?: TaskControlProps
  }>

export const taskControlPropsSchema = z
  .object({
    executeNow: z.boolean().optional(),
  })
  .catchall(jsonAbleSchema)

export const taskFeaturePropsSchema = <TProps extends JsonObj>(
  propsSchema: z.ZodType<TProps>
) =>
  z.intersection(
    propsSchema,
    z.object({
      [TaskControlProp]: taskControlPropsSchema.optional(),
    })
  ) as z.ZodType<TaskFeatureProps<TProps>>

export const taskAnnotationFunctionProps = <
  TProps extends JsonObj,
  TOutput extends JsonObj,
>(
  props: Omit<
    AnnotatedFunctionProps<
      TaskFeatureProps<TProps>,
      { taskId: PrimaryKeyType }
    >,
    'args' | 'returns'
  > & {
    args: z.ZodType<TProps>
    returns?: z.ZodType<TOutput>
  }
): AnnotatedFunctionProps<
  TaskFeatureProps<TProps>,
  { taskId: PrimaryKeyType }
> => ({
  functionName: props.functionName,
  domain: props.domain,
  description: props.description,
  args: taskFeaturePropsSchema(props.args),
  returns: taskExecutionResponseSchema(),
})

export type TaskFeatureWrapperImplementation<TProps extends JsonObj> =
  LayerFunction<
    (props: TaskFeatureProps<TProps>) => Promise<TaskExecutionResponse>
  >

export type Task<
  TPayload extends JsonObj = JsonObj,
  TResult extends JsonObj = JsonObj,
> = Readonly<{
  id: PrimaryKeyType
  rootTaskId?: PrimaryKeyType
  parentTaskId?: PrimaryKeyType
  name: string
  description?: string
  domain: string
  feature: string
  status: TaskStatus
  priority: TaskPriority
  payload: TPayload
  crossLayerProps?: CrossLayerProps<Record<string, JsonAble>>
  result?: TaskResult<TResult>
  scheduledAt?: string
  startedAt?: string
  completedAt?: string
  executionNode?: string
  retryConfig?: TaskRetryConfig
  /**
   * Optional Unix timestamp (seconds) used for automatic database roll-out.
   */
  ttl?: number
  userId?: string
  createdAt?: string
  updatedAt?: string
}>

export type TaskCallbackConditions = Readonly<{
  onSuccess?: boolean
  onFailure?: boolean
  onAnyCompletion?: boolean
}>

export type TaskCallbackMapping = Readonly<{
  id: PrimaryKeyType
  sourceDomain: string
  sourceFeature: string
  targetDomain: string
  targetFeature: string
  conditions: TaskCallbackConditions
  retryConfig?: TaskRetryConfig
  createdAt?: string
  updatedAt?: string
}>

export type CoreCruds = Readonly<{
  Tasks: ModelCrudsFunctions<Task>
  TaskCallbackMappings: ModelCrudsFunctions<TaskCallbackMapping>
}>

export type CoreServices = Readonly<object>

export type CoreServicesLayer = Readonly<{
  [TasksNamespace.Core]: CoreServices & {
    cruds: CoreCruds
  }
}>

/**
 * Core features
 * @interface
 */
export type CoreFeatures = Readonly<object>

export type CoreFeaturesLayer = Readonly<{
  [TasksNamespace.Core]: CoreFeatures & {
    cruds: CoreCruds
  }
}>
