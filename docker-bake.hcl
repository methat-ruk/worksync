group "ci" {
  targets = ["backend", "frontend", "test-runner", "test-e2e"]
}

target "_common" {
  context    = "."
  dockerfile = "Dockerfile"
  output     = ["type=cacheonly"]
}

target "backend" {
  inherits = ["_common"]
  target   = "backend"
  tags     = ["worksync-backend:ci"]
}

target "frontend" {
  inherits = ["_common"]
  target   = "frontend"
  tags     = ["worksync-frontend:ci"]
  args = {
    NEXT_PUBLIC_API_BASE_URL        = "http://localhost:4000"
    NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED = "false"
  }
}

target "test-runner" {
  inherits = ["_common"]
  target   = "test-runner"
  tags     = ["worksync-test-runner:ci"]
}

target "test-e2e" {
  inherits = ["_common"]
  target   = "test-e2e"
  tags     = ["worksync-test-e2e:ci"]
}
