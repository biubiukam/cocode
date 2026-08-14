module.exports = {
  root: true,
  extends: ['@dtyq/eslint-config/base'],
  env: {
    es2022: true,
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  ignorePatterns: ['dist/', '.dev/'],
  rules: {
    // This repository intentionally uses explicit .ts extensions for local ESM imports.
    'import/extensions': 'off',
  },
  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx'],
      extends: ['@dtyq/eslint-config/typescript'],
      parserOptions: {
        project: ['./tsconfig.json', './packages/*/tsconfig.json'],
        tsconfigRootDir: __dirname,
      },
    },
  ],
}
