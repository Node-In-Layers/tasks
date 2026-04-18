import { ModelProps } from '@node-in-layers/core'
import {
  TextProperty,
  DatetimeProperty,
  ObjectProperty,
  JsonAble,
  LastModifiedDateProperty,
} from 'functional-models'
import { TasksNamespace } from '../../types.js'
import {
  Task,
  TaskStatus,
  TaskPriority,
  TaskRetryConfig,
  TaskResult,
} from '../types.js'
import { ConfigWithTasks } from '../../backend/types.js'

export const create = ({
  Model,
  getModel,
  getPrimaryKeyProperty,
  getForeignKeyProperty,
}: ModelProps<ConfigWithTasks>) => {
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
      result: ObjectProperty<TaskResult>(),
      scheduledAt: DatetimeProperty(),
      startedAt: DatetimeProperty(),
      completedAt: DatetimeProperty(),
      executionNode: TextProperty(),
      retryConfig: ObjectProperty<TaskRetryConfig>(),
      userId: TextProperty(),
      createdAt: DatetimeProperty(),
      updatedAt: LastModifiedDateProperty(),
    },
  })
}
