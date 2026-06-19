process.env.NODE_ENV = "test";
process.env.PORT = "4001";
process.env.CORS_ORIGIN = "http://localhost:3000";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://worksync:worksync@localhost:55432/worksync_test?schema=public";
process.env.LOG_LEVEL = "silent";
process.env.JWT_ACCESS_SECRET =
  "test-access-secret-with-at-least-thirty-two-bytes";
process.env.JWT_ACCESS_EXPIRES_IN = "15m";
