import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const excluded = new Set(['node_modules', 'target', '.next', '.next-e2e', 'out', '.impeccable', '.DS_Store',
  'next-env.d.ts', 'tsconfig.tsbuildinfo', 'AGENTS.md', 'CLAUDE.md', 'DESIGN.md', 'PRODUCT.md'])
const artifacts = ['frontend/.next-e2e/BUILD_ID',
  'document-worker/target/godeck-document-worker-0.0.1-SNAPSHOT.jar']

async function hashFiles(root, paths, hash) {
  for (const path of paths) {
    if (path === 'backend/data') continue
    const entries = await readdir(join(root, path), { withFileTypes: true }).catch((error) => {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null
      throw error
    })
    if (entries) {
      await hashFiles(root, entries.filter((entry) => !excluded.has(entry.name))
        .map((entry) => `${path}/${entry.name}`).sort(), hash)
    } else {
      const content = await readFile(join(root, path)).catch((error) => {
        if (error.code === 'ENOENT') return Buffer.from('missing')
        throw error
      })
      hash.update(path).update('\0').update(content).update('\0')
    }
  }
}

/** Test-only edits can reuse a build, but application, toolchain and build inputs cannot. */
export async function buildFingerprint(root, env) {
  const hash = createHash('sha256')
  const buildEnv = Object.entries(env).filter(([key]) => /^(NEXT_|NODE_|BACKEND_URL$|STATIC_EXPORT$|JAVA_HOME$)/.test(key)).sort()
  hash.update(JSON.stringify([process.version, process.platform, process.arch, buildEnv]))
  await hashFiles(root, ['frontend', 'backend', 'document-worker', 'scripts/backend-dev.sh',
    'scripts/document-worker.sh', 'scripts/backend-dev.cjs', 'scripts/document-worker.cjs',
    'scripts/tool-commands.cjs', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc'], hash)
  return hash.digest('hex')
}

async function artifactDigest(root) {
  const hash = createHash('sha256')
  for (const path of artifacts) hash.update(await readFile(join(root, path)))
  return hash.digest('hex')
}

export async function rememberBuild(root, fingerprint) {
  const digest = await artifactDigest(root)
  await mkdir(join(root, '.tools'), { recursive: true })
  await writeFile(join(root, '.tools', 'e2e-build.json'), JSON.stringify({ fingerprint, digest }))
}

export async function requireReusableBuild(root, fingerprint) {
  const path = join(root, '.tools', 'e2e-build.json')
  let previous
  try { previous = JSON.parse(await readFile(path, 'utf8')) }
  catch { throw new Error('No reusable E2E build. Run pnpm test:e2e without --reuse-build first.') }
  if (previous.fingerprint !== fingerprint) throw new Error('E2E build is stale. Run without --reuse-build after application/environment changes.')
  let digest
  try { digest = await artifactDigest(root) }
  catch { throw new Error('E2E build artifacts are missing. Run without --reuse-build.') }
  if (digest !== previous.digest) throw new Error('E2E build artifacts changed. Run without --reuse-build.')
}
