module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/renderer/timerManager.js',
    'src/renderer/state.js',
    'src/renderer/actions.js'
  ],
  coverageDirectory: 'coverage',
  verbose: true
};
