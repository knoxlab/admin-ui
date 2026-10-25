import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    // antd + jsdom 渲染开销较大，全量并行时默认 5s 用例超时偶发（既有用例亦受影响）；
    // 统一放宽用例与钩子超时，避免与业务代码无关的偶发失败。
    testTimeout: 30000,
    hookTimeout: 30000,
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.tsx'],
    setupFiles: ['./src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/utils/**', 'src/form/**', 'src/api/**', 'src/i18n/**', 'src/auth/**', 'src/context/**'],
      exclude: ['src/**/__tests__/**', 'src/**/*.d.ts', 'src/**/*.test.*'],
      reporter: ['text', 'text-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
    },
  },
});
