# Nawara Admin — CI, deployment and rollback

- **Status:** established 2026-10-03. Production serves the frontend only; sign-in is not available in production (A4-S1 is a
  reviewed mock prototype, development builds only).
- **Model:** the Nawara Core convention, applied to a static frontend: an image in GHCR, deployed over SSH by a script that
  travels inside the image, routed by the existing Traefik on the VPS. No Admin backend, no BFF, no runtime secret.

## What runs in production

| Item | Value |
|---|---|
| URL | `https://admin.nawara-solutions.com` (Cloudflare → Traefik on the VPS) |
| Image | `ghcr.io/nawara-solutions/nawara-admin-web:sha-<commit>` (one immutable tag per commit) |
| Container | `nawara-admin-web`: unprivileged nginx on port 8080, read-only filesystem, all capabilities dropped, `no-new-privileges` |
| Traefik | network `deploy_edge`, router `nawara-admin-web`, `Host(admin.nawara-solutions.com)`, entrypoint `websecure`, certresolver `le` (as Core's services) |
| Build | `Dockerfile`: Node 24.18.0 / npm 11.16.0 (`.node-version`, `packageManager`), `npm ci`, `npm run build`, `npm run check:production` |
| Content | the production environment only (`demo: null`): no mock adapter, demo account, demo credential or simulated passkey; every route without a session shows "Sign-in is not available yet" |

**Serving (`deploy/nginx.conf`):** client routes (`/login`, `/overview`, `/platforms/…`) fall back to `index.html`; a missing file
with an extension is a real 404. `index.html` is `no-cache`; content-hashed bundles, styles and fonts are `immutable` for a year;
other static files (brand artwork, illustrations, icons) one hour. Cache headers are sent on successful responses only.
Security headers on every response: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`.
**No Content-Security-Policy yet:** it needs the hash of `index.html`'s no-flash script and the Core origins (ARCHITECTURE §21,
A14). `/healthz` (container health) and `/version.txt` (the deployed commit) are public and contain nothing sensitive.

## Workflows

| Workflow | Trigger | Secrets | Does |
|---|---|---|---|
| `.github/workflows/admin-ci.yml` | pull requests to `main`, pushes to `main` | none (`contents: read`) | `format:check`, `lint`, `lint:styles`, `check:i18n`, `check:contrast`, `test`, `build` (budgets), `check:production`; builds the image (no push), runs it hardened and runs `deploy/verify.sh` |
| `.github/workflows/admin-deploy.yml` | manual on `main`; tag `admin-deploy-*` | org `DEPLOY_SSH_*`, `GITHUB_TOKEN` | `npm run validate`, build and push `sha-<commit>`, deploy, live `deploy/verify.sh` |

- **Normal deployment:** a reviewed commit on `main`: `gh workflow run admin-deploy.yml --ref main`. A manual run on any other
  branch is refused by the job guard. It is not automatic on every push to `main`.
- **A reviewed commit not yet on `main`** (used once, for the initial deployment): push a tag `admin-deploy-<name>` on it. Tag
  runs use the workflow of the tagged commit; creating a tag needs write access, like a manual run. Prefer `main`.
- **Concurrency:** one queue, `production-deploy-admin`; a running deployment is never cancelled. On the server the script also
  holds `~/nawara-admin/deploy.lock`.
- Pull requests never run the deployment workflow, so the deployment secrets never reach untrusted code.

## Configuration and secrets

| Name | Kind | Where | Purpose |
|---|---|---|---|
| `DEPLOY_SSH_HOST`, `DEPLOY_SSH_USER`, `DEPLOY_SSH_PASSWORD`, `DEPLOY_SSH_PORT` | CI/CD secret (VPS access) | GitHub **organization** secrets, shared with Nawara Core | SSH to the VPS (the Core workflows' method) |
| `GITHUB_TOKEN` | automatic | GitHub | push the image to GHCR; the server pulls with it during the run |
| `DEPLOY_NETWORK`, `ADMIN_HOST`, `KEEP_PREVIOUS` | optional script variables | the deploy command | defaults `deploy_edge`, `admin.nawara-solutions.com`, `2` |

The frontend has **no** secret and **no** runtime configuration: everything in the bundle is public. Never put SSH credentials,
tokens, private keys or Core service credentials into `src/environments/` or any served file. Future Core integration settings
(Core origins, WebAuthn) are public browser configuration and are decided with the HTTP adapter (CF-15, D-A4); none exists yet.

## Verification

`deploy/verify.sh <url> <commit>` checks the deployed commit, `/healthz`, deep links, cache and security headers, 404s, and crawls
every JavaScript file reachable from `main` for demo-only content (demo account domain and password, mock adapter tokens, the
simulated passkey). It runs in CI against the image and after every deployment against the live site.

## Rollback

1. **Automatic:** if the new container does not become healthy, the script removes it and restarts the previous one.
2. **Redeploy an earlier image** (preferred): `gh workflow run admin-deploy.yml --ref main -f image_sha=<full commit sha>`. The
   image is not rebuilt; the live checks then expect that commit.
3. **On the server, without GitHub:** the last two superseded containers are kept stopped as `nawara-admin-web-previous-<time>`:

   ```sh
   docker run --rm --entrypoint cat ghcr.io/nawara-solutions/nawara-admin-web:sha-<any> /deploy/provision-and-deploy.sh \
     | ROLLBACK=1 bash -s
   ```

   This stops the current container (kept as `nawara-admin-web-failed-<time>`) and starts the newest previous one.

The script only ever touches containers named `nawara-admin-web*`; it never creates networks and never stops other services.
