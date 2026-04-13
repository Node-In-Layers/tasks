import { CrossLayerProps, loadSystem } from '@node-in-layers/core'
import { JsonObj } from 'functional-models'
import { ConfigWithTasks, TasksNamespace, TaskSystem } from "./types.js"

type RunLocalTaskFromCliProps = Readonly<{
  environment: string,
  config?: ConfigWithTasks,
  data: {
    taskId: string,
  },
  crossLayerProps?: CrossLayerProps,
}>

const runTaskFeatureFromCli = async (props: RunLocalTaskFromCliProps) => {
  const system = await loadSystem<ConfigWithTasks>(props) as TaskSystem

  system.features[TasksNamespace].runTask({
    context: system,


  }, crossLayerProps)

}