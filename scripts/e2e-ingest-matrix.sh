#!/usr/bin/env bash
#
# FSC-122 — cross-repo /api/ingest contract matrix.
#
# Exercises every branch of the ingestion contract (docs/ingestion-api-contract.md)
# end-to-end over real HTTP + the real database: all status codes, the exact error
# envelope + dot-joined issues[].path, idempotency, seen_count, per-post isolation,
# posted_at derivation, and repost-verbatim storage. This is the wired path that the
# colocated *.test.ts (pure logic) and pgTAP (DB) suites cannot cover on their own — the
# gap that let a string-vs-array issues[].path mismatch ship undetected.
#
# Requirements: a running dev server + local Supabase stack, and: bash, curl, jq, psql,
# and sha256sum (or shasum). Self-contained + re-runnable — it provisions its own
# throwaway sensors (unique per run) and item namespace, so it never depends on or
# mutates seed state.
#
#   pnpm db:start && pnpm db:reset && pnpm dev   # (in another shell)
#   pnpm e2e:ingest                              # or: bash scripts/e2e-ingest-matrix.sh
#
# Overridable via env: BASE_URL (default http://127.0.0.1:3000),
# DB_URL (default postgresql://postgres:postgres@127.0.0.1:54322/postgres).

set -uo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
INGEST="$BASE_URL/api/ingest"

# Unique per run so the matrix is idempotent across re-runs (dedup keys on linkedin_post_id).
RUN="${RUN:-$(date +%s)-$$}"
NS="urn:li:activity:fsc122-$RUN"
CAP="2026-07-09T12:00:00.000Z" # captured_at used across posted_at assertions

PASS=0
FAIL=0

# --------------------------------------------------------------------------- helpers
sha256hex() {
  if command -v sha256sum >/dev/null 2>&1; then
    printf '%s' "$1" | sha256sum | awk '{print $1}'
  else
    printf '%s' "$1" | shasum -a 256 | awk '{print $1}'
  fi
}

psql_do() { psql "$DB_URL" -v ON_ERROR_STOP=1 -tAX -c "$1"; }

BODY=""
STATUS=""
# req METHOD URL [curl args...] -> sets $STATUS (http code, 000 on connect failure) + $BODY
req() {
  local method="$1" url="$2"
  shift 2
  local out
  out="$(mktemp)"
  STATUS="$(curl -sS -o "$out" -w '%{http_code}' -X "$method" "$url" "$@" 2>/dev/null)"
  STATUS="${STATUS:-000}"
  BODY="$(cat "$out")"
  rm -f "$out"
}

# ingest TOKEN PAYLOAD -> POST a valid-content-type authorized request
ingest() {
  req POST "$INGEST" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $1" \
    --data "$2"
}

# JSON builders (jq keeps quoting sane).
post() { jq -cn --arg id "$1" --arg cap "$CAP" \
  '{linkedin_post_id:$id, url:("https://www.linkedin.com/feed/update/"+$id), author_name:"Jean Dupont", captured_at:$cap}'; }
batch() { jq -cn --argjson p "$1" '{version:1, posts:[$p]}'; }

pass() { PASS=$((PASS + 1)); }
fail() {
  FAIL=$((FAIL + 1))
  printf '  \033[31m✗ FAIL\033[0m %s\n     status=%s body=%s\n' "$1" "$STATUS" "$BODY"
}

assert_status() { # EXPECTED LABEL
  if [ "$STATUS" = "$1" ]; then pass; else fail "$2 — expected HTTP $1, got $STATUS"; fi
}
assert_json() { # JQFILTER EXPECTED LABEL  (compares jq -r output of $BODY)
  local got
  got="$(printf '%s' "$BODY" | jq -r "$1" 2>/dev/null)"
  if [ "$got" = "$2" ]; then pass; else fail "$3 — jq '$1' expected [$2] got [$got]"; fi
}
assert_db() { # SQL EXPECTED LABEL
  local got
  got="$(psql_do "$1" 2>/dev/null)"
  if [ "$got" = "$2" ]; then pass; else fail "$3 — sql expected [$2] got [$got]"; fi
}
bad422() { # PAYLOAD LABEL
  ingest "$TOK_A" "$1"
  assert_status 422 "$2"
}

# --------------------------------------------------------------------------- preflight
for bin in curl jq psql; do
  command -v "$bin" >/dev/null 2>&1 || {
    echo "e2e-ingest-matrix: missing required tool: $bin" >&2
    exit 2
  }
done
req GET "$INGEST"
[ "$STATUS" = "000" ] && {
  echo "e2e-ingest-matrix: dev server not reachable at $BASE_URL — start it with 'pnpm dev'" >&2
  exit 2
}
psql_do "select 1" >/dev/null 2>&1 || {
  echo "e2e-ingest-matrix: DB not reachable at $DB_URL — start it with 'pnpm db:start'" >&2
  exit 2
}

# --------------------------------------------------------------------------- fixtures
# Throwaway sensors (unique emails/tokens per run). A/B active+consented, C unconsented,
# D inactive. token_hash = sha256_hex(raw token), matching hashSensorToken().
TOK_A="fsc122-A-$RUN"
TOK_B="fsc122-B-$RUN"
TOK_C="fsc122-C-$RUN"
TOK_D="fsc122-D-$RUN"

cleanup() {
  psql_do "delete from sensors where email like 'fsc122-%-$RUN@e2e.test'" >/dev/null 2>&1 || true
  psql_do "delete from items where linkedin_post_id like '${NS}-%'" >/dev/null 2>&1 || true
}
trap cleanup EXIT

mksensor() { # NAME ACTIVE CONSENT_SQL RAW -> prints the new sensor id
  # Wrap the INSERT in a CTE and SELECT the id, so psql emits ONLY the uuid (a bare
  # `INSERT ... RETURNING` also prints the "INSERT 0 1" command tag, which corrupts the id).
  psql_do "with ins as (
             insert into sensors (id, name, email, token_hash, active, consented_at)
             values (gen_random_uuid(), '$1', '$1-$RUN@e2e.test', '$(sha256hex "$4")', $2, $3)
             returning id
           ) select id from ins"
}
SENSOR_A_ID="$(mksensor fsc122-A true now\(\) "$TOK_A")"
mksensor fsc122-B true now\(\) "$TOK_B" >/dev/null
mksensor fsc122-C true null "$TOK_C" >/dev/null
mksensor fsc122-D false now\(\) "$TOK_D" >/dev/null

VALID="$(batch "$(post "$NS-valid")")" # a valid batch, for auth/content-type branches

echo "e2e-ingest-matrix: run $RUN against $BASE_URL"

# ============================================================ A. Auth → uniform 401
req POST "$INGEST" -H 'Content-Type: application/json' --data "$VALID"
assert_status 401 "A1 missing Authorization header"
assert_json '.error.code' unauthorized "A1 code=unauthorized"
req POST "$INGEST" -H 'Content-Type: application/json' -H "Authorization: Token $TOK_A" --data "$VALID"
assert_status 401 "A2 wrong auth scheme"
req POST "$INGEST" -H 'Content-Type: application/json' -H 'Authorization: Bearer' --data "$VALID"
assert_status 401 "A3 Bearer with no token"
req POST "$INGEST" -H 'Content-Type: application/json' -H 'Authorization: Bearer a b' --data "$VALID"
assert_status 401 "A4 Bearer with internal whitespace"
ingest "unknown-token-$RUN" "$VALID"
assert_status 401 "A5 unknown token"
ingest "$TOK_D" "$VALID"
assert_status 401 "A6 inactive sensor"
ingest "$TOK_C" "$VALID"
assert_status 401 "A7 unconsented sensor"
# Reason not leaked: unknown/inactive/no-consent all return the SAME generic message.
assert_json '.error.message' "Invalid sensor credentials" "A8 401 reason not disclosed"

# ============================================================ B. 415 unsupported media type
req POST "$INGEST" -H "Authorization: Bearer $TOK_A" --data "$VALID"
assert_status 415 "B1 no Content-Type"
assert_json '.error.code' unsupported_media_type "B1 code"
req POST "$INGEST" -H 'Content-Type: text/plain' -H "Authorization: Bearer $TOK_A" --data "$VALID"
assert_status 415 "B2 text/plain"
req POST "$INGEST" -H 'Content-Type: application/jsonp' -H "Authorization: Bearer $TOK_A" --data "$VALID"
assert_status 415 "B3 application/jsonp substring trap"
req POST "$INGEST" -H 'Content-Type: application/json; charset=utf-8' -H "Authorization: Bearer $TOK_A" --data "$(batch "$(post "$NS-charset")")"
assert_status 200 "B4 application/json; charset=utf-8 accepted"

# ============================================================ C. 413 payload too large
# Build a ~600 KB body in a FILE and send it with --data-binary @file. Passing it as a
# curl argument breaks on Linux (a single arg is capped at MAX_ARG_STRLEN, 128 KB), which
# truncates the body to invalid JSON (400) instead of exercising the size cap (413).
BIGFILE="$(mktemp)"
{
  printf '{"version":1,"posts":[{"linkedin_post_id":"%s-big","url":"https://x/big","author_name":"J","captured_at":"%s","text":"' "$NS" "$CAP"
  head -c 600000 /dev/zero | tr '\0' x
  printf '"}]}'
} >"$BIGFILE"
req POST "$INGEST" -H 'Content-Type: application/json' -H "Authorization: Bearer $TOK_A" --data-binary @"$BIGFILE"
rm -f "$BIGFILE"
assert_status 413 "C1 body over 512 KB"
assert_json '.error.code' payload_too_large "C1 code"

# ============================================================ D. 400 invalid JSON
req POST "$INGEST" -H 'Content-Type: application/json' -H "Authorization: Bearer $TOK_A" --data '{not valid json'
assert_status 400 "D1 malformed JSON body"
assert_json '.error.code' invalid_json "D1 code"

# ============================================================ E. 422 invalid payload
bad422 "$(jq -cn --argjson p "$(post "$NS-v2")" '{version:2, posts:[$p]}')" "E1 wrong version"
assert_json '.error.code' invalid_payload "E1 code=invalid_payload"
assert_json '(.error.issues | length) > 0' true "E1 issues[] present"
bad422 "$(jq -cn --argjson p "$(post "$NS-nover")" '{posts:[$p]}')" "E2 missing version"
bad422 '{"version":1,"posts":[]}' "E3 empty posts array"
bad422 "$(jq -cn --argjson p "$(post "$NS-over")" '{version:1, posts:[range(0;51) | $p]}')" "E4 over BATCH_MAX (51)"
bad422 "$(batch "$(post "$NS-tk")" | jq -c '. + {extra:1}')" "E5 unknown top-level key (strict)"
bad422 "$(batch "$(post "$NS-pk" | jq -c '. + {smuggled:"x"}')")" "E6 unknown post key (strict)"
bad422 "$(batch "$(post "$NS-sd" | jq -c '. + {seen_count:1}')")" "E7 server-derived key rejected"
bad422 "$(batch "$(post "$NS-at" | jq -c '. + {author_type:"robot"}')")" "E8 bad author_type enum"
bad422 "$(batch "$(post "$NS-pt" | jq -c '. + {post_type:"reel"}')")" "E9 bad post_type enum"
bad422 "$(batch "$(post "$NS-ad" | jq -c '. + {author_degree:"fourth"}')")" "E10 bad author_degree enum"
bad422 "$(batch "$(post "$NS-js" | jq -c '. + {url:"javascript:alert(1)"}')")" "E11 javascript: url (XSS guard)"
# The exact wire-format regression this ticket exists for: issues[].path is a DOT-JOINED STRING.
assert_json '.error.issues[0].path' "posts.0.url" "E11 issues[].path is dot-joined string"
bad422 "$(batch "$(post "$NS-ftp" | jq -c '. + {url:"ftp://example.com"}')")" "E12 ftp: url"
bad422 "$(batch "$(post "$NS-mu" | jq -c '. + {url:"not-a-url"}')")" "E13 malformed url"
bad422 "$(batch "$(post "$NS-nu" | jq -c 'del(.url)')")" "E14 missing required url"
bad422 "$(batch "$(post "$NS-nid" | jq -c 'del(.linkedin_post_id)')")" "E15 missing linkedin_post_id"
bad422 "$(batch "$(post "$NS-nan" | jq -c 'del(.author_name)')")" "E16 missing author_name"
bad422 "$(batch "$(post "$NS-nca" | jq -c 'del(.captured_at)')")" "E17 missing captured_at"
bad422 "$(batch "$(post "$NS-ws" | jq -c '. + {author_name:"   "}')")" "E18 whitespace-only author_name"
bad422 "$(batch "$(post "$NS-do" | jq -c '. + {captured_at:"2026-07-09"}')")" "E19 date-only captured_at"
bad422 "$(batch "$(post "$NS-bd" | jq -c '. + {captured_at:"not-a-date"}')")" "E20 unparseable captured_at"
bad422 "$(batch "$(post "$NS-rp" | jq -c '. + {is_repost:true}')")" "E21 repost without original_author_name"
assert_json '.error.issues[0].path' "posts.0.original_author_name" "E21 repost issue path"
bad422 "$(batch "$(post "$NS-rn" | jq -c '. + {reaction_count:-1}')")" "E22 negative reaction_count"
bad422 "$(batch "$(post "$NS-ri" | jq -c '. + {reaction_count:1.5}')")" "E23 non-integer reaction_count"
# FSC-119: an over-int4 count must give a clean 422 here, NOT a silent per-post DB drop.
bad422 "$(batch "$(post "$NS-ov" | jq -c '. + {reaction_count:3000000000}')")" "E24 over-int4 reaction_count (FSC-119)"
bad422 "$(batch "$(post "$NS-cn" | jq -c '. + {comment_count:-5}')")" "E25 negative comment_count"
bad422 "$(batch "$(post "$NS-co" | jq -c '. + {comment_count:3000000000}')")" "E26 over-int4 comment_count (FSC-119)"
bad422 "$(batch "$(post "$NS-ht" | jq -c '.hashtags = ([range(0;65) | tostring])')")" "E27 hashtags over cap (65)"

# ============================================================ F. 200 happy path
ingest "$TOK_A" "$(batch "$(post "$NS-h1")")"
assert_status 200 "F1 minimal valid post"
assert_json '.received' 1 "F1 received=1"
assert_json '.new_items' 1 "F1 new_items=1"
assert_json 'has("failed")' false "F1 no failed key on a clean batch"
FULL="$(post "$NS-full" | jq -c '. + {author_company:"Acme", author_title:"CIO", post_type:"article", hashtags:["servicenow","pmo"], reaction_count:128, comment_count:24, posted_at_raw:"2h", author_degree:"second", social_proof:"Camille connait Jean"}')"
ingest "$TOK_A" "$(batch "$FULL")"
assert_status 200 "F2 fully-populated post"
ingest "$TOK_A" "$(batch "$(post "$NS-blank" | jq -c '. + {author_company:"   "}')")"
assert_status 200 "F3 blank optional accepted"
assert_db "select coalesce(author_company,'<null>') from items where linkedin_post_id='$NS-blank'" "<null>" "F3 blank optional stored NULL"
ingest "$TOK_A" "$(jq -cn --argjson a "$(post "$NS-m1")" --argjson b "$(post "$NS-m2")" --argjson c "$(post "$NS-m3")" '{version:1, posts:[$a,$b,$c]}')"
assert_status 200 "F4 batch of 3 distinct posts"
assert_json '.new_items' 3 "F4 new_items=3"

# ============================================================ G. Idempotency (same sensor)
ingest "$TOK_A" "$(batch "$(post "$NS-h1")")"
assert_status 200 "G1 resend same post"
assert_json '.new_items' 0 "G1 new_items=0 on resend"
assert_json '.known_items' 1 "G1 known_items=1 on resend"
assert_db "select seen_count from items where linkedin_post_id='$NS-h1'" 1 "G2 seen_count unchanged by same-sensor resend"
ingest "$TOK_A" "$(batch "$(post "$NS-h1" | jq -c '. + {reaction_count:500}')")"
assert_status 200 "G3 resend with higher reaction_count"
assert_db "select reaction_count from items where linkedin_post_id='$NS-h1'" 500 "G3 reaction_count raised (greatest-wins)"
ingest "$TOK_A" "$(batch "$(post "$NS-h1" | jq -c '. + {reaction_count:5}')")"
assert_status 200 "G4 resend with lower reaction_count"
assert_db "select reaction_count from items where linkedin_post_id='$NS-h1'" 500 "G4 reaction_count not regressed"

# ============================================================ H. Second sensor bumps seen_count
ingest "$TOK_B" "$(batch "$(post "$NS-h1")")"
assert_status 200 "H1 second sensor reports the same item"
assert_json '.known_items' 1 "H1 known_items=1 (item already existed)"
assert_db "select seen_count from items where linkedin_post_id='$NS-h1'" 2 "H2 seen_count=2 (two distinct sensors)"

# ============================================================ I. Per-post isolation (failed[])
# A Zod-valid post can no longer reach the DB savepoint over HTTP (Zod mirrors the DB
# constraints — that is the point of FSC-119). Exercise the RPC's per-post isolation
# directly: a repost with no original author violates the DB CHECK (23514) and must
# isolate into failed[] while the good sibling still commits.
ISO="$(jq -cn --arg ns "$NS" --arg cap "$CAP" '[
  {item:{linkedin_post_id:($ns+"-iso-good"),author_name:"G",url:"https://x/g",is_repost:false,captured_at:$cap,author_type:"person",post_type:"text",reaction_count:0,comment_count:0,hashtags:[]},source:{author_degree:"none"}},
  {item:{linkedin_post_id:($ns+"-iso-bad"),author_name:"B",url:"https://x/b",is_repost:true,original_author_name:null,captured_at:$cap,author_type:"person",post_type:"text",reaction_count:0,comment_count:0,hashtags:[]},source:{author_degree:"none"}}
]')"
ISO_RES="$(psql_do "select ingest_posts('$SENSOR_A_ID'::uuid, \$json\$${ISO}\$json\$::jsonb)")"
if printf '%s' "$ISO_RES" | jq -e --arg id "$NS-iso-bad" '.new_items==1 and (.failed|length)==1 and .failed[0].linkedin_post_id==$id and .failed[0].error=="23514"' >/dev/null 2>&1; then pass; else FAIL=$((FAIL + 1)); printf '  \033[31m✗ FAIL\033[0m I1 per-post isolation shape — got %s\n' "$ISO_RES"; fi
assert_db "select count(*) from items where linkedin_post_id='$NS-iso-good'" 1 "I2 good post committed"
assert_db "select count(*) from items where linkedin_post_id='$NS-iso-bad'" 0 "I3 bad post rolled back"

# ============================================================ J. posted_at derivation
ingest "$TOK_A" "$(batch "$(post "$NS-pa2h" | jq -c '. + {posted_at_raw:"2h"}')")"
assert_status 200 "J1 ingest posted_at_raw=2h"
assert_db "select to_char(posted_at at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS') from items where linkedin_post_id='$NS-pa2h'" "2026-07-09T10:00:00" "J1 posted_at = captured - 2h"
ingest "$TOK_A" "$(batch "$(post "$NS-pa1d" | jq -c '. + {posted_at_raw:"1d"}')")"
assert_status 200 "J2 ingest posted_at_raw=1d"
assert_db "select to_char(posted_at at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS') from items where linkedin_post_id='$NS-pa1d'" "2026-07-08T12:00:00" "J2 posted_at = captured - 1d"
ingest "$TOK_A" "$(batch "$(post "$NS-pag" | jq -c '. + {posted_at_raw:"garbage"}')")"
assert_status 200 "J3 ingest unrecognized posted_at_raw"
assert_db "select coalesce(posted_at::text,'<null>') from items where linkedin_post_id='$NS-pag'" "<null>" "J3 posted_at NULL for unrecognized raw"

# ============================================================ K. Reposts stored verbatim
RP="$(post "$NS-rep" | jq -c '. + {author_name:"Lea Resharer", is_repost:true, original_author_name:"Antoine Decision", original_author_profile_url:"https://www.linkedin.com/in/antoine"}')"
ingest "$TOK_A" "$(batch "$RP")"
assert_status 200 "K1 repost accepted"
assert_db "select author_name from items where linkedin_post_id='$NS-rep'" "Lea Resharer" "K2 author_name = resharer (not swapped)"
assert_db "select original_author_name from items where linkedin_post_id='$NS-rep'" "Antoine Decision" "K3 original_author_name stored"
assert_db "select original_author_profile_url from items where linkedin_post_id='$NS-rep'" "https://www.linkedin.com/in/antoine" "K4 original_author_profile_url verbatim"

# --------------------------------------------------------------------------- summary
echo ""
TOTAL=$((PASS + FAIL))
if [ "$FAIL" -eq 0 ]; then
  printf '\033[32me2e-ingest-matrix: %d/%d assertions passed\033[0m\n' "$PASS" "$TOTAL"
else
  printf '\033[31me2e-ingest-matrix: %d/%d passed, %d FAILED\033[0m\n' "$PASS" "$TOTAL" "$FAIL"
  exit 1
fi
