# Deploying Central Command to a test server

This runbook takes a fresh Linux server to a running Central Command that
testers can log in to. Everything runs in Docker Compose: a PostgreSQL
container for Central Command's own data, the FastAPI backend, and an
nginx container that serves the built React app and proxies `/api/*` to
the backend. The three containers talk over a private Compose network;
only nginx is published to the host.

```
browser ──► :8080 nginx (cc-frontend) ──► /api/* ──► cc-backend:8001 ──► cc-db:5432
                                                          │
                                                          └──► client ERP databases (on demand, TLS)
```

## 1. Server prerequisites

| Item | Requirement |
|---|---|
| OS | Ubuntu 22.04 / 24.04 LTS (Debian 12 also fine) |
| Size | 1 vCPU, 2 GB RAM, 10 GB disk is plenty for testing |
| Docker | Docker Engine 24+ with the Compose v2 plugin (`docker compose version`) |
| Network | Inbound: the HTTP port (default 8080) from tester IPs. Outbound: 5432 (or the client's port) to each client ERP database you will register |
| Git | To clone the repo (`sudo apt install git`) |

Install Docker if the server does not have it:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"   # log out and back in afterwards
docker compose version
```

## 2. Get the code

Either unpack the release archive (`central-command-<date>.tar.gz`)
into `/opt/central-command`, or clone:

```bash
sudo mkdir -p /opt/central-command && sudo chown "$USER" /opt/central-command
git clone https://github.com/dennisgoh84-webmaster/websoft-central-command.git /opt/central-command
cd /opt/central-command
git checkout <branch-or-tag-to-test>
```

## 3. Configure secrets

```bash
cp .env.example .env
```

Fill in `.env`:

| Variable | Value |
|---|---|
| `CC_POSTGRES_PASSWORD` | `openssl rand -hex 24` |
| `CC_JWT_SECRET_KEY` | `openssl rand -hex 32` |
| `CC_HTTP_PORT` | Host port nginx listens on. Default `8080`; use `80` if nothing else is on the box |
| `CC_DB_PORT` | Host loopback port for Postgres (for `psql` and backups on the server only). Default `5433` |
| `CC_ENVIRONMENT` | `testing` |

`.env` is gitignored. Compose refuses to start if either secret is empty.

## 4. Build and start

Fastest path, does §3 and §5 for you (installs Docker if missing,
generates `.env`, builds, starts, waits for health, runs the smoke test):

```bash
./scripts/server-setup.sh
```

Or by hand:

```bash
docker compose up -d --build
docker compose ps
```

All three services should reach `running` and `cc-backend` should show
`(healthy)`. First start does the following automatically:

1. `cc-db` initialises the `central_command` database.
2. `cc-backend` waits for the DB health check, runs `seed.py` (creates all
   tables, stamps the Alembic head, creates the default admin), then starts
   uvicorn.
3. `cc-frontend` waits for the backend health check, then serves the app.

Default admin account: **admin / Admin123**. Change it immediately after
first login (Staff › CC Staff › edit, or the Forgot Password flow).

## 5. Verify

From the server or any machine that can reach it:

```bash
./scripts/smoke-test.sh http://<server-ip>:8080
```

Expected output:

```
1. GET /api/health                        OK
2. POST /api/auth/login                   OK
3. Dev OTP present in response            OK
4. POST /api/auth/verify-otp              OK
5. GET /api/dashboard/ (authenticated)    OK
6. GET / serves the SPA                   OK
```

Then open `http://<server-ip>:8080` in a browser and log in. The OTP
step shows the code on screen in a yellow "Dev mode" banner because no
mail server is configured. That is expected on a test server (see §9).

## 6. Register a client ERP for testing

Central Command only does something useful once it can reach a client
ERP database. For each test client:

1. On the client Postgres, create a role Central Command will use and
   grant it access to the schema-contract tables
   (`docs/central-command-schema-contract.md`). It needs `SELECT` on
   `alembic_version`, `companies`, `modules`, `users`; `INSERT/UPDATE` on
   `announcements`, `ad_banner_settings`, `company_modules`,
   `license_settings`, `users`, `user_company_access`.
2. Allow the Central Command server's IP in the client's `pg_hba.conf`
   and firewall, with TLS (`hostssl`).
3. In Central Command: Clients › **+ Add Client**, enter host, port,
   database, username, password, keep **Use TLS** ticked.
4. Open the client and click **Test Connection**. A green panel with the
   Alembic head and the company list means the link works.

The backend refuses to write to a client whose `alembic_version` is
older than `min_client_alembic_head` in `backend/app/core/config.py`
(currently `b2c3d4e5f6a7`). If a test client is on an older schema,
migrate it first or lower that value for the test build.

## 7. Test checklist

Work through `docs/ui-walkthrough.md`, which has a screenshot and the
expected workflow for every screen. Minimum pass:

- [ ] Login with OTP, sign out, Forgot Password round trip
- [ ] Add a client, Test Connection succeeds, Suspend / Activate
- [ ] Client Modules tab lists modules; Enable then Disable one, row updates
- [ ] Client Licenses: set a limit, Push to Client, verify `license_settings` on the client DB
- [ ] Create an ad targeting the client, Push, tick appears on the chip, row in client `announcements`
- [ ] Config Update: draft → Mark Ready → Push to All → status `pushed`, push history row
- [ ] Version Control: register and release a version, client shows Up to date or Update available
- [ ] Staff: add a staff user, push a Support Login to the client, log in to the client ERP with it, Revoke
- [ ] Dashboard shows every push above in Recent Push Activity

## 8. Day-2 operations

**Logs**

```bash
docker compose logs -f cc-backend      # API, OTP codes in dev mode, push errors
docker compose logs -f cc-frontend     # nginx access log
```

**Update to a new build**

```bash
cd /opt/central-command
git pull                                # or git checkout <tag>
docker compose up -d --build            # rebuilds changed images, restarts
./scripts/smoke-test.sh http://localhost:${CC_HTTP_PORT:-8080}
```

Schema changes ship as Alembic migrations. `seed.py` stamps a fresh
database at head; on an existing database apply new migrations with:

```bash
docker compose exec cc-backend alembic upgrade head
```

**Back up / restore Central Command's database**

```bash
docker compose exec cc-db pg_dump -U cc_app -Fc central_command > cc-$(date +%F).dump
docker compose exec -T cc-db pg_restore -U cc_app -d central_command --clean < cc-2026-09-13.dump
```

**Stop / start / reset**

```bash
docker compose stop
docker compose start
docker compose down            # containers only, data volume kept
docker compose down -v         # also deletes the database (full reset)
```

**Open a psql shell**

```bash
docker compose exec cc-db psql -U cc_app central_command
# or from the host: psql -h 127.0.0.1 -p 5433 -U cc_app central_command
```

## 9. Test vs production: what is deliberately loose here

| Area | Test server (this runbook) | Before production |
|---|---|---|
| OTP delivery | Returned in the API response and shown on screen | Wire a mailer in `backend/app/routers/auth.py` (`_send_otp_email`), stop returning `_dev_otp` |
| TLS to the browser | Plain HTTP on port 8080 | Put Caddy / nginx / a load balancer in front with a certificate, or terminate TLS in `frontend/nginx.conf` |
| Admin password | `Admin123` seeded | Change on first login; consider removing the default from `seed.py` |
| Config Updates | Raw SQL runs on every active client with no dry run | Add review/approval, per-client preview |
| Version upgrade | Records intent and updates the tracked head only | Actual Alembic execution on the client is still a manual step |
| Database port | Bound to `127.0.0.1` only | Keep it that way |
| CORS | Not needed: nginx makes the API same-origin | Same; `allow_origins` in `backend/app/main.py` only matters for the Vite dev server |

## 10. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `docker compose up` exits: "set a real password in .env" | `.env` missing or a secret empty. Fill §3 |
| `cc-frontend` restarts with "host not found in upstream cc-backend" | Backend not healthy yet; check `docker compose logs cc-backend` |
| Backend log: `connection to server at "cc-db" ... failed` | DB still starting; the health gate normally prevents this. `docker compose restart cc-backend` |
| Login returns 401 | Wrong credentials, or the DB was reset and the admin re-seeded to `Admin123` |
| Test Connection fails with a timeout | Server cannot reach the client Postgres. Check outbound firewall, client `pg_hba.conf`, TLS requirement |
| Push refused: "alembic head ... too old" | Client schema behind `min_client_alembic_head`; migrate the client |
| Port 8080 already in use | Set `CC_HTTP_PORT` in `.env` and `docker compose up -d` |
