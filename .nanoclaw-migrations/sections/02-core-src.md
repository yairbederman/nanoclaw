# Section 02: Core Source Customizations

These customizations are on core `src/` files — not introduced by any skill branch.
Apply after the skill merges and their post-merge patches (section 01).

---

## Trigger pattern: match anywhere in message

**Intent:** The upstream trigger regex requires the trigger word at the start of a message
(`^@Andy\b`). This fork changes it to match anywhere in the message body (`@Andy\b`).

**Files:** `src/config.ts`

**How to apply:** Find where `TRIGGER_PATTERN` (or `getTriggerPattern`) is constructed.
Change from `^` anchored regex to unanchored — remove the `^` prefix from the trigger regexp.

Standard change: find the line that builds the trigger pattern regex and remove `^` from it.

---

## PID file management

**Intent:** Write the process PID to `nanoclaw.pid` at startup and remove it on shutdown.
Used by Windows startup scripts and service managers to track the running process.

**Files:** `src/pid.ts` (new), `src/index.ts`

**How to apply:**

1. Create `src/pid.ts` — copy verbatim from main tree (16 lines). Functions: `writePidFile()` and `removePidFile()`. Writes to `process.cwd()/nanoclaw.pid`.

2. In `src/index.ts`, import and call:
   - `import { removePidFile, writePidFile } from './pid.js'`
   - At the top of `main()`: `writePidFile()`
   - In the `shutdown()` handler, before `process.exit(0)`: `removePidFile()`

---

## Credential proxy startup

**Intent:** The credential proxy HTTP server must start before any container is launched.
It intercepts container API requests and injects real credentials.

**Files:** `src/index.ts`

**How to apply:** In `main()`, before starting channels or the IPC watcher, add:
```typescript
import { startCredentialProxy } from './credential-proxy.js';
import { PROXY_BIND_HOST } from './container-runtime.js';
// ...
await startCredentialProxy(CREDENTIAL_PROXY_PORT, PROXY_BIND_HOST);
```

Also copy `src/credential-proxy.ts` verbatim from the main tree — this is the full proxy implementation
(~126 lines). It reads API credentials from `.env`, starts an HTTP server on the configured port,
and forwards requests to `api.anthropic.com` with injected auth headers.

**Note:** Verify whether v2 already handles credential injection differently. If v2 has its own
auth injection mechanism, this file may conflict or be redundant. Check before applying.

---

## Session commands (/compact)

**Intent:** Handle `/compact` slash command to trigger session compaction from within the chat.

**Files:** `src/session-commands.ts` (new), `src/index.ts`

**How to apply:**

1. Copy `src/session-commands.ts` verbatim from main tree (~164 lines). Contains:
   - `extractSessionCommand(message, trigger)` — parses `/compact` from message
   - `isSessionCommandAllowed(sender, group)` — allows only main group or is_from_me
   - `handleSessionCommand(cmd, ...)` — orchestrates compact with pre-message and cursor advancement

2. In `src/index.ts`, import these functions. Wire `handleSessionCommand` into the message processing loop
   when `extractSessionCommand` returns a non-null command.

**Note:** In the current fork, imports exist but `handleSessionCommand` is not yet actively invoked
in the message loop. The wiring may need to be completed at migration time.

---

## Task failure/completion notifications

**Intent:** When a scheduled task fails, is paused, or completes with no output, send the user
a visible message in the chat so they know what happened.

**Files:** `src/task-scheduler.ts`

**How to apply:** In the task execution callback in `task-scheduler.ts`, add these notification calls.

Three scenarios and their messages (all prefixed `[Task]`, truncate prompt to 50 chars):

**Task paused** (invalid group folder):
```typescript
await deps.sendMessage(
  task.chat_jid,
  `[Task] Paused: "${task.prompt.slice(0, 50)}..." — ${error}`,
);
```

**Task failed** (group not found):
```typescript
await deps.sendMessage(
  task.chat_jid,
  `[Task] Failed: "${task.prompt.slice(0, 50)}..." — Group not found: ${task.group_folder}`,
);
```

**Task completed with no output** (ran successfully but agent returned nothing):
```typescript
await deps.sendMessage(
  task.chat_jid,
  `[Task] Completed: "${truncatedPrompt}..." (no output)`,
);
```

Also a general task error notification:
```typescript
await deps.sendMessage(
  task.chat_jid,
  `[Task] Failed: "${truncatedPrompt}..." — ${error}`,
);
```

---

## Emoji reactions: DB schema and IPC handler

**Intent:** Store emoji reactions from WhatsApp in the database and handle reaction IPC messages
from containers, allowing agents to react to messages via the `react_to_message` MCP tool.

**Files:** `src/db.ts`, `src/ipc.ts`, `src/types.ts`

### src/db.ts — Reactions table

**How to apply:** Add a `reactions` table and associated query functions. Copy verbatim from main
tree, finding the reactions-related additions. Key items:

1. `Reaction` interface: `{ id, messageId, chatJid, reactorJid, emoji, timestamp }`

2. Create `reactions` table in schema initialization:
   ```sql
   CREATE TABLE IF NOT EXISTS reactions (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     message_id TEXT NOT NULL,
     chat_jid TEXT NOT NULL,
     reactor_jid TEXT NOT NULL,
     emoji TEXT NOT NULL,
     timestamp TEXT NOT NULL
   )
   ```
   Plus indices on `message_id`, `reactor_jid`.

3. Query functions: `storeReaction()`, `getReactionsForMessage()`, `getMessagesByReaction()`,
   `getReactionsByUser()`, `getReactionStats()`, `getMessageFromMe()`, `getLatestMessage()`

   Copy these function implementations verbatim from main tree `src/db.ts`.

### src/ipc.ts — Reaction IPC handler

**How to apply:** Add a handler for `type: 'reaction'` IPC messages. When a container writes
a reaction IPC file, the host reads it and calls `channel.sendReaction()` with the emoji and
message ID. Copy the reaction handler block from the main tree.

Also add: optional `sendReaction?` and `statusHeartbeat?` and `recoverPendingMessages?` callbacks
to the IPC deps interface (these are optional — existing code works without them).

Also add: periodic message recovery loop (60s interval) to catch stuck messages.

### src/types.ts — Channel interface extension

**How to apply:** Add optional methods to the `Channel` interface:
```typescript
sendReaction?(chatJid: string, emoji: string, messageId?: string): Promise<void>;
reactToLatestMessage?(chatJid: string, emoji: string): Promise<void>;
```

---

## Image attachment processing

**Intent:** Process WhatsApp image attachments — resize to max 1024px, convert to JPEG, and pass
them to the container agent as base64 content blocks for multimodal input.

**Files:** `src/image.ts` (new), `src/index.ts`

**How to apply:**

1. Copy `src/image.ts` verbatim from main tree (~66 lines). Uses `sharp` library.
   Functions: `processImageAttachment(path)` → resized JPEG, `parseImageReferences(content)`.

2. In `src/index.ts`, import `parseImageReferences` and pass `imageAttachments` to `runAgent()`.

3. Ensure `sharp` is in `package.json` dependencies (it is — see section 05).

---

## OneCLI removal cleanup

**Intent:** The fork removed OneCLI integration. These removals must not be accidentally
re-introduced when merging upstream changes.

**Files:** `src/index.ts`

**How to apply:** If v2 also doesn't have OneCLI, no action needed. If any merge conflict
re-introduces OneCLI imports or calls, reject them. Specifically remove:
- `import { OneCLI } from '@onecli-sh/sdk'`
- `ensureOneCLIAgent()` function and its call sites
- `getOrRecoverCursor()` function
- `ONECLI_URL` config import
- CLAUDE.md template copying from `groups/main` / `groups/global`
- `/remote-control` command handling
