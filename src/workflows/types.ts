import { TasksNamespace } from '../types.js'

export type WorkflowsNamespace = TasksNamespace.Workflows

export type WorkflowsServices = Readonly<object>

export type WorkflowsServicesLayer = Readonly<{
  [TasksNamespace.Workflows]: WorkflowsServices
}>

export type WorkflowsFeatures = Readonly<object>

export type WorkflowsFeaturesLayer = Readonly<{
  [TasksNamespace.Workflows]: WorkflowsFeatures
}>
