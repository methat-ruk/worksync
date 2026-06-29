const path = require("node:path");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
  override: false,
  quiet: true
});

process.env.NODE_ENV = "test";
process.env.PORT = "4001";
process.env.FRONTEND_URL = "http://localhost:3000";
process.env.CORS_ORIGIN = "http://localhost:3000";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://worksync:worksync@localhost:5433/worksync_test?schema=public";
process.env.REDIS_URL =
  process.env.TEST_REDIS_URL ?? "redis://localhost:6379/1";
process.env.LOG_LEVEL = "silent";
process.env.AUTH_RATE_LIMIT_ENABLED =
  process.env.AUTH_RATE_LIMIT_ENABLED ?? "false";
process.env.AUTH_RATE_LIMIT_KEY_SECRET =
  "test-auth-rate-limit-secret-at-least-32-bytes";
process.env.TRUST_PROXY = "false";
process.env.JWT_ACCESS_SECRET =
  "test-access-secret-with-at-least-thirty-two-bytes";
process.env.JWT_ACCESS_EXPIRES_IN = "15m";
process.env.JWT_REFRESH_SECRET =
  "test-refresh-secret-with-at-least-thirty-two-bytes";
process.env.JWT_REFRESH_EXPIRES_IN = "30d";
process.env.COOKIE_SECURE = "false";
process.env.COOKIE_DOMAIN = "";
process.env.GOOGLE_OAUTH_ENABLED = "true";
process.env.GOOGLE_OAUTH_CLIENT_ID = "test-google-client-id";
process.env.GOOGLE_OAUTH_CLIENT_SECRET = "test-google-client-secret";
process.env.GOOGLE_OAUTH_REDIRECT_URI =
  "http://localhost:4001/api/auth/google/callback";
process.env.GOOGLE_OAUTH_TOKEN_TIMEOUT_MS = "5000";
