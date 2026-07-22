# Deployment guide — My Event Planner on a VPS

Target: a single Linux VPS (Ubuntu 22.04/24.04) with Docker. Three containers run the app (web, api, worker) plus three infrastructure containers (PostgreSQL, Redis, MinIO).

> **Production fail-fast:** with `NODE_ENV=production` the API and the worker
> refuse to boot when the configuration is unsafe (localhost origins,
> `SESSION_COOKIE_SECURE=false`, `EMAIL_PROVIDER=console`, missing SMTP/Resend
> credentials, missing S3 credentials, disabled email verification, or
> Swagger enabled). The process exits with an explicit list of problems —
> fix the environment, not the code.

## 1. Prepare the server

```bash
# Docker + compose plugin
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"   # re-login afterwards

# Unpack the source
mkdir -p /opt/my-event-planner && cd /opt/my-event-planner
# copy the repository here (git clone, scp, or unzip the archive)
```

## 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` (used by `docker-compose.prod.yml` via `${VAR}` interpolation):

| Variable | Notes |
|---|---|
| `POSTGRES_PASSWORD` | **Required.** Strong random password. |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | **Required.** S3 credentials for document storage. |
| `WEB_ORIGIN` / `APP_BASE_URL` | Your public web origin, e.g. `https://planner.example.com`. |
| `NEXT_PUBLIC_API_URL` | Public API origin, e.g. `https://api.example.com`. **Baked into the web build** — set before building. |
| `SESSION_COOKIE_SECURE` | Set `true` when serving over HTTPS. |
| `SWAGGER_ENABLED` | API docs at `/docs`. Defaults to **off** in production. |
| `SCHEDULER_ENABLED` | Hourly notification pass. Set `false` to disable. |
| `AUTH_REGISTER_RATE_LIMIT` | Registration/password-request throttle per minute (default 5). |
| `AUTH_LOGIN_RATE_LIMIT` | Login/password-reset throttle per minute (default 10). |
| `EMAIL_PROVIDER` | `resend` (+ `RESEND_API_KEY`), `smtp` (+ `SMTP_URL`), or `console`. |
| `EMAIL_FROM` | Sender address for transactional mail. |
| `CONTACT_EMAIL` | Inbox that receives contact-form submissions (default `contact@your-domain.example`). |
| `CONTACT_RATE_LIMIT` | Contact-form submissions per minute per client (default 5). |
| `REQUIRE_EMAIL_VERIFICATION` | Blocks app usage until the email address is verified. **On and enforced in production** (cannot be disabled there). |
| `MALWARE_SCAN_URL` | Optional HTTP bridge for malware scanning of uploads (e.g. a ClamAV REST wrapper; expects `{"verdict":"clean"\|"infected"}`). Empty = no-op scanner. |

The API container reads the same variables (see `docker-compose.prod.yml`). For local-disk storage instead of MinIO, set `STORAGE_DRIVER=local` and add a volume for `/app/apps/api/uploads`.

### The worker container

Transactional email is queued in Redis (BullMQ) and delivered by the dedicated **`worker`** container (`node dist/worker.js`) with retries and exponential backoff. Without it, queued mail is never delivered. It shares the API image and environment — no extra configuration. One instance is enough for typical loads; it can be scaled horizontally.

## 3. Build and start

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

On first start the API container runs `prisma migrate deploy` automatically (see the `CMD` in `infrastructure/docker/api.Dockerfile`), then boots. Verify:

```bash
curl http://localhost:4000/api/v1/health/ready
# {"status":"ok","database":true,"redis":true,"storage":{"driver":"s3","ok":true}}
```

Do **not** run `pnpm seed` in production — the seed wipes the database. Create the first account via `https://your-domain/register`.

## 4. Reverse proxy + TLS (Caddy example)

Serve web and API on separate hostnames so cookies stay first-party:

```
planner.example.com {
    reverse_proxy localhost:3000
}
api.example.com {
    reverse_proxy localhost:4000
}
```

Then set `NEXT_PUBLIC_API_URL=https://api.example.com`, `WEB_ORIGIN=https://planner.example.com`, `APP_BASE_URL=https://planner.example.com`, `SESSION_COOKIE_SECURE=true` and rebuild: `docker compose -f docker-compose.prod.yml up -d --build`.

(Nginx, Traefik or Cloudflare Tunnel work equally well — just forward `3000` and `4000`.)

## 5. Backups

```bash
# Nightly database dump (cron example)
0 3 * * * docker compose -f /opt/my-event-planner/docker-compose.prod.yml exec -T postgres \
  pg_dump -U mep my_event_planner | gzip > /backups/mep-$(date +\%F).sql.gz

# Documents (MinIO volume) — or enable MinIO versioning/replication
tar czf /backups/minio-$(date +%F).tgz /var/lib/docker/volumes/*minio_data
```

Keep at least 7 daily + 4 weekly backups off-box (e.g. `rclone` to object storage).

## 6. Updates

```bash
cd /opt/my-event-planner
git pull                       # or unpack the new archive
docker compose -f docker-compose.prod.yml up -d --build
# migrations run automatically on API container start
```

## 7. Operating notes

- **Redis is optional**: if it is down, the API logs a warning and sends email inline instead of via BullMQ. Everything else keeps working.
- **Health checks**: `/api/v1/health` (liveness) and `/api/v1/health/ready` (database + storage + redis). Point your uptime monitor at the latter.
- **Logs**: `docker compose -f docker-compose.prod.yml logs -f api` / `web`.
- **Swagger**: exposed at `http://<api-host>:4000/docs` — restrict it at the proxy in production if desired.
- **Uploads**: limited to `MAX_UPLOAD_MB` (default 10 MB); executable extensions are blocked.
- **Scaling**: the stack is single-node by design. To scale later, move PostgreSQL/Redis/S3 to managed services and run multiple `api` replicas behind the proxy (stateless, cookie sessions live in PostgreSQL).


## Reverse proxy
Set `TRUST_PROXY` to the narrowest trusted proxy range supported by your platform (for example `loopback, linklocal, uniquelocal`). Never use an unrestricted value unless the network boundary is controlled.
