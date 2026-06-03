import omit from 'lodash/omit.js'
import {
  AnnotatedFunctionProps,
  NilAnnotatedFunction,
  annotatedFunction,
} from '@node-in-layers/core'
import { JsonObj, PrimaryKeyType } from 'functional-models'
import { CoreTasksConfig, defaultTaskTtlSeconds } from '../types.js'
import {
  taskAnnotationFunctionProps,
  TaskControlProp,
  TaskFeatureProps,
  TaskFeatureWrapperImplementation,
} from './types.js'
import { createTTL } from './libs.js'

const millisecondsPerSecond = 1000

const resolveDefaultTtlSeconds = (
  coreConfig: CoreTasksConfig | undefined
): number | undefined => {
  if (coreConfig?.noTTL === true) {
    return undefined
  }
  return coreConfig?.defaultTtl ?? defaultTaskTtlSeconds
}

const shouldUseTaskTtl = (
  args: Readonly<{ coreConfig: CoreTasksConfig | undefined }>
): boolean => {
  return resolveDefaultTtlSeconds(args.coreConfig) !== undefined
}

const createTaskTtlFromSecondsFromNow = (
  args: Readonly<{ secondsFromNow: number }>
): number => {
  return createTTL({
    datetime: new Date(
      Date.now() + args.secondsFromNow * millisecondsPerSecond
    ),
  })
}

export const createTaskTtlLazyLoadMethod = (
  args: Readonly<{ coreConfig: CoreTasksConfig | undefined }>
) => {
  return (value: number | undefined): number | undefined => {
    if (value !== undefined && value !== null) {
      return value
    }
    if (!shouldUseTaskTtl({ coreConfig: args.coreConfig })) {
      return value
    }
    const defaultTtlSeconds = resolveDefaultTtlSeconds(args.coreConfig)
    if (defaultTtlSeconds === undefined) {
      return value
    }
    return createTaskTtlFromSecondsFromNow({
      secondsFromNow: defaultTtlSeconds,
    })
  }
}

export const stripTaskControlProps = <TProps extends JsonObj>(
  props: TaskFeatureProps<TProps>
) => omit(props, TaskControlProp) as TProps

/* eslint-disable no-implicit-globals */
export function createTaskFeature<TProps extends JsonObj>(
  feature: NilAnnotatedFunction<
    TaskFeatureProps<TProps>,
    { taskId: PrimaryKeyType }
  >
): NilAnnotatedFunction<TaskFeatureProps<TProps>, { taskId: PrimaryKeyType }>
export function createTaskFeature<
  TProps extends JsonObj,
  TOutput extends JsonObj,
>(
  props: AnnotatedFunctionProps<TProps, TOutput>,
  implementation: TaskFeatureWrapperImplementation<TProps>
): NilAnnotatedFunction<TaskFeatureProps<TProps>, { taskId: PrimaryKeyType }> &
  TaskFeatureWrapperImplementation<TProps>
export function createTaskFeature<
  TProps extends JsonObj,
  TOutput extends JsonObj,
>(
  propsOrFeature:
    | AnnotatedFunctionProps<TProps, TOutput>
    | NilAnnotatedFunction<
        TaskFeatureProps<TProps>,
        { taskId: PrimaryKeyType }
      >,
  implementation?: TaskFeatureWrapperImplementation<TProps>
) {
  if (!implementation) {
    return propsOrFeature
  }
  return annotatedFunction(
    taskAnnotationFunctionProps(
      propsOrFeature as AnnotatedFunctionProps<TProps, TOutput>
    ),
    implementation
  )
}
/* eslint-enable no-implicit-globals */
