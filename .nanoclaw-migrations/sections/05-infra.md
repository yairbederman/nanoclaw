# Section 05: Infrastructure, Startup, and Dependencies

---

## GitHub Actions: fork-sync-skills workflow

**Intent:** Automatically sync upstream main and merge it forward into all local `skill/*` branches
on a schedule (every 6 hours) and on push to main.

**Files:** `.github/workflows/fork-sync-skills.yml`

**How to apply:** Copy `.github/workflows/fork-sync-skills.yml` verbatim from the main tree.

The workflow:
- Triggers: `repository_dispatch`, schedule (every 6h), push to main, `workflow_dispatch`
- Step 1: Fetch upstream main, merge if not up-to-date, validate build+tests, push to origin main
- Step 2: For each `skill/*` branch, merge main in, validate build+tests, push
- Opens GitHub Issues on sync failure or skill merge failure
- Permissions: `contents: write`, `issues: write`
- Concurrency: single job, cancel-in-progress

**Note:** The workflow uses `GITHUB_TOKEN` for authentication. Verify this is sufficient for the fork
or if a PAT is needed for cross-repo operations.

---

## Windows startup files

**Intent:** Start NanoClaw automatically on Windows boot without requiring manual execution.

**Files:** `start-nanoclaw.bat`, `run-beedo.ps1` (if present)

**How to apply:** Copy these files verbatim from the main tree. They are Windows-specific and
have hardcoded paths to `C:\Users\YAIR\nanoclaw` and Node.js installation.

### start-nanoclaw.bat

Starts the compiled `dist/index.js` in the background, redirecting logs:
```batch
@echo off
REM start-nanoclaw.bat — Start NanoClaw on Windows
cd /d "C:\Users\YAIR\nanoclaw"
start /b "" "C:\Program Files\nodejs\node.exe" "C:\Users\YAIR\nanoclaw\dist\index.js" >> "C:\Users\YAIR\nanoclaw\logs\nanoclaw.log" 2>> "C:\Users\YAIR\nanoclaw\logs\nanoclaw.error.log"
```

### Task Scheduler / registry integration

If a Windows Task Scheduler entry or registry Run key exists to auto-start NanoClaw on boot,
it references `start-nanoclaw.bat`. Verify this is preserved after the upgrade by checking:
- Task Scheduler: `schtasks /query /fo LIST /v | findstr NanoClaw`
- Or check `register-task.ps1` if it exists in the main tree

---

## package.json dependencies

**Intent:** Multi-channel support and image processing require additional npm packages.

**How to apply:** After merging skills (which may add their own deps), verify these packages
are in `package.json`. If channels are reinstalled via `/add-<channel>` skills after upgrade,
those skills will add the deps — this list is for reference.

### Runtime dependencies added

| Package | Version | Purpose |
|---------|---------|---------|
| `@whiskeysockets/baileys` | ^7.0.0-rc.9 | WhatsApp Web (Baileys) |
| `discord.js` | ^14.18.0 | Discord bot |
| `googleapis` | ^144.0.0 | Google APIs (Gmail, Calendar) |
| `grammy` | ^1.39.3 | Telegram bot framework |
| `openai` | ^4.77.0 | OpenAI API client |
| `qrcode` | — | QR code generation |
| `qrcode-terminal` | — | QR code terminal display |
| `sharp` | ^0.34.1 | Image resize/convert for attachments |
| `yaml` | ^2.8.2 | YAML parsing |
| `@slack/bolt` | ^4.6.0 | Slack bot (Socket Mode) |
| `zod` | ^4.3.6 | Runtime type validation |

**Note:** When channels are reinstalled via `/add-<channel>` skills from the v2 `channels` branch,
those skills will manage their own deps. The `/add-whatsapp` skill installs Baileys; `/add-slack`
installs `@slack/bolt`; etc. You may not need to manually add these.

The `sharp` package (for image processing in `src/image.ts`) is NOT installed by any channel skill —
add it manually if `src/image.ts` is carried forward.

---

## .gitignore additions

**How to apply:** Verify these entries are in `.gitignore` after upgrade:
```
nanoclaw.pid
logs/
attachments/
store/
data/
.env
```

The `nanoclaw.pid` entry is important — it's an untracked runtime file that should never be committed.
