# Section 01: Post-Merge Skill Customizations

Apply these AFTER merging each skill branch in the worktree.

---

## apple-container: Docker + Apple Container dual runtime

**Intent:** The apple-container skill ships with Apple Container as the only runtime. After merging,
the fork adds Docker as a fallback (Windows/Linux) while keeping Apple Container as preferred on macOS.

**Files:** `src/container-runtime.ts`

**How to apply:** Copy `src/container-runtime.ts` verbatim from the main tree (pre-upgrade backup).
This is a complete rewrite of the file that the skill ships — do not merge or patch, just replace.

Key behaviors this file provides:
- `detectRuntimeBin()` — prefers `container` (Apple Container) on macOS if available, falls back to `docker`
- `detectHostGateway()` — Apple Container uses bridge network gateway (`192.168.64.x`); Docker uses `host.docker.internal`
- `PROXY_BIND_HOST` — defaults to `127.0.0.1` (no hard throw if CREDENTIAL_PROXY_HOST missing)
- `ensureContainerRuntimeRunning()` — Apple Container uses `container system start`; Docker skips auto-start and logs a fatal error
- `cleanupOrphans()` — Apple Container parses `ls --format json`; Docker uses `ps --filter "name=nanoclaw-" --format {{.Names}}`

If v2 already has a `container-runtime.ts`, read it first — apply only the Docker+Apple dual-runtime additions rather than replacing wholesale.

---

## native-credential-proxy: Ollama admin tools + UID/GID + entrypoint .env handling

**Intent:** After merging native-credential-proxy, additional changes were made:
1. Add `OLLAMA_ADMIN_TOOLS` flag so containers can optionally run Ollama admin operations
2. Change main container privilege model: start as root, drop via `setpriv` in entrypoint (for .env shadowing)
3. Remove Docker-incompatible `/dev/null` file mount (move .env shadowing to entrypoint)
4. Remove `store/` and `global/` directory mounts from main containers
5. Simplify agent runner cache check to only watch `index.ts`
6. Remove heartbeat watchdog constants (`HEARTBEAT_CHECK_INTERVAL`, `HEARTBEAT_STALE_THRESHOLD`)

**Files:** `src/config.ts`, `src/container-runner.ts`

**IMPORTANT:** In v2 with the new container architecture, apply only targeted patches — do NOT
wholesale replace `container-runner.ts`. The v2 container model (two-DB mounts, agent groups) is
completely different. Apply the specific customizations listed below.

### src/config.ts

1. Add `'OLLAMA_ADMIN_TOOLS'` to the `readEnvFile([...])` array.

2. Add after the `CREDENTIAL_PROXY_PORT` export:
   ```typescript
   export const OLLAMA_ADMIN_TOOLS =
     (process.env.OLLAMA_ADMIN_TOOLS || envConfig.OLLAMA_ADMIN_TOOLS) === 'true';
   ```

3. Remove these exports if present:
   ```
   HEARTBEAT_CHECK_INTERVAL = 60_000
   HEARTBEAT_STALE_THRESHOLD = 300_000
   ```

### src/container-runner.ts

**a. Import OLLAMA_ADMIN_TOOLS** from `./config.js`.

**b. Forward OLLAMA_ADMIN_TOOLS to containers** — in `buildContainerArgs()`, after the TZ env arg:
   ```typescript
   if (OLLAMA_ADMIN_TOOLS) {
     args.push('-e', 'OLLAMA_ADMIN_TOOLS=true');
   }
   ```

**c. Change UID/GID model for main containers** — update `buildContainerArgs(mounts, containerName)` 
   to accept a third parameter `isMain: boolean`. In the UID/GID block:
   - Non-main containers: keep `--user hostUid:hostGid` (unchanged)
   - Main containers: use `-e RUN_UID=uid -e RUN_GID=gid` (no `--user`, start as root, entrypoint drops)

**d. Remove .env shadow file mount** from the main container branch in `buildVolumeMounts()`.
   Replace with comment: `.env shadowing is handled inside the container entrypoint via mount --bind`.

**e. Remove the `store/` writable mount** for main containers.

**f. Remove the `global/` directory mount** for main containers (writable `/workspace/global`).

**g. Simplify agent runner cache check** — replace the full-directory `newestSrcMtime` scan with a
   check of only `index.ts` modification time vs the cached copy.

---

## channel-formatting: Channel parameter intentionally reverted

**Intent:** The channel-formatting skill was merged, then the channel parameter was dropped from
`formatOutbound()` calls in `src/index.ts`. Channel-aware Markdown transformations are currently
**disabled** — all text is sent as plain stripped text.

**Files:** `src/index.ts`

**Decision point:** Verify at migration time whether this is intentional.

**Option A — Keep reverted (current behavior):**
Call `formatOutbound(rawText)` without a channel. IPC watcher calls `channel.sendMessage(jid, text)` directly.

**Option B — Restore channel-aware formatting:**
Where `formatOutbound(rawText)` is called with a channel available, pass:
```typescript
const text = formatOutbound(rawText, channel.name as ChannelType);
```
Restore the `formatOutbound` call in the IPC watcher path too.

`src/text-styles.ts` and `src/router.ts` are correct as-is — only call sites in `src/index.ts` need updating.
