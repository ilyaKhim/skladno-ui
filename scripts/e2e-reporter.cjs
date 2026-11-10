const { appendFileSync, cpSync, mkdirSync } = require('node:fs')
const { resolve, join, basename } = require('node:path')
const { stripVTControlCharacters } = require('node:util')

class E2eReporter {
  constructor(options = {}) {
    this.directory = options.directory || process.env.E2E_LOG_DIR
    if (!this.directory) throw new Error('Start E2E through pnpm test:e2e to prepare diagnostics.')
    this.urls = options.urls || [`${process.env.BACKEND_URL}/api/generation/health/ready`, `${process.env.FRONTEND_URL}/studio`]
    this.tests = []
    this.setup = new Map()
    this.startedAt = Date.now()
    mkdirSync(this.directory, { recursive: true })
  }

  log(name, content) {
    appendFileSync(join(this.directory, name), content)
  }

  onStdOut(chunk) { this.serverLog(chunk) }
  onStdErr(chunk) { this.serverLog(chunk) }

  onBegin(config, suite) {
    console.log(`E2E: ${suite.allTests().length} tests, ${config.workers} worker(s)`)
  }

  onError(error) {
    const message = stripVTControlCharacters(error.message || String(error))
    this.log('errors.log', `${message}\n`)
    console.error(message)
  }

  onTestBegin() {
    if (this.startupMs !== undefined) return
    this.startupMs = Date.now() - this.startedAt
    console.log(`E2E discovery/server startup: ${(this.startupMs / 1000).toFixed(1)}s`)
  }

  serverLog(chunk) {
    const text = stripVTControlCharacters(String(chunk))
    const server = text.match(/^\[(API|Web|Documents)\]/m)?.[1].toLowerCase() || 'tests'
    this.log(`${server}.log`, `${new Date().toISOString()} ${text}`)
  }

  onStepEnd(test, result, step) {
    if (step.title === 'Подготовка презентации') this.setup.set(test, step.duration)
  }

  async onTestEnd(test, result) {
    const record = { title: test.titlePath().filter(Boolean).join(' › '), status: result.status,
      retry: result.retry, durationMs: result.duration, setupMs: this.setup.get(test) || 0 }
    this.setup.delete(test)
    if (result.status !== test.expectedStatus && result.status !== 'skipped') {
      record.errors = result.errors.map((error) => stripVTControlCharacters(error.message || 'Unknown error'))
      record.health = await Promise.all(this.urls.map(async (url) => {
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(1500), redirect: 'manual' })
          await response.body?.cancel()
          return { url, status: response.status, available: response.status < 500 }
        } catch (error) { return { url, available: false, error: error.message } }
      }))
      console.error(record.errors.join('\n'))
      if (record.health.some((server) => !server.available)) console.error('E2E server unavailable; inspect server logs before treating subsequent failures as application bugs.')
    }
    this.tests.push(record)
    this.log('tests.jsonl', `${JSON.stringify(record)}\n`)
    console.log(`${record.status} ${(record.durationMs / 1000).toFixed(1)}s: ${record.title}`)
  }

  onEnd(result) {
    this.log('summary.json', JSON.stringify({ status: result.status, durationMs: result.duration, startupMs: this.startupMs, tests: this.tests.length }, null, 2))
    // Playwright clears test-results at startup; the runner's build/startup logs must survive it.
    cpSync(this.directory, resolve('test-results/diagnostics', basename(this.directory)), { recursive: true })
    console.log(`E2E ${result.status}. Slowest scenarios:`)
    for (const test of [...this.tests].sort((a, b) => b.durationMs - a.durationMs).slice(0, 5))
      console.log(`  ${(test.durationMs / 1000).toFixed(1)}s (setup ${(test.setupMs / 1000).toFixed(1)}s): ${test.title}`)
    console.log(`Diagnostics: ${this.directory}`)
  }

  printsToStdio() { return true }
}

module.exports = E2eReporter
