import kebabCase from 'lodash/kebabCase.js'
import { CrossLayerProps, combineCrossLayerProps } from '@node-in-layers/core'
import { PrimaryKeyType } from 'functional-models'

export const createQueueName = (
  environment: string,
  domain: string,
  feature: string
) => {
  return kebabCase(`${domain}-${feature}-${environment}`)
}

export const createTaskCrossLayerProps = (
  domain: string,
  feature: string,
  taskId: PrimaryKeyType,
  taskCrossLayerProps?: CrossLayerProps,
  crossLayerProps?: CrossLayerProps
): CrossLayerProps => {
  const idKey = kebabCase(`${domain}-${feature}-id`)
  return combineCrossLayerProps(
    combineCrossLayerProps(
      {
        logging: {
          ids: [
            {
              [idKey]: String(taskId),
            },
          ],
        },
      },
      taskCrossLayerProps || {}
    ),
    crossLayerProps || {}
  )
}
