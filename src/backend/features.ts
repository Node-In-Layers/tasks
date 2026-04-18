import {
  createErrorObject,
  FeaturesContext,
  CrossLayerProps,
  Response,
  LayerFunction,
  LogLevelNames,
  isErrorObject,
  annotatedFunction,
  NilAnnotatedFunction,
} from '@node-in-layers/core'
import { asyncMap } from 'modern-async'
import { JsonObj, queryBuilder, PrimaryKeyType } from 'functional-models'
import {
  stripTaskControlProps,
  createTaskFeature as createTaskFeatureContract,
} from '../core/internal-libs.js'
import {
  Task,
  TaskCallbackMapping,
  TaskStatus,
  TaskPriority,
  TaskFeatureProps,
  TaskExecutionResponse,
  TaskControlProp,
} from '../core/types.js'
import { TasksNamespace } from '../types.js'
import { normalizeCreateTaskFeatureArgs } from './internal-libs.js'
import {
  CreateTaskProps,
  ConfigWithTasks,
  TasksServicesLayer,
  TasksFeatures,
  NoneType,
  QueueService,
  startTaskPollingPropsSchema,
  CreateTaskFeatureMethod,
} from './types.js'
import { continueUntil } from './utils.js'

type TaskRunnerMethod = LayerFunction<
  (
    task: Task,
    crossLayerProps?: CrossLayerProps
  ) => Promise<Response<JsonObj> | void>
>

type CodeTaskCallbackMapping = Omit<
  TaskCallbackMapping,
  'id' | 'createdAt' | 'updatedAt'
>

type CreateTaskRecordProps<
  TConfig extends ConfigWithTasks = ConfigWithTasks,
  TContext extends FeaturesContext<TConfig> = FeaturesContext<TConfig>,
> = Omit<CreateTaskProps<TConfig, TContext>, 'context'>

const create = (
  context: FeaturesContext<ConfigWithTasks, TasksServicesLayer>
): TasksFeatures => {
  const taskRunners: Record<string, Record<string, TaskRunnerMethod>> = {}
  const codeTaskCallbackMappings: CodeTaskCallbackMapping[] = []

  const _registerTaskRunner = (
    domain: string,
    feature: string,
    runner: TaskRunnerMethod
  ) => {
    if (!taskRunners[domain]) {
      // eslint-disable-next-line functional/immutable-data
      taskRunners[domain] = {}
    }
    // eslint-disable-next-line functional/immutable-data
    taskRunners[domain][feature] = runner
  }

  const _getTaskRunner = (domain: string, feature: string) =>
    taskRunners[domain]?.[feature]

  const _getQueueService = () => {
    const queueDomain =
      context.config[TasksNamespace.Backend]?.queue?.enqueueService ||
      TasksNamespace.Backend
    const queueService = context.services.getServices(
      queueDomain
    ) as QueueService

    if (!queueService || !queueService.enqueueTask) {
      return createErrorObject(
        'QUEUE_SERVICE_NOT_FOUND',
        `Queue service not found for domain ${queueDomain}`
      )
    }

    return queueService
  }

  const _shouldRunCallback = (
    task: Task,
    mapping: Pick<TaskCallbackMapping, 'conditions'>
  ) => {
    const hasError =
      Boolean(task.result?.error) || task.status === TaskStatus.Failed
    const isSuccess = !hasError && task.status === TaskStatus.Completed

    if (mapping.conditions.onAnyCompletion) {
      return true
    }
    if (mapping.conditions.onSuccess && isSuccess) {
      return true
    }
    if (mapping.conditions.onFailure && hasError) {
      return true
    }

    return false
  }

  const _createTaskRecord = <
    TConfig extends ConfigWithTasks = ConfigWithTasks,
    TContext extends FeaturesContext<TConfig> = FeaturesContext<TConfig>,
  >(
    props: CreateTaskRecordProps<TConfig, TContext>
  ) => {
    return Promise.resolve().then(async () => {
      const task = await context.services[
        TasksNamespace.Core
      ].cruds.Tasks.create<'id'>({
        ...(props._id ? { id: props._id } : {}),
        rootTaskId: props.rootTaskId,
        parentTaskId: props.parentTaskId,
        name: props.name,
        description: props.description,
        domain: props.domain,
        feature: props.feature,
        status: TaskStatus.Pending,
        priority: props.taskPriority || TaskPriority.Normal,
        payload: props.payload || {},
        scheduledAt: props.scheduledAt?.toISOString(),
        retryConfig: props.retryConfig,
        userId: props.userId,
      }).then(x => x.toObj<Task>())

      return task
    })
  }

  const _enqueueExistingTask = async (
    task: Task,
    crossLayerProps?: CrossLayerProps
  ) => {
    const queueService = _getQueueService()
    if (isErrorObject(queueService)) {
      return queueService
    }

    const response = await queueService.enqueueTask({ task }, crossLayerProps)
    if (isErrorObject(response)) {
      await context.services[TasksNamespace.Core].cruds.Tasks.update(task.id, {
        ...task,
        status: TaskStatus.Failed,
        result: {
          error: response.error,
        },
      })
      return response
    }

    return {
      taskId: task.id,
    }
  }

  const _getCallbackMappings = async (task: Task) => {
    const codeMappings = codeTaskCallbackMappings.filter(
      mapping =>
        mapping.sourceDomain === task.domain &&
        mapping.sourceFeature === task.feature
    )
    const persistedMappings = await context.services[
      TasksNamespace.Core
    ].cruds.TaskCallbackMappings.search(
      queryBuilder()
        .property('sourceDomain', task.domain)
        .and()
        .property('sourceFeature', task.feature)
        .compile()
    ).then(res =>
      Promise.all(res.instances.map(x => x.toObj<TaskCallbackMapping>()))
    )

    return codeMappings.concat(
      persistedMappings.filter(Boolean) as TaskCallbackMapping[]
    )
  }

  const _spawnCallbackTasks = async (
    task: Task,
    crossLayerProps?: CrossLayerProps
  ) => {
    const log = context.log.getInnerLogger(
      'spawnCallbackTasks',
      crossLayerProps
    )
    const mappings = await _getCallbackMappings(task)

    await asyncMap(mappings, async mapping => {
      if (!_shouldRunCallback(task, mapping)) {
        return
      }

      const callbackTask = await _createTaskRecord({
        name: `callback:${mapping.targetDomain}:${mapping.targetFeature}`,
        domain: mapping.targetDomain,
        feature: mapping.targetFeature,
        parentTaskId: task.id,
        rootTaskId: task.rootTaskId || task.id,
        payload: task as unknown as JsonObj,
        retryConfig: mapping.retryConfig,
        userId: task.userId,
      })

      const enqueueResponse = await _enqueueExistingTask(
        callbackTask,
        crossLayerProps
      )
      if (isErrorObject(enqueueResponse)) {
        const level =
          context.config[TasksNamespace.Backend].callbacks
            .callbackFailedLogLevel || LogLevelNames.warn
        if (level !== NoneType) {
          log[level](
            'Failed to enqueue callback task',
            createErrorObject(
              'TASK_CALLBACK_ENQUEUE_FAILED',
              `Failed to enqueue callback task ${mapping.targetDomain}:${mapping.targetFeature}`,
              enqueueResponse.error
            )
          )
        }
      }
    })
  }

  const _executeTask = async (
    props: { taskId: PrimaryKeyType },
    crossLayerProps?: CrossLayerProps
  ) => {
    const log = context.log.getInnerLogger('executeTask', crossLayerProps)
    const task = await context.services[
      TasksNamespace.Core
    ].cruds.Tasks.retrieve(props.taskId).then(x => x?.toObj<Task>())
    if (!task) {
      return createErrorObject(
        'TASK_NOT_FOUND',
        `Task ${props.taskId} not found.`
      )
    }

    const runner = _getTaskRunner(task.domain, task.feature)
    if (!runner) {
      const error = createErrorObject(
        'TASK_FEATURE_NOT_FOUND',
        `Task feature ${task.domain}:${task.feature} not found.`
      )
      await context.services[TasksNamespace.Core].cruds.Tasks.update(task.id, {
        ...task,
        status: TaskStatus.Failed,
        result: {
          error: error.error,
        },
        completedAt: new Date().toISOString(),
      })
      log.error('Task runner missing', error)
      return error
    }

    const refreshedTask = await context.services[
      TasksNamespace.Core
    ].cruds.Tasks.update(task.id, {
      ...task,
      status: TaskStatus.Running,
      startedAt: new Date().toISOString(),
    }).then(x => x.toObj<Task>())

    const result = await runner(refreshedTask, crossLayerProps).catch(e => {
      return createErrorObject(
        'TASK_EXECUTION_EXCEPTION',
        'An overall exception occurred executing a task',
        e
      )
    })

    const runnerStatus = isErrorObject(result)
      ? TaskStatus.Failed
      : TaskStatus.Completed

    const finalTask = await context.services[
      TasksNamespace.Core
    ].cruds.Tasks.update(task.id, {
      ...refreshedTask,
      result: result || {},
      status: runnerStatus,
      completedAt: new Date().toISOString(),
    }).then(x => x.toObj<Task>())

    await _spawnCallbackTasks(finalTask, crossLayerProps)

    return undefined
  }

  const _createTaskFeatureRunner = <
    TProps extends JsonObj,
    TOutput extends JsonObj = JsonObj,
  >(
    method: LayerFunction<(props: TProps) => Promise<Response<TOutput>>>
  ): TaskRunnerMethod => {
    return async (task: Task, crossLayerProps?: CrossLayerProps) => {
      return method(task.payload as TProps, crossLayerProps)
    }
  }

  const createTaskFeature = ((first: any, second?: any) => {
    const { annotationProps, method } = normalizeCreateTaskFeatureArgs(
      first,
      second
    )
    const domain = annotationProps.domain
    const feature = annotationProps.functionName

    _registerTaskRunner(
      domain,
      feature,
      _createTaskFeatureRunner(method as any)
    )

    return createTaskFeatureContract(
      annotationProps,
      async (
        args: TaskFeatureProps<JsonObj>,
        crossLayerProps?: CrossLayerProps
      ) => {
        const payload = stripTaskControlProps(args)
        const taskControl = args[TaskControlProp]
        const task = await _createTaskRecord({
          name: `${domain}:${feature}`,
          domain,
          feature,
          payload,
        })

        if (taskControl?.executeNow) {
          await _executeTask({ taskId: task.id }, crossLayerProps)
          return {
            taskId: task.id,
          }
        }

        const enqueueResponse = await _enqueueExistingTask(
          task,
          crossLayerProps
        )
        if (isErrorObject(enqueueResponse)) {
          return enqueueResponse
        }

        return {
          taskId: task.id,
        }
      }
    )
  }) as CreateTaskFeatureMethod

  const registerTaskCallback: TasksFeatures['registerTaskCallback'] = props => {
    // eslint-disable-next-line functional/immutable-data
    codeTaskCallbackMappings.push({
      sourceDomain: props.sourceDomain,
      sourceFeature: props.sourceFeature,
      targetDomain: props.targetDomain,
      targetFeature: props.targetFeature,
      conditions: props.conditions,
      retryConfig: props.retryConfig,
    })

    _registerTaskRunner(
      props.targetDomain,
      props.targetFeature,
      async (task, crossLayerProps) => {
        await props.method({ task }, crossLayerProps)
        return {}
      }
    )
  }

  const _registerTaskConsumer = () => {
    return async (
      props: { taskId: PrimaryKeyType },
      crossLayerProps?: CrossLayerProps
    ) => {
      const log = context.log.getInnerLogger(
        'registerTaskConsumer',
        crossLayerProps
      )

      const response = await _executeTask(
        { taskId: props.taskId },
        crossLayerProps
      ).catch(e =>
        log.error(
          `Exception occurred while consuming task ${props.taskId}`,
          createErrorObject(
            'TASK_CONSUMER_EXCEPTION',
            'Exception occurred consuming task',
            e
          )
        )
      )
      if (isErrorObject(response)) {
        log.error(
          `Exception occurred while consuming task ${props.taskId}`,
          createErrorObject(
            'TASK_CONSUMER_EXCEPTION',
            'Exception occurred consuming task',
            response.error
          )
        )
      }

      return undefined
    }
  }

  const startTaskPolling: TasksFeatures['startTaskPolling'] = annotatedFunction(
    {
      functionName: 'startTaskPolling',
      domain: TasksNamespace.Backend,
      args: startTaskPollingPropsSchema,
    },
    ((_: JsonObj, crossLayerProps?: CrossLayerProps) => {
      return Promise.resolve().then(async () => {
        const log = context.log.getInnerLogger(
          'startTaskPolling',
          crossLayerProps
        )
        const queueService = _getQueueService()
        if (isErrorObject(queueService)) {
          return queueService
        }

        const queues = Object.keys(taskRunners).flatMap(domain =>
          Object.keys(taskRunners[domain]).map(feature => ({
            domain,
            feature,
          }))
        )

        if (queues.length === 0) {
          log.warn(
            'startTaskPolling called but no task features are registered'
          )
        }

        await queueService.startTaskPolling(
          {
            queues,
            handler: _registerTaskConsumer(),
          },
          crossLayerProps
        )
        // DO NOT return from startTaskPolling. zod blows up if its anyting other than undefined.
        return undefined
      })
    }) as any
  )

  const awaitTask: TasksFeatures['awaitTask'] = async <
    TResult extends JsonObj = JsonObj,
  >(props: {
    taskId: PrimaryKeyType
    timeoutMs?: number
    pollIntervalMs?: number
    maxPolls?: number
  }): Promise<Response<TResult>> => {
    const result = await continueUntil<Task | undefined>(
      async () => {
        const task = await context.services[
          TasksNamespace.Core
        ].cruds.Tasks.retrieve(props.taskId).then(x => x?.toObj<Task>())
        return task
      },
      (prev, current) => {
        if (!current) {
          return false
        }
        if (current.status === TaskStatus.Completed) {
          return false
        }
        if (
          current.status === TaskStatus.Failed ||
          current.status === TaskStatus.Cancelled
        ) {
          return false
        }
        return true
      },
      {
        timeoutMs: props.timeoutMs,
        pollIntervalMs: props.pollIntervalMs,
        maxPolls: props.maxPolls,
      }
    )

    if (isErrorObject(result)) {
      return result as Response<TResult>
    }

    if (!result) {
      return createErrorObject(
        'TASK_NOT_FOUND',
        `Task ${props.taskId} not found.`
      ) as Response<TResult>
    }

    if (result.status === TaskStatus.Completed) {
      return result.result as Response<TResult>
    }

    if (
      result.status === TaskStatus.Failed ||
      result.status === TaskStatus.Cancelled
    ) {
      if (result.result?.error) {
        // @ts-ignore
        return { error: result.result.error } as Response<TResult>
      }
      return createErrorObject(
        'TASK_FAILED',
        `Task ${props.taskId} failed or was cancelled`
      ) as Response<TResult>
    }

    return result.result as Response<TResult>
  }

  const executeTaskAndWait: TasksFeatures['executeTaskAndWait'] = async <
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
  ): Promise<Response<TResult>> => {
    const response = await props.taskFunction(props.payload, crossLayerProps)

    if (isErrorObject(response)) {
      return response as Response<TResult>
    }

    return awaitTask<TResult>(
      {
        taskId: response.taskId,
        timeoutMs: props.timeoutMs,
        pollIntervalMs: props.pollIntervalMs,
        maxPolls: props.maxPolls,
      },
      crossLayerProps
    )
  }

  return {
    createTaskFeature,
    registerTaskCallback,
    startTaskPolling,
    awaitTask,
    executeTaskAndWait,
  }
}

export { create }
