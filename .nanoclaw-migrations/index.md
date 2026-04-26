# NanoClaw Migration Guide

Generated: 2026-04-26T12:40:32
Base: 934f063aff5c30e7b49ce58b53b41901d3472a3e
HEAD at generation: 6fc1ff975260d5b0cbfbde31c8fde18a8b80ce7b
Upstream: 0bc082a17cad3064bd9af395a61f1db959b85c1d

---

## Migration Plan

This is a **Tier 3 complex migration** — v1.x → v2.x with 7 breaking changes, 446 upstream commits, and 15 applied skill branches.

### Architecture change summary

v2 is a full architectural rewrite:
- New entity model: users, roles, messaging groups, agent groups, wired via `messaging_group_agents`
- Two-DB session split: `inbound.db` (host writes, container reads) + `outbound.db` (container writes, host reads)
- Channels no longer in trunk — installed via `/add-<channel>` skill commands from the `channels` branch
- Install flow changed: `bash nanoclaw.sh` replaces `/setup`
- Three-level channel isolation: per-channel agent, shared agent (`session_mode: 'shared'`), or merged (`session_mode: 'agent-shared'`)

### Order of operations

1. **Apply skill branches** (still available as `upstream/skill/*`) — `compact`, `emacs`, `ollama-tool`, `apple-container`, `native-credential-proxy`, `channel-formatting` — then apply their post-merge customizations
2. **Reapply core source customizations** — trigger pattern, PID, credential proxy startup, task notifications, reactions IPC, session commands
3. **Reapply container customizations** — Dockerfile privilege drop, entrypoint .env shadowing, ipc-mcp-stdio.ts tools
4. **Copy content files** — groups/global/CLAUDE.md, groups/main/CLAUDE.md
5. **Copy infra files** — GitHub Actions workflow, Windows startup files
6. **Install channels** — `/add-whatsapp`, `/add-slack`, `/add-discord`, `/add-telegram`, `/add-gmail` (after upgrade, via skill commands)
7. **Install remaining channel-adjacent skills** — `/add-reactions`, `/add-image-vision`, `/add-pdf-reader`

### Staging checkpoints

After Step 1–3 (skills + source): run `npm run build && npm test` — all should pass  
After Step 4–5 (content + infra): no build check needed  
After Step 6–7 (channel installs): run a live test message

### Risk areas

| Area | Risk | Notes |
|------|------|-------|
| `src/credential-proxy.ts` | HIGH | v2 auth model is different — verify whether v2 already handles credential injection, or if this file is still needed |
| `src/container-runner.ts` | HIGH | v2 uses completely different container architecture (agent groups, two-DB mounts) — patch only the targeted customizations |
| `src/db.ts` | HIGH | v2 has new schema (entity model, two-DB split) — do NOT wholesale replace. Apply only the reactions table additions |
| `groups/global/CLAUDE.md` | LOW | Pure content, safe to copy verbatim |
| `mcp__nanoclaw__notify_operator` | MEDIUM | Referenced in global CLAUDE.md — verify it exists in v2's MCP tools, or add it |
| `schedule_task` script param | MEDIUM | CLAUDE.md mentions `script` param, but it was REMOVED from ipc-mcp-stdio.ts — either update the CLAUDE.md or check if v2 re-introduces it |

---

## Applied Skills

Skills with `upstream/skill/*` branches — reapply via `git merge upstream/skill/<name> --no-edit` in the worktree:

| Skill | Branch | Customized? | Notes |
|-------|--------|-------------|-------|
| compact | `skill/compact` | No | Apply as-is |
| emacs | `skill/emacs` | No | Apply as-is |
| ollama-tool | `skill/ollama-tool` | No | Apply as-is |
| apple-container | `skill/apple-container` | **YES** | Docker fallback needed after merge — see [sections/01-skills.md](sections/01-skills.md) |
| native-credential-proxy | `skill/native-credential-proxy` | **YES** | Ollama config + UID/GID handling — see [sections/01-skills.md](sections/01-skills.md) |
| channel-formatting | `skill/channel-formatting` | **YES** | Channel param was reverted after merge — see [sections/01-skills.md](sections/01-skills.md) |

Skills that were applied but branches now DELETED from upstream (channels moved to `channels` branch):  
**Install these after upgrade via `/add-<skill>` skill commands — do NOT merge branches.**

| Old Branch | Install Command |
|-----------|----------------|
| `skill/whatsapp` | `/add-whatsapp` |
| `skill/slack` | `/add-slack` |
| `skill/discord` | `/add-discord` |
| `skill/telegram` | `/add-telegram` |
| `skill/gmail` | `/add-gmail` |
| `skill/reactions` | `/add-reactions` |
| `skill/image-vision` | `/add-image-vision` |
| `skill/pdf-reader` | `/add-pdf-reader` |
| `skill/voice-transcription` | SKIP — removed by user |
| `skill/local-whisper` | SKIP — removed by user |

---

## Skill Interactions

### apple-container + native-credential-proxy

Both modify `src/container-runner.ts` and `src/container-runtime.ts`. After merging both:
- `PROXY_BIND_HOST` export in `container-runtime.ts` — native-credential-proxy sets it to throw if missing; apple-container changes it to throw if CREDENTIAL_PROXY_HOST unset. The post-merge fix makes it default to `127.0.0.1` — ensure both skills don't re-introduce the throw.
- `buildContainerArgs()` in `container-runner.ts` — apple-container changes mounts; native-credential-proxy changes env injection. Both touch the same function. Apply the post-merge customization after both skills are merged.

### channel-formatting + other channel skills

The `channel-formatting` skill adds `src/text-styles.ts` and patches `src/router.ts`. The WhatsApp/Slack/Discord channel skills each call `sendMessage`. Post-merge, the channel parameter was intentionally dropped from `formatOutbound()` calls in `src/index.ts` — this effectively disables the channel-aware formatting. **Verify intent at migration time** — either restore the channel parameter or leave it as plain text passthrough.

---

## Custom Skills to Copy

These `.claude/skills/` directories don't correspond to upstream branches. Copy them verbatim from the main tree into the worktree:

- `.claude/skills/add-karpathy-llm-wiki/`
- `.claude/skills/add-macos-statusbar/`
- `.claude/skills/add-parallel/`
- `.claude/skills/add-telegram-swarm/`
- `.claude/skills/claw/`
- `.claude/skills/customize/`
- `.claude/skills/debug/`
- `.claude/skills/get-qodo-rules/`
- `.claude/skills/init-onecli/`
- `.claude/skills/migrate-from-openclaw/`
- `.claude/skills/migrate-nanoclaw/`
- `.claude/skills/qodo-pr-resolver/`
- `.claude/skills/setup/`
- `.claude/skills/update-nanoclaw/`
- `.claude/skills/update-skills/`
- `.claude/skills/x-integration/`
- `.claude/skills/add-whatsapp/` (install skill, not the code branch)
- `.claude/skills/add-telegram/`
- `.claude/skills/add-telegram-swarm/`

---

## Sections

- [01-skills.md](sections/01-skills.md) — Post-merge customizations for apple-container, native-credential-proxy, channel-formatting
- [02-core-src.md](sections/02-core-src.md) — Core source customizations (trigger pattern, PID, task notifications, reactions, session commands)
- [03-container.md](sections/03-container.md) — Container customizations (Dockerfile, entrypoint, ipc-mcp-stdio.ts tools)
- [04-content.md](sections/04-content.md) — groups/global/CLAUDE.md and groups/main/CLAUDE.md (copy verbatim)
- [05-infra.md](sections/05-infra.md) — GitHub Actions, Windows startup files, package.json dependencies
