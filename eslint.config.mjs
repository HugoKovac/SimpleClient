// Flat config: CommonJS for the Electron main process, ES modules for the renderer and tests.
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    files: ['src/main/**/*.js', 'build/**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  {
    files: ['src/renderer/**/*.js'],
    languageOptions: { sourceType: 'module', globals: globals.browser },
  },
  {
    files: ['test/**/*.{js,mjs}'],
    languageOptions: { sourceType: 'module', globals: globals.node },
  },
  {
    files: ['test/**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
];
