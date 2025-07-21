FROM ubuntu:22.04

# Use bash for all RUN commands
SHELL ["/bin/bash", "-c"]

# Set environment variables to avoid interactive prompts
ARG TZ=UTC
ENV DEBIAN_FRONTEND=noninteractive

# Install essential tools Claude Code typically needs
RUN apt-get update && apt-get install -y \
    curl wget git vim nano \
    build-essential python3 python3-pip \
    zsh bash-completion \
    jq tree htop \
    unzip zip \
    ca-certificates \
    sudo \
    iptables ipset dnsutils iproute2 \
    aggregate \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 22 via NodeSource
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Verify Node.js installation
RUN node --version && npm --version

# Don't install global packages here - will install as user packages in postCreateCommand

WORKDIR /workspace

COPY --chown=node:node init-firewall.sh /usr/local/bin/init-firewall.sh
RUN sudo chmod +x /usr/local/bin/init-firewall.sh
