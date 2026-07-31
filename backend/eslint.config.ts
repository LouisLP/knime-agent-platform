import antfu from '@antfu/eslint-config'

export default antfu({
  typescript: true,
  formatters: true,
}, {
  rules: {
    // No logging library in scope; console is the log sink for this service.
    'no-console': ['error', { allow: ['info', 'warn', 'error'] }],
  },
}, {
  files: ['**/*.test.ts'],
  rules: {
    // The runner is Node's built-in one — the point is to add no test
    // dependency to a service that deliberately runs without a build step.
    'test/no-import-node-test': 'off',
    // Response bodies are untyped JSON; asserting on them is the test's job.
    'ts/no-unsafe-assignment': 'off',
    'ts/no-unsafe-member-access': 'off',
  },
})
