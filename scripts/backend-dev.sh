#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd "$(dirname "$0")/.." && pwd)"
# A project-local JDK takes precedence; the system Java installation is unchanged.
if [[ -x "$project_root/.tools/jdk-26.0.2.1+1/Contents/Home/bin/java" ]]; then
  export JAVA_HOME="$project_root/.tools/jdk-26.0.2.1+1/Contents/Home"
fi
cd "$project_root/backend"
if [[ "${1:-}" == test ]]; then
  exec ./mvnw test
fi
exec ./mvnw spring-boot:run
