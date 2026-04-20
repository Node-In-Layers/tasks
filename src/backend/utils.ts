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
      const timeoutMs =
        options.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : options.timeoutMs
      const pollIntervalMs =
        options.pollIntervalMs === undefined
          ? DEFAULT_POLL_INTERVAL_MS
          : options.pollIntervalMs
      const hasTimeout = timeoutMs > 0
      const derivedMaxPolls = hasTimeout
        ? Math.ceil(timeoutMs / Math.max(pollIntervalMs, MIN_POLL_INTERVAL_MS))
        : undefined
      const maxPolls =
        options.maxPolls === undefined ? derivedMaxPolls : options.maxPolls
      const hasMaxPolls = maxPolls !== undefined && maxPolls > 0

      // Polling needs mutable state and sequential awaits to compare results over time.
      /* eslint-disable functional/no-let, functional/no-loop-statements, no-await-in-loop */
      let polls = 0
      const startTime = Date.now()
      let previousResult: T | undefined = undefined

      // !hasMaxPolls is intentionally here, for unlimited polling.
      // eslint-disable-next-line no-unmodified-loop-condition
      while (!hasMaxPolls || polls < maxPolls) {
        if (hasTimeout && Date.now() - startTime > timeoutMs) {
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

      if (!hasMaxPolls) {
        return createErrorObject(
          'INVALID_POLLING_CONFIGURATION',
          'continueUntil exited unexpectedly while maxPolls was unlimited.'
        )
      }

      return createErrorObject(
        'MAX_POLLS_REACHED',
        `Operation did not complete within ${maxPolls} polls`
      )
    })
    .then(x => x as Response<T>)
}
