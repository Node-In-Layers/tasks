import { ModelProps } from '@node-in-layers/core'
import {
  Model,
  PrimaryKeyUuidProperty,
  TextProperty,
  DatetimeProperty,
  ObjectProperty,
  JsonAble,
  LastModifiedDateProperty
} from 'functional-models'
import { Task, TaskStatus, TaskPriority, TaskRetryConfig, TaskResult, TasksNamespace } from '../types.js'

export const create = ({ Model }: ModelProps) => {
  return Model<Task>({
    pluralName: 'Tasks',
    singularName: 'Task',
    namespace: TasksNamespace,
    properties: {
      id: PrimaryKeyUuidProperty(),
      rootTaskId: TextProperty(),
      parentTaskId: TextProperty(),
      name: TextProperty(),
      description: TextProperty(),
      domain: TextProperty({ required: true }),
      feature: TextProperty({ required: true }),
      status: TextProperty({ required: true, choices: Object.values(TaskStatus) }),
      priority: TextProperty({ required: true, choices: Object.values(TaskPriority) }),
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
    }
  })
}