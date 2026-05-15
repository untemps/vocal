import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
	plugins: [dts({ include: ['src'], exclude: ['src/__tests__'] })],
	build: {
		lib: {
			entry: 'src/index.ts',
			name: 'Vocal',
			formats: ['es', 'cjs', 'umd'],
			fileName: (format) => ({ es: 'index.es.js', umd: 'index.umd.js', cjs: 'index.js' })[format],
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
		restoreMocks: true,
		coverage: {
			provider: 'v8',
			reporter: ['text', 'lcov'],
			reportsDirectory: './coverage',
			exclude: ['vitest.setup.ts'],
		},
	},
})
