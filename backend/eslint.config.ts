import antfu from '@antfu/eslint-config'

export default antfu({
  typescript: true,
  formatters: true,
}, {
  rules: {
    // No logging library in scope; console is the log sink for this service.
    'no-console': ['error', { allow: ['info', 'warn', 'error'] }],
  },
})
