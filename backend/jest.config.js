module.exports = {
  testEnvironment:    'node',
  testMatch:          ['**/tests/**/*.test.js'],
  setupFiles:         ['<rootDir>/jest.setup.js'],
  testTimeout:        30000,
  forceExit:          true,
  detectOpenHandles:  false,
  verbose:            true,
  coverageDirectory:  'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/sockets/**',
    '!**/node_modules/**'
  ]
};
