#!/bin/bash
# Keepalive script to prevent Codespace from going idle
# Runs every 3 minutes via cron to generate activity

LOG_FILE="/tmp/keepalive.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Simple activity: touch a temp file and log
touch /tmp/.codespace-keepalive
echo "[$TIMESTAMP] Keepalive ping" >> "$LOG_FILE"

# Keep log file from growing forever (keep last 100 lines)
tail -100 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE" 2>/dev/null
