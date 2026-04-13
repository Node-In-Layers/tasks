import { Config, createErrorObject, FeaturesContext } from '@node-in-layers/core/index.js'
import {
  WorkflowsServicesLayer,
  WorkflowsFeaturesLayer
} from './types.js'


const create = (
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  context: FeaturesContext<Config, WorkflowsServicesLayer, WorkflowsFeaturesLayer>
) => {

  const _workflows = {}


  type Step = {
    name: string,
    isTask?: boolean
  }

  const registerWorkflowFeature = (props: {
    domain: string,
    feature: string,
    steps: Record<string, Step>
  }) => {
    if (!(props.domain in _workflows)) {
      _workflows[props.domain] = {}
    }
    _workflows[props.domain][props.feature] = {
      domain: props.domain,
      feature: props.feature,
      steps: props.steps,
    }
  }

  const executeWorkflow = (props: {
    domain: string,
    feature: string,
    payload: Record<string, JsonAble>
  }) => {
    const workflow = _workflows[props.domain][props.feature]
    if (!workflow) {
      return createErrorObject('WORKFLOW_NOT_FOUND', `Workflow ${props.domain}:${props.feature} not found`)
    }
  }

  type WorkflowArgs = {
    workflowId: string,
  }

  const createWorkflow = (workflowProps) => {
    return (args: WorkflowArgs, crossLayerProps) => {
      const workflow = context.services.workflows.cruds.Workflows.retrieve(args.workflowId) as OrmModelInstance<Workflow>
      if (!workflow) {
        return createErrorObject('WORKFLOW_NOT_FOUND', `Workflow ${args.workflowId} not found`)
      }
      const step = workflow.currentStep
      const func = workflowProps.steps[step]
      if (!func) {
        return createErrorObject('STEP_NOT_FOUND', `Step ${step} not found in workflow ${workflowProps.domain}:${workflowProps.feature}`)
      }
      // wrapp
      const result = func(args, crossLayerProps)
      // wrap
      return result
    }
  }

  const myWorkflow = createWorkflow({
    steps: {
      'step1': async (args, crossLayerProps) => {
        return {
          step1: 'step1'
        }
      },
      'step2': taskStep(async (args, crossLayerProps) => {
        const taskInfo = context.tasks.runTask(args)
        return taskInfo
      }),
      'step3': async (args, crossLayerProps) => {
        return {
          step3: 'step3'
        }
      }
    }
  })

  const currentStepResult = await myWorkflow({
    workflowId: 'sdf',
  })


  return {
  }
}

export {
  create,
}
