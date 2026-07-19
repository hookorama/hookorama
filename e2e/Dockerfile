# Single container with supervisor, dashboard, Ollama and Playwright.
# Build context is the repo root.

FROM mcr.microsoft.com/playwright:v1.61.1-jammy

ENV DEBIAN_FRONTEND=noninteractive
ENV BUN_INSTALL=/root/.bun
ENV PATH="${BUN_INSTALL}/bin:${PATH}"

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates unzip zstd tmux \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL https://bun.sh/install | bash

ARG E2E_MOCK_OLLAMA=0
# Install Ollama unless mock mode is requested.
RUN if [ "$E2E_MOCK_OLLAMA" != "1" ]; then curl -fsSL https://ollama.com/install.sh | sh; fi

WORKDIR /workspace

COPY package.json bun.lock tsconfig.base.json tsdown.config.ts .prettierrc.json .oxlintrc.json ./
COPY packages packages
COPY scripts scripts
COPY e2e e2e
COPY .agents .agents
COPY docs docs
COPY README.md LICENSE CHANGELOG.md ./

RUN bun install && bun run build

ARG E2E_OLLAMA_MODEL=qwen2.5:0.5b
ENV E2E_OLLAMA_MODEL=${E2E_OLLAMA_MODEL}
ENV E2E_MOCK_OLLAMA=${E2E_MOCK_OLLAMA}
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# The container needs root to spawn tmux sessions and optionally the Ollama service.
USER root

ENTRYPOINT ["bash", "e2e/docker-entrypoint.sh"]
