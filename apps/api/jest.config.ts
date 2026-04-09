import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@telemed/shared-types$': '<rootDir>/../../../packages/shared-types/src/index.ts',
    '^@telemed/shared-types/(.*)$': '<rootDir>/../../../packages/shared-types/src/$1',
    '^@telemed/utils$': '<rootDir>/../../../packages/utils/src/index.ts',
    '^@telemed/utils/(.*)$': '<rootDir>/../../../packages/utils/src/$1',
  },
};

export default config;
