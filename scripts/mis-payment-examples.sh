#!/usr/bin/env bash
# MIS appointment webhook — payment flow examples.
#
# Usage:
#   API_KEY=tmd_live_... ./scripts/mis-payment-examples.sh prepaid
#   API_KEY=tmd_live_... ./scripts/mis-payment-examples.sh prepaid:pay <appointmentId>
#   API_KEY=tmd_live_... ./scripts/mis-payment-examples.sh prepaid:pay-ext <externalAppointmentId>
#   API_KEY=tmd_live_... ./scripts/mis-payment-examples.sh postpaid
#   API_KEY=tmd_live_... ./scripts/mis-payment-examples.sh anon
#   API_KEY=tmd_live_... ./scripts/mis-payment-examples.sh anon:prepaid
#   API_KEY=tmd_live_... ./scripts/mis-payment-examples.sh anon:now
#   API_KEY=tmd_live_... ./scripts/mis-payment-examples.sh recording <appointmentId>
#   API_KEY=tmd_live_... ./scripts/mis-payment-examples.sh recording:ext <externalAppointmentId>
#   API_KEY=tmd_live_... ./scripts/mis-payment-examples.sh info <appointmentId>
#   API_KEY=tmd_live_... ./scripts/mis-payment-examples.sh info:ext <externalAppointmentId>
#   API_KEY=tmd_live_... ./scripts/mis-payment-examples.sh cancel <appointmentId> [reason]
#   API_KEY=tmd_live_... ./scripts/mis-payment-examples.sh cancel:ext <externalAppointmentId> [reason]
#   API_KEY=tmd_live_... ./scripts/mis-payment-examples.sh reschedule <appointmentId> <startAt> <endAt> [reason]
#   API_KEY=tmd_live_... ./scripts/mis-payment-examples.sh reschedule:ext <externalAppointmentId> <startAt> <endAt> [reason]
#   API_KEY=tmd_live_... ./scripts/mis-payment-examples.sh reschedule:now <appointmentId>
#   API_KEY=tmd_live_... ./scripts/mis-payment-examples.sh revoke <appointmentId> [PATIENT|DOCTOR]
#   API_KEY=tmd_live_... ./scripts/mis-payment-examples.sh revoke:ext <externalAppointmentId> [PATIENT|DOCTOR]
#
# Document upload (patient → MIS hub) testing:
#   ./scripts/mis-payment-examples.sh upload-server [port]               # mock MIS hub on :4100
#   UPLOAD_URL=http://localhost:4100 API_KEY=... ./scripts/mis-payment-examples.sh anon:now
#   PATIENT_TOKEN=... ./scripts/mis-payment-examples.sh upload <appointmentId> <file>
#   UPLOAD_URL=http://localhost:4100 ./scripts/mis-payment-examples.sh uploads
#
# Auth: integration API key issued via the admin UI
# (web-admin → "API ключі" → створити ключ). The key is shown exactly once;
# store it in your shell env as API_KEY before running this script.

set -euo pipefail

API="${API:-http://localhost:3000/api/v1}"
TENANT="${TENANT:-22222222-2222-4222-8222-222222222222}"
API_KEY="${API_KEY:-}"

# Document-upload testing. When UPLOAD_URL is set, every create command adds
#   documentUploadUrl = $UPLOAD_URL/upload/<externalAppointmentId>
# so the stored link points at the mock hub (`upload-server`). The API must
# run with MIS_UPLOAD_ALLOW_INSECURE=true to post to a plain-http/localhost URL.
UPLOAD_URL="${UPLOAD_URL:-}"
# Patient access token (Bearer) for the `upload` command. Open the invite link
# in the patient app, then copy tokens.accessToken from localStorage key
# `telemed-patient-auth` (DevTools → Application → Local Storage).
PATIENT_TOKEN="${PATIENT_TOKEN:-}"
UPLOAD_SERVER_PORT="${UPLOAD_SERVER_PORT:-4100}"

cmd="${1:-help}"

require_api_key() {
  if [[ -z "$API_KEY" ]]; then
    echo "ERROR: API_KEY env var is required." >&2
    echo "  Generate one in web-admin → API ключі, then:" >&2
    echo "    export API_KEY=tmd_live_..." >&2
    exit 1
  fi
}

require_patient_token() {
  if [[ -z "$PATIENT_TOKEN" ]]; then
    echo "ERROR: PATIENT_TOKEN env var is required (patient Bearer token)." >&2
    echo "  Open the patientInviteUrl in the patient app, then copy" >&2
    echo "  tokens.accessToken from localStorage['telemed-patient-auth']:" >&2
    echo "    export PATIENT_TOKEN=eyJ..." >&2
    exit 1
  fi
}

require_node() {
  if ! command -v node >/dev/null 2>&1; then
    echo "ERROR: node is required for the mock upload server (https://nodejs.org, >= 18)." >&2
    exit 1
  fi
}

require_upload_url() {
  if [[ -z "$UPLOAD_URL" ]]; then
    echo "ERROR: UPLOAD_URL env var is required (e.g. http://localhost:4100)." >&2
    exit 1
  fi
}

# Appends documentUploadUrl to a create payload when UPLOAD_URL is set. The
# path ends with the externalAppointmentId so the mock hub can tell
# appointments apart. Usage:  -d "$(with_upload_url '<json>' <extId>)"
with_upload_url() {
  local payload="$1" ext_id="$2"
  if [[ -z "$UPLOAD_URL" ]]; then
    printf '%s' "$payload"
    return
  fi
  printf '%s' "$payload" | jq --arg u "${UPLOAD_URL%/}/upload/$ext_id" '. + {documentUploadUrl: $u}'
}

case "$cmd" in

  # ─── 1. Prepaid + unpaid ────────────────────────────────────────────────
  # Appointment is created with status=AWAITING_PAYMENT. The patient sees
  # "Оплату не завершено" and cannot join the video session.
  prepaid)
    require_api_key
    curl -sS -X POST "$API/integrations/$TENANT/appointments" \
      -H "Authorization: ApiKey $API_KEY" \
      -H 'Content-Type: application/json' \
      -d "$(with_upload_url '{
        "type": "appointment.online",
        "externalAppointmentId": "dd-prepaid-001",
        "doctorExternalId": "docdream-doc-77",
        "doctorFirstName": "Анна",
        "doctorLastName": "Коваленко",
        "doctorSpecialization": "Кардіологія",
        "patientExternalId": "dd-patient-prepaid-001",
        "patientFirstName": "Дмитро",
        "patientLastName": "Шевченко",
        "patientEmail": "dshevchenko@example.com",
        "patientPhone": "+380509876543",
        "startAt": "2026-04-20T10:00:00Z",
        "endAt": "2026-04-20T10:30:00Z",
        "paymentType": "prepaid",
        "paymentStatus": "unpaid"
      }' dd-prepaid-001)" | jq .
    ;;

  # ─── 2. Clinic confirms payment ─────────────────────────────────────────
  # Flips misPaymentStatus to 'paid' and transitions the appointment
  # AWAITING_PAYMENT → CONFIRMED. Within ~15 s the patient UI picks this up
  # and unlocks the "Підключитись" button.
  prepaid:pay)
    require_api_key
    appt_id="${2:?usage: $0 prepaid:pay <appointmentId>}"
    curl -sS -X PATCH "$API/integrations/$TENANT/appointments/$appt_id/payment-status" \
      -H "Authorization: ApiKey $API_KEY" \
      -H 'Content-Type: application/json' \
      -d '{"paymentStatus": "paid"}' | jq .
    ;;

  # Same as prepaid:pay but by the MIS's own externalAppointmentId — useful
  # when DocDream didn't persist our internal appointmentId. The connector is
  # resolved from the API key.
  prepaid:pay-ext)
    require_api_key
    ext_id="${2:?usage: $0 prepaid:pay-ext <externalAppointmentId>}"
    curl -sS -X PATCH \
      "$API/integrations/$TENANT/appointments/by-external/$ext_id/payment-status" \
      -H "Authorization: ApiKey $API_KEY" \
      -H 'Content-Type: application/json' \
      -d '{"paymentStatus": "paid"}' | jq .
    ;;

  # ─── 3. Postpaid ────────────────────────────────────────────────────────
  # Patient pays at the clinic after the consultation. Appointment is created
  # as CONFIRMED — video joining is unblocked immediately.
  postpaid)
    require_api_key
    curl -sS -X POST "$API/integrations/$TENANT/appointments" \
      -H "Authorization: ApiKey $API_KEY" \
      -H 'Content-Type: application/json' \
      -d "$(with_upload_url '{
        "type": "appointment.online",
        "externalAppointmentId": "dd-postpaid-009",
        "doctorExternalId": "docdream-doc-77",
        "doctorFirstName": "Анна",
        "doctorLastName": "Коваленко",
        "doctorSpecialization": "Кардіологія",
        "patientExternalId": "dd-patient-postpaid-001",
        "patientFirstName": "Дмитро",
        "patientLastName": "Шевченко",
        "patientEmail": "dshevchenko@example.com",
        "patientPhone": "+380509876543",
        "startAt": "2026-05-10T12:00:00Z",
        "endAt": "2026-05-10T12:30:00Z",
        "paymentType": "postpaid",
        "paymentStatus": "unpaid"
      }' dd-postpaid-009)" | jq .
    ;;

  # ─── 4. Anonymous patient (postpaid, CONFIRMED) ─────────────────────────
  # MIS refuses to share any patient PII. No User / Patient row is created on
  # our side; patient_id stays NULL and the patient invite resolves to a
  # scope='invite-anon' JWT. The MIS delivers the returned patientInviteUrl
  # to the patient itself (we never see their email/phone).
  #
  # All patient* fields are ignored when isAnonymousPatient=true — included
  # here only to prove the server logs a warning and discards them.
  anon)
    require_api_key
    curl -sS -X POST "$API/integrations/$TENANT/appointments" \
      -H "Authorization: ApiKey $API_KEY" \
      -H 'Content-Type: application/json' \
      -d "$(with_upload_url '{
        "type": "appointment.online",
        "externalAppointmentId": "dd-anon-0014",
        "doctorExternalId": "docdream-doc-77",
        "doctorFirstName": "Анна",
        "doctorLastName": "Коваленко",
        "doctorSpecialization": "Кардіологія",
        "startAt": "2026-05-01T20:00:00+03:00",
        "endAt": "2026-05-01T20:00:30+03:00",
        "paymentType": "postpaid",
        "paymentStatus": "unpaid",
        "isAnonymousPatient": true
      }' dd-anon-0014)" | jq .
    ;;

  # Anonymous + prepaid. Same prepaid gate as the named flow — patient
  # sees "Оплату не завершено" until the MIS PATCHes payment-status to paid.
  anon:prepaid)
    require_api_key
    curl -sS -X POST "$API/integrations/$TENANT/appointments" \
      -H "Authorization: ApiKey $API_KEY" \
      -H 'Content-Type: application/json' \
      -d "$(with_upload_url '{
        "type": "appointment.online",
        "externalAppointmentId": "dd-anon-prepaid-001",
        "doctorExternalId": "docdream-doc-77",
        "doctorFirstName": "Анна",
        "doctorLastName": "Коваленко",
        "doctorSpecialization": "Кардіологія",
        "startAt": "2026-04-25T11:00:00Z",
        "endAt": "2026-04-25T11:30:00Z",
        "paymentType": "prepaid",
        "paymentStatus": "unpaid",
        "isAnonymousPatient": true
      }' dd-anon-prepaid-001)" | jq .
    ;;

  # Anonymous + live time window — startAt = now, endAt = now + 30 min, so
  # the join gate (opensAt = startAt - 15 min, closesAt = endAt + 30 min) is
  # already open. Use this to smoke-test the full flow end-to-end: open the
  # returned patientInviteUrl and the "Розпочати консультацію" button works
  # immediately instead of showing a "До початку залишилось…" countdown.
  # externalAppointmentId includes a timestamp so repeated runs don't hit the
  # idempotency path and each invocation produces a fresh appointment.
  anon:now)
    require_api_key
    start_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    end_at=$(date -u -d '+30 minutes' +"%Y-%m-%dT%H:%M:%SZ")
    ext_id="dd-anon-now-$(date +%s)"
    payload="$(jq -n \
      --arg ext "$ext_id" \
      --arg start "$start_at" \
      --arg end "$end_at" \
      '{
        type: "appointment.online",
        externalAppointmentId: $ext,
        doctorExternalId: "docdream-doc-77",
        doctorFirstName: "Анна",
        doctorLastName: "Коваленко",
        doctorSpecialization: "Кардіологія",
        startAt: $start,
        endAt: $end,
        paymentType: "postpaid",
        paymentStatus: "unpaid",
        isAnonymousPatient: true
      }')"
    curl -sS -X POST "$API/integrations/$TENANT/appointments" \
      -H "Authorization: ApiKey $API_KEY" \
      -H 'Content-Type: application/json' \
      -d "$(with_upload_url "$payload" "$ext_id")" | jq .
    ;;

  # ─── 6. Fetch recording after consultation ──────────────────────────────
  # Returns { recordingId, status, durationSec, downloadUrl }. When status is
  # STORED, downloadUrl is a presigned MinIO URL valid for ~1 hour — fetch
  # the .mp3 directly from there. While status is RECORDING, downloadUrl is
  # null.
  recording)
    require_api_key
    appt_id="${2:?usage: $0 recording <appointmentId>}"
    curl -sS "$API/integrations/$TENANT/appointments/$appt_id/recording" \
      -H "Authorization: ApiKey $API_KEY" | jq .
    ;;

  # Recording info keyed by the MIS's externalAppointmentId.
  recording:ext)
    require_api_key
    ext_id="${2:?usage: $0 recording:ext <externalAppointmentId>}"
    curl -sS \
      "$API/integrations/$TENANT/appointments/by-external/$ext_id/recording" \
      -H "Authorization: ApiKey $API_KEY" | jq .
    ;;

  # ─── Appointment + consultation status snapshot ────────────────────────
  # Polls for "did the consultation actually happen?". Returns scheduled
  # times, current AppointmentStatus, MIS payment fields, and a
  # `consultation` block (null until first join) with patient/doctorJoinedAt
  # and the actual startedAt/endedAt.
  info)
    require_api_key
    appt_id="${2:?usage: $0 info <appointmentId>}"
    curl -sS "$API/integrations/$TENANT/appointments/$appt_id" \
      -H "Authorization: ApiKey $API_KEY" | jq .
    ;;

  info:ext)
    require_api_key
    ext_id="${2:?usage: $0 info:ext <externalAppointmentId>}"
    curl -sS \
      "$API/integrations/$TENANT/appointments/by-external/$ext_id" \
      -H "Authorization: ApiKey $API_KEY" | jq .
    ;;

  # ─── Cancel appointment (transitions to CANCELLED_BY_PROVIDER) ─────────
  # Also revokes all outstanding invite links for this appointment.
  cancel)
    require_api_key
    appt_id="${2:?usage: $0 cancel <appointmentId> [reason]}"
    reason="${3:-}"
    curl -sS -X POST "$API/integrations/$TENANT/appointments/$appt_id/cancel" \
      -H "Authorization: ApiKey $API_KEY" \
      -H 'Content-Type: application/json' \
      -d "$(jq -n --arg r "$reason" '{reason: ($r | select(length > 0))}')" | jq .
    ;;

  cancel:ext)
    require_api_key
    ext_id="${2:?usage: $0 cancel:ext <externalAppointmentId> [reason]}"
    reason="${3:-}"
    curl -sS -X POST \
      "$API/integrations/$TENANT/appointments/by-external/$ext_id/cancel" \
      -H "Authorization: ApiKey $API_KEY" \
      -H 'Content-Type: application/json' \
      -d "$(jq -n --arg r "$reason" '{reason: ($r | select(length > 0))}')" | jq .
    ;;

  # ─── Reschedule appointment (slot + start/end change, status preserved) ─
  # Existing invite tokens stay valid — their TTL is just pushed to the new
  # endAt + grace. Patient and doctor keep using the same URLs; the next
  # time they hit the join page they see the new time.
  #
  # Allowed only while the appointment is still pre-call (RESERVED,
  # AWAITING_PAYMENT, CONFIRMED). IN_PROGRESS / terminal → 400.
  reschedule)
    require_api_key
    appt_id="${2:?usage: $0 reschedule <appointmentId> <startAt> <endAt> [reason]}"
    start_at="${3:?usage: $0 reschedule <appointmentId> <startAt> <endAt> [reason]}"
    end_at="${4:?usage: $0 reschedule <appointmentId> <startAt> <endAt> [reason]}"
    reason="${5:-}"
    curl -sS -X POST \
      "$API/integrations/$TENANT/appointments/$appt_id/reschedule" \
      -H "Authorization: ApiKey $API_KEY" \
      -H 'Content-Type: application/json' \
      -d "$(jq -n --arg s "$start_at" --arg e "$end_at" --arg r "$reason" \
        '{startAt: $s, endAt: $e} + (if $r != "" then {reason: $r} else {} end)')" | jq .
    ;;

  reschedule:ext)
    require_api_key
    ext_id="${2:?usage: $0 reschedule:ext <externalAppointmentId> <startAt> <endAt> [reason]}"
    start_at="${3:?usage: $0 reschedule:ext <externalAppointmentId> <startAt> <endAt> [reason]}"
    end_at="${4:?usage: $0 reschedule:ext <externalAppointmentId> <startAt> <endAt> [reason]}"
    reason="${5:-}"
    curl -sS -X POST \
      "$API/integrations/$TENANT/appointments/by-external/$ext_id/reschedule" \
      -H "Authorization: ApiKey $API_KEY" \
      -H 'Content-Type: application/json' \
      -d "$(jq -n --arg s "$start_at" --arg e "$end_at" --arg r "$reason" \
        '{startAt: $s, endAt: $e} + (if $r != "" then {reason: $r} else {} end)')" | jq .
    ;;

  # Convenience: push the appointment to a fresh now → now+30min window so the
  # join gate is open immediately (mirrors the anon:now smoke-test pattern).
  # Useful to verify the same invite URL still works after reschedule.
  reschedule:now)
    require_api_key
    appt_id="${2:?usage: $0 reschedule:now <appointmentId>}"
    start_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    end_at=$(date -u -d '+30 minutes' +"%Y-%m-%dT%H:%M:%SZ")
    curl -sS -X POST \
      "$API/integrations/$TENANT/appointments/$appt_id/reschedule" \
      -H "Authorization: ApiKey $API_KEY" \
      -H 'Content-Type: application/json' \
      -d "$(jq -n --arg s "$start_at" --arg e "$end_at" \
        '{startAt: $s, endAt: $e, reason: "manual now-test"}')" | jq .
    ;;

  # ─── Revoke invite links without cancelling the appointment ────────────
  # Use when only the link is compromised. The appointment stays alive;
  # re-POST the original webhook payload to get fresh invite URLs.
  revoke)
    require_api_key
    appt_id="${2:?usage: $0 revoke <appointmentId> [PATIENT|DOCTOR]}"
    role="${3:-}"
    curl -sS -X POST \
      "$API/integrations/$TENANT/appointments/$appt_id/invites/revoke" \
      -H "Authorization: ApiKey $API_KEY" \
      -H 'Content-Type: application/json' \
      -d "$(jq -n --arg r "$role" '{role: ($r | select(length > 0))}')" | jq .
    ;;

  revoke:ext)
    require_api_key
    ext_id="${2:?usage: $0 revoke:ext <externalAppointmentId> [PATIENT|DOCTOR]}"
    role="${3:-}"
    curl -sS -X POST \
      "$API/integrations/$TENANT/appointments/by-external/$ext_id/invites/revoke" \
      -H "Authorization: ApiKey $API_KEY" \
      -H 'Content-Type: application/json' \
      -d "$(jq -n --arg r "$role" '{role: ($r | select(length > 0))}')" | jq .
    ;;

  # ─── Document upload (patient → MIS hub) ───────────────────────────────
  # The MIS sends a per-appointment documentUploadUrl at create time. The
  # patient app posts files to our API (POST /appointments/:id/mis-documents),
  # which relays them as JSON (base64 body) to that URL — nothing is stored on
  # our side. Until the real DocDream hub exists, run the mock below and
  # create appointments with UPLOAD_URL set so the stored link points at it.
  # Start the mock hub (scripts/mock-upload-server.mjs). SAVE_DIR=./tmp/uploads
  # writes the decoded files to disk; FAIL=1 makes every upload answer 500.
  upload-server)
    require_node
    exec node "$(dirname "$0")/mock-upload-server.mjs" "${2:-$UPLOAD_SERVER_PORT}"
    ;;

  # What the mock hub has received so far (metadata only, no base64).
  uploads)
    require_upload_url
    curl -sS "${UPLOAD_URL%/}/uploads" | jq .
    ;;

  # API-level upload without the UI: base64-encode a local file and POST it
  # to the relay endpoint as the patient (Bearer PATIENT_TOKEN). The body is
  # staged in a temp file (jq --rawfile) because ~13 MB of base64 does not fit
  # in a command-line argument.
  upload)
    appt_id="${2:?usage: $0 upload <appointmentId> <file>}"
    file="${3:?usage: $0 upload <appointmentId> <file>}"
    require_patient_token
    [[ -f "$file" ]] || { echo "ERROR: no such file: $file" >&2; exit 1; }
    mime=$(file -b --mime-type "$file" 2>/dev/null || true)
    if [[ -z "$mime" || "$mime" == application/octet-stream ]]; then
      case "${file##*.}" in
        pdf) mime=application/pdf ;;
        jpg | jpeg) mime=image/jpeg ;;
        png) mime=image/png ;;
        webp) mime=image/webp ;;
        heic) mime=image/heic ;;
        heif) mime=image/heif ;;
        *) mime=application/octet-stream ;;
      esac
    fi
    size=$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file")
    b64_file=$(mktemp)
    body_file=$(mktemp)
    trap 'rm -f "$b64_file" "$body_file"' EXIT
    base64 -w0 "$file" > "$b64_file" 2>/dev/null || base64 "$file" | tr -d '\n' > "$b64_file"
    jq -n \
      --arg n "$(basename "$file")" \
      --arg t "$mime" \
      --argjson s "$size" \
      --rawfile c "$b64_file" \
      '{fileName: $n, contentType: $t, sizeBytes: $s, contentBase64: $c}' > "$body_file"
    echo "POST $API/appointments/$appt_id/mis-documents  ($mime, $size bytes)" >&2
    curl -sS -X POST "$API/appointments/$appt_id/mis-documents" \
      -H "Authorization: Bearer $PATIENT_TOKEN" \
      -H 'Content-Type: application/json' \
      --data-binary @"$body_file" | jq .
    ;;

  help | *)
    cat <<EOF
MIS payment flow examples.

Commands:
  prepaid                        Create a prepaid+unpaid appointment (AWAITING_PAYMENT)
  prepaid:pay <id>               Mark prepaid as paid by internal appointmentId
  prepaid:pay-ext <extId>        Mark prepaid as paid by MIS externalAppointmentId
  postpaid                       Create a postpaid appointment (CONFIRMED)
  anon                           Create anonymous-patient appointment (no PII, CONFIRMED)
  anon:prepaid                   Anonymous + prepaid+unpaid (AWAITING_PAYMENT)
  anon:now                       Anonymous + live time window (joinable right now)
  recording <id>                 Fetch recording by internal appointmentId
  recording:ext <extId>          Fetch recording by MIS externalAppointmentId
  info <id>                      Get appointment + consultation snapshot (status, join times)
  info:ext <extId>               Same, keyed by externalAppointmentId
  cancel <id> [reason]           Cancel appointment + revoke all invites
  cancel:ext <extId> [reason]    Same, keyed by externalAppointmentId
  reschedule <id> <startAt> <endAt> [reason]
                                 Move appointment to a new slot/time. Status,
                                 patient_id, and existing invite URLs are
                                 preserved — invite TTL is pushed to new endAt.
  reschedule:ext <extId> <startAt> <endAt> [reason]
                                 Same, keyed by externalAppointmentId
  reschedule:now <id>            Push appointment into a now → now+30min window
                                 (smoke-test the join gate after reschedule)
  revoke <id> [PATIENT|DOCTOR]   Revoke invite link(s) without cancelling appointment
  revoke:ext <extId> [ROLE]      Same, keyed by externalAppointmentId

Document upload (patient → MIS hub):
  upload-server [port]           Start the mock MIS hub (default port $UPLOAD_SERVER_PORT).
                                 SAVE_DIR=dir saves decoded files; FAIL=1 → 500s.
  uploads                        List files the mock hub received (needs UPLOAD_URL)
  upload <id> <file>             POST a local file to our relay endpoint as the
                                 patient (needs PATIENT_TOKEN) — tests the API
                                 path without the UI
  Any create command (prepaid, postpaid, anon, anon:prepaid, anon:now) adds
  documentUploadUrl=\$UPLOAD_URL/upload/<extId> when UPLOAD_URL is set, which
  turns on the «Надіслати документи» button for that appointment.

Env:
  API_KEY        REQUIRED — integration API key (tmd_live_...).
                 Generate in web-admin → API ключі.
  API            API base URL   (default: $API)
  TENANT         Tenant UUID    (default: $TENANT)
  UPLOAD_URL     Mock hub base URL, e.g. http://localhost:4100 (default: unset)
  PATIENT_TOKEN  Patient Bearer token for \`upload\` (default: unset)

Note: the production API on EC2 cannot reach a mock running on your laptop.
Either expose it (\`ngrok http 4100\` / \`cloudflared tunnel --url http://localhost:4100\`)
and pass that https URL as UPLOAD_URL, or run the mock on the API box itself.
Locally the API needs MIS_UPLOAD_ALLOW_INSECURE=true to post to http://localhost.

Examples:
  export API_KEY=tmd_live_abcdef...
  $0 prepaid
  $0 prepaid:pay c6442524-c847-4d28-8d59-a1af5316c3a9
  $0 postpaid
  $0 recording c6442524-c847-4d28-8d59-a1af5316c3a9
  $0 reschedule c6442524-c847-4d28-8d59-a1af5316c3a9 \\
      2026-05-10T14:00:00Z 2026-05-10T14:30:00Z "patient asked"
  $0 reschedule:now c6442524-c847-4d28-8d59-a1af5316c3a9
  API=http://10.0.0.5:3000/api/v1 $0 postpaid

  # document upload, end to end against the mock hub
  $0 upload-server                                   # terminal A
  UPLOAD_URL=http://localhost:4100 $0 anon:now       # terminal B → open patientInviteUrl
  PATIENT_TOKEN=eyJ... $0 upload <appointmentId> ./scan.pdf
  UPLOAD_URL=http://localhost:4100 $0 uploads
EOF
    ;;
esac
