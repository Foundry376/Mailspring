# Technology Stack Inventory

This document lists the main languages, frameworks, libraries, and version constraints used across the Mailspring application. It is derived from the root `package.json`, `app/package.json`, and build configuration.

## Version Constraints

| Constraint | Value | Source |
|------------|-------|--------|
| Node | >=16.17 | Root `package.json` engines |
| npm | >=8 | Root `package.json` engines |
| Electron | 39.2.7 | Root and app (resolutions) |
| TypeScript | 5.7.3 | Root `package.json` |

---

## Root Repository (Development / Build)

The root `package.json` provides tooling and build dependencies. Key entries:

| Category | Technology | Version / note |
|----------|------------|----------------|
| Runtime | Electron | 39.2.7 |
| Packaging | @electron/packager | 18.3.6 |
| Windows installer | electron-winstaller | 5.4.0 |
| Build | Grunt | ^1.4.1 |
| Build | grunt-cli | ^1.4.3 |
| Language | TypeScript | 5.7.3 |
| Linting | ESLint | ^7.32.0 |
| Linting | prettier | ^1.10.0 |
| Native addons | node-gyp | ^12.1.0 |
| Testing | Jasmine | 2.x.x |

TypeScript and ESLint config live under `app/` (e.g. `app/tsconfig.json`, `.eslintrc`). The main build entry is `npm run build`, which runs Grunt with `app/build/Gruntfile.js` (see [deployment.md](deployment.md)).

---

## App (Electron Application)

The `app/package.json` defines the application name, main entry (`./src/browser/main.js`), and runtime dependencies used by the packaged app.

### Core UI and State

| Category | Technology | Version / note |
|----------|------------|----------------|
| UI | React | 16.9.0 |
| UI | react-dom | 16.9.0 |
| State | reflux | 0.1.13 |
| Reactive | rx-lite | 4.0.8 |
| Remote windows | @electron/remote | ^2.1.2 |

### Database and Data

| Category | Technology | Version / note |
|----------|------------|----------------|
| SQLite | better-sqlite3 | ^12.5.0 |
| Data | immutable | ^3.8.2 |
| Data | underscore | ^1.13.7 |

The app opens the SQLite database in **read-only** mode (WAL); the C++ Mailsync process is the sole writer.

### Composer and Rich Text

| Category | Technology | Version / note |
|----------|------------|----------------|
| Editor | slate (custom fork) | github:bengotow/slate#… |
| Editor | slate-react | github:bengotow/slate#0.45.1-react |
| Serialization | slate-html-serializer, slate-plain-serializer, slate-base64-serializer | Various |
| Email layout | juice | ^11.0.3 |

### Email, Calendar, and Contacts

| Category | Technology | Version / note |
|----------|------------|----------------|
| iCal | ical.js | ^2.2.1 |
| iCal | ical-expander | ^3.2.0 |
| vCard | vcf | ^2.0.5 |
| Date/time | moment, moment-timezone, moment-round | ^2.x / ^0.6.0 / ^1.0.1 |

### Utilities and Services

| Category | Technology | Version / note |
|----------|------------|----------------|
| HTTP / errors | chromium-net-errors | 1.0.3 |
| Parsing | chrono-node | ^2.9.0 |
| XML | xml2js | ^0.6.2 |
| HTML | cheerio | ^1.1.2 |
| Sanitization | dompurify | ^3.3.1 |
| Debug | debug | github:emorikawa/debug#nylas |
| Error reporting | raven | 2.1.2 |

### Testing (Dev)

| Category | Technology | Version / note |
|----------|------------|----------------|
| Test runner | jasmine-json, jasmine-react-helpers, jasmine-reporters | ~0.0 / ^0.2 / 1.x.x |
| React testing | enzyme, enzyme-adapter-react-16 | ^3.11.0 / ^1.15.8 |
| React testing | react-test-renderer | 16.9.0 |
| Stubbing | proxyquire | 1.3.1 |

### Optional / Platform-Specific

| Category | Technology | Version / note |
|----------|------------|----------------|
| macOS notifications | macos-notification-state | github:bengotow/… (optionalDependencies) |

---

## Mailsync (C++ Sync Engine)

The sync engine is developed in a **separate repository**: [Mailspring-Sync](https://github.com/Foundry376/Mailspring-Sync), included as a git submodule at `mailsync/`.

- **Build**: The C++ project uses its own build system (e.g. CMake, binding.gyp, or similar) inside that repo. The Mailspring Electron repo does **not** compile C++; it uses **prebuilt Mailsync binaries**.
- **Distribution**: `scripts/postinstall.js` can download a Mailsync tarball from S3 keyed by the current `mailsync` submodule commit. The URL pattern is:  
  `https://mailspring-builds.s3.amazonaws.com/mailsync/<hash>/<platform>/mailsync.tar.gz`  
  with platforms such as `osx`, `win-ia32`, `linux`.
- **Packaging**: The packager config in `app/build/tasks/package-task.js` unpacks `mailsync`, `mailsync.exe`, `mailsync.bin`, and `*.so` from the ASAR so the binary can be executed. The executable lives under the app directory (e.g. `app.asar.unpacked`) and is spawned by `app/src/mailsync-process.ts`.

To document the exact C++ standard, libraries (e.g. IMAP/SMTP, SQLite), and build steps, refer to the Mailspring-Sync repository and its build configuration (e.g. `binding.gyp`, CMakeLists.txt) when the submodule is present.

---

## Build and Config Files (Summary)

| File | Purpose |
|------|---------|
| Root `package.json` | Node/npm engines, dev/build deps, scripts (start, build, lint, test) |
| `app/package.json` | App metadata, Electron main, runtime deps, resolutions (electron) |
| `app/tsconfig.json` | TypeScript compiler options for app |
| `app/build/Gruntfile.js` | Grunt entry; defines build-client tasks per platform |
| `app/build/tasks/package-task.js` | @electron/packager config, ASAR unpack list, post-packaging steps |
| `app/build/tasks/eslint-task.js` | Lint task |
| `scripts/postinstall.js` | npm install hook; installs app deps with Electron env, optional Mailsync download |
| `.eslintrc`, `.prettierrc` | Lint and format config |

---

## Environment Overrides

- **OAuth**: `MS_GMAIL_CLIENT_ID`, `MS_GMAIL_CLIENT_SECRET`, `MS_O365_CLIENT_ID` can override OAuth credentials (see `app/internal_packages/onboarding/lib/onboarding-constants.ts`).
- **Build**: `SIGN_BUILD`, `OVERRIDE_TO_INTEL` (for x64 build on ARM), and platform-specific signing env vars (e.g. Apple notarization) are used by the build and CI (see [deployment.md](deployment.md)).
