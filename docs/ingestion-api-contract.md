# Ingestion & Sensor API Contract

> **Single source of truth** for the post-ingestion + sensor onboarding endpoints,
> consumed by the `hanabi-intelligence-extension` repo (onboarding/consent, capture,
> opt-out/purge). Change this and the extension together — never one
> without the other.

All endpoints run on the Node.js runtime and are called from the extension's
**background service worker / extension page** (with `host_permissions` for this
origin) — a privileged extension context, so **no CORS** headers or preflight are
involved. Auth is a bearer token; all auth failures return a uniform **401**.

## Endpoint

```
POST /api/ingest
Content-Type: application/json
Authorization: Bearer <sensor-token>
```

- Runs on the Node.js runtime. HTTPS only in deployed environments.
- Base URL per environment: local `http://127.0.0.1:3000`, deployed = the Vercel URL.
- Called from the extension's **background service worker** (host permission), not a
  content script — so no CORS preflight is involved and no `Access-Control-*` headers
  are set.

## Authentication

- The sensor presents a **bearer token** — a ≥ 256-bit CSPRNG value provisioned
  out-of-band. The server stores only its **SHA-256 hex** (`sensors.token_hash`); the
  raw token is never persisted or logged.
- `POST /api/ingest` is accepted only when the token maps to a sensor that is `active`
  **and** has recorded consent (`consented_at`). Consent is captured **in-product**:
  sensors are provisioned `active` with `consented_at` null, and the extension records
  consent once via `POST /api/sensor/consent` during onboarding (see **Sensor identity
  & consent**). The identity/consent endpoints themselves do **not** require prior
  consent, so an active-but-not-yet-consented sensor validates on them.
- **All** auth failures — missing/malformed header, unknown token, inactive sensor
  (and, on `/api/ingest`, a sensor without consent) — return an identical **401** (no
  enumeration). The server logs the specific reason; the response never discloses it.

To provision a sensor: generate a random token, store `sha256_hex(token)` in
`sensors.token_hash` with `active = true` and `consented_at` null, and hand the raw
token to the sensor once. Local development seeds two ready-to-use sensors (see **Local
testing**).

## Sensor identity & consent

Two auxiliary endpoints for extension onboarding. Same `Authorization: Bearer
<token>` scheme and the same uniform **401** on any auth failure (missing/malformed,
unknown token, or `active = false`). Unlike `/api/ingest`, they do **not** require
recorded consent. **No request body**; response is `application/json`. Error envelope is
the shared `{ "error": { "code", "message" } }` — `401 unauthorized` or `500
server_error`.

`consented_at` is an ISO-8601 UTC timestamp in **offset form** (e.g.
`2026-07-09T15:24:53.789036+00:00`), not the `Z` form — parse with `new Date(...)`, not
a `Z`-suffix assumption.

### GET /api/sensor/me

Validate the token and read back the sensor's identity + consent status.

- **200**: `{ "id": string, "name": string, "email": string, "consented_at": string | null }`
  — `consented_at` is `null` until consent is recorded (ISO-8601 otherwise).

### POST /api/sensor/consent

Record the sensor's consent. **Idempotent**: sets `consented_at` to the server time on
the first call and never overwrites it; after this call, `/api/ingest`'s consent gate
passes.

- **200**: `{ "consented_at": string }` — always a non-null ISO-8601 timestamp (the
  just-recorded or previously-recorded value).

## Opt-out & erasure (GDPR)

Two self-serve GDPR endpoints. Same `Authorization: Bearer <token>` scheme and the same
uniform **401** on any auth failure. Unlike `/api/ingest`, they do **not** require the
sensor to be `active` or consented — a sensor must always be able to withdraw, even after
opting out. **No request body**; response is `application/json`; error envelope is the
shared `{ "error": { "code", "message" } }` (`401 unauthorized` / `500 server_error`).

**Procedure — no admin involved:** the sensor (the extension) authenticates with its own
bearer token and calls the endpoint; the server acts on exactly that sensor.

### POST /api/sensor/opt-out

Set the sensor **inactive** (self-serve opt-out). **Idempotent** — opting out an
already-inactive sensor still succeeds. After this call, `/api/ingest` refuses the sensor
(uniform 401), and its past sightings stop counting toward the dashboard aggregates
(`best_author_degree` / `seen_count`) and the warm-intro reveal. The sensor row and its
history are **retained** (this is opt-out, not erasure).

- **200**: `{ "active": false }`.

### DELETE /api/sensor/me

**Erase** the sensor (right to be forgotten). Deletes the sensor row and its
`item_sources` links (which posts it saw, plus its connection degree / social-proof
notes). The captured posts (`items`) are third-party content shared across sensors and are
**retained**; any aggregate they carried self-heals. **Irreversible.**

- **200**: `{ "erased": true }`.

## Request body

An envelope, not a bare array:

```jsonc
{
  "version": 1,
  "posts": [/* 1..50 post objects */],
}
```

- `version` **must** be the literal `1`.
- `posts`: 1 to **50** items (`BATCH_MAX`). Raw body capped at **512 KB**.
- Unknown keys are rejected (strict) at both the envelope and post level — adding a
  field is a breaking change that requires a version bump.

### Per-post fields

Routing column: **items** = stored on the shared, partner-visible `items` row;
**item_sources** = per-sensor, RLS-protected, never exposed by default.

| Field                         | Type                                                                               | Required | Routing          | Notes                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------- | -------- | ---------------- | ---------------------------------------------------------- |
| `linkedin_post_id`            | string                                                                             | yes      | items            | Deduplication key (UNIQUE).                                |
| `url`                         | string (http/https)                                                                | yes      | items            | Permalink. Non-http(s) rejected (XSS guard).               |
| `author_name`                 | string                                                                             | yes      | items            | The **surfaced** author (the resharer on a repost).        |
| `captured_at`                 | string (ISO-8601 datetime)                                                         | yes      | items            | When the extension saw the post.                           |
| `author_company`              | string \| null                                                                     | no       | items            |                                                            |
| `author_title`                | string \| null                                                                     | no       | items            |                                                            |
| `author_profile_url`          | string (http/https) \| null                                                        | no       | items            |                                                            |
| `author_type`                 | `person` \| `company`                                                              | no       | items            | Default `person`.                                          |
| `text`                        | string \| null                                                                     | no       | items            | Optional (image/doc/video carry substance elsewhere).      |
| `post_type`                   | `text` \| `image` \| `multi_image` \| `video` \| `document` \| `poll` \| `article` | no       | items            | Default `text`.                                            |
| `is_repost`                   | boolean                                                                            | no       | items            | Default `false`.                                           |
| `original_author_name`        | string \| null                                                                     | cond.    | items            | **Required when `is_repost` is true.** The decision-maker. |
| `original_author_profile_url` | string (http/https) \| null                                                        | no       | items            |                                                            |
| `media_title`                 | string \| null                                                                     | no       | items            | Carousel/document title.                                   |
| `hashtags`                    | string[]                                                                           | no       | items            | Default `[]`; blanks dropped; ≤ 64 entries.                |
| `reaction_count`              | integer ≥ 0                                                                        | no       | items            | Default `0`.                                               |
| `comment_count`               | integer ≥ 0                                                                        | no       | items            | Default `0`.                                               |
| `posted_at_raw`               | string \| null                                                                     | no       | items            | LinkedIn's relative string ("2h", "1d", "3 sem").          |
| `author_degree`               | `first` \| `second` \| `third` \| `none`                                           | no       | **item_sources** | This sensor's connection degree to the author.             |
| `social_proof`                | string \| null                                                                     | no       | **item_sources** | Warm-intro holder note. Never exposed by default.          |

**Server-derived — do NOT send these** (rejected as unknown keys): `posted_at`
(derived from `posted_at_raw` + `captured_at`), `best_author_degree`, `seen_count`,
`stream`/`heat`/`status`/`summary`/`domains` (classification/triage).

Blank strings are treated as absent (stored as null). Optional strings are trimmed.

### Reposts

`author_*` describes the **resharer** (the surfaced author); `original_author_*`
describes the **original** author. Store both verbatim — the dashboard surfaces the
original author (the decision-maker), never the resharer. A repost without
`original_author_name` is rejected (422; a DB CHECK backstops it).

### `posted_at` derivation

LinkedIn renders only relative times, so `posted_at` is reconstructed server-side as
`captured_at − offset(posted_at_raw)`. Recognised (EN + FR, compact and spelled):
`now`/`maintenant`, `s`/`min`/`h`/`d`(`j`)/`w`(`sem`)/`mo`(`mois`)/`y`(`an`/`ans`),
and `il y a …` / `… ago`. Month ≈ 30 days, year ≈ 365 days (approximate; the field
only feeds ordering + a coarse age label). Unrecognised strings leave `posted_at`
null and the read layer falls back to `captured_at`.

## Response

**200** — the batch was accepted:

```jsonc
{ "received": 3, "new_items": 2, "known_items": 1 }
```

- `new_items`: posts stored for the first time. `known_items`: posts already known
  (deduplicated). `received` = `new_items` + `known_items` + any failed.
- `failed` is present only if the DB isolated some posts:
  `"failed": [{ "linkedin_post_id": "...", "error": "..." }]` — the rest still committed.

### Errors

Uniform shape `{ "error": { "code", "message", "issues"? } }`:

| Status | `code`                   | When                                                                               |
| ------ | ------------------------ | ---------------------------------------------------------------------------------- |
| 400    | `invalid_json`           | Body is not valid JSON.                                                            |
| 401    | `unauthorized`           | Any authentication failure (uniform).                                              |
| 413    | `payload_too_large`      | Body exceeds 512 KB.                                                               |
| 415    | `unsupported_media_type` | `Content-Type` is not `application/json`.                                          |
| 422    | `invalid_payload`        | Schema/enum/refinement/batch-size violation. `issues[]` lists `{ path, message }`. |
| 500    | `ingest_failed`          | Unexpected persistence failure.                                                    |

`429` is reserved (rate limiting is deferred; batch + body caps are the current
mitigations).

## Deduplication & idempotency

- Dedup key is `linkedin_post_id` (UNIQUE). Re-sending a known post upserts its
  `items` row and this sensor's `item_sources` row.
- **`seen_count`** = the number of **distinct active + consented sensors** that reported
  the post. A same-sensor resend does **not** increment it (idempotent). A new sensor
  does. A sensor that later opts out or is erased drops back out of the count.
- Re-capture updates: engagement counts are **greatest-wins** (never regress);
  `captured_at` and `posted_at` are kept from the **first** capture; classification
  and triage columns are never touched.
- `best_author_degree` is a derived, non-identifying aggregate (strongest degree across
  the **active + consented** sensors that saw the post) maintained by the database — the
  same population the warm-intro reveal exposes, so the card can never over-claim a path
  the reveal hides.

## Versioning

The envelope carries `version`. Because the schema is strict (unknown keys rejected),
**any new field is a breaking change** — bump `version` and update this document and
the extension together.

## Local testing

`pnpm db:reset` seeds two local dev sensors:

- `hanabi-local-dev-sensor-token` — onboarded (consent already recorded); use for ingest.
- `hanabi-local-onboarding-token` — active but consent NOT yet recorded; use for the
  identity/consent flow.

Exercise the endpoints with `pnpm dev` running:

```bash
# Onboarding: validate + read identity (consent still null)
curl -sS http://127.0.0.1:3000/api/sensor/me \
  -H 'Authorization: Bearer hanabi-local-onboarding-token'
# -> {"id":"…","name":"Dev Onboarding Sensor","email":"…","consented_at":null}

# Record consent (idempotent)
curl -sS -X POST http://127.0.0.1:3000/api/sensor/consent \
  -H 'Authorization: Bearer hanabi-local-onboarding-token'
# -> {"consented_at":"2026-…Z"}

# Ingest a post (onboarded sensor)
curl -sS -X POST http://127.0.0.1:3000/api/ingest \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer hanabi-local-dev-sensor-token' \
  -d '{"version":1,"posts":[{
        "linkedin_post_id":"urn:li:activity:demo-1",
        "url":"https://www.linkedin.com/feed/update/urn:li:activity:demo-1",
        "author_name":"Jean Dupont","captured_at":"2026-07-09T12:00:00.000Z",
        "posted_at_raw":"2h","reaction_count":12,"author_degree":"second",
        "social_proof":"Camille connaît Jean"}]}'
# -> {"received":1,"new_items":1,"known_items":0}

# Opt out (self-serve; idempotent). Afterwards /api/ingest returns 401 for this token.
curl -sS -X POST http://127.0.0.1:3000/api/sensor/opt-out \
  -H 'Authorization: Bearer hanabi-local-dev-sensor-token'
# -> {"active":false}

# Erase the sensor (right to be forgotten; irreversible).
curl -sS -X DELETE http://127.0.0.1:3000/api/sensor/me \
  -H 'Authorization: Bearer hanabi-local-onboarding-token'
# -> {"erased":true}
```

> These two mutate (or delete) the local seeded sensor — re-run `pnpm db:reset` to restore
> the seed state afterwards.
