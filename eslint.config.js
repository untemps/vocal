import prettier from 'eslint-config-prettier'
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'

export default tseslint.config(
	js.configs.recommended,
	...tseslint.configs.recommended,
	prettier,
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
		},
	},
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
