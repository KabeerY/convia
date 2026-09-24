import React, { useEffect, useRef, useState } from "react";

const chatDay = (value) => value ? new Date(value).toDateString() : "";
const chatTime = (value) => value
  ? new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(new Date(value))
  : "";
const chatDate = (value) => {
  if (!value) return "Trip chat";
  const date = new Date(value);
  if (date.toDateString() === new Date().toDateString()) return "Today";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" }).format(date);
};

export function ChatRoom({ messages, members = [], tripTitle, unavailable, busy, onSend, onReviewProposal }) {
  const [draft, setDraft] = useState("");
  const composeRef = useRef(null);
  const timelineRef = useRef(null);
  const lastMessageId = messages.at(-1)?.message_id;

  useEffect(() => {
    if (timelineRef.current) timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
  }, [lastMessageId]);

  async function send(event) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || busy) return;
    const success = await onSend({ body: message, client_message_id: crypto.randomUUID() });
    if (success) setDraft("");
  }
  function mentionTrippy(prompt = "@Trippy ") {
    setDraft((current) => current ? `${current.trimEnd()} ${prompt}` : prompt);
    composeRef.current?.focus();
  }

  return <section className="wm-chat-shell" aria-label="Group trip chat">
    <div className="wm-chat-main">
      <header className="wm-chat-header">
        <div className="wm-chat-room-icon" aria-hidden="true">↗</div>
        <div className="wm-chat-room-title"><span className="wm-kicker">YOUR GROUP ROOM</span><h2>{tripTitle || "Trip chat"}</h2><p><span className={`wm-chat-live-dot${unavailable ? " is-offline" : ""}`} aria-hidden="true" />{unavailable ? "Chat unavailable" : "Live conversation"} <span aria-hidden="true">·</span> {members.length} {members.length === 1 ? "member" : "members"}</p></div>
        <div className="wm-chat-avatars" aria-label={`${members.length} group members`}>{members.slice(0, 4).map((member) => <span key={member.user_id} title={member.display_name || "Traveller"}>{(member.display_name || "T")[0].toUpperCase()}</span>)}{members.length > 4 && <span>+{members.length - 4}</span>}</div>
      </header>
      {unavailable ? <div className="wm-notice wm-notice-error">{unavailable}</div> : <>
        <div className="wm-chat-timeline" ref={timelineRef} aria-live="polite" aria-label="Messages">
          {messages.length === 0 ? <div className="wm-chat-welcome"><span className="wm-chat-welcome-symbol" aria-hidden="true">↗</span><span className="wm-kicker">A NEW CONVERSATION</span><h3>Good trips start here.</h3><p>Share an idea with your crew, or ask Trippy to shape one into a proposal.</p></div> : messages.map((message, index) => {
            const agent = message.content_kind === "agent";
            const mine = message.is_mine && !agent;
            const name = agent ? "Trippy" : message.display_name || "Traveller";
            const newDay = index === 0 || chatDay(message.created_at) !== chatDay(messages[index - 1].created_at);
            return <React.Fragment key={message.message_id}>
              {newDay && <div className="wm-chat-day"><span>{chatDate(message.created_at)}</span></div>}
              <article className={`wm-chat-row${mine ? " is-mine" : ""}${agent ? " is-agent" : ""}`}>
                {!mine && <span className="wm-chat-avatar" aria-hidden="true">{agent ? "↗" : name[0].toUpperCase()}</span>}
                <div className="wm-chat-message"><div className="wm-chat-message-meta"><strong>{mine ? "You" : name}</strong><time dateTime={message.created_at || undefined}>{chatTime(message.created_at)}</time></div><p>{message.body}</p>{message.change_set_id && <button className="wm-chat-proposal-link" type="button" onClick={onReviewProposal}>Review proposal <span aria-hidden="true">↗</span></button>}</div>
              </article>
            </React.Fragment>;
          })}
        </div>
        <div className="wm-chat-compose-area">
          <form className="wm-chat-compose" onSubmit={send}><textarea ref={composeRef} aria-label="Message your group" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} maxLength={1000} rows={2} placeholder="Message the group…" /><button className="wm-chat-send" type="submit" disabled={busy || !draft.trim()} aria-label={busy ? "Sending message" : "Send message"}>{busy ? "…" : "↗"}</button></form>
          <div className="wm-chat-compose-footer"><button type="button" onClick={() => mentionTrippy()}>@ Mention Trippy</button><span>Enter to send · Shift + Enter for a new line</span></div>
        </div>
      </>}
    </div>
    <aside className="wm-chat-aside"><span className="wm-kicker">CONVIA, IN THE ROOM</span><h3>Make the next move together.</h3><p>Trippy can turn a question into a suggested itinerary change. Your group still decides whether it becomes part of the plan.</p><button type="button" onClick={() => mentionTrippy("@Trippy suggest an activity for our trip ")}>Ask for an idea <span aria-hidden="true">↗</span></button><div className="wm-chat-aside-rule"><span>01</span> Talk it through</div><div className="wm-chat-aside-rule"><span>02</span> Review the proposal</div><div className="wm-chat-aside-rule"><span>03</span> Vote before the plan changes</div></aside>
  </section>;
}

export function GroupGenome({ genome, loading = false }) {
  if (loading) return <div className="wm-empty wm-empty-small">Reading the group’s travel rhythm…</div>;
  if (!genome) return <div className="wm-empty wm-empty-small">The group’s shared preferences will take shape as members confirm their Passports.</div>;
  const anchors = genome.shared_anchors || genome.anchors || [];
  const tensions = genome.tensions || [];
  const unknown = genome.unknown || [];
  return <div className="wm-genome-grid">
    <div className="wm-genome-card"><span className="wm-kicker">SHARED ANCHORS</span><strong>{anchors.length ? anchors.join(" · ") : "Still forming"}</strong><p>What brings this group together.</p></div>
    <div className="wm-genome-card"><span className="wm-kicker">DIFFERENT RHYTHMS</span><strong>{tensions.length ? tensions.join(" · ") : "Room to agree"}</strong><p>Preferences worth discussing, not hiding.</p></div>
    <div className="wm-genome-card"><span className="wm-kicker">STILL UNKNOWN</span><strong>{unknown.length ? unknown.join(" · ") : "The picture is clearer"}</strong><p>Missing information is never treated as a mismatch.</p></div>
  </div>;
}
