import tseslint from 'typescript-eslint'

export default tseslint.config(
	...tseslint.configs.recommended,
	{
		files: ['src/**/*.ts', 'vitest.setup.ts'],
		rules: {
			'@typescript-eslint/no-explicit-any': 'warn',
		},
	},
	{
		ignores: ['dist/**', 'coverage/**', 'node_modules/**', '**/*.d.ts'],
	}
)
