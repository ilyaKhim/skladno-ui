import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile, cp } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { startAiFixture } from './e2e-ai.mjs'
import { acquireE2eRun } from './e2e-run-guard.mjs'
import toolCommands from './tool-commands.cjs'
import { buildFingerprint, rememberBuild, requireReusableBuild } from './e2e-build.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const flags = new Set(process.argv.slice(2))
const reuseBuild = flags.has('--reuse-build')
const diagnostic = flags.has('--diagnostic') || process.argv.some((arg) => arg.startsWith('--debug'))
const args = process.argv.slice(2).filter((arg) => !['--smoke', '--reuse-build', '--diagnostic', '--review'].includes(arg))
if (flags.has('--smoke')) args.unshift('--project=chromium', '--grep=@smoke')
if (reuseBuild && process.env.CI) throw new Error('--reuse-build is local-only; CI always builds current sources.')

// One schema and one directory per run keep quotas, uploads and drafts independent of real projects.
const schema = `editor_e2e_${randomBytes(6).toString('hex')}`
const dataDir = await mkdtemp(join(tmpdir(), 'godeck-e2e-'))
const connectionString = process.env.E2E_DATABASE_URL ?? 'postgresql://godeck:godeck-local-only@127.0.0.1:5433/godeck'
const database = new pg.Client({ connectionString, connectionTimeoutMillis: 10_000 })
const env = {
  ...process.env,
  NEXT_DIST_DIR: '.next-e2e',
  BACKEND_URL: 'http://127.0.0.1:18081',
  FRONTEND_URL: 'http://127.0.0.1:13000',
  STATIC_EXPORT: '0',
  NEXT_TELEMETRY_DISABLED: '1',
  E2E_SCHEMA: schema,
  E2E_DATA_DIR: dataDir,
  E2E_DATABASE_URL: connectionString,
  E2E_VIDEO: diagnostic ? '1' : '0',
  E2E_REVIEW: diagnostic || flags.has('--review') ? '1' : '0',
}

let activeChild
let cancelled = false
const stages = []
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { cancelled = true; activeChild?.kill(signal) })
}

async function run(args, label) {
  if (cancelled) return 130
  const start = performance.now()
  console.log(`E2E: ${label}`)
  const code = await new Promise((resolve, reject) => {
    const output = createWriteStream(join(env.E2E_LOG_DIR, `${label}.log`))
    output.on('error', reject)
    const invocation = toolCommands.pnpmCommand(args)
    const child = spawn(invocation.command, invocation.args, { stdio: ['inherit', 'pipe', 'pipe'], cwd: root, env })
    activeChild = child
    child.stdout.pipe(output, { end: false })
    child.stderr.pipe(output, { end: false })
    child.stdout.pipe(process.stdout, { end: false })
    child.stderr.pipe(process.stderr, { end: false })
    child.on('error', (error) => { output.end(); reject(error) })
    child.on('close', (code, signal) => {
      activeChild = undefined
      output.end(() => resolve(code ?? (signal ? 130 : 1)))
    })
  })
  stages.push({ stage: label, durationMs: Math.round(performance.now() - start), exitCode: code })
  await writeFile(join(env.E2E_LOG_DIR, 'stages.json'), JSON.stringify(stages, null, 2))
  console.log(`E2E: ${label} ${(stages.at(-1).durationMs / 1000).toFixed(1)}s (exit ${code})`)
  return code
}

let connected = false
let schemaCreated = false
let aiFixture
let releaseRun
try {
  releaseRun = await acquireE2eRun(fileURLToPath(new URL('../.tools/e2e-run.lock', import.meta.url)), [env.BACKEND_URL, env.FRONTEND_URL])
  env.E2E_LOG_DIR = join(root, '.tools', 'e2e-runs', schema)
  await mkdir(env.E2E_LOG_DIR, { recursive: true })
  console.log(`E2E diagnostics: ${env.E2E_LOG_DIR}`)
  const fingerprint = await buildFingerprint(root, env)
  if (reuseBuild) await requireReusableBuild(root, fingerprint)
  await database.connect()
  connected = true
  if (!reuseBuild) {
    await rm(join(root, '.tools', 'e2e-build.json'), { force: true })
    const buildCode = await run(['document-worker:build'], 'build-worker') || await run(['build'], 'build-frontend')
    if (buildCode) throw new Error(`Build failed (exit ${buildCode}); see ${env.E2E_LOG_DIR}`)
    if (fingerprint !== await buildFingerprint(root, env)) throw new Error('Build inputs changed during compilation. Run again before reusing this build.')
    await rememberBuild(root, fingerprint)
  }
  if (cancelled) throw new Error('E2E cancelled before server startup.')
  aiFixture = await startAiFixture()
  env.E2E_AI_URL = aiFixture.url
  await database.query(`CREATE SCHEMA ${schema}`)
  schemaCreated = true
  process.exitCode = await run(['exec', 'playwright', 'test', ...args], 'playwright')
} catch (error) {
  console.error(`E2E could not start: ${error.message}`)
  if (error.code === 'ECONNREFUSED') console.error('Start local PostgreSQL with pnpm infra:up, or set E2E_DATABASE_URL to a dedicated test database.')
  process.exitCode = 1
} finally {
  try {
    if (connected && schemaCreated) {
      // schema is generated above, never read from user input or an application configuration.
      await database.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    }
  } finally {
    try {
      if (connected) await database.end()
      if (aiFixture) await aiFixture.close()
      await rm(dataDir, { recursive: true, force: true })
    } finally {
      try {
        if (env.E2E_LOG_DIR) {
          await cp(env.E2E_LOG_DIR, join(root, 'test-results', 'diagnostics', schema), { recursive: true })
          console.log(`E2E logs retained: ${env.E2E_LOG_DIR}`)
        }
      } finally { await releaseRun?.() }
    }
  }
}
