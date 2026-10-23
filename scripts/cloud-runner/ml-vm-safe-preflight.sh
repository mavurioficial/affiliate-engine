#!/usr/bin/env bash
# Mavuri ML host assessment — NO CREDENTIALS, NO LOGIN, NO AUTOMATION.
# Execute on a candidate Linux VM before installing Chromium or copying state.
set -uo pipefail
command -v curl >/dev/null 2>&1 || { echo '{"ok":false,"reason":"curl_missing"}'; exit 2; }
mib=0
if [[ -r /proc/meminfo ]]; then
  kib=$(awk '/^MemTotal:/{print $2;exit}' /proc/meminfo)
  [[ "$kib" =~ ^[0-9]+$ ]] && mib=$((kib / 1024))
fi
status(){
  local result
  result=$(curl --silent --show-error --max-time 14 --output /dev/null --write-out '%{http_code}' "$1" 2>/dev/null) || result="000"
  [[ "$result" =~ ^[0-9]{3}$ ]] || result="000"
  printf '%s' "$result"
}
home=$(status 'https://www.mercadolivre.com.br/')
hub=$(status 'https://www.mercadolivre.com.br/afiliados/hub?is_affiliate=true')
api=$(status 'https://api.mercadolibre.com/sites/MLB')
if (( mib < 2048 )); then capacity="insufficient_for_persistent_chrome"
elif (( mib < 4096 )); then capacity="limited_test_only"
else capacity="reasonable_test_capacity"; fi
if [[ "$home" == "403" && "$hub" == "403" ]]; then origin="denied"
elif [[ "$home" == "200" || "$home" == "301" || "$home" == "302" ]]; then
  if [[ "$hub" == "200" || "$hub" == "301" || "$hub" == "302" ]]; then
    origin="public_site_reachable_auth_not_tested"
  else origin="public_site_only"
  fi
else origin="network_unknown"; fi
printf '{"ok":true,"mode":"read_only","credentials_used":false,"links_generated":0,"jobs_created":0,"ram_mb":%s,"capacity":"%s","public_home_http":"%s","guest_hub_http":"%s","api_site_http":"%s","origin":"%s"}\n' \
  "$mib" "$capacity" "$home" "$hub" "$api" "$origin"
# All output is aggregate. HTTP 200/302 guest does NOT prove login or
# authorization to automate the affiliate portal.
