# Section 04: Content Files

Pure content files (not code) — copy verbatim from the main tree into the worktree.

---

## groups/global/CLAUDE.md — Claudet persona

**Intent:** The global group CLAUDE.md defines the "Claudet" persona with Israeli group-chat
personality, Hebrew/English consistency rules, Yair-protection rules, combat rules, and
detailed behavioral guidelines for social group contexts.

**How to apply:** Copy `groups/global/CLAUDE.md` verbatim from the main tree.

**Key sections to verify after copy:**
- References `mcp__nanoclaw__notify_operator` — verify this tool exists in v2 (see section 03)
- References `schedule_task` with a `script` parameter — this was **removed** from v2.
  After copy, update the "Task Scripts" section to remove references to the `script` parameter,
  or verify if v2 re-introduces it.
- References `/workspace/db/messages.db` for data analysis — verify this path is valid in v2's
  two-DB split architecture (it may now be `inbound.db` or a different path)

---

## groups/main/CLAUDE.md — Main group / infrastructure

**Intent:** The main group CLAUDE.md defines the "Andy" persona with infrastructure-focused
capabilities: group management, container mounts, auth context, scheduling for other groups,
global memory, task scripts.

**How to apply:** Copy `groups/main/CLAUDE.md` verbatim from the main tree.

**Key sections to verify after copy:**
- **Authentication section** — references short-lived OAuth tokens causing 401 errors.
  In v2 the auth model may differ — verify the token guidance is still accurate.
- **Container Mounts section** — describes main container having read-only project access.
  In v2 with two-DB split, the mount paths may differ.
- **Managing Groups section** — references `registered_groups` SQLite table and group JID format.
  Verify these are still accurate in v2's new entity model.
- **Task Scripts section** — same `script` parameter caveat as global CLAUDE.md.

---

## Note on data analysis path

`groups/global/CLAUDE.md` tells Claudet to access the message history database at
`/workspace/db/messages.db`. In v2 with the two-DB session split, the database architecture changed.
Verify what database is available inside containers at migration time and update the path if needed.
