# My Event Planner — Remaining Production Fixes

## Status

Technical source remediation completed on 2026-07-22. The repository is prepared for GitHub CI and staging validation. Public launch remains conditional on supplying verified legal operator details and obtaining a clean network-enabled CI run.

## Fixed

- Redis connection now initializes before the BullMQ email worker and fails closed in production.
- Production now requires Redis, HTTPS public URLs, secure cookies, trusted-proxy configuration, a real email provider, a non-placeholder contact address, and a malware scanner.
- Email queue no longer silently degrades to fire-and-forget delivery in production.
- Malware scanning rejects unknown verdicts and fails closed when unavailable in production.
- Uploads now have a Multer memory limit based on `MAX_UPLOAD_MB`.
- S3 signed downloads force `Content-Disposition: attachment` and `application/octet-stream`.
- Payment/refund idempotency is bound to a canonical payload hash; conflicting key reuse returns a conflict.
- Added Prisma migration for `payments.idempotencyHash`.
- Added explicit Express `TRUST_PROXY` configuration.
- Workspace ownership transfer requires a verified target and uses a compare-and-swap owner update inside the transaction.
- Added complete account-level JSON data export API and settings UI.
- Account deletion now attempts object-storage cleanup for documents in deleted owned workspaces.
- Removed personal email addresses and obsolete EU ODR references from public pages.
- Replaced MIT declarations with proprietary/all-rights-reserved status.
- Added GitHub security workflow, Redis-backed CI, worker startup validation, formatting and lint gates.
- Production Compose now requires secrets and public endpoint values instead of unsafe defaults.
- Runtime containers use a non-root user.

## Static validation performed

- 190+ TypeScript/TSX source files parsed with zero syntax errors.
- All JSON files parsed successfully.
- All YAML files parsed successfully.
- No personal Gmail address remains in the repository.
- No obsolete EU ODR URL remains.
- No MIT licence link remains.
- No `.env`, `.git`, `node_modules`, build cache, or runtime upload directory is included in the release archive.

## Verification limitation

A clean dependency installation, Prisma generation, migration execution, typecheck, tests, and production build could not be rerun in this execution environment because access to the npm registry was unavailable. GitHub Actions must reproduce these checks before deployment.

## Remaining owner-supplied launch requirement

The `/impressum` page intentionally contains explicit placeholders. Before public launch, replace them with verified legal operator name/company, full serviceable address, legal contact details, registration/VAT information where applicable, and a legally reviewed consumer-dispute statement.
