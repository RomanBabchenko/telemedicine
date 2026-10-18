#!/usr/bin/env bash
# LiveKit video-call stress test — find how many concurrent calls the box holds.
#
# Usage:
#   ./scripts/livekit-stress.sh probe                # ONE 20s call in foreground, full lk output
#   ./scripts/livekit-stress.sh ramp                 # interactive: SPACE = +1 call
#   ./scripts/livekit-stress.sh add [n]              # start n calls, hold until Ctrl-C
#   ./scripts/livekit-stress.sh step <n> <every>     # auto-ramp: +1 call every <every>s up to n
#   ./scripts/livekit-stress.sh clean                # delete leftover stress-* rooms
#   LK_URL=wss://livekit.medview.com.ua ./scripts/livekit-stress.sh ramp
#
# What one "call" is:
#   One LiveKit room carrying the media of a two-way doctor<->patient
#   consultation. A real call makes the SFU do two things: INGEST 2 video +
#   2 audio tracks, and FORWARD each side's tracks to the other side (2 video
#   + 2 audio out). `lk load-test` publishers do NOT subscribe to anything
#   (verified in pkg/loadtester/loadtest.go: expectedTracks = 0), so
#   publishers alone would only exercise ingest. Each call therefore gets:
#     --video-publishers 2   2 simulated simulcast video tracks in
#     --audio-publishers 2   2 simulated Opus tracks in
#     --subscribers 2        2 clients each receiving ALL 4 tracks
#   = 4 tracks ingested, 8 track-subscriptions forwarded. A real 1:1 call is
#   4 in / 4 out, so this is deliberately a bit HEAVIER than a real call
#   (extra 2 low-layer video + 2 audio subscriptions) — the ceiling you find
#   is conservative, which is the right direction for capacity planning.
#
#   NOTE on participant counts: lk uses a separate client per role, so one
#   call = 6 LiveKit participants, not 2. Compare Grafana on TRACKS and on
#   this script's calls counter, not on livekit_participant_total.
#
# Load is produced by the official LiveKit CLI (`lk load-test`), which runs
# real WebRTC clients publishing synthetic VP8 + Opus. Install it once:
#   Linux:   curl -sSL https://get.livekit.io/cli | bash
#   macOS:   brew install livekit-cli
#   Windows: winget install LiveKit.LiveKitCLI      (Git Bash picks up lk.exe)
#
# ┌─────────────────────────────────────────────────────────────────────────┐
# │ READ BEFORE TRUSTING THE NUMBERS                                        │
# │ The machine running this script both UPLOADS every published track and │
# │ DOWNLOADS every subscription. Measured with res=medium: ~0.8 Mbit/s    │
# │ down per call (2 subs x ~410 kbps) and a similar amount up; res=high   │
# │ is several times more (check the probe's Bitrate column). On a laptop  │
# │ over home internet you saturate your own link/CPU first and end up     │
# │ measuring the laptop, not the server. For a real ceiling run this from │
# │ a throwaway EC2 in the same region (or several, splitting the ramp).   │
# └─────────────────────────────────────────────────────────────────────────┘

set -euo pipefail

#LK_URL="${LK_URL:-ws://localhost:7880}"
LK_URL="${LK_URL:-wss://livekit.medview.com.ua}"
# REQUIRED. The repo's devkey/devsecret are only dev placeholders — on the
# terraform box real keys are generated once at first boot and live only in
# /home/ubuntu/telemedicine/.env (chmod 600). Pull them with:
#   ssh ubuntu@<eip> "grep -E '^LIVEKIT_API_(KEY|SECRET)=' ~/telemedicine/.env"
# then export LK_API_KEY / LK_API_SECRET (or pin them here like API_KEY in
# mis-payment-examples.sh). Local dev: devkey / devsecretdevsecretdevsecretdevsecret.
LK_API_KEY="${LK_API_KEY:-}"
LK_API_SECRET="${LK_API_SECRET:-}"

# high | medium | low — lk's simulcast preset for each published video track.
# The real SPA (web-doctor ConsultationPage / web-patient AppointmentJoinPage,
# publishDefaults.videoSimulcastLayers) publishes VP8 180p@150k / 360p@400k /
# 720p@1.5M, and a desktop peer receives the 720p layer. lk "medium" tops out
# at ~280 kbps (measured), ~5x lighter than that — so "high" is the honest
# default for a ceiling; keep medium only to model phone-sized viewers.
RES="${RES:-high}"
# Video publishers per call (= audio publishers per call). 2 = two-way call.
PER_CALL="${PER_CALL:-2}"
# Subscriber clients per call; each receives every track in the room. This
# is what makes the SFU FORWARD media (publishers alone only ingest).
SUBS="${SUBS:-$PER_CALL}"
# How many calls `r` adds at once in ramp mode.
BURST="${BURST:-5}"
# Room name prefix so you can spot/clean them (`lk room list`).
PREFIX="${PREFIX:-stress}"
# Each load-test client lives this long unless killed first (Go duration).
HOLD="${HOLD:-8h}"
# Per-call lk logs land here and are KEPT after exit for diagnostics.
LOGDIR="${LOGDIR:-/tmp}"

cmd="${1:-help}"

# Windows Git Bash: the installer drops lk.exe; plain `lk` also resolves.
LK_BIN="${LK_BIN:-lk}"

require_creds() {
  if [[ -z "$LK_API_KEY" || -z "$LK_API_SECRET" ]]; then
    echo "ERROR: LK_API_KEY and LK_API_SECRET env vars are required." >&2
    echo "  On the instance they are in ~/telemedicine/.env:" >&2
    echo "    ssh ubuntu@<eip> \"grep -E '^LIVEKIT_API_(KEY|SECRET)=' ~/telemedicine/.env\"" >&2
    echo "  then:" >&2
    echo "    export LK_API_KEY=LK...  LK_API_SECRET=..." >&2
    exit 1
  fi
}

require_lk() {
  if ! command -v "$LK_BIN" >/dev/null 2>&1; then
    echo "ERROR: LiveKit CLI ($LK_BIN) not found in PATH." >&2
    echo "  Linux:   curl -sSL https://get.livekit.io/cli | bash" >&2
    echo "  macOS:   brew install livekit-cli" >&2
    echo "  Windows: winget install LiveKit.LiveKitCLI" >&2
    exit 1
  fi
}

# ─── call bookkeeping ───────────────────────────────────────────────────────
# One background `lk load-test` process per call. PIDS[i] <-> ROOMS[i].
PIDS=()
ROOMS=()
SEQ=0
T0=$(date +%s)

spawn_call() {
  SEQ=$((SEQ + 1))
  local room="${PREFIX}-call-${SEQ}-$(date +%s)"
  # stdout/stderr go to a per-call log so a rejected join (bad key, wrong URL,
  # or the server already shedding clients) is diagnosable after the fact.
  "$LK_BIN" load-test \
    --url "$LK_URL" \
    --api-key "$LK_API_KEY" \
    --api-secret "$LK_API_SECRET" \
    --room "$room" \
    --video-publishers "$PER_CALL" \
    --audio-publishers "$PER_CALL" \
    --subscribers "$SUBS" \
    --video-resolution "$RES" \
    --duration "$HOLD" \
    >"$LOGDIR/${room}.log" 2>&1 &
  PIDS+=("$!")
  ROOMS+=("$room")
}

drop_last_call() {
  local n=${#PIDS[@]}
  [[ $n -eq 0 ]] && return 0
  local i=$((n - 1))
  kill "${PIDS[$i]}" 2>/dev/null || true
  unset 'PIDS[i]' 'ROOMS[i]'
  PIDS=("${PIDS[@]}")
  ROOMS=("${ROOMS[@]}")
}

# Drop entries whose process died on its own (server rejected/shed them) so
# the counter reflects calls that are really alive, and say which ones died.
reap_dead() {
  local alive_p=() alive_r=()
  local i
  for i in "${!PIDS[@]}"; do
    if kill -0 "${PIDS[$i]}" 2>/dev/null; then
      alive_p+=("${PIDS[$i]}"); alive_r+=("${ROOMS[$i]}")
    else
      printf '\n  !! %s died — tail of its log:\n' "${ROOMS[$i]}"
      tail -n 3 "$LOGDIR/${ROOMS[$i]}.log" 2>/dev/null | sed 's/^/     /'
    fi
  done
  PIDS=("${alive_p[@]+"${alive_p[@]}"}")
  ROOMS=("${alive_r[@]+"${alive_r[@]}"}")
}

render() {
  local calls=${#PIDS[@]}
  local tracks_in=$((calls * PER_CALL * 2))
  local fwd=$((calls * PER_CALL * 2 * SUBS))
  local up=$(( $(date +%s) - T0 ))
  printf '\r\033[K  calls: %4d | tracks in: %4d | forwarded: %4d | up %dm%02ds' \
    "$calls" "$tracks_in" "$fwd" $((up / 60)) $((up % 60))
}

teardown() {
  # Disarm all traps first so this body runs exactly once (INT and EXIT
  # would otherwise both fire it), then exit explicitly at the end — a
  # trap handler that merely returns drops you back into the key loop.
  trap - EXIT INT TERM
  printf '\n\n  Tearing down %d call(s)...\n' "${#PIDS[@]}"
  for p in "${PIDS[@]+"${PIDS[@]}"}"; do kill "$p" 2>/dev/null || true; done
  wait 2>/dev/null || true
  # Rooms close themselves via LiveKit's empty-room timeout once the last
  # participant drops; `clean` is there if you want them gone immediately.
  echo "  per-call lk logs kept in: $LOGDIR/${PREFIX}-call-*.log"
  exit 0
}

banner() {
  cat <<EOF

  LiveKit video-call stress test
  ------------------------------
  server    : $LK_URL
  per call  : $PER_CALL video + $PER_CALL audio in, $SUBS subscribers ($((PER_CALL*2+SUBS)) lk clients), res=$RES
EOF
}

case "$cmd" in

  # ─── 0. Probe: one call, foreground, everything lk prints ───────────────
  # Run this FIRST. If the server shows no load during `ramp`, the answer is
  # here: a signaling rejection (bad URL/key, proxy refusing the websocket)
  # or an ICE failure (UDP 50000-50100 unreachable) shows up as errors and a
  # final summary with 0 connected / 0 bytes. A healthy probe ends with a
  # summary listing 2 video + 2 audio publishers and non-zero bytes/bitrate.
  probe)
    require_lk
    require_creds
    banner
    echo "  one call, 20s, foreground"
    echo
    "$LK_BIN" load-test \
      --url "$LK_URL" \
      --api-key "$LK_API_KEY" \
      --api-secret "$LK_API_SECRET" \
      --room "${PREFIX}-probe-$(date +%s)" \
      --video-publishers "$PER_CALL" \
      --audio-publishers "$PER_CALL" \
      --subscribers "$SUBS" \
      --video-resolution "$RES" \
      --duration 20s
    ;;

  # ─── 1. Interactive ramp ────────────────────────────────────────────────
  # The main mode. Keep Grafana open on the other screen; every SPACE adds
  # one more consultation's worth of media. When CPU pins / packet loss /
  # jitter climbs on the dashboards, the current counter is your ceiling.
  ramp)
    require_lk
    require_creds
    trap teardown EXIT INT TERM
    banner
    echo "  SPACE add 1  |  r add $BURST  |  k drop 1  |  q quit"
    echo
    render
    while IFS= read -rsn1 -t 1 key || true; do
      case "${key:-}" in
        ' ') spawn_call ;;
        r)   for _ in $(seq "$BURST"); do spawn_call; done ;;
        k)   drop_last_call ;;
        q)   teardown ;;
      esac
      reap_dead
      render
    done
    ;;

  # ─── 2. Fixed batch ─────────────────────────────────────────────────────
  # Start n calls at once and hold them until Ctrl-C. Use to re-verify a
  # suspected ceiling from `ramp` as a steady-state soak ("can it HOLD 25?").
  add)
    require_lk
    require_creds
    n="${2:-1}"
    trap teardown EXIT INT TERM
    banner
    echo "  starting $n call(s); Ctrl-C to stop"
    echo
    for _ in $(seq "$n"); do spawn_call; done
    while true; do sleep 2; reap_dead; render; done
    ;;

  # ─── 3. Timed auto-ramp ─────────────────────────────────────────────────
  # Hands-free version of ramp: +1 call every <every> seconds up to <n>,
  # then hold. Nice when you want a clean, evenly-stepped graph to screenshot.
  step)
    require_lk
    require_creds
    n="${2:?usage: $0 step <maxCalls> <secondsBetween>}"
    every="${3:?usage: $0 step <maxCalls> <secondsBetween>}"
    trap teardown EXIT INT TERM
    banner
    echo "  +1 call every ${every}s up to $n, then hold; Ctrl-C to stop"
    echo
    for _ in $(seq "$n"); do
      spawn_call; reap_dead; render; sleep "$every"
    done
    while true; do sleep 2; reap_dead; render; done
    ;;

  # ─── 4. Clean up leftover rooms ─────────────────────────────────────────
  # Only needed if a previous run was killed hard and you don't want to wait
  # for LiveKit's empty-room timeout. Best-effort parse of `lk room list`.
  clean)
    require_lk
    require_creds
    "$LK_BIN" room list --url "$LK_URL" --api-key "$LK_API_KEY" --api-secret "$LK_API_SECRET" \
      | awk -v p="$PREFIX-call-" 'index($0, p) { for (i=1;i<=NF;i++) if (index($i, p)==1) print $i }' \
      | while read -r room; do
          echo "  deleting $room"
          "$LK_BIN" room delete --url "$LK_URL" --api-key "$LK_API_KEY" --api-secret "$LK_API_SECRET" "$room" \
            >/dev/null 2>&1 || true
        done
    echo "  done"
    ;;

  help | *)
    cat <<EOF
LiveKit video-call stress test.

Commands:
  probe                      One 20s call in the foreground with full lk output.
                             Run first; diagnoses "no load on the server".
  ramp                       Interactive. SPACE = +1 call, r = +$BURST, k = -1, q = quit.
                             Watch Grafana; the counter when it degrades = ceiling.
  add [n]                    Start n calls (default 1) and hold until Ctrl-C.
  step <n> <every>           +1 call every <every>s up to n, then hold.
  clean                      Delete leftover ${PREFIX}-call-* rooms on the server.

One call = 1 room: $PER_CALL video + $PER_CALL audio tracks ingested, plus $SUBS
subscribers each receiving all of them ($((PER_CALL*2*SUBS)) forwarded subscriptions).
Slightly heavier than a real 1:1 call (4 in / 4 out), so the ceiling is
conservative. lk uses one client per role: LiveKit shows $((PER_CALL*2+SUBS)) participants/call.

Env:
  LK_URL         LiveKit signaling URL   (default: $LK_URL)
  LK_API_KEY     REQUIRED — real key from the box: ~/telemedicine/.env
  LK_API_SECRET  REQUIRED — same file. (devkey/devsecret... only for local dev)
  RES            high|medium|low         (default: $RES)
  PER_CALL       video (=audio) pubs/call (default: $PER_CALL)
  SUBS           subscribers per call    (default: = PER_CALL)
  BURST          calls per 'r' press     (default: $BURST)
  HOLD           max lifetime per client (default: $HOLD)
  PREFIX         room name prefix        (default: $PREFIX)
  LOGDIR         per-call lk logs        (default: $LOGDIR)

Examples:
  export LK_API_KEY=LK0123abcd...  LK_API_SECRET=...
  $0 probe
  $0 ramp
  RES=high $0 ramp
  $0 add 20
  $0 step 40 15
  LK_URL=ws://192.168.88.251:7880 $0 ramp

Generator caveat: this host uploads every published track AND downloads
every subscription (~0.8 Mbit/s each way per call at medium, several times
more at high). From a laptop you hit your own link before the server's —
run from an EC2 in the same region for a real number.
EOF
    ;;
esac
