import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import { startAiFixture } from './e2e-ai.mjs'

// One schema and one directory per run keep quotas, uploads and drafts independent of real projects.
const schema = `editor_e2e_${randomBytes(6).toString('hex')}`
const dataDir = await mkdtemp(join(tmpdir(), 'godeck-e2e-'))
const connectionString = process.env.E2E_DATABASE_URL ?? 'postgresql://godeck:godeck-local-only@127.0.0.1:5433/godeck'
const database = new pg.Client({ connectionString, connectionTimeoutMillis: 10_000 })
const env = {
  ...process.env,
  NEXT_DIST_DIR: '.next-e2e',
  BACKEND_URL: 'http://127.0.0.1:18081',
  STATIC_EXPORT: '0',
  NEXT_TELEMETRY_DISABLED: '1',
  E2E_SCHEMA: schema,
  E2E_DATA_DIR: dataDir,
  E2E_DATABASE_URL: connectionString,
}

let activeChild
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => activeChild?.kill(signal))
}

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', args, { stdio: 'inherit', env })
    activeChild = child
    child.on('error', reject)
    child.on('exit', (code, signal) => resolve(code ?? (signal ? 130 : 1)))
  })
}

let connected = false
let schemaCreated = false
let aiFixture
try {
  aiFixture = await startAiFixture()
  env.E2E_AI_URL = aiFixture.url
  await database.connect()
  connected = true
  await database.query(`CREATE SCHEMA ${schema}`)
  schemaCreated = true
  const buildCode = await run(['build'])
  process.exitCode = buildCode || await run(['exec', 'playwright', 'test', ...process.argv.slice(2)])
} catch (error) {
  console.error(`E2E could not start: ${error.message}`)
  console.error('Start local PostgreSQL with pnpm infra:up, or set E2E_DATABASE_URL to a dedicated test database.')
  process.exitCode = 1
} finally {
  try {
    if (connected && schemaCreated) {
      // schema is generated above, never read from user input or an application configuration.
      await database.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    }
  } finally {
    if (connected) await database.end()
    if (aiFixture) await aiFixture.close()
    await rm(dataDir, { recursive: true, force: true })
  }
}
