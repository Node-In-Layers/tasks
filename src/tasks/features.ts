import { 
  createErrorObject,
  Config, 
  FeaturesContext, 
  LayerContext, 
  CrossLayerProps 
} from '@node-in-layers/core/index.js'
import { JsonObj } from 'functional-models'
import { asyncMap } from 'modern-async'
import { 
  RunTaskCallbacksProps,
  CreateTaskProps,
  TaskStatus,
  TaskRunner,
  TaskPriority,
  ConfigWithTasks,
  TasksServicesLayer, 
  TasksFeaturesLayer, 
  TasksFeatures, 
  TasksNamespace,
  Task 
} from './types.js'

const create = (
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  context: FeaturesContext<Config, TasksServicesLayer>
) : TasksFeatures => {

  const runTaskCallbacks = <
    TInput extends JsonObj={}, 
    TOutput extends JsonObj={}, 
    TConfig extends ConfigWithTasks=ConfigWithTasks,
    TContext extends FeaturesContext<TConfig>=FeaturesContext<TConfig>
  >(props: RunTaskCallbacksProps<TInput, TOutput, TConfig, TContext>, crossLayerProps?: CrossLayerProps) => {
    const log = context.log.getInnerLogger('runTaskCallbacks')
    return Promise.resolve()
      .then(() => {
        // TODO: Need to run task callbacks. Get the callbacks, then decide if going to run based on conditions.
        return
      })
      .catch(e => {
        const errorObj = createErrorObject('OVERALL_CALLBACK_EXCEPTION', 'Exception occurred running task callbacks', e)
        log.error('Exception occurred running task callbacks', errorObj)
      })
  }

  const runTask = async <
    TInput extends JsonObj={}, 
    TOutput extends JsonObj={}, 
    TConfig extends ConfigWithTasks=ConfigWithTasks,
    TContext extends FeaturesContext<TConfig>=FeaturesContext<TConfig>
  >(props: CreateTaskProps<TInput, TOutput, TConfig, TContext>, crossLayerProps?: CrossLayerProps) => {
    const log = context.log.getInnerLogger('runTask')
    crossLayerProps = crossLayerProps || {
      logging: {
        ids: log.getIds()
      }
    }
    const config = context.config[TasksNamespace]
    if (!config) {
      throw new Error(`Namespace ${TasksNamespace} does not exist in config.`)
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
      callbackIds: taskCallbacks,
      retryConfig: props.retryConfig,
      userId: props.userId,
    }).then(x=>x.toObj<Task>())

    const response = await ((() => {
      switch(config.type) {
        case(TaskRunner.Local): {
          return context.services[TasksNamespace].runTaskLocal(task, crossLayerProps)
        }
        case(TaskRunner.Docker): {
          return context.services[TasksNamespace].runTaskLocal(task, crossLayerProps)
        }
        case(TaskRunner.Custom): {
          return props.context.features[config.domain][config.features](props.context, task, crossLayerProps)
        }
        default:
          return createErrorObject('TASK_RUNNER_TYPE', `Task Runner type ${config.type} is not handled.`)
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

      // Update the task, that its completed.
      return {
        taskId: task.id,
        error: response.error,
      }
    }

    return {
      taskId: task.id,
    }
  }

  return {
    runTask,
    runTaskCallbacks,
  }
}

export { create }
