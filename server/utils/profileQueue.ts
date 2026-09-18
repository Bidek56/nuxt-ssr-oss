// In-process profiling queue — caps concurrent Polars runs so parallel uploads
// cannot OOM the server. Swap for a worker/Redis queue in multi-instance deploys.

const DEFAULT_CONCURRENCY = 2
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000

let active = 0
const waiters: Array<() => void> = []

function acquire(slot = DEFAULT_CONCURRENCY): Promise<void> {
   if (active < slot) {
      active++
      return Promise.resolve()
   }
   return new Promise((resolve) => {
      waiters.push(() => {
         active++
         resolve()
      })
   })
}

function release(): void {
   active = Math.max(0, active - 1)
   const next = waiters.shift()
   if (next) next()
}

export interface RunProfileOptions {
   concurrency?: number
   timeoutMs?: number
}

/**
 * Run an expensive profiling task with a concurrency cap and wall-clock timeout.
 * The timeout rejects the promise; it does not cancel native Polars work.
 */
export async function runProfileTask<T>(
   task: () => Promise<T>,
   options: RunProfileOptions = {},
): Promise<T> {
   const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY
   const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

   await acquire(concurrency)

   let timer: ReturnType<typeof setTimeout> | undefined
   try {
      const work = task()
      const timed = new Promise<T>((resolve, reject) => {
         timer = setTimeout(() => {
            reject(new Error(`Profiling timed out after ${Math.round(timeoutMs / 1000)}s.`))
         }, timeoutMs)
         work.then(resolve, reject)
      })
      return await timed
   } finally {
      if (timer) clearTimeout(timer)
      release()
   }
}
