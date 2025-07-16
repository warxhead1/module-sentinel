# Lightweight but full-featured
FROM ubuntu:22.04

# Install essential tools Claude Code typically needs
RUN apt-get update && apt-get install -y \
    curl wget git vim nano \
    build-essential python3 python3-pip \
    nodejs npm \
    zsh bash-completion \
    jq tree htop \
    unzip zip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

# Install Claude Code
RUN curl -fsSL https://claude.ai/install.sh | sh

# Set up zsh with basic config
RUN chsh -s /bin/zsh
COPY .zshrc /root/.zshrc

WORKDIR /workspace