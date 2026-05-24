#!/usr/bin/env bash
# Build the macOS native Arcade shell target without opening it.
# Validates bundle identity, copies in the local rp1 executable, and refreshes
# the LaunchServices registration so the dev app is the preferred handler.
set -euo pipefail

cd native-app
bun install --frozen-lockfile
rm -rf \
    "build/dev-macos-arm64/RP1 Arcade-dev.app" \
    "build/stable-macos-arm64/rp1 Arcade.app" \
    "artifacts/stable-macos-arm64-rp1Arcade.app.tar.zst" \
    "artifacts/stable-macos-arm64-rp1Arcade.dmg" \
    "artifacts/stable-macos-arm64-update.json"
bun run build:macos
app_path="$(find build/stable-macos-arm64 -maxdepth 1 -name 'rp1 Arcade.app' -print -quit)"
if [ -z "$app_path" ]; then
    echo "Native app build finished, but no rp1 Arcade.app was found under native-app/build/stable-macos-arm64."
    exit 1
fi
bundle_name="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleName' "${app_path}/Contents/Info.plist")"
bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "${app_path}/Contents/Info.plist")"
if [ "$bundle_name" != "rp1 Arcade" ] || [ "$bundle_id" != "run.rp1.arcade" ]; then
    echo "Native app bundle identity mismatch: CFBundleName=${bundle_name}, CFBundleIdentifier=${bundle_id}"
    exit 1
fi
if [ -d "assets/icon.iconset" ]; then
    bundle_icon_file="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIconFile' "${app_path}/Contents/Info.plist")"
    icon_path="${app_path}/Contents/Resources/AppIcon.icns"
    if [ "$bundle_icon_file" != "AppIcon" ]; then
        echo "Native app bundle icon mismatch: CFBundleIconFile=${bundle_icon_file}"
        exit 1
    fi
    if [ ! -s "$icon_path" ]; then
        echo "Native app bundle icon missing or empty: ${icon_path}"
        exit 1
    fi
fi
cp ../bin/rp1 "${app_path}/Contents/MacOS/rp1"
chmod +x "${app_path}/Contents/MacOS/rp1"
touch "$app_path"
lsregister="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
if [ -x "$lsregister" ]; then
    if command -v mdfind >/dev/null 2>&1; then
        while IFS= read -r stale_app; do
            if [ -z "$stale_app" ] || [ ! -f "${stale_app}/Contents/Info.plist" ]; then
                continue
            fi
            stale_bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "${stale_app}/Contents/Info.plist" 2>/dev/null || true)"
            if [ "$stale_bundle_id" = "run.rp1.arcade" ]; then
                "$lsregister" -u "$stale_app" >/dev/null 2>&1 || true
                echo "Unregistered stale native dev app: $stale_app"
            fi
        done < <(mdfind 'kMDItemFSName == "RP1 Arcade-dev.app"')
    fi
    "$lsregister" -f "$app_path" >/dev/null 2>&1 || true
fi
echo "Built native app: native-app/${app_path}"
echo "Bundled local rp1 executable: native-app/${app_path}/Contents/MacOS/rp1"
echo "Run later with:"
echo "  open -n \"native-app/${app_path}\""
echo "Direct project launch:"
echo "  RP1_NATIVE_PROJECT_PATH=\"/path/to/rp1-project\" \"native-app/${app_path}/Contents/MacOS/launcher\""
