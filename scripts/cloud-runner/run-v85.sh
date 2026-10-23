#!/usr/bin/env bash
# Cloud runner for the V85 discovery engine (Linux only).
# EXECUTION IS DISABLED BY DEFAULT; setting MAVURI_CLOUD_LIVE_ENABLED intentionally
# is required because V85 Shopee/Magalu/coupons may publish even with AUTO_INGEST=false.
set -euo pipefail
umask 077
DIR="/var/lib/mavuri"
NODE_BIN="${MAVURI_NODE_BIN:-/usr/bin/node}"
V85="${MAVURI_DISCOVERY_SCRIPT:-/opt/mavuri/affiliate-engine/private/browser-discovery-v85.cloud.mjs}"
PREFLIGHT="${MAVURI_PREFLIGHT_SCRIPT:-/opt/mavuri/affiliate-engine/scripts/cloud-runner/validate-v85.mjs}"
LOCK="${MAVURI_CLOUD_LOCK_FILE:-$DIR/discovery-v85.lock}"
if [[ "${MAVURI_CLOUD_LIVE_ENABLED:-}" != "YES_EXCLUSIVE_CLOUD_EXECUTOR" ]]; then
  echo "[Mavuri] cloud runner bloqueado: cutover não habilitado."
  exit 78
fi
if [[ "${MAVURI_CLOUD_WINDOWS_STOPPED:-}" != "CONFIRMED" ]]; then
  echo "[Mavuri] cloud runner bloqueado: ausência de confirmação do Windows parado."
  exit 78
fi
export MAVURI_DISCOVERY_SCRIPT="$V85"
"$NODE_BIN" "$PREFLIGHT" --live
# Prevent overlaps in this VM; distributed Windows/cloud exclusivity is checked
# by preflight/cutover externally, not guaranteed by this local file lock.
exec /usr/bin/flock -n -E 75 "$LOCK" "$NODE_BIN" "$V85"
