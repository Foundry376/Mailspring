# Build Changelog Entry

Build a changelog entry for a new Mailspring release by analyzing git history.

## Instructions

1. **Identify the previous release tag** in the main repository:
   ```bash
   git tag --list '1.*' | sort -V | tail -5
   ```
   Tags use the format `1.X.Y` (no `v` prefix).

2. **Get commits since the last tag** in the main repo:
   ```bash
   git log <previous-tag>..HEAD --pretty=format:"%h %s (%an)" --no-merges
   ```

3. **Get the mailsync submodule commits**. The user must provide the previous mailsync commit hash, or you can find it by checking out the previous tag and looking at the submodule:
   ```bash
   cd mailsync && git log <previous-mailsync-commit>..HEAD --pretty=format:"%h %s (%an)" --no-merges
   ```

4. **Look up GitHub usernames** for external contributors (anyone other than "Ben Gotow") using:
   ```bash
   gh pr view <PR-number> --json author --jq '.author.login'
   ```

5. **Create the changelog entry** at the top of `CHANGELOG.md` following the format below.

6. **Bump the version number** to the new release in both places (the real version lives in `app/`, not the root `package.json` which is a `0.0.1` placeholder):
   - `app/package.json` — the `"version"` field.
   - `app/package-lock.json` — the two top-of-file `"version"` fields (the root `"version"` on line ~3 and the `packages[""]."version"` on line ~9). Both must match.

7. **Add a release entry** to the top of the `<releases>` list in `app/build/resources/linux/mailspring.metainfo.xml.in`, without reformatting the rest of the file:
   ```xml
   <release version="1.X.Y" date="YYYY-MM-DD">
     <url type="details">https://github.com/Foundry376/Mailspring/releases/tag/1.X.Y</url>
   </release>
   ```
   Note the date here is ISO format (`YYYY-MM-DD`), unlike the `M/D/YYYY` format used in the changelog heading. In both the the version string and the URL, 1.X.Y is a placeholder for the new version number.

## Changelog Format

```markdown
## 1.X.Y (M/D/YYYY)

Features:

- Description of new feature. (#PR-number)

Bug Fixes:

- Fixed description of bug. (#PR-number)

Improvements:

- Description of improvement. (#PR-number) Thanks @username!

Localization:

- Language updates. (#PR-number) Thanks @username!

Developer:

- Description of developer/build changes. (#PR-number)
```

## Section Guidelines

- **Features**: New user-facing functionality (calendar views, unsubscribe support, etc.)
- **Bug Fixes**: Fixes for broken behavior, include platform prefix if platform-specific (e.g., "On Windows, ...")
- **Improvements**: Enhancements to existing features
- **Localization**: Translation updates and new language support
- **Developer**: Build system, CI, dependency updates, code cleanup (less important to end users)

## Contributor Attribution

- **Always credit external contributors** (anyone other than Ben Gotow) with `Thanks @username!` at the end of the line
- Look up GitHub usernames from PR numbers using `gh pr view`
- The "Claude" author name refers to AI-assisted commits and does not need attribution

## Mailsync Changes

The `mailsync` directory is a git submodule containing the C++ sync engine. Changes there should be categorized into the same sections:

- Sync fixes (IMAP, SMTP, CardDAV, CalDAV) go in **Bug Fixes**
- New sync capabilities go in **Features**
- Dependency updates and CI changes go in **Developer**

## Example Workflow

```
User: /changelog
Assistant: I'll build a changelog entry. What is the previous release tag (e.g., 1.17.1)?
User: 1.17.1
Assistant: What was the mailsync commit hash for that release?
User: 80a361685a7cad73957658681160864b4ff13215
Assistant: [analyzes commits and builds changelog]
```

$ARGUMENTS
