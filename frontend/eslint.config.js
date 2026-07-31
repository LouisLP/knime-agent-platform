import antfu from '@antfu/eslint-config'

export default antfu({
  formatters: true,
  vue: true,
}, {
  // `pnpm-workspace.yaml` exists only to approve vue-demi's postinstall (pulled in
  // by reka-ui); without it pnpm exits non-zero and every script fails. The rule
  // also insists on `trustPolicy: no-downgrade`, which the current tree cannot
  // satisfy — @babel/core (via vite-plugin-vue-devtools) resolves semver@6.3.1,
  // published without provenance, so install is rejected outright.
  files: ['pnpm-workspace.yaml'],
  rules: {
    'pnpm/yaml-enforce-settings': 'off',
  },
})
