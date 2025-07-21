import { 
  ServicesContext,
  createErrorObject,
} from '@node-in-layers/core/index.js'
import { 
  TasksServices, 
  Task,
  TasksNamespace
} from './types.js'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const create = (context: ServicesContext): TasksServices => {
  const runTaskLocal = (task: Task) => {
    return Promise.resolve().then(() => {
      const config = context.config[TasksNamespace]
      if (!config) {
        return createErrorObject('CONFIG_ERROR', `Namespace ${TasksNamespace} does not exist in config.`)
      }
      if (config.type !== 'local') {
        return createErrorObject('LOCAL_CONFIG_ERROR', `Configured task was not docker. Received ${config.type}.`)
      }

      throw new Error('Not implemented')
    })
  }

  const runTaskDocker = (task: Task) =>{
    return Promise.resolve().then(() => {
      const config = context.config[TasksNamespace]
      if (!config) {
        return createErrorObject('CONFIG_ERROR', `Namespace ${TasksNamespace} does not exist in config.`)
      }
      if (config.type !== 'docker') {
        return createErrorObject('DOCKER_CONFIG_ERROR', `Configured task was not docker. Received ${config.type}.`)
      }

      throw new Error('Not implemented')
    })
  }

  return {
    runTaskLocal,
    runTaskDocker,
  }
}

export { create }
