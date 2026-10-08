# Build image for Anthropic OSS Scanner (https://github.com/anthropics/oss-scanner).
# The scanner builds this with the repository root as the build context, then removes network access,
# so every dependency the web app, the desktop app and the tests need is installed here.
FROM node:22-bookworm
ENV DEBIAN_FRONTEND=noninteractive \
    NEXT_TELEMETRY_DISABLED=1 \
    SKIP_ENV_VALIDATION=1
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates git python3 \
    && rm -rf /var/lib/apt/lists/*

# scanner contract: the checkout lives inside the image, at /src
COPY . /src
WORKDIR /src

# Web app (Next.js): install and build as CI does.
RUN npm ci
RUN npm run build

# Desktop app (Electron): install and bundle, as CI does. Packaging with electron-builder is platform specific
# and is not needed for analysis.
RUN cd apps/desktop && npm ci && npm run build

# Run the cheap checks so the image is known to work, without failing the build on a red test.
RUN (npm run check && npm run test) || echo "WARNING: checks or tests reported failures"
RUN (cd apps/desktop && npm run typecheck) || echo "WARNING: desktop typecheck reported failures"
