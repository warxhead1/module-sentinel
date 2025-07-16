FROM ubuntu:22.04

# Use bash for all RUN commands
SHELL ["/bin/bash", "-c"]

# Set environment variables to avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

# Install essential tools Claude Code typically needs
RUN apt-get update && apt-get install -y \
    curl wget git vim nano \
    build-essential python3 python3-pip \
    zsh bash-completion \
    jq tree htop \
    unzip zip \
    ca-certificates \
    sudo \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 22 via NodeSource
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Verify Node.js installation
RUN node --version && npm --version

# Create the warxh user directory structure
RUN mkdir -p /home/warxh

# Create a non-root user for development
RUN useradd -m -s /bin/zsh devuser && \
    echo "devuser ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Switch to devuser and set up environment
USER devuser
WORKDIR /home/devuser

# Install oh-my-zsh for devuser
RUN sh -c "$(curl -fsSL https://raw.github.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended || echo "oh-my-zsh install failed, continuing..."

# Try to install Claude Code (may fail, that's ok)
RUN curl -fsSL https://claude.ai/install.sh | bash || echo "Claude install failed - will be available via mount"

WORKDIR /workspace