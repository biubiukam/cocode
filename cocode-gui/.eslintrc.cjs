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
  ignorePatterns: ['dist/', 'dist-electron/', 'release/', 'vendor/', '.dev/'],
  rules: {
    // This repository intentionally uses explicit .ts extensions for local ESM imports.
    'import/extensions': 'off',
  },
  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx'],
      extends: ['@dtyq/eslint-config/typescript'],
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.node.json', './packages/*/tsconfig.json'],
        tsconfigRootDir: __dirname,
      },
    },
    {
      files: ['**/*.tsx'],
      extends: ['@dtyq/eslint-config/react'],
      settings: {
        react: {
          version: 'detect',
        },
      },
      rules: {
        'react/prop-types': 'off',
        'react/react-in-jsx-scope': 'off',
        'react/jsx-uses-react': 'off',
      },
    },
  ],
}
