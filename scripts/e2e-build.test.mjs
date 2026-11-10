import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildFingerprint, rememberBuild, requireReusableBuild } from './e2e-build.mjs'

async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'godeck-build-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  for (const file of ['frontend/app/page.tsx', 'frontend/.next-e2e/BUILD_ID',
    'document-worker/target/godeck-document-worker-0.0.1-SNAPSHOT.jar', 'pnpm-lock.yaml']) {
    await mkdir(join(root, file, '..'), { recursive: true })
    await writeFile(join(root, file), file)
  }
  return root
}

test('only test and generated output changes can reuse the existing build', async (t) => {
  const root = await workspace(t)
  const before = await buildFingerprint(root, {})
  await rememberBuild(root, before)
  await mkdir(join(root, 'e2e'))
  await writeFile(join(root, 'e2e', 'editor.spec.ts'), 'new assertion')
  await mkdir(join(root, 'frontend', 'out'))
  await writeFile(join(root, 'frontend', 'out', 'index.html'), 'generated')
  await writeFile(join(root, 'frontend', 'tsconfig.tsbuildinfo'), 'generated')
  assert.equal(await buildFingerprint(root, {}), before)
  await requireReusableBuild(root, before)
  await writeFile(join(root, 'frontend', 'app', 'page.tsx'), 'changed application')
  await assert.rejects(requireReusableBuild(root, await buildFingerprint(root, {})), /stale/)
})

test('lockfile, worker source and build environment invalidate reuse', async (t) => {
  const root = await workspace(t)
  const before = await buildFingerprint(root, { BACKEND_URL: 'http://127.0.0.1:18081' })
  assert.notEqual(await buildFingerprint(root, { BACKEND_URL: 'http://127.0.0.1:9999' }), before)
  await writeFile(join(root, 'pnpm-lock.yaml'), 'new dependencies')
  const dependencyChange = await buildFingerprint(root, { BACKEND_URL: 'http://127.0.0.1:18081' })
  assert.notEqual(dependencyChange, before)
  await mkdir(join(root, 'document-worker', 'src'))
  await writeFile(join(root, 'document-worker', 'src', 'Worker.java'), 'changed worker')
  assert.notEqual(await buildFingerprint(root, { BACKEND_URL: 'http://127.0.0.1:18081' }), dependencyChange)
  const beforeEnvFile = await buildFingerprint(root, {})
  await writeFile(join(root, 'frontend', '.env.local'), 'NEXT_PUBLIC_TEMPLATE_ASSETS_BASE_URL=/another')
  assert.notEqual(await buildFingerprint(root, {}), beforeEnvFile)
  const beforeData = await buildFingerprint(root, {})
  await mkdir(join(root, 'frontend', 'data'))
  await writeFile(join(root, 'frontend', 'data', 'slides.json'), '{"changed":true}')
  assert.notEqual(await buildFingerprint(root, {}), beforeData)
})

test('missing, corrupt or replaced build artifacts are rejected', async (t) => {
  const root = await workspace(t)
  const fingerprint = await buildFingerprint(root, {})
  await assert.rejects(requireReusableBuild(root, fingerprint), /No reusable/)
  await rememberBuild(root, fingerprint)
  await writeFile(join(root, 'frontend', '.next-e2e', 'BUILD_ID'), 'another build')
  await assert.rejects(requireReusableBuild(root, fingerprint), /artifacts/)
  await rememberBuild(root, fingerprint)
  await writeFile(join(root, 'document-worker', 'target', 'godeck-document-worker-0.0.1-SNAPSHOT.jar'), 'replaced jar')
  await assert.rejects(requireReusableBuild(root, fingerprint), /artifacts/)
  await rm(join(root, 'document-worker', 'target', 'godeck-document-worker-0.0.1-SNAPSHOT.jar'))
  await assert.rejects(requireReusableBuild(root, fingerprint), /artifacts/)
  await writeFile(join(root, '.tools', 'e2e-build.json'), 'invalid json')
  await assert.rejects(requireReusableBuild(root, fingerprint), /No reusable/)
})
