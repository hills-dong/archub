import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:5173' },
  webServer: [
    {
      command: 'node ../dist/cli.js serve --project /home/hills/projects/lifly --port 4317',
      url: 'http://localhost:4317/api/graph?level=module',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm dev --port 5173',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
    },
  ],
})
