export default {
  '{src,packages}/**/*.{js,cjs,mjs,ts,tsx}': ['eslint --fix', 'prettier --write'],
  'test/**/*.{js,cjs,mjs,ts,tsx}': 'prettier --write',
  '*.{css,json,jsonc,md,html,yaml,yml}': 'prettier --write',
}
