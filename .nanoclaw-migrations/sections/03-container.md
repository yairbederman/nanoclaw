# Section 03: Container Customizations

Changes inside `container/` — Dockerfile, entrypoint, and the agent runner.

---

## Dockerfile: PDF reader binary + privilege dropping

**Intent:** Add the PDF reader CLI binary to the container image, and enable privilege dropping
so main containers can shadow `.env` via `mount --bind` (Apple Container compatibility).

**Files:** `container/Dockerfile`

**How to apply:**

1. **System dependencies** — ensure `poppler-utils` is in the apt-get install list (adds `pdftotext`, `pdfinfo`).

2. **PDF reader binary** — after the npm install step, copy and install the PDF reader CLI:
   ```dockerfile
   COPY container/skills/pdf-reader/pdf-reader /usr/local/bin/pdf-reader
   RUN chmod +x /usr/local/bin/pdf-reader
   ```

3. **Privilege model change** — remove the hardcoded `USER node` statement from the Dockerfile.
   Main containers now start as root (to run `mount --bind`) and drop to the host user via `setpriv`
   in the entrypoint script. Non-main containers use `--user` flag at runtime.

4. **Entrypoint .env shadowing** (Apple Container) — the entrypoint must:
   - Accept `RUN_UID` and `RUN_GID` environment variables
   - If set, run `mount --bind /dev/null /workspace/project/.env` to shadow .env
   - Then drop privileges: `setpriv --reuid=$RUN_UID --regid=$RUN_GID --clear-groups -- node dist/index.js`
   
   Copy the current `container/entrypoint.sh` verbatim from the main tree — it contains the full
   privilege-dropping logic.

---

## container/agent-runner/src/ipc-mcp-stdio.ts: New MCP tools

**Intent:** Add `react_to_message` tool for emoji reactions, and update `send_message` description
to clarify behavior in scheduled tasks.

**Files:** `container/agent-runner/src/ipc-mcp-stdio.ts`

**IMPORTANT:** In v2, the container agent runner has a completely new structure with separate
`mcp-tools/` files. Check whether `ipc-mcp-stdio.ts` still exists in v2 or whether tools are
now defined elsewhere (e.g., `src/mcp-tools/core.ts`, `src/mcp-tools/scheduling.ts`).

**How to apply:**

### Update send_message description

Find the `send_message` tool definition and update its description to:
> "Send a message to the user or group immediately while you're still running. Use this for progress
> updates or to send multiple messages. You can call this multiple times. **Note: when running as a
> scheduled task, your final output is NOT sent to the user — use this tool if you need to communicate
> with the user or group.**"

### Add react_to_message tool

Add this tool definition (after `send_message`):

```typescript
server.tool(
  'react_to_message',
  'React to a message with an emoji. Omit message_id to react to the most recent message in the chat.',
  {
    emoji: z
      .string()
      .describe('The emoji to react with (e.g. "👍", "❤️", "🔥")'),
    message_id: z
      .string()
      .optional()
      .describe(
        'The message ID to react to. If omitted, reacts to the latest message in the chat.',
      ),
  },
  async (args) => {
    const data: Record<string, string | undefined> = {
      type: 'reaction',
      chatJid,
      emoji: args.emoji,
      messageId: args.message_id || undefined,
      groupFolder,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(MESSAGES_DIR, data);

    return {
      content: [
        { type: 'text' as const, text: `Reaction ${args.emoji} sent.` },
      ],
    };
  },
);
```

### Remove script parameter from schedule_task

In the `schedule_task` tool definition, remove the `script` parameter from the zod schema.
Bash scripts are no longer supported as pre-checks for scheduled tasks.

---

## container/agent-runner/src/index.ts: Image attachment support

**Intent:** Accept image attachments from the host and pass them as multimodal content blocks
to the Claude API call.

**Files:** `container/agent-runner/src/index.ts`

**How to apply:**

In v2 the agent runner is significantly refactored. Check whether image attachment support
already exists in v2's agent runner before applying these patches.

If not present, add:

1. `ImageAttachment` type: `{ relativePath: string; mediaType: string }`

2. Accept `imageAttachments?: ImageAttachment[]` in `ContainerInput`.

3. In the message assembly loop, when `input.imageAttachments` is present, add image content blocks
   before the text content block:
   ```typescript
   for (const img of input.imageAttachments) {
     const imageData = fs.readFileSync(path.join(workspaceDir, img.relativePath));
     content.push({
       type: 'image',
       source: {
         type: 'base64',
         media_type: img.mediaType as 'image/jpeg',
         data: imageData.toString('base64'),
       },
     });
   }
   ```

---

## notify_operator tool

**Intent:** `groups/global/CLAUDE.md` references `mcp__nanoclaw__notify_operator` as a tool
to send a message directly to Yair's private chat outside the current group.

**Current state:** This tool does NOT exist in the fork's `ipc-mcp-stdio.ts`. It's referenced in
the CLAUDE.md but was never implemented (or was removed). This is a gap.

**How to apply at migration time:**

1. Check if v2 has a `notify_operator` tool in its MCP tool definitions.

2. If not, add it to the container agent's MCP tools:
   - Tool name: `notify_operator`
   - Description: Send a message to the operator (Yair) in their private chat, outside the current group
   - Input: `{ text: string }`
   - Implementation: writes an IPC file with `type: 'notify_operator'`, `text`, `timestamp`
   - Host must handle `type: 'notify_operator'` in `src/ipc.ts` to route the message to the operator's JID

3. If the tool can't be added immediately, update `groups/global/CLAUDE.md` to use `send_message`
   with a note to the user explaining the limitation.

The operator JID (Yair's WhatsApp number) must be configured somewhere — check `.env` or config.
