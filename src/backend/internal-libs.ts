import {
  AnnotatedFunctionProps,
  LayerFunction,
  NilAnnotatedFunction,
  Response,
} from '@node-in-layers/core'
import { JsonObj } from 'functional-models'
import { z } from 'zod'

export type TaskFeatureImplementation<
  TProps extends JsonObj,
  TOutput extends JsonObj = JsonObj,
> =
  | LayerFunction<(props: TProps) => Promise<Response<TOutput>>>
  | NilAnnotatedFunction<TProps, TOutput>

export type NormalizedCreateTaskFeatureArgs<
  TProps extends JsonObj,
  TOutput extends JsonObj = JsonObj,
> = Readonly<{
  annotationProps: AnnotatedFunctionProps<TProps, TOutput>
  method: TaskFeatureImplementation<TProps, TOutput>
}>

const getAnnotatedFunctionProps = <
  TProps extends JsonObj,
  TOutput extends JsonObj = JsonObj,
>(
  method: NilAnnotatedFunction<TProps, TOutput>
): AnnotatedFunctionProps<TProps, TOutput> => ({
  functionName: method.functionName,
  domain: method.domain,
  description: method.schema.description,
  args: (method.schema as any).parameters().items[0] as z.ZodType<TProps>,
  returns: (method.schema as any).returnType() as any,
})

/* eslint-disable no-implicit-globals */
export function normalizeCreateTaskFeatureArgs<
  TProps extends JsonObj,
  TOutput extends JsonObj = JsonObj,
>(
  props: AnnotatedFunctionProps<TProps, TOutput>,
  implementation: TaskFeatureImplementation<TProps, TOutput>
): NormalizedCreateTaskFeatureArgs<TProps, TOutput>
export function normalizeCreateTaskFeatureArgs<
  TProps extends JsonObj,
  TOutput extends JsonObj = JsonObj,
>(
  method: NilAnnotatedFunction<TProps, TOutput>
): NormalizedCreateTaskFeatureArgs<TProps, TOutput>
export function normalizeCreateTaskFeatureArgs<
  TProps extends JsonObj,
  TOutput extends JsonObj = JsonObj,
>(
  first:
    | AnnotatedFunctionProps<TProps, TOutput>
    | NilAnnotatedFunction<TProps, TOutput>,
  second?: TaskFeatureImplementation<TProps, TOutput>
): NormalizedCreateTaskFeatureArgs<TProps, TOutput> {
  if (!second) {
    const method = first as NilAnnotatedFunction<TProps, TOutput>
    return {
      annotationProps: getAnnotatedFunctionProps(method),
      method,
    }
  }
  return {
    annotationProps: first as AnnotatedFunctionProps<TProps, TOutput>,
    method: second,
  }
}
/* eslint-enable no-implicit-globals */
