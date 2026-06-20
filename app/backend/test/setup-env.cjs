const path = require("node:path");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
  override: false,
  quiet: true
});

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
process.env.JWT_REFRESH_SECRET =
  "test-refresh-secret-with-at-least-thirty-two-bytes";
process.env.JWT_REFRESH_EXPIRES_IN = "30d";
process.env.COOKIE_SECURE = "false";
process.env.COOKIE_DOMAIN = "";
