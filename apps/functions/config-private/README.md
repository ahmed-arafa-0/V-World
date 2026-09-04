# config-private

This folder is the server-only location for backend credentials. It is never
imported by the React/Vite frontend, and its contents are excluded from git
via the root `.gitignore`.

## What goes here

The Google service account key used to access the private Google Sheet and
the Google Drive asset root, named exactly:

```
apps/functions/config-private/google-service-account.json
```

A standard Google Cloud service account JSON key, containing at minimum
`client_email` and `private_key`. This file must **never** be committed to
the repository and must **never** be requested by, sent to, or imported from
the browser bundle.

## M01 status

The credential file is present locally (Ahmed placed it here for M01) and is
git-ignored — confirmed via `git check-ignore -v` in the M01 evidence report.
The backend's credential loader (`src/config/google-credential-loader.ts`)
also still handles a **missing** file gracefully, returning a typed,
credential-free status (`{ present: false, reason: 'not_configured' }`) so
that `GET /api/health` keeps working without it. No raw file-system or
JSON-parse error is ever surfaced to callers. Automated unit tests exercise
the missing-credential path using fixture directories under
`apps/functions/tests/fixtures/`, never this real file.

## Do not hand-edit

Do not hand-edit or rename this file once placed. If it is ever rotated,
replace the whole file rather than editing individual fields.
