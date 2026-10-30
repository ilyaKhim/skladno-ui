#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -x "$project_root/.tools/jdk-26.0.2.1+1/Contents/Home/bin/java" ]]; then
  export JAVA_HOME="$project_root/.tools/jdk-26.0.2.1+1/Contents/Home"
fi
worker_java="${JAVA_HOME:+$JAVA_HOME/bin/}java"
if [[ "${1:-}" == test ]]; then
  shift
  exec "$project_root/backend/mvnw" -f "$project_root/document-worker/pom.xml" test "$@"
fi
if [[ "${1:-}" != --no-build ]]; then
  "$project_root/backend/mvnw" -f "$project_root/document-worker/pom.xml" -q -DskipTests package
fi
if [[ "${1:-}" == build ]]; then exit 0; fi
# The supervisor is outside the parser process: watchdog/OOM exits restart only this worker.
worker_pid=''
trap 'if [[ -n "$worker_pid" ]]; then kill "$worker_pid" 2>/dev/null || true; fi; exit 0' INT TERM
while true; do
  "$worker_java" -Xmx128m -XX:MaxMetaspaceSize=96m -XX:ActiveProcessorCount=1 -XX:+ExitOnOutOfMemoryError -Djava.awt.headless=true -jar "$project_root/document-worker/target/godeck-document-worker-0.0.1-SNAPSHOT.jar" &
  worker_pid=$!
  wait "$worker_pid" || true
  worker_pid=''
  sleep 1
done
