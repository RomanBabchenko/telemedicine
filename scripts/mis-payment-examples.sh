#!/usr/bin/env bash
# MIS appointment webhook — payment flow examples.
#
# Usage:
#   API_KEY=tmd_live_... ./scripts/mis-payment-examples.sh prepaid
#   API_KEY=tmd_live_... ./scripts/mis-payment-examples.sh prepaid:pay <appointmentId>
#   API_KEY=tmd_live_... ./scripts/mis-payment-examples.sh prepaid:pay-ext <externalAppointmentId>
#   API_KEY=tmd_live_... ./scripts/mis-payment-examples.sh postpaid
#   API_KEY=tmd_live_... ./scripts/mis-payment-examples.sh legacy
#   API_KEY=tmd_live_... ./scripts/mis-payment-examples.sh recording <appointmentId>
#   API_KEY=tmd_live_... ./scripts/mis-payment-examples.sh recording:ext <externalAppointmentId>
#   API_KEY=tmd_live_... ./scripts/mis-payment-examples.sh cancel <appointmentId> [reason]
#   API_KEY=tmd_live_... ./scripts/mis-payment-examples.sh cancel:ext <externalAppointmentId> [reason]
#   API_KEY=tmd_live_... ./scripts/mis-payment-examples.sh revoke <appointmentId> [PATIENT|DOCTOR]
#   API_KEY=tmd_live_... ./scripts/mis-payment-examples.sh revoke:ext <externalAppointmentId> [PATIENT|DOCTOR]
#
# Auth: integration API key issued via the admin UI
# (web-admin → "API ключі" → створити ключ). The key is shown exactly once;
# store it in your shell env as API_KEY before running this script.

set -euo pipefail

API="${API:-http://localhost:3000/api/v1}"
TENANT="${TENANT:-11111111-1111-4111-8111-111111111111}"
API_KEY="${API_KEY:-}"

cmd="${1:-help}"

require_api_key() {
  if [[ -z "$API_KEY" ]]; then
    echo "ERROR: API_KEY env var is required." >&2
    echo "  Generate one in web-admin → API ключі, then:" >&2
    echo "    export API_KEY=tmd_live_..." >&2
    exit 1
  fi
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
      -d '{
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
      }' | jq .
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
      -d '{
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
        "startAt": "2026-04-22T12:00:00Z",
        "endAt": "2026-04-22T12:30:00Z",
        "paymentType": "postpaid",
        "paymentStatus": "unpaid"
      }' | jq .
    ;;

  # ─── 4. Legacy payload — no payment fields ──────────────────────────────
  # Backward-compatible with the original webhook contract. Defaults kick in:
  # paymentType=postpaid, paymentStatus=unpaid → status=CONFIRMED.
  legacy)
    require_api_key
    curl -sS -X POST "$API/integrations/$TENANT/appointments" \
      -H "Authorization: ApiKey $API_KEY" \
      -H 'Content-Type: application/json' \
      -d '{
        "type": "appointment.online",
        "externalAppointmentId": "dd-legacy-001",
        "doctorExternalId": "docdream-doc-77",
        "doctorFirstName": "Анна",
        "doctorLastName": "Коваленко",
        "doctorSpecialization": "Кардіологія",
        "patientExternalId": "dd-patient-legacy-001",
        "patientFirstName": "Дмитро",
        "patientLastName": "Шевченко",
        "patientEmail": "dshevchenko@example.com",
        "patientPhone": "+380509876543",
        "startAt": "2026-04-20T14:00:00Z",
        "endAt": "2026-04-20T14:30:00Z"
      }' | jq .
    ;;

  # ─── 5. Fetch recording after consultation ──────────────────────────────
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

  help | *)
    cat <<EOF
MIS payment flow examples.

Commands:
  prepaid                        Create a prepaid+unpaid appointment (AWAITING_PAYMENT)
  prepaid:pay <id>               Mark prepaid as paid by internal appointmentId
  prepaid:pay-ext <extId>        Mark prepaid as paid by MIS externalAppointmentId
  postpaid                       Create a postpaid appointment (CONFIRMED)
  legacy                         Create without payment fields (defaults to postpaid)
  recording <id>                 Fetch recording by internal appointmentId
  recording:ext <extId>          Fetch recording by MIS externalAppointmentId
  cancel <id> [reason]           Cancel appointment + revoke all invites
  cancel:ext <extId> [reason]    Same, keyed by externalAppointmentId
  revoke <id> [PATIENT|DOCTOR]   Revoke invite link(s) without cancelling appointment
  revoke:ext <extId> [ROLE]      Same, keyed by externalAppointmentId

Env:
  API_KEY  REQUIRED — integration API key (tmd_live_...).
           Generate in web-admin → API ключі.
  API      API base URL   (default: $API)
  TENANT   Tenant UUID    (default: $TENANT)

Examples:
  export API_KEY=tmd_live_abcdef...
  $0 prepaid
  $0 prepaid:pay c6442524-c847-4d28-8d59-a1af5316c3a9
  $0 postpaid
  $0 recording c6442524-c847-4d28-8d59-a1af5316c3a9
  API=http://10.0.0.5:3000/api/v1 $0 postpaid
EOF
    ;;
esac
