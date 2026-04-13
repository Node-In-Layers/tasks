import kebabCase from 'lodash/kebabCase.js'
import { CrossLayerProps } from "@node-in-layers/core"

export const createQueueName = (environment: string, domain: string, feature: string) => {
  return kebabCase(`${domain}-${feature}-${environment}`)
}

export const createTaskCrossLayerProps = (domain: string, feature: string, taskId: string, crossLayerProps?: CrossLayerProps) :CrossLayerProps => {
  const idKey = kebabCase(`${domain}-${feature}-id`)
  const ids = crossLayerProps?.logging?.ids || []

  return {
    logging: {
      ids: ids.concat({
        [idKey]: taskId,
      }),
    },
  }
}