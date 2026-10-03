# Nawara Admin — CI, deployment and rollback

- **Status:** established 2026-10-03; **first production deployment succeeded on 2026-10-03** (see "Initial deployment
  record"). Production serves the frontend only. **Production authentication remains unavailable** and stage A4 stays open:
  A4-S1 is a reviewed mock prototype that exists in development builds only.
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

**Organization secrets and repository visibility.** Deployment uses the existing organization-level `DEPLOY_SSH_*` secrets
(policy: all repositories). They are not duplicated as repository secrets. The organization is on **GitHub Free**, where
organization secrets are passed only to **public** repositories. `nawara-admin` is currently **public**, which is why they reach
its workflows. While it was private, the first deployment attempt received them empty and stopped with "missing server host"
before any connection. **Making the repository private again will break deployment** unless either the organization moves to a
plan that supports organization secrets for private repositories (GitHub Team or Enterprise), or a change to secret management
(for example repository secrets) is separately approved by the owner. Neither is to be done as a side effect of other work.

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

## Initial deployment record (2026-10-03)

| Item | Value |
|---|---|
| Workflow run | <https://github.com/nawara-solutions/nawara-admin/actions/runs/37079263924> (attempt 1 failed: secrets empty while the repository was private; attempt 2 succeeded) |
| Trigger | tag `admin-deploy-initial` (the workflow was not yet on `main` when it was created) |
| Deployed commit | `43f267285d9dc9e1546c5fba20fce7ca76d28929`, file-for-file identical to `main` at `3264ba6` |
| Image | `ghcr.io/nawara-solutions/nawara-admin-web:sha-43f267285d9dc9e1546c5fba20fce7ca76d28929` |
| Container | `nawara-admin-web`, running/healthy; no previous container existed |

**Live verification** (workflow `deploy/verify.sh`, repeated from a workstation, plus a Chrome run):

- HTTPS: valid Let's Encrypt certificate for `*.nawara-solutions.com` (expires 2026-12-20); plain HTTP redirects to HTTPS.
- `/`, `/login`, `/login/verify`, `/overview`, `/platforms`, `/platforms/x` load directly and all show "Sign-in is not available
  yet": no sign-in form, no demo panel.
- 131 assets loaded; no console errors; no failed requests; a missing file is a real 404; `/version.txt` returns the commit.
- All 40 JavaScript files reachable from `main`: no demo account, demo credential, mock adapter or simulated passkey.
- `https://core-api.nawara-solutions.com/auth/health` returned 200 before and after the deployment. Core was not modified.

**Unverified observations (no cause established):** `https://core-api.nawara-solutions.com/organization/health` and
`…/audit/health` returned 404 from outside after the deployment. They were not checked before it, so nothing is known about their
earlier state; these services may simply not expose a public health route. The Admin deployment touches only its own
`nawara-admin-web` container, and there is no evidence that it caused these responses. Likewise `https://nawara-solutions.com`
(a different address from the VPS) did not answer over HTTPS during the session; its earlier state is unknown.

**Still open:** a Content-Security-Policy (ARCHITECTURE §21, A14); the real session and refresh strategy, exact Core contracts and
error mappings, the platform-access contract, real WebAuthn validation, main-app sign-out and the full operator journey (A4).

Later deployments run from `main`: `gh workflow run admin-deploy.yml --ref main`.
