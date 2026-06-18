process.env.NODE_ENV = "test";
process.env.PORT = "4001";
process.env.CORS_ORIGIN = "http://localhost:3000";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://worksync:worksync@localhost:55432/worksync_test?schema=public";
process.env.LOG_LEVEL = "silent";
