const millisecondsPerSecond = 1000

export const createTTL = (
  args: Readonly<{ datetime: Date | string }>
): number => {
  const date =
    args.datetime instanceof Date ? args.datetime : new Date(args.datetime)
  return Math.floor(date.getTime() / millisecondsPerSecond)
}
