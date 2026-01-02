# Plan: Replace AppVeyor with GitHub Actions for Windows Build

## Overview

Replace the existing `.appveyor.yml` Windows build configuration with a new GitHub Actions workflow that builds the Mailspring application for Windows, including code signing and artifact upload to S3.

## Current State Analysis

### AppVeyor Configuration (`.appveyor.yml`)
- **Runner**: Visual Studio 2019
- **Node.js**: v16
- **Certificate handling**: Uses OpenSSL to decrypt `app/build/resources/certs.tar.enc` using `encrypted_faf2708e46e2_key` and `encrypted_faf2708e46e2_iv`
- **Build steps**:
  1. `npm install`
  2. `npm run build`
  3. `node app/build/create-signed-windows-installer.js`
- **Artifacts uploaded**: `MailspringSetup.exe`, `*.nupkg`, `RELEASES`
- **Deploy**: S3 bucket `mailspring-builds` under `client/{commit}/win-x64/`

### Existing GitHub Actions Patterns
- **Linux** (`build-linux.yaml`): Uses `ubuntu-22.04`, Node 20, `npm ci`, AWS CLI for S3
- **macOS** (`build-macos.yaml`): Uses matrix builds, base64-encoded P12 cert as secret, `workflow_dispatch` trigger

## Implementation Plan

### Step 1: Create the GitHub Actions Workflow File

Create `.github/workflows/build-windows.yaml` with the following structure:

```yaml
name: Build for Windows

on:
  workflow_dispatch:
    branches: master

jobs:
  build:
    runs-on: windows-2022

    steps:
      - Checkout code
      - Setup Node.js 20
      - Setup AWS CLI
      - Decode and setup codesigning certificate
      - Install dependencies (npm ci)
      - Run lint
      - Build (npm run build)
      - Create signed Windows installer
      - Sync artifacts to S3
```

### Step 2: Certificate Handling Strategy

**Change from AppVeyor approach:**
- AppVeyor uses encrypted tar file with OpenSSL keys
- GitHub Actions will use base64-encoded certificate as a secret (consistent with macOS approach)

**Required secrets:**
| Secret Name | Description |
|-------------|-------------|
| `WINDOWS_CODESIGN_CERT_BASE64` | Base64-encoded P12 certificate file |
| `WINDOWS_CODESIGN_CERT_PASSWORD` | Password for the P12 certificate |
| `AWS_ACCESS_KEY_ID` | AWS credentials (already exists) |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials (already exists) |

**Certificate setup step:**
```yaml
- name: Setup Codesigning Certificate
  shell: pwsh
  run: |
    $certBytes = [Convert]::FromBase64String($env:CERT_BASE64)
    $certPath = "app\build\resources\certs\win\win-codesigning.p12"
    New-Item -ItemType Directory -Force -Path "app\build\resources\certs\win"
    [IO.File]::WriteAllBytes($certPath, $certBytes)
  env:
    CERT_BASE64: ${{ secrets.WINDOWS_CODESIGN_CERT_BASE64 }}
```

### Step 3: Build and Installer Creation

The workflow will:
1. Run `npm ci` for deterministic installs
2. Run `npm run lint` for code quality
3. Run `npm run build` to create the Electron app
4. Run `node app/build/create-signed-windows-installer.js` to create signed installer

Environment variables needed:
- `SIGN_BUILD=true`
- `WINDOWS_CODESIGN_CERT=app\build\resources\certs\win\win-codesigning.p12`
- `WINDOWS_CODESIGN_CERT_PASSWORD=${{ secrets.WINDOWS_CODESIGN_CERT_PASSWORD }}`

### Step 4: Artifact Upload to S3

Following the Linux workflow pattern:
```yaml
- name: Sync Artifacts to S3
  run: |
    aws s3 sync app/dist/ "s3://mailspring-builds/client/$(git rev-parse --short HEAD)/win-x64" `
      --acl public-read `
      --exclude "*" --include "MailspringSetup.exe" --include "*.nupkg" --include "RELEASES"
```

### Step 5: Delete AppVeyor Configuration

Remove `.appveyor.yml` after the new workflow is tested and working.

## Files to Create/Modify

| File | Action |
|------|--------|
| `.github/workflows/build-windows.yaml` | Create |
| `.appveyor.yml` | Delete |

## Required Secrets to Configure

The repository owner will need to add these secrets in GitHub repository settings:

1. **WINDOWS_CODESIGN_CERT_BASE64**: The Windows code signing certificate (`win-codesigning.p12`) encoded as base64
2. **WINDOWS_CODESIGN_CERT_PASSWORD**: The password for the P12 certificate

## Workflow Trigger

Following the pattern of existing workflows, using `workflow_dispatch` for manual triggering on master branch (same as Linux and macOS builds).

## Testing Checklist

- [ ] Workflow runs successfully on `windows-2022`
- [ ] Dependencies install correctly with `npm ci`
- [ ] Lint passes
- [ ] Build completes without errors
- [ ] Code signing works with the certificate
- [ ] `MailspringSetup.exe` is created
- [ ] Artifacts are uploaded to S3 bucket

## Notes

- Node.js version upgraded from 16 (AppVeyor) to 20 (matching Linux workflow)
- Using `npm ci` instead of `npm install` for reproducible builds
- Certificate handling simplified to use base64 secrets (same as macOS approach)
- Windows runner uses `windows-2022` which includes Visual Studio 2022
