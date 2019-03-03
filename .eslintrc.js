module.exports = {
	env: {
		es6: true,
		node: true,
	},
	globals: {},
	parser: '@typescript-eslint/parser',
	plugins: ['@typescript-eslint', '@typescript-eslint/tslint'],
	parserOptions: {
		project: './tsconfig.json',
		sourceType: 'module',
		ecmaFeatures: {
			jsx: true,
			modules: true,
		},
	},
	rules: {
		"@typescript-eslint/restrict-plus-operands": "error",
		'@typescript-eslint/tslint/config': [
			'error',
			{
				rules: {
					'no-floating-promises': true,
					'strict-type-predicates': true,
					'no-unbound-method': true,
					'no-unsafe-any': true,
				},
			},
		],
	},
};
