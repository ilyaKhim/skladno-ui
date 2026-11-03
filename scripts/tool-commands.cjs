const fs = require('node:fs')
const path = require('node:path')

/** Preserve explicit configuration; otherwise use an IntelliJ-installed JDK 26 on Windows. */
function windowsJavaEnvironment(environment, jdksDirectory) {
  const env = { ...environment }
  const hasCompiler = (home) => home && fs.existsSync(path.join(home, 'bin', 'javac.exe'))
  if (!hasCompiler(env.JAVA_HOME) && fs.existsSync(jdksDirectory)) {
    const home = fs.readdirSync(jdksDirectory)
      .filter((name) => /26/.test(name))
      .map((name) => path.join(jdksDirectory, name))
      .find(hasCompiler)
    if (home) env.JAVA_HOME = home
  }
  return env
}

/** Batch wrappers need a Windows shell; quote paths/properties as PowerShell string literals. */
function windowsMavenCommand(root, args) {
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`
  const command = [path.win32.join(root, 'backend', 'mvnw.cmd'), ...args].map(quote).join(' ')
  return { command: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference = 'Stop'; & ${command}; exit $LASTEXITCODE`] }
}

/** Avoid spawning pnpm.cmd directly or reparsing test filters through cmd.exe. */
function pnpmCommand(args, platform = process.platform, environment = process.env) {
  if (platform !== 'win32') return { command: 'pnpm', args }
  const cli = environment.npm_execpath
  if (!cli) throw new Error('Start E2E through pnpm test:e2e so its CLI entry point is available on Windows.')
  return /\.exe$/i.test(cli)
    ? { command: cli, args }
    : { command: process.execPath, args: [cli, ...args] }
}

/** Keep Maven/Bash failures visible to pnpm verify instead of reporting a successful wrapper. */
function forwardExit(child) {
  child.once('error', (error) => { console.error(error.message); process.exitCode = 1 })
  child.once('exit', (code) => { process.exitCode = code ?? 1 })
}

module.exports = { windowsJavaEnvironment, windowsMavenCommand, pnpmCommand, forwardExit }
