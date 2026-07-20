#!/bin/bash
set -euo pipefail

export XDG_RUNTIME_DIR=/tmp/hookorama-runtime
export XDG_CACHE_HOME=/tmp/hookorama-cache
mkdir -p "$XDG_RUNTIME_DIR" "$XDG_CACHE_HOME"

OLLAMA_PID=""
SUPERVISOR_PID=""
DASHBOARD_PID=""
TEST_EXIT=0

cleanup() {
  echo "==> cleaning up"
  if [[ -n "${DASHBOARD_PID:-}" ]]; then kill "$DASHBOARD_PID" 2>/dev/null || true; fi
  if [[ -n "${SUPERVISOR_PID:-}" ]]; then kill "$SUPERVISOR_PID" 2>/dev/null || true; fi
  if [[ -n "${OLLAMA_PID:-}" ]]; then kill "$OLLAMA_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT

if [[ "${E2E_MOCK_OLLAMA:-0}" != "1" ]]; then
  echo "==> starting Ollama"
  ollama serve >/tmp/ollama.log 2>&1 &
  OLLAMA_PID=$!
  for _ in $(seq 1 30); do
    if curl -s http://127.0.0.1:11434 >/dev/null 2>&1; then
      echo "==> Ollama is ready"
      break
    fi
    sleep 1
  done
  if ! curl -s http://127.0.0.1:11434 >/dev/null 2>&1; then
    echo "ERROR: Ollama failed to start within timeout" >&2
    exit 1
  fi

  echo "==> pulling Ollama model ${E2E_OLLAMA_MODEL:-qwen2.5:0.5b}"
  ollama pull "${E2E_OLLAMA_MODEL:-qwen2.5:0.5b}" || true
fi

export E2E_ALLOW_RESET=1

echo "==> starting supervisor"
bun run --cwd packages/supervisor start >/tmp/supervisor.log 2>&1 &
SUPERVISOR_PID=$!
for _ in $(seq 1 30); do
  if curl -s http://127.0.0.1:7354/api/state >/dev/null 2>&1; then
    echo "==> supervisor is ready"
    break
  fi
  sleep 0.5
done
if ! curl -s http://127.0.0.1:7354/api/state >/dev/null 2>&1; then
  echo "ERROR: supervisor failed to start within timeout" >&2
  exit 1
fi

if [[ ! -f packages/cli/dist/web-app/index.html ]]; then
  echo "==> building dashboard bundle"
  bun run build
fi

echo "==> starting dashboard"
bun packages/cli/dist/main.mjs dashboard >/tmp/dashboard.log 2>&1 &
DASHBOARD_PID=$!
for _ in $(seq 1 30); do
  if curl -s http://127.0.0.1:3000 >/dev/null 2>&1; then
    echo "==> dashboard is ready"
    break
  fi
  sleep 0.5
done
if ! curl -s http://127.0.0.1:3000 >/dev/null 2>&1; then
  echo "ERROR: dashboard failed to start within timeout" >&2
  exit 1
fi

echo "==> running E2E tests"
<<<<<<< HEAD
bunx --no-install playwright test --config e2e/playwright.config.ts || TEST_EXIT=$?
=======
npx playwright test --config e2e/playwright.config.ts || TEST_EXIT=$?
>>>>>>> origin/main

exit "$TEST_EXIT"
