import { defineConfig } from 'vite'

export default defineConfig({
	build: {
		lib: {
			entry: 'src/index.js',
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
		setupFiles: ['./vitest.setup.js'],
		restoreMocks: true,
		coverage: {
			provider: 'v8',
			reporter: ['text', 'lcov'],
			reportsDirectory: './coverage',
		},
	},
})
