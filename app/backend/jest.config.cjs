const baseConfig = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.json" }]
  },
  collectCoverageFrom: ["src/**/*.ts", "!src/main.ts"],
  setupFiles: ["<rootDir>/test/setup-env.cjs"],
  testEnvironment: "node"
};

module.exports = {
  projects: [
    {
      ...baseConfig,
      displayName: "unit",
      testMatch: ["<rootDir>/test/unit/**/*.spec.ts"]
    },
    {
      ...baseConfig,
      displayName: "integration",
      testMatch: ["<rootDir>/test/integration/**/*.spec.ts"]
    },
    {
      ...baseConfig,
      displayName: "e2e",
      testMatch: ["<rootDir>/test/e2e/**/*.spec.ts"]
    }
  ]
};
