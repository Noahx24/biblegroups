// Jest config - uses the jest-expo preset which handles the React Native
// transform pipeline (Babel + react-native shims). Test files live next to
// the source they cover in __tests__/ directories, or as *.test.ts(x) files
// anywhere under src/.

module.exports = {
  preset: 'jest-expo',
  testMatch: [
    '<rootDir>/src/**/*.test.ts',
    '<rootDir>/src/**/*.test.tsx',
    '<rootDir>/src/**/__tests__/**/*.ts',
    '<rootDir>/src/**/__tests__/**/*.tsx',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
