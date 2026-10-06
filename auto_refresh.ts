export const REFRESH_SECONDS = 30

export type RefreshLoop = {
  readonly running: boolean
  done: Promise<void>
  stop(): Promise<void>
}

export function createRefreshLoop(
  refresh: () => Promise<boolean>,
  onError: (error: unknown) => void,
): RefreshLoop {
  let running = true
  let timer: ReturnType<typeof setTimeout> | undefined
  let finishDelay: (() => void) | undefined

  const done = (async () => {
    try {
      while (running) {
        await new Promise<void>(resolve => {
          finishDelay = resolve
          timer = setTimeout(resolve, REFRESH_SECONDS * 1000)
        })
        timer = undefined
        finishDelay = undefined
        if (!running) break

        try {
          if (!await refresh()) running = false
        } catch (error) {
          onError(error)
        }
      }
    } finally {
      running = false
      if (timer !== undefined) clearTimeout(timer)
      finishDelay?.()
      timer = undefined
      finishDelay = undefined
    }
  })()

  return {
    get running() { return running },
    done,
    stop() {
      running = false
      if (timer !== undefined) clearTimeout(timer)
      finishDelay?.()
      return done
    },
  }
}
