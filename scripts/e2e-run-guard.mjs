import { mkdir, open, unlink } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname } from 'node:path'

async function requireFreePort(url) {
  const { hostname, port } = new URL(url)
  await new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', (cause) => reject(new Error(`E2E port ${hostname}:${port} is already in use or unavailable. Stop the existing run before retrying.`, { cause })))
    server.listen(Number(port), hostname, () => server.close((error) => error ? reject(error) : resolve()))
  })
}

/** Protect shared build files before creating test data or starting any build/server. */
export async function acquireE2eRun(lockPath, urls) {
  await mkdir(dirname(lockPath), { recursive: true })
  let lock
  try {
    lock = await open(lockPath, 'wx', 0o600)
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    throw new Error(`Another E2E run owns ${lockPath}. Stop it before retrying. If it crashed, remove this lock only after checking that no E2E process or test server remains.`)
  }
  let released = false
  const release = async () => {
    if (released) return
    released = true
    try { await lock.close() } finally { await unlink(lockPath) }
  }
  try {
    await lock.writeFile(`${process.pid}\n`)
    for (const url of urls) await requireFreePort(url)
    return release
  } catch (error) {
    await release()
    throw error
  }
}
