# config-private

This folder is the server-only location for backend credentials. It is never
imported by the React/Vite frontend, and its contents are excluded from git
via the root `.gitignore`.

## What goes here (starting in M01)

Ahmed will place the Google service account key used to access the private
Google Sheet and the Google Drive asset root here, named exactly:

```
apps/functions/config-private/google-service-account.json
```

This file must **never** be committed to the repository and must **never**
be requested by, sent to, or imported from the browser bundle.

## M00 status

As of M00, this file intentionally does **not** exist. The backend's
credential loader (`src/config/google-credential-loader.ts`) detects the
missing file and returns a typed, credential-free status
(`{ present: false, reason: 'not_configured' }`) so that `GET /api/health`
keeps working without it. No raw file-system or JSON-parse error is ever
surfaced to callers.

## Format expected in M01

A standard Google Cloud service account JSON key, containing at minimum
`client_email` and `private_key`. Do not hand-edit or rename the file once
Ahmed provides it.
