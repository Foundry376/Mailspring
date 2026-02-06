# Draft Forum Responses for Mailspring 1.17.3 Release

## Release Summary (1.17.3 - Jan 31, 2025)

- **Fix:** SMTP sending broken on Windows due to missing SASL libraries
- **Fix:** .deb package dependencies for Ubuntu 25 and Linux Mint 22
- **New:** Screenshot mode now blurs email content
- **Improved:** Spanish (Latin America) translations updated

## Threads Needing Responses

### 1. Today's update breaks SMTP AUTH after STARTTLS (IMAP works)

- **URL:** https://community.getmailspring.com/t/14123
- **Posts:** 20
- **Created:** 2026-01-25
- **Status:** No mention of 1.17.3 fix

**Proposed Response:**

> Hi all, this SMTP authentication issue was caused by missing SASL libraries that were inadvertently excluded in the 1.17.2 build. This has been fixed in **Mailspring 1.17.3** (released Jan 31). The update resolves SMTP sending failures (Error 296) across all platforms. Please update to 1.17.3 and let us know if the issue persists. [Changelog](https://github.com/Foundry376/Mailspring/blob/master/CHANGELOG.md)

---

### 2. Problem with SMTP login on version 1.17.2 Windows

- **URL:** https://community.getmailspring.com/t/14132
- **Posts:** 12
- **Created:** 2026-01-26
- **Status:** No mention of 1.17.3 fix

**Proposed Response:**

> Hi everyone, this was a known regression in 1.17.2 where SASL libraries needed for SMTP authentication were missing on Windows. **Mailspring 1.17.3** (released Jan 31) includes the fix for this. The build process now also verifies SASL library presence across all platforms to prevent this from happening again. Please update and let us know if you're still experiencing issues.

---

### 3. SMTP Error 296 with Yandex IMAP/SMTP account (IMAP OK, SMTP fails)

- **URL:** https://community.getmailspring.com/t/14167
- **Posts:** 2
- **Created:** 2026-01-31
- **Status:** User reverted to 1.17.1, no awareness of 1.17.3

**Proposed Response:**

> Hi, this SMTP authentication failure (Error 296) was a regression in 1.17.2 caused by missing SASL libraries. It has been fixed in **Mailspring 1.17.3** (released Jan 31). Please update from 1.17.1 to 1.17.3 — you should be able to re-enable auto-updates and send mail normally again.

---

### 4. [Bug] SMTP Error 296 (Handshake failure) on Exim 4.98 (cPanel)

- **URL:** https://community.getmailspring.com/t/14134
- **Posts:** 2
- **Created:** 2026-01-26
- **Status:** No mention of 1.17.3 fix

**Proposed Response:**

> Hi, this SMTP Error 296 was a known issue in 1.17.2 caused by missing SASL libraries in the build. **Mailspring 1.17.3** (released Jan 31) resolves this. Please update and your SMTP authentication should work correctly with your cPanel/Exim server again.

---

### 5. I cannot add email accounts

- **URL:** https://community.getmailspring.com/t/14148
- **Posts:** 1
- **Created:** 2026-01-27
- **Status:** No responses yet

**Proposed Response:**

> Hi, if you were experiencing this issue on version 1.17.2, it may be related to the SMTP authentication bug that was present in that release (missing SASL libraries caused account setup validation to fail). **Mailspring 1.17.3** (released Jan 31) fixes this. Please update and try adding your accounts again. If the issue persists after updating, please share your connection logs so we can investigate further.

---

## Threads Already Aware of Fix (No Response Needed)

| Thread ID | Title | Confirmed By |
|-----------|-------|-------------|
| 14124 | 1.17.2 - SMTP Auth Failing | anthrax132 (Feb 3) |
| 14135 | CRITICAL: SMTP Authentication Broken in 1.17.2 | Oral-B (Feb 1) |
| 14146 | Authentication Error | BrianPerktold (Feb 1) |
| 14151 | Changing expired password Error Code: 296 | okarpov (Feb 1) |
| 14168 | SMTP not working after updating to 1.17.2 | Oral-B (Feb 1) |
| 14139 | Unable to install Mailspring 1.17.2 on debian 13 | florealcab (Feb 2) |

## Threads Excluded (Not Addressed by 1.17.3)

| Thread ID | Title | Reason |
|-----------|-------|--------|
| 14158 | After updating to Mailspring version 1.17... Outlook | Likely OAuth-related, not SMTP/SASL |
| 14142 | Mailspring 1.17.3, nothing provides mesa-libgbm, openSUSE | RPM packaging issue, not .deb fix |
| 14202 | Mailspring 1.17.3 issues | Reporting issues WITH 1.17.3 |
| 14172 | 1.17.3 so far so good! | Positive feedback, no bug |
