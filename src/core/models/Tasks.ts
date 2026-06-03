import { CrossLayerProps, ModelProps } from '@node-in-layers/core'
import {
  TextProperty,
  DatetimeProperty,
  ObjectProperty,
  JsonAble,
  LastModifiedDateProperty,
  IntegerProperty,
} from 'functional-models'
import { TasksNamespace, ConfigWithTasks } from '../../types.js'
import {
  Task,
  TaskStatus,
  TaskPriority,
  TaskRetryConfig,
  TaskResult,
} from '../types.js'
import { createTaskTtlLazyLoadMethod } from '../internal-libs.js'

export const create = ({
  context,
  Model,
  getModel,
  getPrimaryKeyProperty,
  getForeignKeyProperty,
}: ModelProps<ConfigWithTasks>) => {
  const coreConfig = context.config[TasksNamespace.Core]
  const idProperty = getPrimaryKeyProperty(TasksNamespace.Core, 'Tasks')
  const rootTaskIdProperty = getForeignKeyProperty(
    TasksNamespace.Core,
    'Tasks',
    getModel(TasksNamespace.Core, 'Tasks')
  )
  const parentTaskIdProperty = getForeignKeyProperty(
    TasksNamespace.Core,
    'Tasks',
    getModel(TasksNamespace.Core, 'Tasks')
  )

  return Model<Task>({
    pluralName: 'Tasks',
    singularName: 'Task',
    namespace: TasksNamespace.Core,
    properties: {
      id: idProperty,
      rootTaskId: rootTaskIdProperty,
      parentTaskId: parentTaskIdProperty,
      name: TextProperty(),
      description: TextProperty(),
      domain: TextProperty({ required: true }),
      feature: TextProperty({ required: true }),
      status: TextProperty({
        required: true,
        choices: Object.values(TaskStatus),
      }),
      priority: TextProperty({
        required: true,
        choices: Object.values(TaskPriority),
      }),
      payload: ObjectProperty<Record<string, JsonAble>>(),
      crossLayerProps:
        ObjectProperty<CrossLayerProps<Record<string, JsonAble>>>(),
      result: ObjectProperty<TaskResult>(),
      scheduledAt: DatetimeProperty(),
      startedAt: DatetimeProperty(),
      completedAt: DatetimeProperty(),
      executionNode: TextProperty(),
      retryConfig: ObjectProperty<TaskRetryConfig>(),
      ttl: IntegerProperty({
        description:
          'Optional Unix timestamp (seconds) for automatic database roll-out.',
        lazyLoadMethod: createTaskTtlLazyLoadMethod({ coreConfig }),
        minValue: 0,
      }),
      userId: TextProperty(),
      createdAt: DatetimeProperty(),
      updatedAt: LastModifiedDateProperty(),
    },
  })
}
