/**
 * Undo a recorded batch of calendar writes.
 *
 * Every change set keeps the before/after snapshot of each session it touched, so the inverse is always the same
 * rule: restore `before`, in reverse order, and delete the session when `before` is null. Reverse order matters when
 * one batch touched the same session more than once (move then delete, delete then re-add), because the last write of
 * the batch is the one a revert has to undo first.
 *
 * A revert is recorded as its own change set (with action "revert" entries), so it is auditable like every other batch,
 * and it can itself be reverted: the same rule restores the state from just before the undo.
 */
import { randomUUID } from "node:crypto";
import type { ChangeEntry, ChangeSet, Store } from "./types";

export interface RevertResult {
  /** The inverse mutations, newest first, in the shape the calendar UI animates. */
  changes: ChangeEntry[];
  /** The change set that was undone. */
  revertedChangeSetId: string;
  restored: number;
  deleted: number;
}

const MAX_SUMMARY_CHARS = 280;

function summarizeUndo(changeSet: ChangeSet): string {
  const summary = changeSet.summary.trim().length === 0 ? `Undo ${changeSet.changeSetId}` : `Undo: ${changeSet.summary}`;
  return summary.length > MAX_SUMMARY_CHARS ? `${summary.slice(0, MAX_SUMMARY_CHARS - 1)}…` : summary;
}

/**
 * Apply the inverse of `changeSet` for `userId` and append the audit change set. Pure in the sense that it talks only
 * to the store: no HTTP, no model. `at` is injectable so a caller with its own clock keeps one timeline.
 *
 * An already reverted change set is a no-op (no second audit row): undoing twice must not corrupt the calendar.
 */
export function applyRevert(
  store: Store,
  userId: string,
  changeSet: ChangeSet,
  at: string = new Date().toISOString(),
): RevertResult {
  if (changeSet.userId !== userId) {
    throw new Error(`change set ${changeSet.changeSetId} does not belong to this user`);
  }
  if (changeSet.revertedAt !== null) {
    return { changes: [], revertedChangeSetId: changeSet.changeSetId, restored: 0, deleted: 0 };
  }

  const changes: ChangeEntry[] = [];
  let restored = 0;
  let deleted = 0;
  for (const entry of [...changeSet.entries].reverse()) {
    const current = store.getSession(userId, entry.sessionId) ?? null;
    if (entry.before === null) {
      if (store.deleteSession(userId, entry.sessionId)) deleted += 1;
      changes.push({
        action: "revert",
        sessionId: entry.sessionId,
        before: current,
        after: null,
        fromDay: current === null ? null : current.day,
        toDay: null,
        title: current === null ? entry.title : current.title,
        kind: current === null ? entry.kind : current.kind,
      });
      continue;
    }
    store.upsertSession(entry.before);
    restored += 1;
    changes.push({
      action: "revert",
      sessionId: entry.sessionId,
      before: current,
      after: entry.before,
      fromDay: current === null ? null : current.day,
      toDay: entry.before.day,
      title: entry.before.title,
      kind: entry.before.kind,
    });
  }

  store.appendChangeSet({
    changeSetId: `change:${randomUUID()}`,
    userId,
    createdAt: at,
    summary: summarizeUndo(changeSet),
    entries: changes,
    revertedAt: null,
  });
  store.markChangeSetReverted(userId, changeSet.changeSetId, at);
  return { changes, revertedChangeSetId: changeSet.changeSetId, restored, deleted };
}
