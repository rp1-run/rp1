#!/usr/bin/env bash
# Install the freshly-built rp1 Arcade.app as `rp1 Arcade dev.app` under
# ~/Applications, rewriting bundle identity to the dev id so it can coexist
# with a stable install.
set -euo pipefail

src_app="native-app/build/stable-macos-arm64/rp1 Arcade.app"
if [ ! -d "$src_app" ]; then
    echo "Source app not found: $src_app" >&2
    exit 1
fi
install_dir="${HOME}/Applications"
dest_app="${install_dir}/rp1 Arcade dev.app"
mkdir -p "$install_dir"
rm -rf "$dest_app"
cp -R "$src_app" "$dest_app"
plist="${dest_app}/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Set :CFBundleName rp1 Arcade dev' "$plist"
/usr/libexec/PlistBuddy -c 'Set :CFBundleIdentifier run.rp1.arcade.dev' "$plist"
if /usr/libexec/PlistBuddy -c 'Print :CFBundleDisplayName' "$plist" >/dev/null 2>&1; then
    /usr/libexec/PlistBuddy -c 'Set :CFBundleDisplayName rp1 Arcade dev' "$plist"
else
    /usr/libexec/PlistBuddy -c 'Add :CFBundleDisplayName string "rp1 Arcade dev"' "$plist"
fi
xattr -dr com.apple.quarantine "$dest_app" 2>/dev/null || true
touch "$dest_app"
lsregister="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
if [ -x "$lsregister" ]; then
    "$lsregister" -f "$dest_app" >/dev/null 2>&1 || true
fi
echo ""
echo "Installed local native app: ${dest_app}"
echo "Launch with: open -n \"${dest_app}\""
