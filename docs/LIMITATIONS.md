# Known limitations

Honest list of remaining constraints in this release. None blocks the
Definition of Done workflow; each has a documented path to resolution.

## Delivery & integrations

- **Email delivery is provider-pluggable but unconfigured by default.** With
  `EMAIL_PROVIDER=console` (development default) transactional mail is
  written to the API log. Production needs `EMAIL_PROVIDER=resend`
  (+ `RESEND_API_KEY`) or `smtp` (+ `SMTP_URL`).
- **File storage defaults to local disk** (`STORAGE_DRIVER=local`). Suitable
  for single-container deployments with a volume; S3-compatible storage is
  selected via `STORAGE_DRIVER=s3` + bucket credentials. Local storage does
  not survive ephemeral container filesystems without a mounted volume.

## Scaling

- **The notification scheduler runs in-process** (hourly pass, single
  instance). For multi-replica deployments either run exactly one instance
  with `SCHEDULER_ENABLED=true` and the rest with `false`, or move the pass
  to an external cron hitting an internal endpoint.
- **Rate limiting is in-memory per instance.** Behind multiple replicas the
  effective limit multiplies by replica count. Move to a Redis-backed
  throttler store for strict global limits.
- **The job queue degrades to inline execution without Redis.** Email and
  report jobs still run, but synchronously. Set `REDIS_URL` to enable BullMQ
  with retries and backoff.
- **Sessions are database-backed** (by design, for instant revocation). This
  adds one indexed lookup per request; cache in Redis if it ever becomes hot.

## Product scope

- **Single-currency per event.** The event currency applies to all its
  expenses; there is no FX conversion.
- **RSVP tracking is manual** — guests are marked invited/confirmed/declined
  by planners; there are no public RSVP links or email invitations to guests.
- **Calendar is read-aggregated** (auto entries derive from records). There
  is no drag-and-drop rescheduling; dates are edited on the source records.
- **Reports are generated on demand** (PDF/CSV download); there is no
  scheduled email delivery of reports.
- **No real-time collaboration** — concurrent edits use optimistic locking
  (`version` column) with a conflict error rather than live presence/merge.

## Platform

- **PostgreSQL is required** — the schema uses PostgreSQL-specific features;
  SQLite/MySQL are not supported.
- **The PWA installs on Chromium/Android and desktop**; iOS supports
  add-to-homescreen but without background sync or push.
