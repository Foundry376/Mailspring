# Point these at your build output directories
export OLD_DIR="./app/dist-old"
export NEW_DIR="./app/dist"

# For macOS: path to the .app bundle
export OLD_MAC_APP="$OLD_DIR/mac/Mailspring.app"
export NEW_MAC_APP="$NEW_DIR/mac/Mailspring.app"

# For Windows: path to the unpacked app directory
export OLD_WIN_APP="$OLD_DIR/mailspring-win32-x64"
export NEW_WIN_APP="$NEW_DIR/win-unpacked"

# For Linux: path to the .deb and .rpm files
export OLD_DEB="$OLD_DIR/mailspring-1.19.0-amd64.deb"
export NEW_DEB="$NEW_DIR/mailspring-1.19.0-amd64.deb"
export OLD_RPM="$OLD_DIR/mailspring-1.19.0.x86_64.rpm"
export NEW_RPM="$NEW_DIR/mailspring-1.19.0.x86_64.rpm"

# Temp dirs for extraction
export WORK="/tmp/mailspring-verify-$$"
```
```bash
#!/usr/bin/env bash
# verify-build.sh — Build artifact verification for Mailspring
#
# Usage:
#   ./scripts/verify-build.sh <artifact-dir> [platform]
#
# Examples:
#   ./scripts/verify-build.sh ./app/dist-old mac    > /tmp/old-report.txt
#   ./scripts/verify-build.sh ./app/dist     mac    > /tmp/new-report.txt
#   diff /tmp/old-report.txt /tmp/new-report.txt
#
#   ./scripts/verify-build.sh ./app/dist all        # run all platform checks

set -euo pipefail

DIST_DIR="${1:?Usage: $0 <dist-dir> [mac|win|linux|all]}"
PLATFORM="${2:-all}"
WORK="/tmp/mailspring-verify-$$"
PASS=0
FAIL=0
SKIP=0
RESULTS=()

mkdir -p "$WORK"
trap 'rm -rf "$WORK"' EXIT

# ─── Assertion helpers ─────────────────────────────────────────────

assert_pass() { PASS=$((PASS+1)); RESULTS+=("PASS  $1"); echo "PASS  $1"; }
assert_fail() { FAIL=$((FAIL+1)); RESULTS+=("FAIL  $1: $2"); echo "FAIL  $1: $2"; }
assert_skip() { SKIP=$((SKIP+1)); RESULTS+=("SKIP  $1: $2"); echo "SKIP  $1: $2"; }

assert_file_exists() {
  local label="$1" path="$2"
  if [[ -e "$path" ]]; then assert_pass "$label"
  else assert_fail "$label" "not found: $path"; fi
}

assert_dir_exists() {
  local label="$1" path="$2"
  if [[ -d "$path" ]]; then assert_pass "$label"
  else assert_fail "$label" "directory not found: $path"; fi
}

assert_file_not_empty() {
  local label="$1" path="$2"
  if [[ -s "$path" ]]; then assert_pass "$label"
  else assert_fail "$label" "file is empty or missing: $path"; fi
}

assert_grep() {
  local label="$1" pattern="$2" file="$3"
  if grep -q "$pattern" "$file" 2>/dev/null; then assert_pass "$label"
  else assert_fail "$label" "pattern '$pattern' not found in $file"; fi
}

assert_no_grep() {
  local label="$1" pattern="$2" file="$3"
  if grep -q "$pattern" "$file" 2>/dev/null; then assert_fail "$label" "unexpected pattern '$pattern' found in $file"
  else assert_pass "$label"; fi
}

assert_equals() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then assert_pass "$label"
  else assert_fail "$label" "expected '$expected', got '$actual'"; fi
}

assert_contains() {
  local label="$1" needle="$2" haystack="$3"
  if [[ "$haystack" == *"$needle"* ]]; then assert_pass "$label"
  else assert_fail "$label" "expected to contain '$needle'"; fi
}

assert_count_gt() {
  local label="$1" minimum="$2" actual="$3"
  if [[ "$actual" -gt "$minimum" ]]; then assert_pass "$label (count=$actual)"
  else assert_fail "$label" "expected >$minimum, got $actual"; fi
}

assert_exit_zero() {
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then assert_pass "$label"
  else assert_fail "$label" "command failed: $*"; fi
}

# Print a value for comparison (not an assertion, just data capture)
report_value() {
  local label="$1" value="$2"
  echo "DATA  $label = $value"
}

# ─── Detect available artifacts ────────────────────────────────────

find_mac_app() {
  # Try common electron-builder and @electron/packager output paths
  for p in "$DIST_DIR/mac/Mailspring.app" \
           "$DIST_DIR/mac-arm64/Mailspring.app" \
           "$DIST_DIR/mac-universal/Mailspring.app" \
           "$DIST_DIR/Mailspring-darwin-x64/Mailspring.app" \
           "$DIST_DIR/Mailspring-darwin-arm64/Mailspring.app"; do
    [[ -d "$p" ]] && echo "$p" && return
  done
}

find_win_app() {
  for p in "$DIST_DIR/win-unpacked" \
           "$DIST_DIR/mailspring-win32-x64"; do
    [[ -d "$p" ]] && echo "$p" && return
  done
}

find_deb() {
  find "$DIST_DIR" -maxdepth 1 -name 'mailspring*amd64.deb' -o -name 'mailspring*x64.deb' 2>/dev/null | head -1
}

find_rpm() {
  find "$DIST_DIR" -maxdepth 1 -name 'mailspring*.x86_64.rpm' -o -name 'mailspring*.x64.rpm' 2>/dev/null | head -1
}

find_squirrel_setup() {
  find "$DIST_DIR" -maxdepth 1 -name '*Setup*.exe' -o -name '*setup*.exe' 2>/dev/null | head -1
}

find_nupkg() {
  find "$DIST_DIR" -maxdepth 1 -name 'Mailspring*.nupkg' -o -name 'mailspring*.nupkg' 2>/dev/null | head -1
}

# ─── Resolve resources dir from an app path ────────────────────────

resources_dir() {
  local app="$1"
  if [[ -d "$app/Contents/Resources" ]]; then
    echo "$app/Contents/Resources"  # macOS
  elif [[ -d "$app/resources" ]]; then
    echo "$app/resources"           # win/linux
  fi
}

# ─── ASAR extraction helper ───────────────────────────────────────

extract_asar() {
  local asar_path="$1" dest="$2"
  npx asar extract "$asar_path" "$dest" 2>/dev/null
}

# ═══════════════════════════════════════════════════════════════════
# SECTION 1: ASAR & GENERAL CHECKS
# ═══════════════════════════════════════════════════════════════════

run_asar_checks() {
  local app_path="$1"
  local res
  res="$(resources_dir "$app_path")"
  if [[ -z "$res" ]]; then
    assert_skip "1.0 ASAR checks" "cannot find resources dir in $app_path"
    return
  fi

  local asar="$res/app.asar"
  local unpacked="$res/app.asar.unpacked"

  echo ""
  echo "=== SECTION 1: ASAR & PRE-BUILD VERIFICATION ==="
  echo "    resources_dir=$res"

  # 1.1 ASAR structure
  assert_file_exists "1.1.1 ASAR file exists" "$asar"
  assert_dir_exists  "1.1.2 ASAR unpacked dir exists" "$unpacked"

  report_value "1.1.3 ASAR file size" "$(stat -f%z "$asar" 2>/dev/null || stat -c%s "$asar" 2>/dev/null || echo UNKNOWN)"

  # Extract ASAR for content checks
  local asar_contents="$WORK/asar-listing.txt"
  npx asar list "$asar" > "$asar_contents" 2>/dev/null || true

  local file_count
  file_count="$(wc -l < "$asar_contents" | tr -d ' ')"
  report_value "1.1.4 ASAR file count" "$file_count"

  # 1.2 Commit hash injection
  local extracted="$WORK/asar-extracted"
  extract_asar "$asar" "$extracted"

  if [[ -f "$extracted/package.json" ]]; then
    local commit_hash
    commit_hash="$(jq -r '.commitHash // empty' "$extracted/package.json" 2>/dev/null)"
    if [[ -n "$commit_hash" && "$commit_hash" != "COMMIT_INSERTED_DURING_PACKAGING" ]]; then
      assert_pass "1.2.1 Commit hash injected ($commit_hash)"
    else
      assert_fail "1.2.1 Commit hash injected" "got '$commit_hash'"
    fi
    assert_no_grep "1.2.2 No placeholder in package.json" "COMMIT_INSERTED_DURING_PACKAGING" "$extracted/package.json"

    # Capture version for cross-platform comparison
    local app_version
    app_version="$(jq -r '.version // empty' "$extracted/package.json" 2>/dev/null)"
    report_value "1.2.3 App version from package.json" "$app_version"
  else
    assert_skip "1.2.1 Commit hash" "package.json not found in ASAR"
  fi

  # 1.3 TypeScript compilation — no .ts/.tsx/.jsx in ASAR (except .d.ts)
  local ts_count
  ts_count="$(grep -cE '\.(ts|tsx|jsx)$' "$asar_contents" | tr -d ' ')"
  local dts_count
  dts_count="$(grep -c '\.d\.ts$' "$asar_contents" | tr -d ' ')"
  local non_dts_ts=$((ts_count - dts_count))
  if [[ "$non_dts_ts" -le 0 ]]; then
    assert_pass "1.3.1 No .ts/.tsx/.jsx in ASAR (excluding .d.ts)"
  else
    assert_fail "1.3.1 No .ts/.tsx/.jsx in ASAR" "$non_dts_ts TypeScript files found"
  fi

  # 1.3.2 JS files exist
  local js_count
  js_count="$(grep -cE '(src|internal_packages).*\.js$' "$asar_contents" | tr -d ' ')"
  assert_count_gt "1.3.2 JS files present in ASAR" 0 "$js_count"
  report_value "1.3.3 JS file count (src + internal_packages)" "$js_count"

  # 1.3.4 Inline source maps
  if [[ -f "$extracted/src/flux/actions.js" ]]; then
    assert_grep "1.3.4 Inline source maps present" "sourceMappingURL=data:" "$extracted/src/flux/actions.js"
  else
    assert_skip "1.3.4 Inline source maps" "src/flux/actions.js not found"
  fi

  # 1.4 ASAR unpack rules
  assert_file_exists "1.4.1 mailsync unpacked" "$(find "$unpacked" -maxdepth 2 -name 'mailsync*' -not -name '*.js' 2>/dev/null | head -1)"

  local node_module_count
  node_module_count="$(find "$unpacked" -name '*.node' 2>/dev/null | wc -l | tr -d ' ')"
  assert_count_gt "1.4.2 Native .node modules unpacked" 0 "$node_module_count"
  report_value "1.4.3 .node module count" "$node_module_count"

  assert_dir_exists "1.4.4 Spellchecker unpacked" "$(find "$unpacked" -type d -path '*/spellchecker' 2>/dev/null | head -1)"

  local task_count
  task_count="$(find "$unpacked" -path '*/src/tasks/*' 2>/dev/null | wc -l | tr -d ' ')"
  assert_count_gt "1.4.5 Task files unpacked" 0 "$task_count"

  assert_file_exists "1.4.6 all_licenses.html unpacked" "$(find "$unpacked" -name 'all_licenses.html' 2>/dev/null | head -1)"

  # 1.5 File exclusion rules
  local spec_count build_count md_count test_count
  spec_count="$(grep -c '^/spec/' "$asar_contents" 2>/dev/null || echo 0)"
  assert_equals "1.5.1 No /spec/ in ASAR" "0" "$spec_count"

  build_count="$(grep -c '^/build/' "$asar_contents" 2>/dev/null || echo 0)"
  assert_equals "1.5.2 No /build/ in ASAR" "0" "$build_count"

  md_count="$(grep -c '\.md$' "$asar_contents" 2>/dev/null || echo 0)"
  assert_equals "1.5.3 No .md files in ASAR" "0" "$md_count"

  test_count="$(grep -cE 'node_modules/.*/tests?/' "$asar_contents" 2>/dev/null || echo 0)"
  assert_equals "1.5.4 No test dirs in node_modules" "0" "$test_count"

  local h_cc_count
  h_cc_count="$(grep -cE '\.(h|cc)$' "$asar_contents" 2>/dev/null || echo 0)"
  assert_equals "1.5.5 No .h/.cc files in ASAR" "0" "$h_cc_count"

  local gyp_count
  gyp_count="$(grep -cE '\.(gyp|gypi)$' "$asar_contents" 2>/dev/null || echo 0)"
  assert_equals "1.5.6 No .gyp/.gypi files in ASAR" "0" "$gyp_count"

  local log_count
  log_count="$(grep -c '\.log$' "$asar_contents" 2>/dev/null || echo 0)"
  assert_equals "1.5.7 No .log files in ASAR" "0" "$log_count"

  # Save listing for diff
  sort "$asar_contents" > "$WORK/asar-listing-sorted.txt"
  find "$unpacked" -type f | sed "s|$unpacked||" | sort > "$WORK/unpacked-listing-sorted.txt"
  cp "$WORK/asar-listing-sorted.txt" "/tmp/verify-asar-listing-$(basename "$DIST_DIR").txt"
  cp "$WORK/unpacked-listing-sorted.txt" "/tmp/verify-unpacked-listing-$(basename "$DIST_DIR").txt"
  echo "DATA  Saved sorted ASAR listing to /tmp/verify-asar-listing-$(basename "$DIST_DIR").txt"
  echo "DATA  Saved sorted unpacked listing to /tmp/verify-unpacked-listing-$(basename "$DIST_DIR").txt"
}


# ═══════════════════════════════════════════════════════════════════
# SECTION 2: macOS CHECKS
# ═══════════════════════════════════════════════════════════════════

run_mac_checks() {
  local app
  app="$(find_mac_app)"
  if [[ -z "$app" ]]; then
    assert_skip "2.0 macOS checks" "no .app bundle found in $DIST_DIR"
    return
  fi

  echo ""
  echo "=== SECTION 2: macOS VERIFICATION ==="
  echo "    app=$app"

  # 2.1 Bundle structure
  assert_dir_exists  "2.1.1 .app bundle exists" "$app"
  assert_file_exists "2.1.2 Info.plist exists" "$app/Contents/Info.plist"
  assert_file_exists "2.1.3 Main executable exists" "$app/Contents/MacOS/Mailspring"
  assert_dir_exists  "2.1.4 Frameworks dir exists" "$app/Contents/Frameworks"

  local plist="$app/Contents/Info.plist"

  # 2.2 Info.plist keys (using PlistBuddy which works on macOS)
  if command -v /usr/libexec/PlistBuddy &>/dev/null; then
    local pb="/usr/libexec/PlistBuddy -c"

    local bundle_id
    bundle_id="$($pb "Print :CFBundleIdentifier" "$plist" 2>/dev/null)"
    assert_equals "2.2.1 Bundle ID" "com.mailspring.mailspring" "$bundle_id"

    local bundle_name
    bundle_name="$($pb "Print :CFBundleName" "$plist" 2>/dev/null)"
    assert_equals "2.2.2 Bundle name" "Mailspring" "$bundle_name"

    local bundle_version
    bundle_version="$($pb "Print :CFBundleShortVersionString" "$plist" 2>/dev/null)"
    assert_equals "2.2.3 Bundle version" "1.19.0" "$bundle_version"

    local app_category
    app_category="$($pb "Print :LSApplicationCategoryType" "$plist" 2>/dev/null)"
    assert_equals "2.2.4 App category" "public.app-category.business" "$app_category"

    local principal_class
    principal_class="$($pb "Print :NSPrincipalClass" "$plist" 2>/dev/null)"
    assert_equals "2.2.5 NSPrincipalClass (from extra.plist)" "AtomApplication" "$principal_class"

    local focus_desc
    focus_desc="$($pb "Print :NSFocusStatusUsageDescription" "$plist" 2>/dev/null)"
    assert_contains "2.2.6 Focus status description" "Focus" "$focus_desc"
    assert_contains "2.2.6b Focus mentions DND" "Do Not Disturb" "$focus_desc"

    local copyright
    copyright="$($pb "Print :NSHumanReadableCopyright" "$plist" 2>/dev/null)"
    assert_contains "2.2.7 Copyright string" "Foundry 376" "$copyright"
    assert_contains "2.2.7b Copyright year" "2014" "$copyright"

    # URL schemes
    local url_types
    url_types="$($pb "Print :CFBundleURLTypes" "$plist" 2>/dev/null)"
    assert_contains "2.2.8 mailspring:// scheme" "mailspring" "$url_types"
    assert_contains "2.2.9 mailto: scheme" "mailto" "$url_types"

    # Document types
    local doc_types
    doc_types="$($pb "Print :CFBundleDocumentTypes" "$plist" 2>/dev/null || echo "")"
    if [[ -n "$doc_types" ]]; then
      assert_contains "2.2.10 Document types registered" "Alternate" "$doc_types"
    else
      assert_skip "2.2.10 Document types" "CFBundleDocumentTypes not found"
    fi

    # Dump full plist for diffing
    $pb "Print" "$plist" > "/tmp/verify-plist-$(basename "$DIST_DIR").txt" 2>/dev/null
    echo "DATA  Saved full plist dump to /tmp/verify-plist-$(basename "$DIST_DIR").txt"

  elif command -v defaults &>/dev/null; then
    # Fallback: use defaults (less precise but works)
    assert_equals "2.2.1 Bundle ID" "com.mailspring.mailspring" "$(defaults read "$app/Contents/Info" CFBundleIdentifier 2>/dev/null)"
    assert_equals "2.2.2 Bundle name" "Mailspring" "$(defaults read "$app/Contents/Info" CFBundleName 2>/dev/null)"
    assert_equals "2.2.3 Bundle version" "1.19.0" "$(defaults read "$app/Contents/Info" CFBundleShortVersionString 2>/dev/null)"
    assert_equals "2.2.4 App category" "public.app-category.business" "$(defaults read "$app/Contents/Info" LSApplicationCategoryType 2>/dev/null)"
    assert_equals "2.2.5 NSPrincipalClass" "AtomApplication" "$(defaults read "$app/Contents/Info" NSPrincipalClass 2>/dev/null)"

    defaults read "$app/Contents/Info" > "/tmp/verify-plist-$(basename "$DIST_DIR").txt" 2>/dev/null
    echo "DATA  Saved full plist dump to /tmp/verify-plist-$(basename "$DIST_DIR").txt"
  else
    assert_skip "2.2 Info.plist keys" "neither PlistBuddy nor defaults available (not macOS?)"
    # Still try to extract keys with python as fallback
    if command -v python3 &>/dev/null; then
      local bundle_id
      bundle_id="$(python3 -c "import plistlib; p=plistlib.load(open('$plist','rb')); print(p.get('CFBundleIdentifier',''))" 2>/dev/null)"
      assert_equals "2.2.1 Bundle ID (python3)" "com.mailspring.mailspring" "$bundle_id"
      local bundle_version
      bundle_version="$(python3 -c "import plistlib; p=plistlib.load(open('$plist','rb')); print(p.get('CFBundleShortVersionString',''))" 2>/dev/null)"
      assert_equals "2.2.3 Bundle version (python3)" "1.19.0" "$bundle_version"
      local principal_class
      principal_class="$(python3 -c "import plistlib; p=plistlib.load(open('$plist','rb')); print(p.get('NSPrincipalClass',''))" 2>/dev/null)"
      assert_equals "2.2.5 NSPrincipalClass (python3)" "AtomApplication" "$principal_class"
    fi
  fi

  # 2.3 Code signing
  if command -v codesign &>/dev/null; then
    assert_exit_zero "2.3.1 Signature is valid" codesign --verify --deep --strict "$app"

    local sign_info
    sign_info="$(codesign -dv --verbose=4 "$app" 2>&1)"

    assert_contains "2.3.2 Hardened runtime" "runtime" "$(echo "$sign_info" | grep 'flags=' || true)"

    local team_id
    team_id="$(echo "$sign_info" | grep 'TeamIdentifier=' | head -1 | cut -d= -f2)"
    assert_equals "2.3.3 Team identifier" "X9RJ36K9D4" "$team_id"
    report_value "2.3.4 Signing authority" "$(echo "$sign_info" | grep 'Authority=' | head -1)"

    # 2.4 Entitlements — main app
    local ent
    ent="$(codesign -d --entitlements - "$app" 2>&1)"

    assert_contains "2.4.1 Entitlement: app identifier"         "X9RJ36K9D4.com.mailspring.mailspring" "$ent"
    assert_contains "2.4.2 Entitlement: team identifier"         "X9RJ36K9D4"                           "$ent"
    assert_contains "2.4.3 Entitlement: keychain access"         "keychain-access-groups"                "$ent"
    assert_contains "2.4.4 Entitlement: communication notif"     "usernotifications.communication"       "$ent"
    assert_contains "2.4.5 Entitlement: time-sensitive notif"    "usernotifications.time-sensitive"      "$ent"
    assert_contains "2.4.6 Entitlement: apple events"            "automation.apple-events"               "$ent"
    assert_contains "2.4.7 Entitlement: JIT"                     "allow-jit"                             "$ent"
    assert_contains "2.4.8 Entitlement: network client"          "network.client"                        "$ent"
    assert_contains "2.4.9 Entitlement: network server"          "network.server"                        "$ent"
    assert_contains "2.4.10 Entitlement: printer"                "device.print"                          "$ent"

    # Save for diffing
    echo "$ent" > "/tmp/verify-entitlements-main-$(basename "$DIST_DIR").txt"

    # 2.4 Entitlements — helper (child) process
    local helper_app
    helper_app="$(find "$app/Contents/Frameworks" -maxdepth 1 -name '*.app' | head -1)"
    if [[ -n "$helper_app" ]]; then
      local helper_ent
      helper_ent="$(codesign -d --entitlements - "$helper_app" 2>&1)"

      assert_contains "2.4.11 Helper: apple events"     "automation.apple-events"  "$helper_ent"
      assert_contains "2.4.12 Helper: JIT"               "allow-jit"                "$helper_ent"
      assert_contains "2.4.13 Helper: network client"    "network.client"           "$helper_ent"
      assert_contains "2.4.14 Helper: network server"    "network.server"           "$helper_ent"
      assert_contains "2.4.15 Helper: printer"           "device.print"             "$helper_ent"

      # Helper must NOT have these (main-only entitlements)
      if echo "$helper_ent" | grep -q "keychain-access-groups"; then
        assert_fail "2.4.16 Helper must NOT have keychain" "keychain-access-groups found in helper"
      else
        assert_pass "2.4.16 Helper must NOT have keychain"
      fi
      if echo "$helper_ent" | grep -q "usernotifications"; then
        assert_fail "2.4.17 Helper must NOT have notifications" "usernotifications found in helper"
      else
        assert_pass "2.4.17 Helper must NOT have notifications"
      fi

      echo "$helper_ent" > "/tmp/verify-entitlements-helper-$(basename "$DIST_DIR").txt"
    else
      assert_skip "2.4.11-17 Helper entitlements" "no helper .app found in Frameworks"
    fi

    # 2.5 Provisioning profile
    if [[ -f "$app/Contents/embedded.provisionprofile" ]]; then
      assert_pass "2.5.1 Provisioning profile embedded"
      if command -v security &>/dev/null; then
        local profile_xml
        profile_xml="$(security cms -D -i "$app/Contents/embedded.provisionprofile" 2>/dev/null)"
        assert_contains "2.5.2 Profile team ID" "X9RJ36K9D4" "$profile_xml"
        assert_contains "2.5.3 Profile app ID" "com.mailspring.mailspring" "$profile_xml"
        echo "$profile_xml" > "/tmp/verify-profile-$(basename "$DIST_DIR").txt"
      fi
    else
      assert_skip "2.5 Provisioning profile" "not embedded (signing may be disabled)"
    fi

    # 2.6 Notarization
    if command -v stapler &>/dev/null; then
      if stapler validate "$app" &>/dev/null; then
        assert_pass "2.6.1 Notarization ticket stapled"
      else
        assert_skip "2.6.1 Notarization ticket" "not stapled (notarization may be disabled)"
      fi
    fi

    if command -v spctl &>/dev/null; then
      local spctl_out
      spctl_out="$(spctl --assess --type execute --verbose "$app" 2>&1 || true)"
      report_value "2.6.2 Gatekeeper assessment" "$spctl_out"
    fi

  else
    assert_skip "2.3-2.6 Code signing/entitlements/notarization" "codesign not available (not macOS)"
  fi

  # 2.7 DMG
  local dmg
  dmg="$(find "$DIST_DIR" -maxdepth 1 -name 'Mailspring*.dmg' 2>/dev/null | head -1)"
  if [[ -n "$dmg" ]]; then
    assert_file_exists "2.7.1 DMG exists" "$dmg"
    report_value "2.7.2 DMG size" "$(stat -f%z "$dmg" 2>/dev/null || stat -c%s "$dmg" 2>/dev/null || echo UNKNOWN)"
    if command -v hdiutil &>/dev/null; then
      local mnt="$WORK/dmg-mount"
      mkdir -p "$mnt"
      if hdiutil attach "$dmg" -mountpoint "$mnt" -nobrowse -quiet 2>/dev/null; then
        assert_dir_exists "2.7.3 App in DMG" "$mnt/Mailspring.app"
        hdiutil detach "$mnt" -quiet 2>/dev/null || true
      else
        assert_skip "2.7.3 App in DMG" "could not mount DMG"
      fi
    fi
  else
    assert_skip "2.7 DMG" "no DMG found"
  fi

  # 2.8 ZIP
  local zip
  zip="$(find "$DIST_DIR" -maxdepth 1 -name 'Mailspring*.zip' 2>/dev/null | head -1)"
  if [[ -n "$zip" ]]; then
    assert_file_exists "2.8.1 ZIP exists" "$zip"
    report_value "2.8.2 ZIP size" "$(stat -f%z "$zip" 2>/dev/null || stat -c%s "$zip" 2>/dev/null || echo UNKNOWN)"
    local zip_listing
    zip_listing="$(unzip -l "$zip" 2>/dev/null)"
    assert_contains "2.8.3 ZIP contains Mailspring.app" "Mailspring.app/" "$zip_listing"
  else
    assert_skip "2.8 ZIP" "no ZIP found"
  fi

  # 2.9 Architecture
  local arch_info
  arch_info="$(file "$app/Contents/MacOS/Mailspring" 2>/dev/null)"
  report_value "2.9.1 Main binary architecture" "$arch_info"

  local framework_arch
  framework_arch="$(file "$app/Contents/Frameworks/Electron Framework.framework/Electron Framework" 2>/dev/null || echo "not found")"
  report_value "2.9.2 Framework architecture" "$framework_arch"

  # Run ASAR checks using this .app
  run_asar_checks "$app"
}


# ═══════════════════════════════════════════════════════════════════
# SECTION 3: WINDOWS CHECKS (runnable from mac/linux on unpacked dir)
# ═══════════════════════════════════════════════════════════════════

run_win_checks() {
  local app
  app="$(find_win_app)"
  if [[ -z "$app" ]]; then
    assert_skip "3.0 Windows checks" "no unpacked Windows dir found in $DIST_DIR"
    return
  fi

  echo ""
  echo "=== SECTION 3: WINDOWS VERIFICATION ==="
  echo "    app=$app"

  # 3.1 Structure
  assert_file_exists "3.1.1 mailspring.exe" "$app/mailspring.exe"
  assert_file_exists "3.1.2 app.asar" "$app/resources/app.asar"

  local dll_count
  dll_count="$(find "$app" -maxdepth 1 -name '*.dll' 2>/dev/null | wc -l | tr -d ' ')"
  assert_count_gt "3.1.3 Electron DLLs present" 0 "$dll_count"
  report_value "3.1.4 DLL count" "$dll_count"

  # 3.2 Windows resource files (must be alongside the exe)
  assert_file_exists "3.2.1 mailto registration reg" "$app/mailspring-mailto-registration.reg"
  assert_file_exists "3.2.2 mailto default reg"      "$app/mailspring-mailto-default.reg"
  assert_file_exists "3.2.3 VisualElements manifest"  "$app/mailspring.VisualElementsManifest.xml"
  assert_file_exists "3.2.4 Tile 150px"               "$app/mailspring-150px.png"
  assert_file_exists "3.2.5 Tile 75px"                 "$app/mailspring-75px.png"
  assert_file_exists "3.2.6 elevate.cmd"               "$app/elevate.cmd"
  assert_file_exists "3.2.7 elevate.vbs"               "$app/elevate.vbs"

  # 3.2.8 Verify registry file content
  assert_grep "3.2.8 Reg has Mailspring.Url.mailto" "Mailspring.Url.mailto" "$app/mailspring-mailto-registration.reg"
  assert_grep "3.2.9 Reg has Clients\\\\Mail"        "Clients.*Mail.*Mailspring" "$app/mailspring-mailto-registration.reg"

  # 3.2.10 Visual Elements manifest content
  assert_grep "3.2.10 VisualElements background color" "#4ecdc4" "$app/mailspring.VisualElementsManifest.xml"
  assert_grep "3.2.11 VisualElements 150px ref"        "mailspring-150px.png" "$app/mailspring.VisualElementsManifest.xml"

  # 3.2.12 Elevation script content
  assert_grep "3.2.12 elevate.vbs uses runas" "runas" "$app/elevate.vbs"

  # Save resource file contents for diffing
  for f in mailspring-mailto-registration.reg mailspring-mailto-default.reg \
           mailspring.VisualElementsManifest.xml elevate.cmd elevate.vbs; do
    if [[ -f "$app/$f" ]]; then
      cp "$app/$f" "/tmp/verify-win-$f-$(basename "$DIST_DIR")"
    fi
  done
  echo "DATA  Saved Windows resource files to /tmp/verify-win-*-$(basename "$DIST_DIR")"

  # 3.3 EXE metadata (using file command — limited but works cross-platform)
  local exe_info
  exe_info="$(file "$app/mailspring.exe" 2>/dev/null)"
  assert_contains "3.3.1 EXE is PE32+" "PE32+" "$exe_info"
  assert_contains "3.3.2 EXE is x86-64" "x86-64" "$exe_info"
  report_value "3.3.3 EXE file info" "$exe_info"

  # 3.3.4 EXE metadata via strings (cross-platform approximation)
  if command -v strings &>/dev/null; then
    local exe_strings
    exe_strings="$(strings "$app/mailspring.exe" 2>/dev/null | head -2000)"
    assert_contains "3.3.4 EXE contains CompanyName" "Foundry 376" "$exe_strings"
    assert_contains "3.3.5 EXE contains ProductName" "Mailspring" "$exe_strings"
  fi

  # 3.4 Squirrel installer artifacts
  local setup_exe
  setup_exe="$(find_squirrel_setup)"
  if [[ -n "$setup_exe" ]]; then
    assert_file_exists "3.4.1 Setup EXE exists" "$setup_exe"
    report_value "3.4.2 Setup EXE size" "$(stat -f%z "$setup_exe" 2>/dev/null || stat -c%s "$setup_exe" 2>/dev/null || echo UNKNOWN)"
  else
    assert_skip "3.4.1 Setup EXE" "no Setup EXE found"
  fi

  local releases_file="$DIST_DIR/RELEASES"
  if [[ -f "$releases_file" ]]; then
    assert_pass "3.4.3 RELEASES file exists"

    # Validate RELEASES format: SHA1 <space> filename <space> size
    local releases_lines
    releases_lines="$(wc -l < "$releases_file" | tr -d ' ')"
    assert_count_gt "3.4.4 RELEASES has entries" 0 "$releases_lines"

    # Each line should match: <40-char hex> <space> <filename> <space> <number>
    local bad_lines
    bad_lines="$(grep -cvE '^[0-9a-fA-F]{40} .+ [0-9]+$' "$releases_file" 2>/dev/null || echo 0)"
    assert_equals "3.4.5 RELEASES format valid (all lines)" "0" "$bad_lines"

    cp "$releases_file" "/tmp/verify-RELEASES-$(basename "$DIST_DIR")"
    report_value "3.4.6 RELEASES content" "$(cat "$releases_file")"
  else
    assert_skip "3.4.3 RELEASES file" "not found"
  fi

  local nupkg
  nupkg="$(find_nupkg)"
  if [[ -n "$nupkg" ]]; then
    assert_file_exists "3.4.7 Nupkg exists" "$nupkg"
    assert_exit_zero "3.4.8 Nupkg is valid ZIP" unzip -t "$nupkg"

    # Check nupkg contains the exe
    local nupkg_listing
    nupkg_listing="$(unzip -l "$nupkg" 2>/dev/null)"
    assert_contains "3.4.9 Nupkg contains mailspring.exe" "mailspring.exe" "$nupkg_listing"

    # Extract and check nuspec for package ID and version
    local nuspec_file
    nuspec_file="$(unzip -l "$nupkg" 2>/dev/null | grep '\.nuspec$' | awk '{print $NF}')"
    if [[ -n "$nuspec_file" ]]; then
      unzip -o -d "$WORK/nupkg" "$nupkg" "$nuspec_file" >/dev/null 2>&1
      local nuspec_path="$WORK/nupkg/$nuspec_file"
      if [[ -f "$nuspec_path" ]]; then
        local pkg_id
        pkg_id="$(grep -oP '(?<=<id>)[^<]+' "$nuspec_path" 2>/dev/null || \
                  sed -n 's/.*<id>\([^<]*\)<\/id>.*/\1/p' "$nuspec_path" 2>/dev/null | head -1)"
        assert_equals "3.4.10 Nupkg package ID" "Mailspring" "$pkg_id"

        local pkg_version
        pkg_version="$(grep -oP '(?<=<version>)[^<]+' "$nuspec_path" 2>/dev/null || \
                       sed -n 's/.*<version>\([^<]*\)<\/version>.*/\1/p' "$nuspec_path" 2>/dev/null | head -1)"
        report_value "3.4.11 Nupkg version" "$pkg_version"

        cp "$nuspec_path" "/tmp/verify-nuspec-$(basename "$DIST_DIR").nuspec"
      fi
    fi

    report_value "3.4.12 Nupkg size" "$(stat -f%z "$nupkg" 2>/dev/null || stat -c%s "$nupkg" 2>/dev/null || echo UNKNOWN)"
  else
    assert_skip "3.4.7 Nupkg" "not found"
  fi

  # Run ASAR checks using the Windows app dir
  run_asar_checks "$app"
}


# ═══════════════════════════════════════════════════════════════════
# SECTION 4: LINUX CHECKS
# ═══════════════════════════════════════════════════════════════════

run_linux_checks() {
  echo ""
  echo "=== SECTION 4: LINUX VERIFICATION ==="

  # ── 4.1 DEB checks ──────────────────────────────────────────────

  local deb
  deb="$(find_deb)"
  if [[ -n "$deb" ]] && command -v dpkg-deb &>/dev/null; then
    echo "    deb=$deb"

    # 4.1.1 Metadata
    local pkg_name
    pkg_name="$(dpkg-deb -f "$deb" Package 2>/dev/null)"
    assert_equals "4.1.1 DEB Package name" "mailspring" "$pkg_name"

    local pkg_version
    pkg_version="$(dpkg-deb -f "$deb" Version 2>/dev/null)"
    report_value "4.1.2 DEB version" "$pkg_version"

    local pkg_arch
    pkg_arch="$(dpkg-deb -f "$deb" Architecture 2>/dev/null)"
    assert_equals "4.1.3 DEB architecture" "amd64" "$pkg_arch"

    local pkg_section
    pkg_section="$(dpkg-deb -f "$deb" Section 2>/dev/null)"
    assert_equals "4.1.4 DEB section" "mail" "$pkg_section"

    local pkg_maintainer
    pkg_maintainer="$(dpkg-deb -f "$deb" Maintainer 2>/dev/null)"
    report_value "4.1.5 DEB maintainer" "$pkg_maintainer"

    # Save full control for diffing
    dpkg-deb -f "$deb" > "/tmp/verify-deb-control-$(basename "$DIST_DIR").txt" 2>/dev/null
    echo "DATA  Saved DEB control to /tmp/verify-deb-control-$(basename "$DIST_DIR").txt"

    # 4.1.2 Dependencies
    local deps
    deps="$(dpkg-deb -f "$deb" Depends 2>/dev/null)"

    assert_contains "4.1.6 Dep: libasound"    "libasound"    "$deps"
    assert_contains "4.1.7 Dep: libcurl"       "libcurl"      "$deps"
    assert_contains "4.1.8 Dep: libgtk-3"      "libgtk-3"     "$deps"
    assert_contains "4.1.9 Dep: libnss3"       "libnss3"      "$deps"
    assert_contains "4.1.10 Dep: libsecret"    "libsecret"    "$deps"
    assert_contains "4.1.11 Dep: libsasl2"     "libsasl2"     "$deps"
    assert_contains "4.1.12 Dep: libssl"        "libssl"       "$deps"
    assert_contains "4.1.13 Dep: libtidy"       "libtidy"      "$deps"
    assert_contains "4.1.14 Dep: xdg-utils"     "xdg-utils"   "$deps"
    assert_contains "4.1.15 Dep: libnotify"      "libnotify"   "$deps"
    assert_contains "4.1.16 Dep: libgbm"         "libgbm"     "$deps"
    assert_contains "4.1.17 Dep: libxss"          "libxss\|libXss\|XScrnSaver" "$deps"

    local recommends
    recommends="$(dpkg-deb -f "$deb" Recommends 2>/dev/null)"
    report_value "4.1.18 DEB Recommends" "$recommends"

    # Save sorted deps for diffing
    echo "$deps" | tr ',' '\n' | sed 's/^ //' | sort > "/tmp/verify-deb-deps-$(basename "$DIST_DIR").txt"

    # 4.1.3 DEB contents
    local deb_contents
    deb_contents="$(dpkg-deb -c "$deb" 2>/dev/null)"

    assert_contains "4.1.19 Main binary in package" "usr/share/mailspring/mailspring" "$deb_contents"
    assert_contains "4.1.20 /usr/bin symlink"        "usr/bin/mailspring"               "$deb_contents"
    assert_contains "4.1.21 Desktop file"             ".desktop"                         "$deb_contents"

    # Copyright
    if echo "$deb_contents" | grep -q "copyright"; then
      assert_pass "4.1.22 Copyright file in package"
    else
      assert_fail "4.1.22 Copyright file in package" "not found"
    fi

    local deb_file_count
    deb_file_count="$(echo "$deb_contents" | wc -l | tr -d ' ')"
    report_value "4.1.23 DEB file count" "$deb_file_count"

    # 4.1.4 Icons
    local icon_sizes=("16x16" "32x32" "64x64" "128x128" "256x256" "512x512")
    local found_icons=0
    for size in "${icon_sizes[@]}"; do
      if echo "$deb_contents" | grep -q "icons/hicolor/${size}"; then
        found_icons=$((found_icons + 1))
      fi
    done
    assert_equals "4.1.24 All 6 icon sizes present" "6" "$found_icons"

    # 4.1.5 Maintainer scripts — extract control tar
    local ctrl_extract="$WORK/deb-control"
    mkdir -p "$ctrl_extract"

    # dpkg-deb -e extracts control info to a directory
    dpkg-deb -e "$deb" "$ctrl_extract" 2>/dev/null

    if [[ -f "$ctrl_extract/postinst" ]]; then
      assert_pass "4.1.25 postinst script exists"
      assert_grep "4.1.26 postinst: chrome-sandbox chmod 4755" "chmod.*4755.*chrome-sandbox\|chmod.*chrome-sandbox.*4755" "$ctrl_extract/postinst"
      assert_grep "4.1.27 postinst: gtk icon cache update"     "gtk-update-icon-cache"                                     "$ctrl_extract/postinst"
      cp "$ctrl_extract/postinst" "/tmp/verify-deb-postinst-$(basename "$DIST_DIR").sh"
    else
      assert_fail "4.1.25 postinst script exists" "not found"
    fi

    if [[ -f "$ctrl_extract/postrm" ]]; then
      assert_pass "4.1.28 postrm script exists"
      cp "$ctrl_extract/postrm" "/tmp/verify-deb-postrm-$(basename "$DIST_DIR").sh"
    else
      assert_skip "4.1.28 postrm script" "not found (may be optional)"
    fi

    # Lintian overrides
    if echo "$deb_contents" | grep -q "lintian"; then
      assert_pass "4.1.29 Lintian overrides present"
    else
      assert_skip "4.1.29 Lintian overrides" "not found"
    fi

    # 4.1.6 Chrome sandbox
    assert_contains "4.1.30 chrome-sandbox in package" "chrome-sandbox" "$deb_contents"

    # 4.1.7 Extract and verify desktop file
    local deb_extract="$WORK/deb-data"
    mkdir -p "$deb_extract"
    dpkg-deb -x "$deb" "$deb_extract" 2>/dev/null

    local desktop_file
    desktop_file="$(find "$deb_extract" -name '*.desktop' -path '*/applications/*' 2>/dev/null | head -1)"
    if [[ -n "$desktop_file" ]]; then
      assert_grep "4.1.31 Desktop: Exec line"        "^Exec=mailspring"                  "$desktop_file"
      assert_grep "4.1.32 Desktop: Icon"              "^Icon=mailspring"                  "$desktop_file"
      assert_grep "4.1.33 Desktop: Categories"        "Network"                            "$desktop_file"
      assert_grep "4.1.34 Desktop: Email category"    "Email"                              "$desktop_file"
      assert_grep "4.1.35 Desktop: mailto MIME"        "x-scheme-handler/mailto"           "$desktop_file"
      assert_grep "4.1.36 Desktop: mailspring MIME"    "x-scheme-handler/mailspring"       "$desktop_file"
      assert_grep "4.1.37 Desktop: NewMessage action"  "Desktop Action.*NewMessage\|Action NewMessage" "$desktop_file"

      local translation_count
      translation_count="$(grep -c '^Name\[' "$desktop_file" 2>/dev/null || echo 0)"
      assert_count_gt "4.1.38 Desktop: translations" 50 "$translation_count"
      report_value "4.1.39 Desktop translation count" "$translation_count"

      if command -v desktop-file-validate &>/dev/null; then
        assert_exit_zero "4.1.40 Desktop file validates" desktop-file-validate "$desktop_file"
      else
        assert_skip "4.1.40 Desktop file validation" "desktop-file-validate not installed"
      fi

      cp "$desktop_file" "/tmp/verify-desktop-$(basename "$DIST_DIR").desktop"
      echo "DATA  Saved desktop file to /tmp/verify-desktop-$(basename "$DIST_DIR").desktop"
    else
      assert_fail "4.1.31 Desktop file" "not found in DEB"
    fi

    # 4.1.8 Extract and verify AppData/metainfo
    local appdata_file
    appdata_file="$(find "$deb_extract" -name 'mailspring*.xml' -path '*appdata*' -o -name 'mailspring*.xml' -path '*metainfo*' 2>/dev/null | head -1)"
    if [[ -n "$appdata_file" ]]; then
      assert_grep "4.1.41 AppData: component type"    'type="desktop"'                    "$appdata_file"
      assert_grep "4.1.42 AppData: license"            "GPL-3.0"                           "$appdata_file"
      assert_grep "4.1.43 AppData: homepage"           "getmailspring.com"                 "$appdata_file"
      assert_grep "4.1.44 AppData: VCS browser"        "github.com.*Mailspring"            "$appdata_file"
      assert_grep "4.1.45 AppData: content rating"     "content_rating"                    "$appdata_file"

      local release_count
      release_count="$(grep -c '<release ' "$appdata_file" 2>/dev/null || echo 0)"
      assert_count_gt "4.1.46 AppData: release entries" 20 "$release_count"
      report_value "4.1.47 AppData release count" "$release_count"

      local latest_release
      latest_release="$(grep '<release ' "$appdata_file" 2>/dev/null | head -1)"
      assert_contains "4.1.48 AppData: latest release version" "1.19.0" "$latest_release"

      if command -v appstream-util &>/dev/null; then
        assert_exit_zero "4.1.49 AppData validates" appstream-util validate "$appdata_file"
      elif command -v xmllint &>/dev/null; then
        assert_exit_zero "4.1.49 AppData is valid XML" xmllint --noout "$appdata_file"
      else
        assert_skip "4.1.49 AppData validation" "neither appstream-util nor xmllint installed"
      fi

      cp "$appdata_file" "/tmp/verify-appdata-$(basename "$DIST_DIR").xml"
      echo "DATA  Saved appdata to /tmp/verify-appdata-$(basename "$DIST_DIR").xml"
    else
      assert_skip "4.1.41 AppData" "not found in DEB"
    fi

  elif [[ -n "$deb" ]]; then
    assert_skip "4.1 DEB checks" "dpkg-deb not available"
  else
    assert_skip "4.1 DEB checks" "no .deb file found"
  fi

  # ── 4.2 RPM checks ──────────────────────────────────────────────

  local rpm_file
  rpm_file="$(find_rpm)"

  if [[ -n "$rpm_file" ]] && command -v rpm &>/dev/null; then
    echo "    rpm=$rpm_file"

    local rpm_name
    rpm_name="$(rpm -qp --queryformat '%{NAME}' "$rpm_file" 2>/dev/null)"
    assert_equals "4.2.1 RPM package name" "mailspring" "$rpm_name"

    local rpm_version
    rpm_version="$(rpm -qp --queryformat '%{VERSION}' "$rpm_file" 2>/dev/null)"
    report_value "4.2.2 RPM version" "$rpm_version"

    local rpm_arch
    rpm_arch="$(rpm -qp --queryformat '%{ARCH}' "$rpm_file" 2>/dev/null)"
    assert_equals "4.2.3 RPM architecture" "x86_64" "$rpm_arch"

    local rpm_license
    rpm_license="$(rpm -qp --queryformat '%{LICENSE}' "$rpm_file" 2>/dev/null)"
    report_value "4.2.4 RPM license" "$rpm_license"

    local rpm_url
    rpm_url="$(rpm -qp --queryformat '%{URL}' "$rpm_file" 2>/dev/null)"
    report_value "4.2.5 RPM URL" "$rpm_url"

    # RPM dependencies
    local rpm_deps
    rpm_deps="$(rpm -qp --requires "$rpm_file" 2>/dev/null)"
    rpm -qp --requires "$rpm_file" 2>/dev/null | sort > "/tmp/verify-rpm-deps-$(basename "$DIST_DIR").txt"
    echo "DATA  Saved RPM deps to /tmp/verify-rpm-deps-$(basename "$DIST_DIR").txt"

    # RPM file listing
    local rpm_listing
    rpm_listing="$(rpm -qpl "$rpm_file" 2>/dev/null)"

    assert_contains "4.2.6 RPM: main binary"  "usr/share/mailspring/mailspring" "$rpm_listing"
    assert_contains "4.2.7 RPM: /usr/bin link" "usr/bin/mailspring"              "$rpm_listing"
    assert_contains "4.2.8 RPM: desktop file"  ".desktop"                        "$rpm_listing"

    local rpm_icon_count
    rpm_icon_count="$(echo "$rpm_listing" | grep -c 'icons/hicolor' || echo 0)"
    assert_equals "4.2.9 RPM: 6 icon sizes" "6" "$rpm_icon_count"

    local rpm_file_count
    rpm_file_count="$(echo "$rpm_listing" | wc -l | tr -d ' ')"
    report_value "4.2.10 RPM file count" "$rpm_file_count"

    # RPM scripts
    local rpm_scripts
    rpm_scripts="$(rpm -qp --scripts "$rpm_file" 2>/dev/null)"
    rpm -qp --scripts "$rpm_file" 2>/dev/null > "/tmp/verify-rpm-scripts-$(basename "$DIST_DIR").txt"
    echo "DATA  Saved RPM scripts to /tmp/verify-rpm-scripts-$(basename "$DIST_DIR").txt"

    if echo "$rpm_scripts" | grep -q "chrome-sandbox\|gtk-update-icon-cache"; then
      assert_pass "4.2.11 RPM: post-install scripts present"
    else
      assert_skip "4.2.11 RPM: post-install scripts" "not found (FPM may handle differently)"
    fi

    rpm -qpl "$rpm_file" 2>/dev/null | sort > "/tmp/verify-rpm-listing-$(basename "$DIST_DIR").txt"
    echo "DATA  Saved RPM listing to /tmp/verify-rpm-listing-$(basename "$DIST_DIR").txt"

  elif [[ -n "$rpm_file" ]]; then
    # Try rpm2cpio as fallback
    if command -v rpm2cpio &>/dev/null; then
      echo "    rpm=$rpm_file (using rpm2cpio fallback)"
      local rpm_extract="$WORK/rpm-data"
      mkdir -p "$rpm_extract"
      rpm2cpio "$rpm_file" | (cd "$rpm_extract" && cpio -idm 2>/dev/null)

      assert_file_exists "4.2.1 RPM: main binary" "$(find "$rpm_extract" -name 'mailspring' -not -name '*.desktop' 2>/dev/null | head -1)"
      assert_file_exists "4.2.8 RPM: desktop file" "$(find "$rpm_extract" -name '*.desktop' 2>/dev/null | head -1)"

      local rpm_icon_count
      rpm_icon_count="$(find "$rpm_extract" -path '*/icons/hicolor/*' -name '*.png' 2>/dev/null | wc -l | tr -d ' ')"
      assert_equals "4.2.9 RPM: 6 icon sizes" "6" "$rpm_icon_count"
    else
      assert_skip "4.2 RPM checks" "neither rpm nor rpm2cpio available"
    fi
  else
    assert_skip "4.2 RPM checks" "no .rpm file found"
  fi

  # If we extracted the DEB, run ASAR checks on the Linux app
  local linux_app="$WORK/deb-data/usr/share/mailspring"
  if [[ -d "$linux_app" ]]; then
    run_asar_checks "$linux_app"
  fi
}


# ═══════════════════════════════════════════════════════════════════
# SECTION 5: CROSS-PLATFORM / SUMMARY
# ═══════════════════════════════════════════════════════════════════

run_cross_platform_checks() {
  echo ""
  echo "=== SECTION 5: CROSS-PLATFORM CHECKS ==="

  # Electron version file (present in all platforms)
  local version_file
  version_file="$(find "$DIST_DIR" -name 'version' -path '*/Electron*' -o -name 'version' -maxdepth 3 2>/dev/null | head -1)"
  if [[ -n "$version_file" ]]; then
    local electron_version
    electron_version="$(cat "$version_file")"
    report_value "5.1 Electron version" "$electron_version"
  fi

  # Overall size
  local total_size
  total_size="$(du -sh "$DIST_DIR" 2>/dev/null | cut -f1)"
  report_value "5.2 Total dist directory size" "$total_size"
}


# ═══════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║       Mailspring Build Artifact Verification Report         ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "  Dist dir:   $DIST_DIR"
echo "  Platform:   $PLATFORM"
echo "  Date:       $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "  Git commit: $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

case "$PLATFORM" in
  mac)
    run_mac_checks
    ;;
  win)
    run_win_checks
    ;;
  linux)
    run_linux_checks
    ;;
  all)
    run_mac_checks
    run_win_checks
    run_linux_checks
    ;;
  *)
    echo "Unknown platform: $PLATFORM (use mac, win, linux, or all)"
    exit 1
    ;;
esac

run_cross_platform_checks

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  RESULTS: $PASS passed, $FAIL failed, $SKIP skipped"
echo "═══════════════════════════════════════════════════════════════"
echo ""

if [[ $FAIL -gt 0 ]]; then
  echo "FAILED CHECKS:"
  for r in "${RESULTS[@]}"; do
    if [[ "$r" == FAIL* ]]; then echo "  $r"; fi
  done
  echo ""
fi

echo "Comparison files saved to /tmp/verify-*-$(basename "$DIST_DIR").*"
echo "To compare OLD vs NEW, run:"
echo "  diff /tmp/verify-<file>-<old-dir> /tmp/verify-<file>-<new-dir>"
echo ""
echo "Key files to diff:"
echo "  - /tmp/verify-asar-listing-*.txt          (ASAR file listing)"
echo "  - /tmp/verify-unpacked-listing-*.txt       (unpacked file listing)"
echo "  - /tmp/verify-plist-*.txt                  (macOS Info.plist)"
echo "  - /tmp/verify-entitlements-main-*.txt      (macOS entitlements)"
echo "  - /tmp/verify-entitlements-helper-*.txt    (macOS helper entitlements)"
echo "  - /tmp/verify-profile-*.txt                (macOS provisioning profile)"
echo "  - /tmp/verify-win-*                        (Windows resource files)"
echo "  - /tmp/verify-nuspec-*.nuspec              (Squirrel nuspec)"
echo "  - /tmp/verify-RELEASES-*                   (Squirrel RELEASES)"
echo "  - /tmp/verify-deb-control-*.txt            (DEB control metadata)"
echo "  - /tmp/verify-deb-deps-*.txt               (DEB dependencies)"
echo "  - /tmp/verify-deb-postinst-*.sh            (DEB postinst script)"
echo "  - /tmp/verify-rpm-deps-*.txt               (RPM dependencies)"
echo "  - /tmp/verify-rpm-scripts-*.txt            (RPM scripts)"
echo "  - /tmp/verify-rpm-listing-*.txt            (RPM file listing)"
echo "  - /tmp/verify-desktop-*.desktop            (Linux desktop file)"
echo "  - /tmp/verify-appdata-*.xml                (Linux AppData/metainfo)"

exit $FAIL
```
```bash
# 1. Build with old system, save artifacts
git stash && npm run build && mv app/dist app/dist-old

# 2. Build with new system
git stash pop && npm run build

# 3. Run verification on both
./scripts/verify-build.sh app/dist-old mac   > /tmp/old-mac.txt 2>&1
./scripts/verify-build.sh app/dist     mac   > /tmp/new-mac.txt 2>&1

# 4. Compare
diff /tmp/old-mac.txt /tmp/new-mac.txt

# 5. Deep-diff specific artifacts
diff /tmp/verify-plist-dist-old.txt /tmp/verify-plist-dist.txt
diff /tmp/verify-entitlements-main-dist-old.txt /tmp/verify-entitlements-main-dist.txt
diff /tmp/verify-deb-control-dist-old.txt /tmp/verify-deb-control-dist.txt
diff /tmp/verify-deb-deps-dist-old.txt /tmp/verify-deb-deps-dist.txt
diff /tmp/verify-desktop-dist-old.desktop /tmp/verify-desktop-dist.desktop
diff /tmp/verify-appdata-dist-old.xml /tmp/verify-appdata-dist.xml
diff /tmp/verify-nuspec-dist-old.nuspec /tmp/verify-nuspec-dist.nuspec
diff /tmp/verify-RELEASES-dist-old /tmp/verify-RELEASES-dist
