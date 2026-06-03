import {
  annotatedFunction,
  FeaturesContext,
  jsonObjSchema,
} from '@node-in-layers/core'
import {
  queryBuilder,
  DatastoreValueType,
  EqualitySymbol,
} from 'functional-models'
import { z } from 'zod'
import { ConfigWithTasks, TasksNamespace } from '../types.js'
import { createTTL } from './libs.js'
import { CoreFeatures, CoreFeaturesLayer, CoreServicesLayer } from './types.js'

const defaultCleanupBatchSize = 100

export const create = (
  context: FeaturesContext<
    ConfigWithTasks,
    CoreServicesLayer,
    CoreFeaturesLayer
  >
): CoreFeatures => {
  const cleanUpTasks = annotatedFunction(
    {
      functionName: 'cleanUpTasks',
      domain: TasksNamespace.Core,
      description:
        'Searches for Tasks with expired TTL Unix timestamps and bulk deletes them.',
      args: jsonObjSchema,
      returns: z.object({
        deletedCount: z.number().int(),
      }),
    },
    async () => {
      const Tasks = context.services[TasksNamespace.Core].cruds.Tasks
      const batchSize =
        context.config[TasksNamespace.Core]?.cleanupBatchSize ??
        defaultCleanupBatchSize
      const nowTtl = createTTL({ datetime: new Date() })

      const deleteNextBatch = async (deletedSoFar: number): Promise<number> => {
        const result = await Tasks.search(
          queryBuilder()
            .property('ttl', nowTtl, {
              type: DatastoreValueType.number,
              equalitySymbol: EqualitySymbol.lte,
            })
            .take(batchSize)
            .compile()
        )
        const primaryKeys = result.instances.map(instance =>
          instance.getPrimaryKey()
        )
        if (!primaryKeys.length) {
          return deletedSoFar
        }
        await Tasks.bulkDelete(primaryKeys)
        return deleteNextBatch(deletedSoFar + primaryKeys.length)
      }

      const deletedCount = await deleteNextBatch(0)
      return { deletedCount }
    }
  )

  return {
    cleanUpTasks,
  }
}
