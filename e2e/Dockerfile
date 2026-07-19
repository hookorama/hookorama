# Single container with supervisor, dashboard, Ollama and Playwright.
# Build context is the repo root.

FROM mcr.microsoft.com/playwright:v1.61.1-jammy

ENV DEBIAN_FRONTEND=noninteractive
ENV BUN_INSTALL=/usr/local/bun
ENV PATH="${BUN_INSTALL}/bin:${PATH}"

ARG E2E_MOCK_OLLAMA=0

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates unzip zstd tmux \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p ${BUN_INSTALL} \
  && curl -fsSL https://bun.sh/install | bash \
  && groupadd -r e2e \
  && useradd -r -m -d /home/e2e -g e2e -s /bin/bash e2e \
  && if [ "$E2E_MOCK_OLLAMA" != "1" ]; then curl -fsSL https://ollama.com/install.sh | sh; fi

WORKDIR /workspace

COPY package.json bun.lock tsconfig.base.json tsdown.config.ts .prettierrc.json .oxlintrc.json ./
COPY packages packages
COPY scripts scripts
COPY e2e e2e
COPY .agents .agents
COPY docs docs
COPY README.md LICENSE CHANGELOG.md ./

RUN bun install && bun run build && chown -R e2e:e2e /workspace

ARG E2E_OLLAMA_MODEL=qwen2.5:0.5b
ENV E2E_OLLAMA_MODEL=${E2E_OLLAMA_MODEL}
ENV E2E_MOCK_OLLAMA=${E2E_MOCK_OLLAMA}
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV HOME=/home/e2e

USER e2e

ENTRYPOINT ["bash", "e2e/docker-entrypoint.sh"]
