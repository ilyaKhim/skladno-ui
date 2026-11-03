const assert = require('node:assert/strict')
const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs')
const { EventEmitter } = require('node:events')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')
const { compileFunction } = require('node:vm')
const { spawnSync } = require('node:child_process')
const { windowsJavaEnvironment, windowsMavenCommand, pnpmCommand } = require('./tool-commands.cjs')

function jdks(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'godeck-jdks-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  return directory
}

function jdk(directory, name) {
  const home = path.join(directory, name)
  mkdirSync(path.join(home, 'bin'), { recursive: true })
  writeFileSync(path.join(home, 'bin', 'javac.exe'), '')
  return home
}

test('Windows preserves an explicitly configured JDK and does not mutate the environment', (t) => {
  const directory = jdks(t)
  const home = jdk(directory, 'explicit-jdk')
  jdk(directory, 'openjdk-26')
  const environment = { JAVA_HOME: home, AUTH_BYPASS: 'false' }
  const selected = windowsJavaEnvironment(environment, directory)
  assert.deepEqual(selected, environment)
  assert.notEqual(selected, environment)
})

test('Windows finds IntelliJ JDK 26 when JAVA_HOME is missing or invalid', (t) => {
  const directory = jdks(t)
  jdk(directory, 'openjdk-21')
  const home = jdk(directory, 'openjdk-26.0.2')
  mkdirSync(path.join(directory, 'jdk-26-without-compiler'))
  for (const environment of [{}, { JAVA_HOME: 'missing' }]) {
    assert.equal(windowsJavaEnvironment(environment, directory).JAVA_HOME, home)
  }
})

test('a machine without IntelliJ JDKs keeps the environment for the Maven PATH fallback', (t) => {
  assert.deepEqual(windowsJavaEnvironment({}, path.join(jdks(t), 'absent')), {})
})

test('Windows Maven quotes paths and keeps each Maven property as one PowerShell argument', () => {
  const root = "C:\\Users\\O'Brien\\Go Deck"
  const property = '-Dtest=*Test,!*IntegrationTest,!DevelopmentAuthBypassTest'
  const invocation = windowsMavenCommand(root, ['test', property, '-Dmessage=hello world'])
  assert.equal(invocation.command, 'powershell.exe')
  assert.deepEqual(invocation.args.slice(0, -1), ['-NoProfile', '-NonInteractive', '-Command'])
  assert.equal(invocation.args.at(-1), "$ErrorActionPreference = 'Stop'; & 'C:\\Users\\O''Brien\\Go Deck\\backend\\mvnw.cmd' 'test' '-Dtest=*Test,!*IntegrationTest,!DevelopmentAuthBypassTest' '-Dmessage=hello world'; exit $LASTEXITCODE")
})

test('Windows worker Maven command preserves -f and a POM path containing spaces', () => {
  const invocation = windowsMavenCommand('C:\\Go Deck', ['-f', 'C:\\Go Deck\\document-worker\\pom.xml', 'test'])
  assert.match(invocation.args.at(-1), /'-f' 'C:\\Go Deck\\document-worker\\pom\.xml' 'test'/)
})

test('Unix pnpm invocation is unchanged', () => {
  for (const platform of ['darwin', 'linux']) {
    assert.deepEqual(pnpmCommand(['exec', 'playwright', 'test'], platform, {}), {
      command: 'pnpm', args: ['exec', 'playwright', 'test'],
    })
  }
})

test('Windows starts pnpm through Node without a shell or reparsing grep expressions', () => {
  const args = ['exec', 'playwright', 'test', '--grep', 'Back|создать презентацию']
  assert.deepEqual(pnpmCommand(args, 'win32', { npm_execpath: 'C:\\Program Files\\pnpm\\bin\\pnpm.cjs' }), {
    command: process.execPath,
    args: ['C:\\Program Files\\pnpm\\bin\\pnpm.cjs', ...args],
  })
  assert.throws(() => pnpmCommand(args, 'win32', {}), /pnpm test:e2e/)
})

test('a standalone Windows pnpm executable does not need a shell', () => {
  assert.deepEqual(pnpmCommand(['build'], 'win32', { npm_execpath: 'C:\\pnpm\\pnpm.exe' }), {
    command: 'C:\\pnpm\\pnpm.exe', args: ['build'],
  })
})

// Execute the actual entry point with subprocesses replaced, never Maven or Java.
function launch(name, platform, args, environment = {}, buildStatus = 0) {
  const calls = []
  const child = () => Object.assign(new EventEmitter(), { kill() {} })
  const subprocess = {
    spawn(command, args, options) { calls.push({ command, args, options, sync: false }); return child() },
    spawnSync(command, args, options) { calls.push({ command, args, options, sync: true }); return { status: buildStatus } },
  }
  const script = path.join(__dirname, name)
  const localProcess = { platform, argv: ['node', script, ...args], env: environment, on() {}, exitCode: undefined }
  const dependencies = (id) => id === 'node:child_process' ? subprocess
    : id === 'node:os' ? { homedir: () => path.join(__dirname, 'no-user-jdks') } : require(id)
  compileFunction(readFileSync(script, 'utf8'), ['require', 'process', '__dirname', 'console', 'setTimeout', 'clearTimeout'], { filename: script })(
    dependencies, localProcess, __dirname, console, setTimeout, clearTimeout,
  )
  return { calls, process: localProcess }
}

test('macOS and Linux entry points delegate to the unchanged Bash scripts', () => {
  for (const platform of ['darwin', 'linux']) {
    for (const name of ['backend-dev', 'document-worker']) {
      const { calls } = launch(`${name}.cjs`, platform, ['test', '-Dtest=ExampleTest'])
      assert.equal(calls.length, 1)
      assert.equal(calls[0].command, 'bash')
      assert.deepEqual(calls[0].args, [path.join(__dirname, `${name}.sh`), 'test', '-Dtest=ExampleTest'])
    }
  }
})

test('Windows backend selects Maven goals and enables auth bypass only for development', () => {
  const testing = launch('backend-dev.cjs', 'win32', ['test', '-Dtest=ExampleTest']).calls[0]
  assert.equal(testing.command, 'powershell.exe')
  assert.match(testing.args.at(-1), /'test' '-Dtest=ExampleTest'/)
  assert.equal(testing.options.env.AUTH_BYPASS, undefined)
  const development = launch('backend-dev.cjs', 'win32', []).calls[0]
  assert.match(development.args.at(-1), /'spring-boot:run'/)
  assert.equal(development.options.env.AUTH_BYPASS, 'true')
  assert.equal(launch('backend-dev.cjs', 'win32', [], { AUTH_BYPASS: 'false' }).calls[0].options.env.AUTH_BYPASS, 'false')
})

test('Windows worker test/build modes never start a worker JVM and preserve build failures', () => {
  const testing = launch('document-worker.cjs', 'win32', ['test', '-Dtest=ExampleTest']).calls[0]
  assert.equal(testing.command, 'powershell.exe')
  assert.equal(testing.sync, false)
  assert.match(testing.args.at(-1), /'-f'.*'test' '-Dtest=ExampleTest'/)
  const build = launch('document-worker.cjs', 'win32', ['build'])
  assert.equal(build.calls.length, 1)
  assert.equal(build.calls[0].sync, true)
  assert.match(build.calls[0].args.at(-1), /'-DskipTests' 'package'/)
  const failed = launch('document-worker.cjs', 'win32', [], {}, 19)
  assert.equal(failed.process.exitCode, 19)
  assert.equal(failed.calls.length, 1)
})

test('Windows --no-build starts the constrained worker without invoking Maven', () => {
  const { calls } = launch('document-worker.cjs', 'win32', ['--no-build'])
  assert.equal(calls.length, 1)
  assert.equal(calls[0].command, 'java')
  assert.equal(calls[0].sync, false)
  assert.ok(calls[0].args.includes('-Xmx128m'))
  assert.ok(calls[0].args.includes('-XX:+ExitOnOutOfMemoryError'))
  assert.ok(calls[0].args.includes('-jar'))
})

test('a child failure remains a failing launcher process', () => {
  const helper = JSON.stringify(path.join(__dirname, 'tool-commands.cjs'))
  const result = spawnSync(process.execPath, ['-e', `
    const { EventEmitter } = require('node:events')
    const child = new EventEmitter()
    require(${helper}).forwardExit(child)
    child.emit('exit', 17)
  `])
  assert.equal(result.status, 17)
})
