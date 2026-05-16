import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
	plugins: [dts({ include: ['src'], exclude: ['src/__tests__'] })],
	build: {
		lib: {
			entry: 'src/index.ts',
			name: 'Vocal',
			formats: ['es', 'cjs', 'umd'],
			fileName: (format) => ({ es: 'index.es.js', umd: 'index.umd.js', cjs: 'index.cjs' })[format],
		},
		rollupOptions: {
			external: ['@untemps/user-permissions-utils'],
			output: {
				globals: {
					'@untemps/user-permissions-utils': 'UserPermissionsUtils',
				},
			},
		},
		sourcemap: true,
	},
	test: {
		globals: true,
		environment: 'jsdom',
		setupFiles: ['./vitest.setup.ts'],
		typecheck: { tsconfig: './tsconfig.test.json' },
		restoreMocks: true,
		coverage: {
			provider: 'v8',
			reporter: ['text', 'lcov'],
			reportsDirectory: './coverage',
			exclude: ['vitest.setup.ts'],
			thresholds: {
				statements: 100,
				branches: 100,
				functions: 100,
				lines: 100,
			},
		},
	},
})
