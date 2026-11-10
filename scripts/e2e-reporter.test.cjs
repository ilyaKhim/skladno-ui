const assert = require('node:assert/strict')
const { mkdtempSync, readFileSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { test } = require('node:test')
const { spawnSync } = require('node:child_process')
const { createServer } = require('node:http')
const Reporter = require('./e2e-reporter.cjs')

function silenceReporter(t) {
  t.mock.method(console, 'log', () => {})
  t.mock.method(console, 'error', () => {})
}

test('reporter keeps separate server logs and test/setup timings', async (t) => {
  silenceReporter(t)
  const directory = mkdtempSync(join(tmpdir(), 'godeck-report-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const reporter = new Reporter({ directory })
  reporter.onStdOut('\u001b[32m[API]\u001b[0m Ready\n')
  reporter.onStdErr('[Web] Connection lost\n')
  const scenario = { titlePath: () => ['chromium', 'editor', 'save'], expectedStatus: 'passed' }
  const result = { status: 'passed', duration: 1200, retry: 0, errors: [] }
  reporter.onStepEnd(scenario, result, { title: 'Подготовка презентации', duration: 400 })
  await reporter.onTestEnd(scenario, result)
  assert.match(readFileSync(join(directory, 'api.log'), 'utf8'), /Ready/)
  assert.match(readFileSync(join(directory, 'web.log'), 'utf8'), /Connection lost/)
  const data = JSON.parse(readFileSync(join(directory, 'tests.jsonl'), 'utf8'))
  assert.equal(data.durationMs, 1200)
  assert.equal(data.setupMs, 400)
  assert.equal(data.title, 'chromium › editor › save')
})

test('unexpected failure includes server health and error without calling a real provider', async (t) => {
  silenceReporter(t)
  const directory = mkdtempSync(join(tmpdir(), 'godeck-report-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const reporter = new Reporter({ directory, urls: ['http://127.0.0.1:1'] })
  await reporter.onTestEnd({ titlePath: () => ['broken'], expectedStatus: 'passed' }, {
    status: 'failed', duration: 10, retry: 0, errors: [{ message: 'save failed' }],
  })
  const failure = JSON.parse(readFileSync(join(directory, 'tests.jsonl'), 'utf8'))
  assert.equal(failure.health[0].available, false)
  assert.equal(failure.errors[0], 'save failed')
})

test('startup errors and final summary survive in per-run report artifacts', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'godeck-report-end-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const result = spawnSync(process.execPath, ['-e', `
    const Reporter = require(${JSON.stringify(require.resolve('./e2e-reporter.cjs'))})
    const reporter = new Reporter({directory: 'logs/run-123'})
    reporter.onTestBegin()
    reporter.onError({message: 'Cannot start API'})
    reporter.onEnd({status: 'failed', duration: 123})
  `], { cwd: directory, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const artifact = join(directory, 'test-results/diagnostics/run-123')
  assert.match(readFileSync(join(artifact, 'errors.log'), 'utf8'), /Cannot start API/)
  const summary = JSON.parse(readFileSync(join(artifact, 'summary.json'), 'utf8'))
  assert.equal(summary.status, 'failed')
  assert.equal(summary.tests, 0)
  assert.equal(typeof summary.startupMs, 'number')
})

test('health distinguishes a responding server from a server returning 500', async (t) => {
  silenceReporter(t)
  const directory = mkdtempSync(join(tmpdir(), 'godeck-health-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const server = createServer((request, response) => response.writeHead(request.url === '/ok' ? 200 : 500).end())
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const base = `http://127.0.0.1:${server.address().port}`
  const reporter = new Reporter({ directory, urls: [`${base}/ok`, `${base}/broken`] })
  await reporter.onTestEnd({ titlePath: () => ['save'], expectedStatus: 'passed' }, {
    status: 'failed', duration: 1, retry: 0, errors: [{ message: 'Test assertion failed' }],
  })
  const failure = JSON.parse(readFileSync(join(directory, 'tests.jsonl'), 'utf8'))
  assert.deepEqual(failure.health.map(({ status, available }) => [status, available]), [[200, true], [500, false]])
})
