# Playwright worker for the golf tee-time manager — deployed as a Render web service.
#
# Node 24 is REQUIRED: the worker runs its .ts sources directly via Node's native
# type-stripping (no build step), and imports use explicit .ts extensions.
# The Playwright docs' base is node:20-bookworm; we bump to 24 for type-stripping.
FROM node:24-bookworm

WORKDIR /app

# Install dependencies first so this layer is cached unless the lockfile changes.
# --omit=dev: production image doesn't need typescript/vitest.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Install the Chromium build matching the installed Playwright version, plus the
# apt system libraries it needs (--with-deps). Version-matched via the local playwright.
RUN npx playwright install --with-deps chromium

# Copy the app source (node_modules, .env*, tests are excluded via .dockerignore).
COPY . .

# Render injects PORT; the server falls back to 8787 when it's unset (local Docker).
EXPOSE 8787
CMD ["node", "--env-file-if-exists=.env.worker", "src/server.ts"]
