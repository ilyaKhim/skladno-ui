const { spawn, spawnSync } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')
const { windowsJavaEnvironment, windowsMavenCommand, forwardExit } = require('./tool-commands.cjs')

const root = path.resolve(__dirname, '..')
const args = process.argv.slice(2)
if (process.platform !== 'win32') {
  forwardExit(spawn('bash', [path.join(root, 'scripts', 'document-worker.sh'), ...args], {
    cwd: root, env: process.env, stdio: 'inherit',
  }))
  return
}

const env = windowsJavaEnvironment(process.env, path.join(os.homedir(), '.jdks'))
const command = (goals) => windowsMavenCommand(root, ['-f', path.join(root, 'document-worker', 'pom.xml'), ...goals])
if (args[0] === 'test') {
  const invocation = command(['test', ...args.slice(1)])
  forwardExit(spawn(invocation.command, invocation.args, { cwd: root, env, stdio: 'inherit' }))
  return
}
if (args[0] !== '--no-build') {
  const invocation = command(['-q', '-DskipTests', 'package'])
  const result = spawnSync(invocation.command, invocation.args, { cwd: root, env, stdio: 'inherit' })
  if (result.error) console.error(result.error.message)
  const code = result.status ?? 1
  if (code !== 0) { process.exitCode = code; return }
}
if (args[0] === 'build') return

// Keep the supervisor outside the parser JVM: watchdog/OOM restarts only the worker.
const java = env.JAVA_HOME ? path.join(env.JAVA_HOME, 'bin', 'java.exe') : 'java'
const jar = path.join(root, 'document-worker', 'target', 'godeck-document-worker-0.0.1-SNAPSHOT.jar')
let worker
let timer
let stopping = false
const stop = () => { stopping = true; clearTimeout(timer); worker?.kill() }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
const run = () => {
  if (stopping) return
  worker = spawn(java, ['-Xmx128m', '-XX:MaxMetaspaceSize=96m', '-XX:ActiveProcessorCount=1', '-XX:+ExitOnOutOfMemoryError', '-Djava.awt.headless=true', '-jar', jar], {
    cwd: root, env, stdio: 'inherit',
  })
  worker.once('error', (error) => { console.error(error.message); stopping = true; process.exitCode = 1 })
  worker.once('exit', () => { worker = null; if (!stopping) timer = setTimeout(run, 1000) })
}
run()
