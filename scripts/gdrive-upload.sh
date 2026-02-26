#!/bin/bash
PROJECT="$1"
CHANNEL="${2:-Geen Kanaal}"
PROJECT_PATH="/root/.openclaw/workspace/projects/$PROJECT"
DRIVE_ROOT="Video Producer"

if [ ! -d "$PROJECT_PATH" ]; then
    echo '{"status":"error","message":"Project niet gevonden"}'
    exit 1
fi

DRIVE_BASE="$DRIVE_ROOT/$CHANNEL/$PROJECT"
rclone mkdir "gdrive:$DRIVE_BASE/script" 2>/dev/null
rclone mkdir "gdrive:$DRIVE_BASE/audio" 2>/dev/null
rclone mkdir "gdrive:$DRIVE_BASE/assets" 2>/dev/null
rclone mkdir "gdrive:$DRIVE_BASE/scenes" 2>/dev/null
rclone mkdir "gdrive:$DRIVE_BASE/clips" 2>/dev/null
rclone mkdir "gdrive:$DRIVE_BASE/final" 2>/dev/null

UPLOADED=0
ERRORS=0

upload_file() {
    local src="$1"
    local dest="$2"
    if [ -f "$src" ]; then
        if rclone copyto "$src" "gdrive:$DRIVE_BASE/$dest/$(basename $src)" 2>/dev/null; then
            UPLOADED=$((UPLOADED + 1))
        else
            ERRORS=$((ERRORS + 1))
        fi
    fi
}

upload_dir() {
    local src="$1"
    local dest="$2"
    local pattern="${3:-*}"
    if [ -d "$src" ]; then
        for f in $src/$pattern; do
            [ -f "$f" ] && upload_file "$f" "$dest"
        done
    fi
}

upload_file "$PROJECT_PATH/config.json" ""
upload_file "$PROJECT_PATH/script/script.txt" "script"
upload_file "$PROJECT_PATH/script/script-voiceover.txt" "script"
upload_file "$PROJECT_PATH/script/style-profile.json" "script"
upload_file "$PROJECT_PATH/audio/voiceover.mp3" "audio"
upload_file "$PROJECT_PATH/assets/scene-prompts.json" "assets"
upload_file "$PROJECT_PATH/assets/image-selections.json" "assets"
upload_dir "$PROJECT_PATH/assets/scenes" "scenes" "*.mp4"
upload_dir "$PROJECT_PATH/assets/scenes" "scenes" "*.jpg"
upload_dir "$PROJECT_PATH/assets/scenes" "scenes" "*.png"
upload_dir "$PROJECT_PATH/assets/images" "scenes" "*.jpg"
upload_dir "$PROJECT_PATH/assets/images" "scenes" "*.png"
upload_dir "$PROJECT_PATH/assets/clips" "clips" "*.mp4"
upload_dir "$PROJECT_PATH" "final" "final_video.*"
upload_dir "$PROJECT_PATH" "final" "final.*"

PARENT_PATH="$DRIVE_ROOT/$CHANNEL"
FOLDER_ID=$(rclone lsjson "gdrive:$PARENT_PATH" --dirs-only 2>/dev/null | python3 -c "
import sys,json
data=json.load(sys.stdin)
for d in data:
    if d['Name']=='$PROJECT':
        print(d['ID'])
        break
" 2>/dev/null || echo "unknown")

DRIVE_URL="https://drive.google.com/drive/folders/$FOLDER_ID"

cat > "$PROJECT_PATH/drive-upload-status.json" << STATUSEOF
{
    "status": "completed",
    "project": "$PROJECT",
    "channel": "$CHANNEL",
    "files_uploaded": $UPLOADED,
    "errors": $ERRORS,
    "drive_url": "$DRIVE_URL",
    "drive_path": "$DRIVE_BASE",
    "completed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
STATUSEOF

echo '{"status":"completed","project":"'"$PROJECT"'","channel":"'"$CHANNEL"'","files_uploaded":'"$UPLOADED"',"errors":'"$ERRORS"',"drive_url":"'"$DRIVE_URL"'","drive_path":"'"$DRIVE_BASE"'"}'
