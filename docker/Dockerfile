# rp1 Docker Local Environment
# Multi-stage Dockerfile: base -> target-repo -> stable | dev
# Platform: linux/arm64

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: base
# OS packages, non-root user, bun, just
# ─────────────────────────────────────────────────────────────────────────────
FROM debian:bookworm-slim AS base

ARG TARGETARCH=arm64

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    ca-certificates \
    make \
    gcc \
    g++ \
    tar \
    gzip \
    wget \
    less \
    vim \
    jq \
    zsh \
    ripgrep \
    python3 \
    gnupg \
    sudo \
    unzip \
    xz-utils \
    procps \
    && rm -rf /var/lib/apt/lists/*

# GitHub CLI (gh)
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | gpg --dearmor -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

# just (command runner)
RUN curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh | bash -s -- --to /usr/local/bin

# Non-root user
RUN useradd -m -s /bin/zsh rp1user \
    && mkdir -p /home/rp1user/.local/bin \
    && chown -R rp1user:rp1user /home/rp1user \
    && echo 'rp1user ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/rp1user

USER rp1user
WORKDIR /home/rp1user

# Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/home/rp1user/.bun/bin:${PATH}"

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: target-repo
# Clone zod-to-json-schema and install dependencies
# ─────────────────────────────────────────────────────────────────────────────
FROM base AS target-repo

ARG ZOD_COMMIT=master

RUN git clone https://github.com/StefanTerdell/zod-to-json-schema.git \
    /home/rp1user/target/zod-to-json-schema \
    && cd /home/rp1user/target/zod-to-json-schema \
    && git checkout ${ZOD_COMMIT} \
    && bun install

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3a: stable
# Clean room: OS tools + harness CLIs, but NO rp1 installed.
# Use test-install.sh inside the container to simulate user installation.
# ─────────────────────────────────────────────────────────────────────────────
FROM target-repo AS stable

USER root

# Node.js LTS via NodeSource
RUN curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

USER rp1user

ENV PATH="/home/rp1user/.local/bin:/home/rp1user/.opencode/bin:/home/rp1user/.npm-global/bin:${PATH}"

# Claude Code CLI
RUN curl -fsSL https://claude.ai/install.sh | bash

# OpenCode CLI
RUN curl -fsSL https://opencode.ai/install | bash

# Codex CLI (configure npm global prefix for non-root user)
RUN mkdir -p /home/rp1user/.npm-global \
    && npm config set prefix /home/rp1user/.npm-global \
    && npm install -g @openai/codex

# Test installation harness — simulates user install/update flow
COPY --chown=rp1user:rp1user docker/test-install.sh /home/rp1user/.local/bin/test-install.sh
RUN chmod +x /home/rp1user/.local/bin/test-install.sh

# Shell prompt for stable
RUN echo 'PROMPT="[rp1-stable] %~/ %# "' >> /home/rp1user/.zshrc

# Bind Arcade to 0.0.0.0 so port forwarding works from host
ENV RP1_ARCADE_HOST="0.0.0.0"

EXPOSE 7710

WORKDIR /home/rp1user/target/zod-to-json-schema

CMD ["zsh"]

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3b: dev
# Setup script entrypoint, PATH for /src/rp1/bin
# ─────────────────────────────────────────────────────────────────────────────
FROM target-repo AS dev

USER root

# Node.js LTS via NodeSource (needed for Codex CLI)
RUN curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

USER rp1user

# Claude Code CLI
RUN curl -fsSL https://claude.ai/install.sh | bash

# OpenCode CLI
RUN curl -fsSL https://opencode.ai/install | bash

# Codex CLI
RUN mkdir -p /home/rp1user/.npm-global \
    && npm config set prefix /home/rp1user/.npm-global \
    && npm install -g @openai/codex
ENV PATH="/home/rp1user/.npm-global/bin:${PATH}"

COPY --chown=rp1user:rp1user docker/setup-dev.sh /home/rp1user/.local/bin/setup-dev.sh
RUN chmod +x /home/rp1user/.local/bin/setup-dev.sh

# Add all tool bin dirs to PATH and configure dev prompt
RUN echo 'export PATH="/src/rp1/bin:$HOME/.local/bin:$HOME/.opencode/bin:$HOME/.npm-global/bin:$PATH"' >> /home/rp1user/.zshrc \
    && echo 'PROMPT="[rp1-dev] %~/ %# "' >> /home/rp1user/.zshrc

ENV PATH="/src/rp1/bin:/home/rp1user/.local/bin:/home/rp1user/.opencode/bin:/home/rp1user/.npm-global/bin:${PATH}"

# Bind Arcade to 0.0.0.0 so port forwarding works from host
ENV RP1_ARCADE_HOST="0.0.0.0"

EXPOSE 7710

WORKDIR /home/rp1user/target/zod-to-json-schema

ENTRYPOINT ["/home/rp1user/.local/bin/setup-dev.sh"]
