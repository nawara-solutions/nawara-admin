# syntax=docker/dockerfile:1
#
# Nawara Admin, production image: the Angular production build served as static files by unprivileged nginx.
# There is no backend in this image; the frontend calls Nawara Core from the browser (none yet: sign-in is deferred).
#
# The build stage runs the production build and its demo-exclusion check, so an image with mock adapters, demo accounts
# or the simulated passkey cannot be produced (src/environments/environment.ts, tools/check-production-bundle.mjs).
#
# The private @nawara-solutions/design-tokens package is installed from GitHub Packages with a token passed as a BuildKit
# secret: it exists only during the `npm ci` step, never as a build argument, environment variable or layer. The
# committed .npmrc holds only the scope mapping and a ${NODE_AUTH_TOKEN} reference.
#
#   NODE_AUTH_TOKEN=<token with read:packages> docker build --secret id=npm_token,env=NODE_AUTH_TOKEN \
#     --build-arg REVISION="$(git rev-parse HEAD)" -t nawara-admin-web .

FROM node:24.18.0-alpine AS build
WORKDIR /app
# npm is pinned by package.json "packageManager".
RUN npm install -g npm@11.16.0 >/dev/null
COPY package.json package-lock.json .npmrc ./
# HUSKY=0: no git hooks in an image build. The token is mounted for this step only (required: the build fails without it).
RUN --mount=type=secret,id=npm_token,env=NODE_AUTH_TOKEN,required=true \
    HUSKY=0 npm ci --no-audit --no-fund
COPY . .
ARG REVISION=unknown
RUN npm run build && npm run check:production \
 && printf '%s\n' "$REVISION" > dist/nawara-admin/browser/version.txt

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
ARG REVISION=unknown
LABEL org.opencontainers.image.title="nawara-admin-web" \
      org.opencontainers.image.source="https://github.com/nawara-solutions/nawara-admin" \
      org.opencontainers.image.revision="$REVISION"
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist/nawara-admin/browser /usr/share/nginx/html
# The on-server deployment script travels with the image it deploys (the Nawara Core convention).
COPY deploy/provision-and-deploy.sh /deploy/provision-and-deploy.sh
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
