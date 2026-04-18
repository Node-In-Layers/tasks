import omit from 'lodash/omit.js'
import {
  AnnotatedFunctionProps,
  NilAnnotatedFunction,
  annotatedFunction,
} from '@node-in-layers/core'
import { JsonObj, PrimaryKeyType } from 'functional-models'
import {
  taskAnnotationFunctionProps,
  TaskControlProp,
  TaskFeatureProps,
  TaskFeatureWrapperImplementation,
} from './types.js'

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
