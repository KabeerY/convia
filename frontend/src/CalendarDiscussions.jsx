import React, { useState } from "react";

export default function CalendarDiscussions({
  proposals = [],
  busy,
  onCommand,
  compact = false,
}) {
  return (
    <div className={`cc-discussions ${compact ? "compact" : ""}`}>
      {proposals.map((q) => (
        <Discussion
          key={q.proposal_id}
          q={q}
          busy={busy}
          onCommand={onCommand}
        />
      ))}
    </div>
  );
}
function Discussion({ q, busy, onCommand }) {
  const [reply, setReply] = useState("");
  const [expanded, setExpanded] = useState(false);
  return (
    <article className="cc-discussion">
      <span className="wm-kicker">
        {q.kind === "question"
          ? "GROUP QUESTION"
          : q.branch_id
            ? "BRANCH CHANGE"
            : "SHARED PLAN CHANGE"}{" "}
        · {q.status}
      </span>
      <h3>{q.title}</h3>
      {q.payload?.starts_at && (
        <p>
          {q.payload.starts_at.replace("T", " ").slice(0, 16)} UTC ·{" "}
          {q.payload.location}
        </p>
      )}
      <p>
        {q.yes_count} yes · {q.no_count} no
        {q.kind !== "question" && ` · ${q.threshold} yes needed`}
        {q.actor_ballot && ` · You: ${q.actor_ballot}`}
      </p>
      {q.branch_id && q.kind !== "question" && (
        <small>
          Shared branch changes need organizer approval as well as the voting
          threshold.
        </small>
      )}
      {q.branch_id && ["add", "edit", "remove"].includes(q.kind) && (
        <small>
          On branch activities, your vote also sets your attendance.
        </small>
      )}
      {q.status === "stale" && (
        <p className="cc-warning">
          The plan or branch membership changed. Review the current calendar and
          submit a fresh proposal.
        </p>
      )}
      <div className="cc-actions">
        {q.status === "open" && q.can_vote && (
          <>
            <button
              className="wm-primary"
              disabled={busy}
              onClick={() =>
                onCommand("vote", {
                  proposal_id: q.proposal_id,
                  vote: "yes",
                  expected_revision: q.revision,
                })
              }
            >
              {q.kind === "question" ? "Yes" : "Vote yes"}
            </button>
            <button
              className="wm-secondary"
              disabled={busy}
              onClick={() =>
                onCommand("vote", {
                  proposal_id: q.proposal_id,
                  vote: "no",
                  expected_revision: q.revision,
                })
              }
            >
              Vote no
            </button>
          </>
        )}
        {q.status === "open" && q.can_withdraw && (
          <button
            className="cc-text-button"
            disabled={busy}
            onClick={() =>
              onCommand("withdraw", { proposal_id: q.proposal_id })
            }
          >
            Withdraw
          </button>
        )}
        <button
          className="cc-text-button"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Hide discussion" : `Discuss (${q.replies.length})`}
        </button>
      </div>
      {expanded && (
        <div className="cc-thread">
          {q.replies.map((r) => (
            <div key={r.reply_id}>
              <strong>{r.display_name}</strong>
              <p>{r.body}</p>
            </div>
          ))}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await onCommand("reply", {
                  proposal_id: q.proposal_id,
                  body: reply,
                })
              )
                setReply("");
            }}
          >
            <label>
              Reply
              <textarea
                disabled={!q.can_reply}
                required
                maxLength={2000}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
              />
            </label>
            <button className="wm-secondary" disabled={busy || !q.can_reply}>
              Send reply
            </button>
          </form>
        </div>
      )}
    </article>
  );
}
