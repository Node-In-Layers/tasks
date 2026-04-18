import {
  TextProperty,
  LastModifiedDateProperty,
  DatetimeProperty,
  ObjectProperty,
} from 'functional-models'
import { ModelProps } from '@node-in-layers/core'
import { TasksNamespace } from '../../types.js'
import {
  TaskCallbackConditions,
  TaskCallbackMapping,
  TaskRetryConfig,
} from '../types.js'
import { ConfigWithTasks } from '../../backend/types.js'

export const create = ({
  Model,
  getPrimaryKeyProperty,
}: ModelProps<ConfigWithTasks>) => {
  const idProperty = getPrimaryKeyProperty(
    TasksNamespace.Core,
    'TaskCallbackMappings'
  )

  return Model<TaskCallbackMapping>({
    pluralName: 'TaskCallbackMappings',
    singularName: 'TaskCallbackMapping',
    namespace: TasksNamespace.Core,
    properties: {
      id: idProperty,
      sourceDomain: TextProperty({ required: true }),
      sourceFeature: TextProperty({ required: true }),
      targetDomain: TextProperty({ required: true }),
      targetFeature: TextProperty({ required: true }),
      conditions: ObjectProperty<TaskCallbackConditions>(),
      retryConfig: ObjectProperty<TaskRetryConfig>(),
      createdAt: DatetimeProperty(),
      updatedAt: LastModifiedDateProperty(),
    },
  })
}
