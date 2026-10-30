import { defineConfig, devices } from '@playwright/test'

if (!process.env.E2E_SCHEMA?.match(/^editor_e2e_[a-f0-9]{12}$/)) {
  throw new Error('Start E2E with pnpm test:e2e; the runner prepares an isolated database schema.')
}
if (!process.env.E2E_AI_URL?.match(/^http:\/\/127\.0\.0\.1:\d+\/v1\/responses$/)) {
  throw new Error('E2E requires the runner\'s loopback AI fixture; real provider calls are forbidden.')
}

const database = new URL(process.env.E2E_DATABASE_URL ?? 'postgresql://godeck:godeck-local-only@127.0.0.1:5433/godeck')
const backendUrl = 'http://127.0.0.1:18081'
const frontendUrl = 'http://127.0.0.1:13000'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  snapshotPathTemplate: `{testDir}/snapshots/${process.platform}/{projectName}/{arg}{ext}`,
  reporter: [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'test-results/e2e.xml' }]],
  use: {
    baseURL: frontendUrl,
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
    viewport: { width: 1440, height: 1000 },
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } } },
  ],
  webServer: [
    {
      name: 'Documents',
      command: 'bash scripts/document-worker.sh --no-build',
      wait: { stdout: /Document worker ready/ },
      reuseExistingServer: false,
      timeout: 30_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
      env: {
        DATABASE_URL: `jdbc:postgresql://${database.host}${database.pathname}?currentSchema=${process.env.E2E_SCHEMA}`,
        DATABASE_USER: decodeURIComponent(database.username),
        DATABASE_PASSWORD: decodeURIComponent(database.password),
      },
    },
    {
      name: 'API',
      command: process.env.E2E_JAVA_DEBUG === '1'
        ? 'bash scripts/backend-dev.sh -Dspring-boot.run.jvmArguments=-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=127.0.0.1:15005'
        : 'bash scripts/backend-dev.sh',
      url: `${backendUrl}/api/generation/health/ready`,
      reuseExistingServer: false,
      timeout: 120_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
      env: {
        AUTH_BYPASS: 'true',
        SERVER_ADDRESS: '127.0.0.1',
        PORT: '18081',
        DATABASE_URL: `jdbc:postgresql://${database.host}${database.pathname}?currentSchema=${process.env.E2E_SCHEMA}`,
        DATABASE_USER: decodeURIComponent(database.username),
        DATABASE_PASSWORD: decodeURIComponent(database.password),
        SPRING_FLYWAY_DEFAULT_SCHEMA: process.env.E2E_SCHEMA,
        SPRING_FLYWAY_SCHEMAS: process.env.E2E_SCHEMA,
        GODECK_DATA_DIR: process.env.E2E_DATA_DIR!,
        GODECK_OPENAI_ENABLED: 'true',
        OPENAI_API_KEY: 'e2e-local-fixture-not-a-real-key',
        GODECK_OPENAI_RESPONSES_URL: process.env.E2E_AI_URL,
        SPRING_PROFILES_ACTIVE: 'e2e',
        GODECK_AI_EDIT_LLM: 'scripted',
        FRONTEND_URL: frontendUrl,
      },
    },
    {
      name: 'Web',
      command: 'pnpm --filter @godeck/frontend start --port 13000 --hostname 127.0.0.1',
      url: `${frontendUrl}/studio`,
      reuseExistingServer: false,
      timeout: 60_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
      env: { NEXT_DIST_DIR: '.next-e2e', BACKEND_URL: backendUrl },
    },
  ],
})
