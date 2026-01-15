# Issue Report: RPM Package Dependency Conflict (libtidy.so.5)

## Summary

The 1.17.0 RPM package specifies a dependency on `libtidy.so.5` which is not available on newer Fedora, Alma Linux, and Rocky Linux distributions. These distributions provide `libtidy.so.58` instead, preventing installation.

## Severity

**Medium** - Blocks installation on affected distros, but workaround available.

## Affected Platforms

- Fedora 43
- Alma Linux (latest versions)
- Rocky Linux (latest versions)
- Other RHEL-based distributions with newer libtidy

## Affected Version

- Mailspring 1.17.0-0.1.x86_64.rpm

## Discourse Reference

- Topic 14086: "1.17.0 rpm package conflict on Fedora 43"

## Error Message

```
$ sudo dnf install ./mailspring-1.17.0-0.1.x86_64.rpm
Updating and loading repositories:
Repositories loaded.
Failed to resolve the transaction:
Problem: conflicting requests
  - nothing provides libtidy.so.5()(64bit) needed by mailspring-1.17.0-0.1.x86_64 from @commandline
You can try to add to command line:
  --skip-broken to skip uninstallable packages
```

## User Reports

### Report 1 (B-rando1 - Fedora 43)
> "I uninstalled the previous version's rpm and tried to install version 1.17.0, but I got this error: nothing provides libtidy.so.5()(64bit) needed by mailspring-1.17.0-0.1.x86_64"

**Environment:**
- Fedora 43 with KDE Plasma 6.5.4

### Report 2 (clintre - Alma/Rocky Linux)
> "Can confirm. This is also an issue with the latest version of Alma and Rocky Linux. Newer versions use libtidy.so.58."

## Root Cause

The RPM package was built on a system with an older version of libtidy (version 5.x), and the automatic dependency detection picked up `libtidy.so.5`. Newer distributions have upgraded to libtidy 5.8.x which provides `libtidy.so.58` instead.

The libtidy library maintains ABI compatibility, so the actual runtime should work with the newer library version - this is purely a packaging/dependency metadata issue.

## Workaround (User-Provided)

A community member provided this workaround using `rpmrebuild`:

```bash
# Install rpmrebuild
sudo dnf install rpmrebuild

# Edit the RPM spec to change the dependency
rpmrebuild --package --edit-whole ./mailspring-1.17.0-0.1.x86_64.rpm

# In the editor, find and modify:
# Requires: libtidy.so.5()(64bit)
# Change to:
# Requires: libtidy.so.58()(64bit)

# Save and exit. The rebuilt RPM will be at:
# ~/rpmbuild/RPMS/x86_64/

# Install the modified RPM
sudo dnf install ~/rpmbuild/RPMS/x86_64/mailspring-1.17.0-0.1.x86_64.rpm

# Optional: remove rpmrebuild
sudo dnf remove rpmrebuild
```

## Recommended Fix

### Option 1: Relax the dependency (Recommended)
Instead of requiring a specific `.so` version, use a more flexible dependency:

```spec
Requires: libtidy
```

Or use a versioned package requirement instead of soname:

```spec
Requires: libtidy >= 5.0
```

### Option 2: Build on newer base system
Build the RPM on a Fedora 43 or newer base system so it picks up the correct library version.

### Option 3: Use autoreq filtering
In the RPM spec, filter out the automatic libtidy requirement and specify a manual one:

```spec
%global __requires_exclude ^libtidy\\.so.*$
Requires: libtidy
```

## Affected Build Files

Look for RPM spec files or build configuration in:
- Build scripts in the repository
- CI/CD configuration for RPM builds
- `electron-builder` configuration if it handles RPM packaging

## Additional Notes

The user also mentioned that after fixing the dependency issue, Wayland users may need to add `--ozone-platform=x11` to the launch command, which relates to a separate Wayland compatibility issue (see `004-linux-wayland-display.md`).

## Related Issues

- Linux/Wayland display issues (see `004-linux-wayland-display.md`)
