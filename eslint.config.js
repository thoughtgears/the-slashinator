import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import googleConfig from 'eslint-config-google';

export default [
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...googleConfig.rules,
      ...tseslint.configs.recommended.rules,
      'quotes': ['error', 'single'],
      'indent': 'off',
      'max-len': ['error', {code: 120}],
      'no-unused-vars': ['warn'],
      'require-jsdoc': 'off',
      'valid-jsdoc': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },
  {
    ignores: ['node_modules/', 'dist/', 'coverage/'],
  },
];
