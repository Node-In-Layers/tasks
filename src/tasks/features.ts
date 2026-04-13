import { v4 as uuidv4 } from 'uuid'
import { 
  createErrorObject,
  Config, 
  FeaturesContext, 
  CrossLayerProps,
  Response,
  LayerFunction,
  LogLevelNames,
  isErrorObject,
  annotatedFunction,
} from '@node-in-layers/core/index.js'
import { z } from 'zod'
import { asyncMap } from 'modern-async'
import { JsonObj, queryBuilder, Maybe } from 'functional-models'
import { 
  RunTaskCallbacksProps,
  CreateTaskProps,
  TaskStatus,
  TaskRunner,
  TaskPriority,
  ConfigWithTasks,
  TasksServicesLayer, 
  TasksFeatures, 
  TasksNamespace,
  Task,
  TaskCallback,
  RegisterTaskFeatureProps,
  RegisterTaskCallbackProps,
  TaskSystem,
  TaskQueueType,
  NoneType,
  QueueService,
} from './types.js'

const create = (
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  context: FeaturesContext<ConfigWithTasks, TasksServicesLayer>
) : TasksFeatures => {

  const taskFeatures  = {}
  const taskCallbacks = {}

  const runTaskCallbacks = <
    TConfig extends ConfigWithTasks=ConfigWithTasks,
    TContext extends FeaturesContext<TConfig>=FeaturesContext<TConfig>
  >(props: RunTaskCallbacksProps<TConfig, TContext>, crossLayerProps?: CrossLayerProps) => {
    const log = context.log.getInnerLogger('runTaskCallbacks', crossLayerProps)
    return Promise.resolve()
      .then(async () => {
        const task = await context.services[TasksNamespace].cruds.Tasks.retrieve(props.taskId).then(x=>x?.toObj<Task>())
        if (!task) {
          return
        }
        
        const callbacks = await context.services[TasksNamespace].cruds.TaskCallbacks.search(
          queryBuilder()
          .property('taskId', task.id)
          .compile()
        ).then(res => Promise.all(res.instances.map(x => x.toObj<TaskCallback>())))


        const _shouldRun = (task: Task, callback: TaskCallback) => {
          const hasError = !!task.result?.error || task.status === TaskStatus.Failed
          const isSuccess = !hasError && task.status === TaskStatus.Completed
          if (callback.conditions.onSuccess && isSuccess) {
            return true
          }
          if (callback.conditions.onFailure && hasError) {
            return true
          }
          return false
        }

        await Promise.all(callbacks.map(async (callback) => {
          if (_shouldRun(task, callback)) {
            const response = await enqueueTask({
              context: props.context,
              name: `callback:${callback.domain}:${callback.feature}`,
              domain: TasksNamespace,
              feature: 'executeCallbackTask',
              payload: { taskCallbackId: callback.id },
              parentTaskId: task.id,
              retryConfig: callback.retryConfig,
            }, crossLayerProps)
            
            if (isErrorObject(response)) {
              const level = context.config[TasksNamespace].callbacks.callbackFailedLogLevel || LogLevelNames.warn
              if (level !== 'none') {
                const obj = createErrorObject('TASK_CALLBACK_ENQUEUE_FAILED', `Failed to enqueue task callback ${callback.domain}:${callback.feature}`, response.error)
                log[level]('Overall task callback enqueue exception occurred', obj)
              }
            }
          }
        }))
        return
      })
      .catch(e => {
        const errorObj = createErrorObject('OVERALL_CALLBACK_EXCEPTION', 'Exception occurred running task callbacks', e)
        log.error('Exception occurred running task callbacks', errorObj)
      })
  }

  const _runExistingTask = async <
    TConfig extends ConfigWithTasks=ConfigWithTasks,
    TContext extends FeaturesContext<TConfig>=FeaturesContext<TConfig>
  >(context: TContext, task: Task, crossLayerProps?: CrossLayerProps) => {
    return Promise.resolve().then(async () => {
      return {
        taskId: task.id,
      }
    })
  }

  const runTask = async <
    TConfig extends ConfigWithTasks=ConfigWithTasks,
    TContext extends FeaturesContext<TConfig>=FeaturesContext<TConfig>
  >(props: CreateTaskProps<TConfig, TContext>, crossLayerProps?: CrossLayerProps) => {
    return Promise.resolve().then(async () => {
      const log = context.log.getInnerLogger('runTask')
      crossLayerProps = crossLayerProps || {
        logging: {
          ids: log.getIds()
        }
      }
      const config = context.config[TasksNamespace]
      if (!config) {
        return createErrorObject('CONFIG_ERROR', `Namespace ${TasksNamespace} does not exist in config.`)
      }

      const models = await (async () => {
        if (props._id) {
          const task = await context.services[TasksNamespace].cruds.Tasks.retrieve(props._id).then(x=>x?.toObj<Task>())
          if (!task) {
            return createErrorObject('TASK_NOT_FOUND', `Task ${props._id} not found.`)
          }
          return {
            task,
          }
        }
        const taskCallbacks = await asyncMap(props.taskCallbacks || [], async callbackArgs => {
          const taskCallback = await context.services[TasksNamespace].cruds.TaskCallbacks.create<'id'>({
            domain: callbackArgs.domain,
            feature: callbackArgs.feature,
            payload: callbackArgs.payload || {},
            conditions: callbackArgs.conditions,
            retryConfig: callbackArgs.retryConfig,
          })
          return taskCallback
        }).then(models => models.map(m => m.get.id()))

        const task : Task = await context.services[TasksNamespace].cruds.Tasks.create<'id'>({
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
        }).then(x=>x.toObj<Task>())
        return {
          taskCallbacks,
          task,
        }
      })()

      if (isErrorObject(models)) {
        return models
      }

      const {task} = models

      const response = await ((() => {
        switch(config.runner.type) {
          case(TaskRunner.Local): {
            return context.services[TasksNamespace].runTaskLocal(task, crossLayerProps)
          }
          case(TaskRunner.Docker): {
            return context.services[TasksNamespace].runTaskLocal(task, crossLayerProps)
          }
          case(TaskRunner.Custom): {
            return props.context.features[config.runner.domain][config.runner.feature](props.context, task, crossLayerProps)
          }
          default:
            // @ts-ignore
            return createErrorObject('TASK_RUNNER_TYPE', `Task Runner type ${config.runner.type} is not handled.`)
        }
      })()).catch(e => {
        return createErrorObject('RUN_TASK_EXCEPTION', 'An overall exception occurred running a task', e)
      })

      // Did we have an error?
      if (response && response.error) {
        // Run the callbacks,
        await runTaskCallbacks({
          context: props.context,
          taskId: task.id,
        })
        await context.services[TasksNamespace].cruds.Tasks.update(task.id, {
          ...task,
          result: {
            error: response.error,
          }
        })

        return { error: response.error }
      }
      return {
        taskId: task.id,
      }
    })
  }

  const enqueueTask = async <
    TConfig extends ConfigWithTasks=ConfigWithTasks,
    TContext extends FeaturesContext<TConfig>=FeaturesContext<TConfig>
  >(props: CreateTaskProps<TConfig, TContext>, crossLayerProps?: CrossLayerProps) => {
    return Promise.resolve().then(async () => {
      const config = context.config[TasksNamespace]
      if (!config) {
        return createErrorObject('CONFIG_ERROR', `Namespace ${TasksNamespace} does not exist in config.`)
      }

      const id = uuidv4()

      const taskCallbacks = await asyncMap(props.taskCallbacks || [], async callbackArgs => {
        const taskCallback = await context.services[TasksNamespace].cruds.TaskCallbacks.create<'id'>({
          taskId: id,
          domain: callbackArgs.domain,
          feature: callbackArgs.feature,
          payload: callbackArgs.payload || {},
          conditions: callbackArgs.conditions,
          retryConfig: callbackArgs.retryConfig,
        })
        return taskCallback
      }).then(models => models.map(m => m.get.id()))

      const task : Task = await context.services[TasksNamespace].cruds.Tasks.create({
        id,
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
      }).then(x=>x.toObj<Task>())

      const queueDomain = config.queue.enqueueService || TasksNamespace
      const queueService = context.services.getServices(queueDomain) as QueueService
      
      if (!queueService || !queueService.enqueueTask) {
        return createErrorObject('QUEUE_SERVICE_NOT_FOUND', `Queue service not found for domain ${queueDomain}`)
      }

      const results = await queueService.enqueueTask({ task }, crossLayerProps)

      if (isErrorObject(results)) {
        await context.services[TasksNamespace].cruds.Tasks.update(task.id, {
          ...task,
          result: {
            error: results.error,
          }
        })

        return { error: results.error }
      }

      return {
        taskId: task.id,
      }
    })
  }

  const _createTaskFeature = <TProps extends JsonObj, TOutput extends JsonObj={}>(
    method: LayerFunction<(props: TProps) => Promise<Response<TOutput>>>
  ) => {
    return async (props: { taskId: string }, crossLayerProps?: CrossLayerProps) => {
      const task = await context.services[TasksNamespace].cruds.Tasks.retrieve(props.taskId).then(x=>x?.toObj<Task>())
      if (!task) {
        const level = context.config[TasksNamespace].runner.failedTaskLogLevel || LogLevelNames.warn
        if (level !== 'none') {
          const obj = createErrorObject('TASK_NOT_FOUND', `Task ${props.taskId} not found.`)
          const log = context.log.getInnerLogger('createTaskFeature', crossLayerProps)
          log[level]('Overall task feature exception occurred', obj)
        }
        return
      }
      const results = await method(task.payload as TProps, crossLayerProps)
        .catch(e => {
          return createErrorObject('TASK_FEATURE_EXCEPTION', 'An overall exception occurred running a task feature', e)
        })

      await context.services[TasksNamespace].cruds.Tasks.update(task.id, {
        ...task,
        result: results,
        status: isErrorObject(results) ? TaskStatus.Failed : TaskStatus.Completed,
      })

      await runTaskCallbacks({
        context: context as any,
        taskId: task.id,
      }, crossLayerProps)

      /**
       * TODO: Parent finished callback
       * We can set a parents callback as complete, by first setting this task as complete. Then querying to see how many remaining
       * tasks there are for that parent. If NONE.
       * Then do the task complete callback.
       */

      if (task.parentTaskId) {
        const response = await context.services[TasksNamespace].evaluateTaskBySubTasks(task.parentTaskId)
        if (isErrorObject(response)) {
          const level = context.config[TasksNamespace].runner.failedTaskLogLevel || LogLevelNames.warn
          if (level !== 'none') {
            const obj = createErrorObject('TASK_EVALUATE_EXCEPTION', 'An overall exception occurred evaluating a task', response.error)
            const log = context.log.getInnerLogger('createTaskFeature', crossLayerProps)
            log[level]('Overall task feature exception occurred', obj)
          }
          return 
        }
        if (response.completed) {
          await closeOutTask({
            taskId: task.parentTaskId,
            status: response.status
          })
        }
      }

      return
    }
  }

  const _createTaskCallback = (
    method: LayerFunction<(props: { taskCallback: TaskCallback }) => Promise<void>>
  ) => {
    return async (props: { taskCallbackId: string }, crossLayerProps?: CrossLayerProps) => {
      const taskCallback : Maybe<TaskCallback> = await context.services[TasksNamespace].cruds.TaskCallbacks.retrieve(props.taskCallbackId).then(x=>x?.toObj<TaskCallback>())
      if (!taskCallback) {
        const level = context.config[TasksNamespace].callbacks.callbackFailedLogLevel || LogLevelNames.warn
        if (level !== NoneType) {
          const obj = createErrorObject('TASK_CALLBACK_NOT_FOUND', `Task callback ${props.taskCallbackId} not found.`)
          const log = context.log.getInnerLogger('createTaskCallback', crossLayerProps)
          log[level]('Overall task callback exception occurred', obj)
        }
        return
      }
      await method({
        taskCallback,
      }, crossLayerProps)
        .catch(e => {
          const level = context.config[TasksNamespace].callbacks.callbackFailedLogLevel || LogLevelNames.warn
          if (level !== 'none') {
            const obj = createErrorObject('TASK_CALLBACK_EXCEPTION', 'An overall exception occurred running a task callback', e)
            const log = context.log.getInnerLogger('createTaskCallback', crossLayerProps)
            log[level]('Overall task callback exception occurred', obj)
            return
          }
        })
      return
    }
  }

  /**
   * Regardless of the current state of the task, the task will be put into a "done" state.
   * @param props
   * @returns 
   */
  const closeOutTask = async (props: { taskId: string, status?: (TaskStatus.Completed | TaskStatus.Failed | TaskStatus.Cancelled) }) => {
    const task : Maybe<Task> = await context.services[TasksNamespace].cruds.Tasks.retrieve(props.taskId).then(x=>x?.toObj<Task>())
    if (!task) {
      return
    }

    await context.services[TasksNamespace].cruds.Tasks.update(task.id, {
      ...task,
      status: props.status || TaskStatus.Completed,
    })

    await runTaskCallbacks({
      context: context as any,
      taskId: task.id,
    })

    return
  }

  const registerTaskFeature = <
    TProps extends JsonObj,
    TOutput extends JsonObj={}
  >(props: RegisterTaskFeatureProps<TProps, TOutput>) => {
    const method = props.method as any
    const isAnnotated = !!method.schema
    
    const domain = props.domain || method.domain
    const feature = props.feature || method.functionName
    
    if (!domain || !feature) {
      throw new Error('domain and feature must be provided if method is not an annotated function')
    }

    if (!taskFeatures[domain]) {
      taskFeatures[domain] = {}
    }
    
    // Store the wrapped runner that the consumer will call
    const runner = _createTaskFeature<TProps, TOutput>(props.method as any)
    taskFeatures[domain][feature] = runner

    // Build the annotated function that the user will call
    const wrapped = annotatedFunction({
      functionName: feature,
      domain: domain,
      description: isAnnotated ? method.schema.description : undefined,
      args: z.custom<TProps & { tasks?: { executeSync?: boolean } }>(),
      returns: z.object({
        taskId: z.string(),
        result: z.any().optional()
      })
    }, async (args: TProps & { tasks?: { executeSync?: boolean } }, crossLayerProps?: CrossLayerProps) => {
      const { tasks, ...payload } = args
      
      if (tasks?.executeSync) {
        // Run synchronously
        const result = await (props.method as any)(payload, crossLayerProps)
        return {
          taskId: 'sync-execution',
          result: isErrorObject(result) ? undefined : result
        }
      } else {
        // Enqueue task
        const response = await enqueueTask({
          context,
          name: `${domain}:${feature}`,
          domain,
          feature,
          payload: payload as any,
        }, crossLayerProps)
        
        if (isErrorObject(response)) {
          return response
        }
        return {
          taskId: response.taskId
        }
      }
    })

    return wrapped as any
  }

  const registerTaskCallback = (props: RegisterTaskCallbackProps) => {
    if (!taskCallbacks[props.domain]) {
      taskCallbacks[props.domain] = {}
    }
    const wrapped = _createTaskCallback(props.method)
    taskCallbacks[props.domain][props.feature] = wrapped
    return wrapped
  }

  const executeRegisteredTaskFeature = async (props: { taskId: string }, crossLayerProps?: CrossLayerProps) => {
    const log = context.log.getInnerLogger('executeRegisteredTaskFeature', crossLayerProps)
    const task : Maybe<Task> = await context.services[TasksNamespace].cruds.Tasks.retrieve(props.taskId).then(x=>x?.toObj<Task>())
    if (!task) {
      const obj = createErrorObject('TASK_NOT_FOUND', `Task ${props.taskId} not found.`)
      log.error('Overall task feature exception occurred', obj)
      return
    }
    const feature = taskFeatures[task.domain]?.[task.feature]
    if (!feature) {
      const obj = createErrorObject('TASK_FEATURE_NOT_FOUND', `Task feature ${task.domain}:${task.feature} not found.`)
      log.error('Overall task feature exception occurred', obj)
      return
    }
    return feature({
      taskId: props.taskId,
    }, crossLayerProps)
  }

  const registerTaskConsumer = () => {
    return async (props: { taskId: string }, crossLayerProps?: CrossLayerProps) => {
      const log = context.log.getInnerLogger('registerTaskConsumer', crossLayerProps)
      
      try {
        const task = await context.services[TasksNamespace].cruds.Tasks.retrieve(props.taskId).then(x=>x?.toObj<Task>())
        if (!task) {
          log.warn(`Attempted to consume task ${props.taskId} but it was not found`)
          return
        }

        // Update status to running
        await context.services[TasksNamespace].cruds.Tasks.update(task.id, {
          ...task,
          status: TaskStatus.Running,
          startedAt: new Date().toISOString()
        })

        await executeRegisteredTaskFeature({ taskId: props.taskId }, crossLayerProps)
      } catch (e) {
        log.error(`Exception occurred while consuming task ${props.taskId}`, createErrorObject('TASK_CONSUMER_EXCEPTION', 'Exception occurred consuming task', e))
      }
    }
  }



  const executeCallbackTask = registerTaskFeature({
    domain: TasksNamespace,
    feature: 'executeCallbackTask',
    method: async (props: { taskCallbackId: string }, crossLayerProps?: CrossLayerProps) => {
      const log = context.log.getInnerLogger('executeCallbackTask', crossLayerProps)
      const callback = await context.services[TasksNamespace].cruds.TaskCallbacks.retrieve(props.taskCallbackId).then(x=>x?.toObj<TaskCallback>())
      
      if (!callback) {
        const level = context.config[TasksNamespace].callbacks.callbackFailedLogLevel || LogLevelNames.warn
        if (level !== 'none') {
          const obj = createErrorObject('TASK_CALLBACK_NOT_FOUND', `Task callback ${props.taskCallbackId} not found.`)
          log[level]('Overall task callback exception occurred', obj)
        }
        return {}
      }

      const feature = taskCallbacks[callback.domain]?.[callback.feature]
      if (feature) {
        await feature({ taskCallbackId: callback.id }, crossLayerProps)
      } else {
        const level = context.config[TasksNamespace].callbacks.callbackFailedLogLevel || LogLevelNames.warn
        if (level !== 'none') {
          const obj = createErrorObject('TASK_CALLBACK_FEATURE_NOT_FOUND', `Task callback feature ${callback.domain}:${callback.feature} not found.`)
          log[level]('Overall task callback exception occurred', obj)
        }
      }
      return {}
    }
  })

  return {
    runTask,
    runTaskCallbacks,
    enqueueTask,
    registerTaskFeature,
    registerTaskCallback,
    executeRegisteredTaskFeature,
    registerTaskConsumer,
  }
}

export { create }
