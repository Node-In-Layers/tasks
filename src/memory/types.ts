import { TasksNamespace } from '../types.js'
import { QueueService } from '../backend/types.js'

export type MemoryServices = QueueService & Readonly<object>

export type MemoryServicesLayer = Readonly<{
  [TasksNamespace.Memory]: MemoryServices
}>

export type MemoryFeatures = Readonly<object>

export type MemoryFeaturesLayer = Readonly<{
  [TasksNamespace.Memory]: MemoryFeatures
}>
