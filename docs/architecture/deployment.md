# Deployment Architecture

This document describes how the Mailspring binary is **built, signed, and distributed** across platforms. The build is driven by Grunt and **@electron/packager**; CI uses GitHub Actions. There is no electron-builder; packaging is custom.

---

## Build Entry Point

- **Command**: `npm run build`
- **Effect**: Runs `grunt build-client --gruntfile=app/build/Gruntfile.js --base=./` from the repo root.
- **Platform**: Defaults to `process.platform`; override with `grunt build-client --platform=win32` (or `darwin`, `linux`).

The Gruntfile delegates to platform-specific task chains:

- **win32**: `package` (Windows installer is created **outside** Grunt; see below).
- **darwin**: `package` → `create-mac-zip`.
- **linux**: `package` → `create-deb-installer` → `create-rpm-installer`.

---

## Packaging (Electron)

- **Tool**: [@electron/packager](https://github.com/electron/packager) (v18.3.6), configured in `app/build/tasks/package-task.js`.
- **Config**: Grunt merges options into `grunt.config('packager')`. Key settings:
  - **Output**: `app/dist/` (configurable via `outputDir`).
  - **App name**: Mailspring (darwin/win32), mailspring (linux).
  - **Arch**: win32 → x64; darwin → process.arch (or x64 if `OVERRIDE_TO_INTEL`).
  - **ASAR**: Used, with an **unpack** list so native binaries and certain assets stay outside the archive: `mailsync`, `mailsync.exe`, `mailsync.bin`, `*.so`, `*.dll`, `*.node`, vendor, quickpreview, etc.
  - **Signing (macOS)**: When `SIGN_BUILD=true`, `osxSign` and related options are set (identity from keychain / env).
- **Post-packaging steps** (in package-task.js): Resolve symlinks and copy into build folder; run TypeScript transpiler on packed app; write commit hash into `package.json`; (Linux) adjust chrome-sandbox permissions; (Windows) copy platform resources next to the ASAR.

The packed output directory is:

- **macOS**: `app/dist/Mailspring-darwin-{arch}/` (e.g. `Mailspring-darwin-arm64`).
- **Windows**: `app/dist/mailspring-win32-x64/`.
- **Linux**: `app/dist/mailspring-linux-{arch}/`.

---

## Platform-Specific Build and Distribution

### macOS

- **Package**: After `package`, the task `create-mac-zip` zips the `.app` bundle:
  - Path: `app/dist/Mailspring-darwin-{arch}/Mailspring.app` → `app/dist/Mailspring.zip`.
  - Intel override: when `OVERRIDE_TO_INTEL` is set, arch is forced to x64 and the folder name uses `x64`.
- **Signing / notarization**: Handled in CI (see below). Local builds use `SIGN_BUILD=true` and Apple identity from the keychain; notarization env vars (e.g. `APPLE_ID`, `APPLE_ID_PASSWORD`, `APPLE_TEAM_ID`) are used by electron-notarize when configured.
- **Artifacts**: `Mailspring.zip` (or renamed in CI to `Mailspring-AppleSilicon.zip` for arm64).

### Windows

- **Package**: Packager produces `app/dist/mailspring-win32-x64/`. The **installer** is **not** created by Grunt.
- **Installer**: Run manually or in CI: `node app/build/create-signed-windows-installer.js`.
  - Uses **electron-winstaller** (`createWindowsInstaller`).
  - Input: `app/dist/mailspring-win32-x64`.
  - Output: `app/dist/MailspringSetup.exe` (and related files).
  - Config: `app/build/create-signed-windows-installer.js` (icon, title, version from `app/package.json`).
- **Signing**: In CI, the built app folder is signed **before** the installer step using **Azure Trusted Signing** (see GitHub workflow). The script itself creates an unsigned installer; the workflow signs the executables first.

### Linux

- **Packages**: After `package`, two Grunt tasks run:
  - **create-deb-installer**: Produces a Debian package (e.g. `.deb`) under `app/dist/`, using templates in `app/build/resources/linux/` (e.g. `debian/control.in`, `Mailspring.desktop.in`).
  - **create-rpm-installer**: Produces an RPM using `app/build/resources/linux/redhat/mailspring.spec.in` and the `script/mkrpm` script.
- **Snap**: A separate CI job (`build-snap` in the Linux workflow) can build a Snap package using `snap/snapcraft.yaml`; see `.github/workflows/build-linux.yaml`.

---

## CI/CD (GitHub Actions)

Builds run on **workflow_dispatch** (and branch checks enforce `master` for production builds).

### macOS (`.github/workflows/build-macos.yaml`)

- **Runner**: `macos-latest` (arm64) and `macos-15-intel` (x64).
- **Steps**: Checkout → cache node_modules → npm ci → **Setup Codesigning** (Apple certificates from secrets) → AWS CLI → Lint → **Build** with `SIGN_BUILD=true` and notarization env (e.g. `APPLE_ID_ASC_PROVIDER`, `APPLE_ID_PASSWORD`, `APPLE_TEAM_ID`, `APPLE_ID`).
- **Artifact naming**: For arm64, `Mailspring.zip` is renamed to `Mailspring-AppleSilicon.zip`.
- **Distribution**: `aws s3 sync app/dist/` to `s3://mailspring-builds/client/<commit>/osx` with `--include *.zip`.

### Windows (`.github/workflows/build-windows.yaml`)

- **Runner**: `windows-2022`.
- **Steps**: Checkout → cache → Node 20 → npm ci → AWS CLI → Lint → **Build** (`npm run build`) → **Sign Application Files** with Azure Trusted Signing (exe/dll in `app\dist\mailspring-win32-x64`) → **Create Windows Installer** (`node app/build/create-signed-windows-installer.js`).
- **Secrets**: `AWS_*`, `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TRUSTED_SIGNING_*`; **Vars**: `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`, `AZURE_TRUSTED_SIGNING_CERT_PROFILE_NAME`.
- **Distribution**: Artifacts are synced to S3 (see workflow for exact path).

### Linux (`.github/workflows/build-linux.yaml`)

- **Runner**: `ubuntu-22.04`.
- **Steps**: Checkout → install system deps (build tools, libs for native modules) → Node 20 → npm ci → AWS CLI → Lint → **Build** (`DEBUG=electron-packager npm run build`).
- **Artifacts**: DEB and RPM uploaded as GitHub artifacts (short retention). **Sync to S3**: `app/dist/` → `s3://mailspring-builds/client/<commit>/linux` with `--include *.deb --include *.rpm`.
- **Snap**: Optional follow-up job `build-snap` (see workflow).

---

## Secrets and Variables (Summary)

| Purpose | Where | Kind |
|--------|--------|------|
| Apple codesigning / notarization | build-macos.yaml | Secrets (e.g. APPLE_ID, APPLE_ID_PASSWORD, APPLE_TEAM_ID, APPLE_CODESIGN_*) |
| AWS (S3 upload) | All three workflows | AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY |
| Azure Trusted Signing | build-windows.yaml | AZURE_* secrets; AZURE_TRUSTED_SIGNING_* vars |

---

## CircleCI

`.circleci/config.yml` runs a **test** job only (install deps, lint). It does **not** build or package the app. Production builds are done in GitHub Actions.

---

## Mailsync Binary

The Mailsync C++ binary is **not** built in this repo. It is either:

- **Prebuilt**: Downloaded during `npm install` (or postinstall) from S3, keyed by the `mailsync` submodule commit (see `scripts/postinstall.js`), and unpacked into the app (e.g. `app/mailsync` or platform-specific name), or
- **Present** in the tree (e.g. from a prior download or manual copy).

The packager's ASAR unpack list ensures `mailsync`, `mailsync.exe`, `mailsync.bin`, and `*.so` are left outside the ASAR so the binary can be executed at runtime.

---

## Summary Table

| Platform | Packager output | Extra step | Signing | Distribution |
|----------|-----------------|------------|---------|-------------|
| macOS    | Mailspring-darwin-{arch}/Mailspring.app → Mailspring.zip | create-mac-zip | osxSign + notarize (CI) | S3 client/&lt;commit&gt;/osx |
| Windows  | mailspring-win32-x64/ | create-signed-windows-installer.js | Azure Trusted Signing (CI) | S3 (see workflow) |
| Linux    | mailspring-linux-{arch}/ | create-deb-installer, create-rpm-installer | — | S3 client/&lt;commit&gt;/linux; optional Snap |
