const { spawn } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')
const { windowsJavaEnvironment, windowsMavenCommand, forwardExit } = require('./tool-commands.cjs')

const root = path.resolve(__dirname, '..')
const args = process.argv.slice(2)
if (process.platform !== 'win32') {
  forwardExit(spawn('bash', [path.join(root, 'scripts', 'backend-dev.sh'), ...args], {
    cwd: root, env: process.env, stdio: 'inherit',
  }))
} else {
  const test = args[0] === 'test'
  if (test) args.shift()
  const env = windowsJavaEnvironment(process.env, path.join(os.homedir(), '.jdks'))
  if (!test) env.AUTH_BYPASS = env.AUTH_BYPASS || 'true'
  const invocation = windowsMavenCommand(root, [test ? 'test' : 'spring-boot:run', ...args])
  forwardExit(spawn(invocation.command, invocation.args, {
    cwd: path.join(root, 'backend'), env, stdio: 'inherit',
  }))
}
