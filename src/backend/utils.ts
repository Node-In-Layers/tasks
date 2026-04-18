import { createErrorObject, Response, ErrorObject } from '@node-in-layers/core'

export type ContinueUntilOptions = Readonly<{
  timeoutMs?: number
  pollIntervalMs?: number
  maxPolls?: number
}>

const DEFAULT_TIMEOUT_MS = 30000
const DEFAULT_POLL_INTERVAL_MS = 1000
const MIN_POLL_INTERVAL_MS = 1

export const continueUntil = async <T>(
  action: () => Promise<T>,
  shouldContinue: (previousResult: T | undefined, currentResult: T) => boolean,
  options: ContinueUntilOptions = {}
): Promise<Response<T>> => {
  return Promise.resolve()
    .then(async () => {
      const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS
      const pollIntervalMs = options.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS
      const maxPolls =
        options.maxPolls ||
        Math.ceil(timeoutMs / Math.max(pollIntervalMs, MIN_POLL_INTERVAL_MS))

      // Polling needs mutable state and sequential awaits to compare results over time.
      /* eslint-disable functional/no-let, functional/no-loop-statements, no-await-in-loop */
      let polls = 0
      const startTime = Date.now()
      let previousResult: T | undefined = undefined

      while (polls < maxPolls) {
        if (Date.now() - startTime > timeoutMs) {
          return createErrorObject(
            'TIMEOUT',
            `Operation timed out after ${timeoutMs}ms`
          ) as ErrorObject
        }

        const currentResult = await action()

        if (!shouldContinue(previousResult, currentResult)) {
          return currentResult as T
        }

        previousResult = currentResult
        polls++

        if (pollIntervalMs > 0) {
          await new Promise(resolve => {
            setTimeout(resolve, pollIntervalMs)
          })
        }
      }
      /* eslint-enable functional/no-let, functional/no-loop-statements, no-await-in-loop */

      return createErrorObject(
        'MAX_POLLS_REACHED',
        `Operation did not complete within ${maxPolls} polls`
      )
    })
    .then(x => x as Response<T>)
}
