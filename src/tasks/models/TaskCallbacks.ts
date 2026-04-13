import {
  Model,
  ForeignKeyProperty,
  PrimaryKeyUuidProperty,
  TextProperty,
  DatetimeProperty,
  ObjectProperty,
  LastModifiedDateProperty,
  JsonAble,
} from 'functional-models'
import { TaskCallback, TaskCallbackConditions, TaskRetryConfig, TasksNamespace } from '../types.js'
import { ModelProps } from '@node-in-layers/core'

export const create = ({ Model, getModel }: ModelProps) => {
  return Model<TaskCallback>({
    pluralName: 'TaskCallbacks',
    singularName: 'TaskCallback',
    namespace: TasksNamespace,
    properties: {
      id: PrimaryKeyUuidProperty(),
      taskId: ForeignKeyProperty(getModel(TasksNamespace, 'Tasks'), { required: true }),
      domain: TextProperty({ required: true }),
      feature: TextProperty({ required: true }),
      payload: ObjectProperty<Record<string, JsonAble>>(),
      conditions: ObjectProperty<TaskCallbackConditions>(),
      retryConfig: ObjectProperty<TaskRetryConfig>(),
      lastCall: DatetimeProperty(),
      createdAt: DatetimeProperty(),
      updatedAt: LastModifiedDateProperty(),
    }
  })
}