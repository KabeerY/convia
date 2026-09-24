import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  branchOrder,
  datePlus,
  layoutEvents,
  localParts,
  overlaps,
  snapMinutes,
  timeString,
  zonedInstant,
} from "./lib/calendar";
import CalendarDiscussions from "./CalendarDiscussions";
import DecisionRoom from "./DecisionRoom";
import "./calendar.css";

const DAY_MS = 86400000;
const SCALE = 1.15;
const dateLabel = (date) =>
  new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00Z`));
function useMobile() {
  const [mobile, setMobile] = useState(
    () => window.matchMedia("(max-width: 760px)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const update = () => setMobile(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return mobile;
}
export function CalendarOverlay({
  title,
  kicker,
  anchor,
  children,
  onClose,
  onBack,
}) {
  const panel = useRef(null),
    mobile = useMobile();
  useEffect(() => {
    const prior = document.activeElement,
      overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    const key = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const nodes = panel.current?.querySelectorAll(
          'button:not(:disabled), input, select, textarea, [tabindex="0"]',
        );
        if (!nodes?.length) {
          e.preventDefault();
          return;
        }
        if (
          e.shiftKey &&
          (document.activeElement === nodes[0] ||
            document.activeElement === panel.current)
        ) {
          e.preventDefault();
          nodes[nodes.length - 1].focus();
        } else if (
          !e.shiftKey &&
          document.activeElement === nodes[nodes.length - 1]
        ) {
          e.preventDefault();
          nodes[0].focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      prior?.focus();
    };
  }, [onClose]);
  const width = Math.min(440, window.innerWidth - 32);
  const left = anchor
    ? anchor.right + width + 16 < window.innerWidth
      ? anchor.right + 12
      : Math.max(16, anchor.left - width - 12)
    : (window.innerWidth - width) / 2;
  const top = Math.max(
    16,
    Math.min(
      anchor?.top || 80,
      window.innerHeight - Math.min(720, window.innerHeight - 32) - 16,
    ),
  );
  return createPortal(
    <div className="cc-overlay">
      <button
        className="cc-backdrop"
        aria-label="Close panel"
        onClick={onClose}
      />
      <section
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="cc-popover"
        style={
          mobile
            ? undefined
            : { width, left, top, maxHeight: window.innerHeight - top - 16 }
        }
      >
        <div className="cc-handle" />
        <header>
          {onBack && (
            <button
              className="wm-icon-button"
              onClick={onBack}
              aria-label="Back"
            >
              ←
            </button>
          )}
          <div>
            <span className="wm-kicker">{kicker}</span>
            <h2>{title}</h2>
          </div>
          <button
            className="wm-icon-button"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <div className="cc-popover-body">{children}</div>
      </section>
    </div>,
    document.body,
  );
}

export default function PlanCalendar({
  trip,
  items,
  forks = [],
  calendar,
  unavailable,
  timezone = "Asia/Kolkata",
  version,
  busy,
  members,
  canVote,
  decisions,
  onVote,
  onCommand,
  actionError,
}) {
  const mobile = useMobile();
  const scrollRef = useRef(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const measure = () => setViewportWidth(element.clientWidth);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);
  const [day, setDay] = useState(trip.start_date),
    [panel, setPanel] = useState(null),
    [ideas, setIdeas] = useState(false),
    [collapsed, setCollapsed] = useState([]);
  const close = React.useCallback(() => setPanel(null), []);
  const branches = calendar?.branches || [];
  const actor = calendar?.actor_id;
  const confirmed =
    calendar?.activities ||
    items.map((i) => ({ ...i, branch_id: null, attendee_ids: [] }));
  // Existing approved V0 forks remain visible in dedicated, read-only lanes.
  const legacy = forks
    .filter((f) => !branches.some((b) => b.branch_id === f.fork_id))
    .map((f) => ({
      branch_id: f.fork_id,
      parent_branch_id: null,
      title:
        confirmed.find((i) => i.item_id === f.alternative_item_id)?.title ||
        "Alternate path",
      starts_at: confirmed.find((i) => i.item_id === f.source_item_id)
        ?.starts_at,
      rejoin_at: f.rejoin_at,
      rejoin_note: f.rejoin_note,
      source_item_id: f.source_item_id,
      member_ids: [],
      depth: 1,
      legacy: true,
      alternative_item_id: f.alternative_item_id,
    }))
    .filter((b) => b.starts_at);
  const allBranches = [...branches, ...legacy];
  const normalized = confirmed.map((i) => ({
    ...i,
    branch_id:
      legacy.find((b) => b.alternative_item_id === i.item_id)?.branch_id ||
      i.branch_id,
  }));
  const pending = (calendar?.proposals || [])
    .filter((q) => q.status === "open" && ["add", "edit"].includes(q.kind))
    .map((q) => ({
      ...q.payload,
      item_id: q.proposal_id,
      branch_id: q.branch_id,
      pending: true,
      proposal: q,
      attendee_ids: [],
    }));
  const events = [...normalized, ...pending];
  const count = Math.max(
    1,
    Math.round(
      (Date.parse(trip.end_date) - Date.parse(trip.start_date)) / DAY_MS,
    ) + 1,
  );
  const days = Array.from({ length: count }, (_, i) =>
    datePlus(trip.start_date, i),
  );
  const dates = mobile ? [day] : days;
  const lanes = dates.flatMap((date) => [
    { date, id: null, title: "Main plan" },
    ...branchOrder(allBranches)
      .filter(
        (b) =>
          localParts(b.starts_at, timezone).date <= date &&
          localParts(b.rejoin_at, timezone).date >= date,
      )
      .map((b) => ({ date, id: b.branch_id, title: b.title, branch: b })),
  ]);
  const timed = events.filter((i) => i.starts_at && i.ends_at);
  const visibleRanges = dates.flatMap((date) =>
    timed.flatMap((i) => {
      const from = localParts(i.starts_at, timezone),
        to = localParts(i.ends_at, timezone);
      if (
        from.date > date ||
        to.date < date ||
        (to.date === date && to.minutes === 0)
      )
        return [];
      return [
        {
          start: from.date < date ? 0 : from.minutes,
          end: to.date > date ? 1440 : to.minutes,
        },
      ];
    }),
  );
  const first = Math.min(
    7,
    ...visibleRanges.map((i) => Math.floor(i.start / 60)),
  );
  const last = Math.max(21, ...visibleRanges.map((i) => Math.ceil(i.end / 60)));
  const startMinute = first * 60,
    endMinute = Math.min(1440, last * 60),
    height = (endMinute - startMinute) * SCALE;
  const solo = mobile && lanes.length === 1;
  const collapsedCount = lanes.filter(
    (lane) => lane.id && collapsed.includes(lane.id),
  ).length;
  const expandedCount = lanes.length - collapsedCount;
  const laneWidth = solo
    ? null
    : Math.max(
        260,
        (viewportWidth - 56 - collapsedCount * 64) / Math.max(1, expandedCount),
      );
  const selected =
    panel?.itemId && normalized.find((i) => i.item_id === panel.itemId);
  const selectedBranch = allBranches.find(
    (b) => b.branch_id === (panel?.branchId || selected?.branch_id),
  );
  const proposals = calendar?.proposals || [];
  const anchor = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top };
  };
  function place(date, minute, branchId = null, idea = null, rect = null) {
    const branch = branches.find((b) => b.branch_id === branchId);
    const input = `${date}T${timeString(snapMinutes(minute))}`;
    setPanel({
      type: "activity",
      branchId,
      starts: input,
      idea,
      anchor: rect,
      key: crypto.randomUUID(),
      branch,
    });
  }
  function openActivity(item, e) {
    setPanel(
      item.pending
        ? {
            type: "proposal",
            proposalId: item.proposal.proposal_id,
            anchor: anchor(e),
          }
        : { type: "detail", itemId: item.item_id, anchor: anchor(e) },
    );
  }
  const recommendations = (
    <div className="cc-ideas">
      <p>Choose a time, or drag an idea onto the desktop calendar.</p>
      {(calendar?.recommendations || []).map((idea) => (
        <article
          key={idea.recommendation_id}
          draggable={!mobile}
          onDragStart={(e) =>
            e.dataTransfer.setData(
              "application/convia-idea",
              idea.recommendation_id,
            )
          }
        >
          <span className="wm-kicker">
            {idea.source === "sample" ? "SAMPLE IDEA" : "TRIPPY RECOMMENDS"} ·{" "}
            {idea.duration_minutes} MIN
          </span>
          <h3>{idea.title}</h3>
          <p>{idea.description}</p>
          <small>{idea.reason}</small>
          {proposals.some(
            (q) => q.payload?.title === idea.title && q.status === "open",
          ) && <small>Already proposed · awaiting votes</small>}
          <button
            className="wm-secondary"
            onClick={(e) => {
              setIdeas(false);
              place(day, 540, null, idea, anchor(e));
            }}
          >
            Choose time →
          </button>
        </article>
      ))}
      {!calendar?.recommendations?.length && <p>No recommendations yet.</p>}
    </div>
  );
  return (
    <div className="cc-calendar">
      {unavailable && (
        <p className="wm-notice wm-notice-error" role="alert">
          {unavailable}
        </p>
      )}
      <div className="cc-toolbar">
        <div>
          <span className="wm-kicker">YOUR DAYS, TOGETHER & APART</span>
          <p>
            Times in {timezone.replaceAll("_", " ")} · changes to the shared
            plan go to a vote.
          </p>
        </div>
        <div className="cc-actions">
          {canVote && (
            <>
              <button className="wm-secondary" onClick={() => setIdeas(!ideas)}>
                ✧ Ideas
              </button>
              <button
                className="wm-primary"
                onClick={(e) => place(day, 540, null, null, anchor(e))}
              >
                ＋ Activity
              </button>
            </>
          )}
        </div>
      </div>
      <div className="cc-day-tabs" aria-label="Choose day">
        {days.map((date) => (
          <button
            key={date}
            className={day === date ? "active" : ""}
            onClick={() => {
              setDay(date);
              document.getElementById(`cc-day-${date}`)?.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
                inline: "start",
              });
            }}
          >
            {dateLabel(date)}
          </button>
        ))}
      </div>
      <div className={`cc-workspace ${ideas && !mobile ? "with-ideas" : ""}`}>
        <div
          ref={scrollRef}
          className="cc-scroll"
          tabIndex={0}
          aria-label="Trip calendar; scroll for more days and branches"
        >
          <div
            className={`cc-grid ${solo ? "solo" : ""}`}
            style={{
              width: solo
                ? "100%"
                : 56 +
                  lanes.reduce(
                    (sum, l) =>
                      sum + (collapsed.includes(l.id) ? 64 : laneWidth),
                    0,
                  ),
            }}
          >
            <div className="cc-corner" />
            <div className="cc-time-rail" style={{ height }}>
              {Array.from({ length: endMinute / 60 - first + 1 }, (_, i) => (
                <span key={i} style={{ top: i * 60 * SCALE }}>
                  {timeString((first + i) * 60)}
                </span>
              ))}
            </div>
            <div className="cc-columns">
              <svg
                className="cc-connections"
                aria-label="Branch split and rejoin connections"
                style={{ top: 100, height, width: "100%" }}
              >
                {lanes.map((lane, index) => {
                  if (!lane.branch || collapsed.includes(lane.id)) return null;
                  const b = lane.branch,
                    parentIndex = lanes.findIndex(
                      (l) =>
                        l.date === lane.date && l.id === b.parent_branch_id,
                    );
                  if (parentIndex < 0) return null;
                  const x = (idx) =>
                    lanes
                      .slice(0, idx)
                      .reduce(
                        (sum, l) =>
                          sum + (collapsed.includes(l.id) ? 64 : laneWidth),
                        0,
                      ) +
                    (collapsed.includes(lanes[idx].id) ? 32 : laneWidth / 2);
                  const start = localParts(b.starts_at, timezone),
                    end = localParts(b.rejoin_at, timezone);
                  const y1 =
                    (Math.max(
                      startMinute,
                      start.date === lane.date ? start.minutes : startMinute,
                    ) -
                      startMinute) *
                    SCALE;
                  const y2 =
                    (Math.min(
                      endMinute,
                      end.date === lane.date ? end.minutes : endMinute,
                    ) -
                      startMinute) *
                    SCALE;
                  return (
                    <g key={`${lane.date}-${lane.id}`}>
                      <title>
                        {b.title} splits from its parent and rejoins at{" "}
                        {b.rejoin_note}
                      </title>
                      <path
                        d={`M ${x(parentIndex)} ${y1} H ${x(index)} V ${y2}${end.date === lane.date ? ` H ${x(parentIndex)}` : ""}`}
                        fill="none"
                        stroke="#826d92"
                        strokeWidth="2"
                      />
                      {end.date === lane.date && (
                        <circle
                          cx={x(parentIndex)}
                          cy={y2}
                          r="4"
                          fill="#826d92"
                        />
                      )}
                    </g>
                  );
                })}
              </svg>
              {lanes.map((lane) => {
                const mini = lane.id && collapsed.includes(lane.id);
                const branch = lane.branch;
                const laneEvents = timed
                  .filter(
                    (i) =>
                      i.branch_id === lane.id &&
                      localParts(i.starts_at, timezone).date <= lane.date &&
                      localParts(i.ends_at, timezone).date >= lane.date,
                  )
                  .map((i) => {
                    const from = localParts(i.starts_at, timezone),
                      to = localParts(i.ends_at, timezone);
                    return {
                      ...i,
                      top: Math.max(
                        startMinute,
                        from.date < lane.date ? 0 : from.minutes,
                      ),
                      bottom: Math.min(
                        endMinute,
                        to.date > lane.date ? 1440 : to.minutes,
                      ),
                    };
                  })
                  .filter((i) => i.bottom > i.top);
                const rejoin = branch && localParts(branch.rejoin_at, timezone);
                const source =
                  branch &&
                  normalized.find((i) => i.item_id === branch.source_item_id);
                const joined = branch?.member_ids.includes(actor);
                return (
                  <section
                    key={`${lane.date}-${lane.id}`}
                    id={!lane.id ? `cc-day-${lane.date}` : undefined}
                    className={`cc-lane ${lane.id ? "branch" : ""} ${mini ? "collapsed" : ""}`}
                    style={{ width: solo ? "100%" : mini ? 64 : laneWidth }}
                    aria-label={`${dateLabel(lane.date)} ${lane.title}`}
                  >
                    <header>
                      <div>
                        <span className="wm-kicker">
                          {lane.id
                            ? `PATH · LEVEL ${branch.depth}`
                            : dateLabel(lane.date)}
                        </span>
                        <strong>{lane.title}</strong>
                        <small>
                          {branch
                            ? `${branch.member_ids.length} travellers${joined ? " · You’re here" : ""}`
                            : "The shared itinerary"}
                        </small>
                      </div>
                      {branch && (
                        <div className="cc-lane-actions">
                          <button
                            aria-label={
                              mini ? "Expand branch" : "Collapse branch"
                            }
                            onClick={() =>
                              setCollapsed(
                                mini
                                  ? collapsed.filter((id) => id !== lane.id)
                                  : [...collapsed, lane.id],
                              )
                            }
                          >
                            {mini ? "＋" : "−"}
                          </button>
                          {!mini && (
                            <button
                              aria-label="Branch details"
                              onClick={(e) =>
                                setPanel({
                                  type: "branchDetails",
                                  branchId: lane.id,
                                  anchor: anchor(e),
                                })
                              }
                            >
                              ↗
                            </button>
                          )}
                        </div>
                      )}
                    </header>
                    <div
                      className="cc-slots"
                      style={{ height }}
                      onDragOver={(e) => {
                        if (canVote && !branch?.legacy && !mobile)
                          e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (!canVote || mobile || branch?.legacy) return;
                        const min = snapMinutes(
                          startMinute +
                            (e.clientY -
                              e.currentTarget.getBoundingClientRect().top) /
                              SCALE,
                        );
                        const idea = calendar?.recommendations.find(
                          (i) =>
                            i.recommendation_id ===
                            e.dataTransfer.getData("application/convia-idea"),
                        );
                        const moving = normalized.find(
                          (i) =>
                            i.item_id ===
                            e.dataTransfer.getData("application/convia-item"),
                        );
                        if (moving) {
                          if (moving.branch_id !== lane.id) return;
                          setPanel({
                            type: "activity",
                            itemId: moving.item_id,
                            branchId: lane.id,
                            starts: `${lane.date}T${timeString(min)}`,
                            key: crypto.randomUUID(),
                          });
                        } else if (idea) place(lane.date, min, lane.id, idea);
                      }}
                      onClick={(e) => {
                        if (
                          canVote &&
                          !mini &&
                          !branch?.legacy &&
                          e.target === e.currentTarget
                        )
                          place(
                            lane.date,
                            startMinute +
                              (e.clientY -
                                e.currentTarget.getBoundingClientRect().top) /
                                SCALE,
                            lane.id,
                          );
                      }}
                    >
                      {!mini &&
                        Array.from(
                          { length: endMinute / 60 - first },
                          (_, i) => (
                            <button
                              className="cc-slot-target"
                              key={i}
                              style={{
                                top: i * 60 * SCALE,
                                height: 60 * SCALE,
                              }}
                              aria-label={`Add activity on ${lane.date} at ${timeString((first + i) * 60)}${branch ? ` in ${branch.title}` : ""}`}
                              disabled={!canVote || branch?.legacy}
                              onClick={(e) => {
                                const offset =
                                  e.detail === 0
                                    ? 0
                                    : (e.clientY -
                                        e.currentTarget.getBoundingClientRect()
                                          .top) /
                                      SCALE;
                                place(
                                  lane.date,
                                  (first + i) * 60 + offset,
                                  lane.id,
                                  null,
                                  anchor(e),
                                );
                              }}
                            />
                          ),
                        )}
                      {!mini && branch && (
                        <>
                          <span className="cc-split-label">
                            ↳ from {source?.title || "parent plan"}
                          </span>
                          {rejoin.date === lane.date && (
                            <button
                              className="cc-rejoin"
                              style={{
                                top: Math.max(
                                  0,
                                  Math.min(
                                    height - 30,
                                    (rejoin.minutes - startMinute) * SCALE,
                                  ),
                                ),
                              }}
                              onClick={(e) =>
                                setPanel({
                                  type: "branchDetails",
                                  branchId: lane.id,
                                  anchor: anchor(e),
                                })
                              }
                            >
                              ↩ {timeString(rejoin.minutes)} ·{" "}
                              {branch.rejoin_note}
                            </button>
                          )}
                          {branch.needs_review && (
                            <span className="cc-review-badge">
                              Needs organizer review
                            </span>
                          )}
                        </>
                      )}
                      {!mini &&
                        layoutEvents(laneEvents).map((event) => (
                          <button
                            key={event.item_id}
                            className={`cc-event ${event.bottom - event.top < 30 ? "is-short" : ""} ${lane.id ? "is-branch" : ""} ${event.pending ? "is-pending" : ""}`}
                            style={{
                              top: (event.top - startMinute) * SCALE,
                              height: Math.max(
                                22,
                                (event.bottom - event.top) * SCALE,
                              ),
                              left: `calc(${(event.lane / event.laneCount) * 100}% + 6px)`,
                              width: `calc(${100 / event.laneCount}% - 12px)`,
                            }}
                            onClick={(e) => openActivity(event, e)}
                            draggable={
                              canVote &&
                              !mobile &&
                              !event.pending &&
                              !branch?.legacy
                            }
                            onDragStart={(e) =>
                              e.dataTransfer.setData(
                                "application/convia-item",
                                event.item_id,
                              )
                            }
                          >
                            <small>
                              {timeString(
                                localParts(event.starts_at, timezone).minutes,
                              )}
                              –
                              {timeString(
                                localParts(event.ends_at, timezone).minutes,
                              )}
                              {event.pending ? " · PROPOSED" : ""}
                            </small>
                            <strong>{event.title}</strong>
                            {event.bottom - event.top >= 65 && (
                              <span>
                                {event.attendee_ids.length} going
                                {event.location ? ` · ${event.location}` : ""}
                              </span>
                            )}
                          </button>
                        ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </div>
        {ideas && !mobile && (
          <aside className="cc-recommendations">
            <div className="cc-actions">
              <h2>Room for an idea?</h2>
              <button
                className="wm-icon-button"
                onClick={() => setIdeas(false)}
                aria-label="Close recommendations"
              >
                ×
              </button>
            </div>
            {recommendations}
          </aside>
        )}
      </div>
      <p className="cc-caption">
        {mobile
          ? "Tap an empty time to add an activity. Swipe sideways when this day has branches."
          : "Click an empty time or drag an idea into place. Drag existing activities to propose a move."}
      </p>
      {ideas && mobile && (
        <CalendarOverlay
          title="Room for an idea?"
          kicker="RECOMMENDATIONS"
          onClose={() => setIdeas(false)}
        >
          {recommendations}
        </CalendarOverlay>
      )}
      {panel && (
        <CalendarOverlay
          title={
            panel.type === "detail"
              ? selected?.title || "Activity changed"
              : panel.type === "branch"
                ? "Create an alternate path"
                : panel.type === "branchDetails"
                  ? selectedBranch?.title || "Branch changed"
                  : panel.type === "review"
                    ? "Review branch connections"
                    : panel.type === "proposal"
                      ? "Review a proposal"
                      : selected
                        ? "Propose an activity change"
                        : "Add an activity"
          }
          kicker={
            selected
              ? `${localParts(selected.starts_at, timezone).input.replace("T", " · ")} · ${selected.item_type}`
              : "THE SHARED JOURNEY"
          }
          anchor={panel.anchor}
          onClose={close}
          onBack={
            ["branch", "activity"].includes(panel.type) && selected
              ? () => setPanel({ ...panel, type: "detail" })
              : undefined
          }
        >
          {actionError && (
            <p role="alert" className="cc-warning">
              {actionError}
            </p>
          )}
          {panel.type === "activity" && (
            <ActivityForm
              key={panel.key}
              trip={trip}
              timezone={timezone}
              item={selected}
              branch={selectedBranch}
              initial={panel}
              version={version}
              busy={busy}
              events={normalized}
              actor={actor}
              onSubmit={async (body) => {
                const ok = await onCommand("change", body);
                if (ok) close();
                return ok;
              }}
            />
          )}
          {(panel.type === "branch" || panel.type === "review") && (
            <BranchForm
              trip={trip}
              timezone={timezone}
              source={selected}
              parent={selectedBranch}
              branches={branches}
              items={normalized}
              reviewing={panel.type === "review"}
              busy={busy}
              onSubmit={async (action, body) => {
                if (await onCommand(action, body)) close();
              }}
            />
          )}
          {panel.type === "proposal" && (
            <CalendarDiscussions
              proposals={proposals.filter(
                (q) => q.proposal_id === panel.proposalId,
              )}
              busy={busy}
              onCommand={onCommand}
              compact
            />
          )}
          {panel.type === "branchDetails" && selectedBranch && (
            <>
              <p>
                {selectedBranch.rejoin_note} ·{" "}
                {localParts(selectedBranch.rejoin_at, timezone).input.replace(
                  "T",
                  " ",
                )}
              </p>
              <p>
                Organized by{" "}
                {members.find((m) => m.user_id === selectedBranch.organizer_id)
                  ?.display_name || "the trip organizer"}
              </p>
              {normalized.some(
                (i) =>
                  i.attendee_ids.includes(actor) &&
                  i.branch_id !== selectedBranch.branch_id &&
                  overlaps(i, {
                    starts_at: selectedBranch.starts_at,
                    ends_at: selectedBranch.rejoin_at,
                  }),
              ) && (
                <p className="cc-warning">
                  This branch overlaps activities you’re attending. Joining
                  changes which parent-plan activities show you as going.
                </p>
              )}
              <p>
                {selectedBranch.member_ids
                  .map(
                    (id) =>
                      members.find((m) => m.user_id === id)?.display_name ||
                      "Traveller",
                  )
                  .join(", ") || "No travellers yet"}
              </p>
              {selectedBranch.needs_review && (
                <p className="cc-warning">
                  A connection changed. The branch organizer needs to review
                  these times. You can still join.
                </p>
              )}
              {selectedBranch.legacy ? (
                <p>
                  This path was approved using the earlier fork flow. Its
                  activities remain in the shared plan.
                </p>
              ) : (
                canVote && (
                  <div className="cc-actions">
                    <button
                      className="wm-primary"
                      disabled={busy}
                      onClick={() =>
                        onCommand("branch.join", {
                          branch_id: selectedBranch.branch_id,
                          joining: !selectedBranch.member_ids.includes(actor),
                        })
                      }
                    >
                      {selectedBranch.member_ids.includes(actor)
                        ? "Leave branch"
                        : "Join branch"}
                    </button>
                    {selectedBranch.can_manage && (
                      <>
                        <button
                          className="wm-secondary"
                          onClick={() => setPanel({ ...panel, type: "review" })}
                        >
                          Review connections
                        </button>
                        <button
                          className="wm-secondary"
                          disabled={busy}
                          onClick={() =>
                            setPanel({ ...panel, confirmCancel: true })
                          }
                        >
                          Cancel branch…
                        </button>
                      </>
                    )}
                    {panel.confirmCancel && (
                      <div className="cc-warning">
                        <p>
                          This cancels this branch and all its nested branches.
                          If others are affected, it goes to a vote.
                        </p>
                        <button
                          disabled={busy}
                          onClick={async () => {
                            if (
                              await onCommand("change", {
                                branch_id: selectedBranch.branch_id,
                                item_id: null,
                                kind: "cancel",
                                expected_revision: selectedBranch.revision,
                              })
                            )
                              close();
                          }}
                        >
                          Confirm cancellation
                        </button>
                      </div>
                    )}
                  </div>
                )
              )}
            </>
          )}
          {panel.type === "detail" && selected && (
            <>
              <p>{selected.description || "A moment in your trip."}</p>
              {selected.location && <p>⌖ {selected.location}</p>}
              {normalized.some(
                (i) =>
                  i.item_id !== selected.item_id &&
                  overlaps(i, selected) &&
                  i.attendee_ids.some((id) =>
                    selected.attendee_ids.includes(id),
                  ),
              ) && (
                <p className="cc-warning">
                  Some attendees have another activity at this time. Review
                  their plans before joining.
                </p>
              )}
              <section className="cc-detail-section">
                <h3>Who’s going?</h3>
                <p>
                  {selected.attendee_ids
                    .map(
                      (id) =>
                        members.find((m) => m.user_id === id)?.display_name ||
                        "Traveller",
                    )
                    .join(", ") || "No responses yet"}
                </p>
                {canVote &&
                  (!selectedBranch ||
                    selectedBranch.member_ids.includes(actor)) && (
                    <div className="cc-actions">
                      <button
                        className={
                          selected.attendee_ids.includes(actor)
                            ? "wm-primary"
                            : "wm-secondary"
                        }
                        disabled={busy}
                        onClick={() =>
                          onCommand("attendance", {
                            item_id: selected.item_id,
                            going: true,
                          })
                        }
                      >
                        {selectedBranch ? "Yes · going" : "I’m going"}
                      </button>
                      <button
                        className="wm-secondary"
                        disabled={busy}
                        onClick={() =>
                          onCommand("attendance", {
                            item_id: selected.item_id,
                            going: false,
                          })
                        }
                      >
                        {selectedBranch ? "No · not going" : "Not going"}
                      </button>
                    </div>
                  )}
                {selectedBranch &&
                  !selectedBranch.legacy &&
                  !selectedBranch.member_ids.includes(actor) &&
                  canVote && (
                    <button
                      className="wm-secondary"
                      disabled={busy}
                      onClick={() =>
                        onCommand("branch.join", {
                          branch_id: selectedBranch.branch_id,
                          joining: true,
                        })
                      }
                    >
                      Join this branch
                    </button>
                  )}
              </section>
              {canVote && !selectedBranch?.legacy && (
                <section className="cc-detail-section">
                  <h3>Make a plan</h3>
                  <div className="cc-actions">
                    <button
                      className="wm-secondary"
                      onClick={() =>
                        setPanel({
                          ...panel,
                          type: "activity",
                          branchId: selected.branch_id,
                          key: crypto.randomUUID(),
                        })
                      }
                    >
                      Suggest a change
                    </button>
                    <button
                      className="cc-text-button"
                      onClick={() =>
                        setPanel({ ...panel, confirmRemove: true })
                      }
                    >
                      Remove…
                    </button>
                  </div>
                  {panel.confirmRemove && (
                    <p className="cc-warning">
                      Remove this activity? Shared plans go to a vote.{" "}
                      <button
                        disabled={busy}
                        onClick={async () => {
                          if (
                            await onCommand("change", {
                              branch_id: selected.branch_id,
                              item_id: selected.item_id,
                              kind: "remove",
                              expected_revision:
                                selectedBranch?.revision ?? version,
                            })
                          )
                            close();
                        }}
                      >
                        Confirm removal
                      </button>
                    </p>
                  )}
                  {(!selectedBranch || selectedBranch.depth < 5) && (
                    <button
                      className="cc-branch-action"
                      onClick={() =>
                        setPanel({
                          ...panel,
                          type: "branch",
                          branchId: selected.branch_id,
                        })
                      }
                    >
                      <strong>Create a branch →</strong>
                      <span>
                        Keep this plan. Take another path and rejoin later.
                      </span>
                    </button>
                  )}
                </section>
              )}
              <section className="cc-detail-section">
                <h3>Suggestions & discussion</h3>
                {canVote && (
                  <QuestionForm
                    busy={busy}
                    onSubmit={(body) =>
                      onCommand("question", { item_id: selected.item_id, body })
                    }
                  />
                )}
                <CalendarDiscussions
                  proposals={proposals.filter(
                    (q) => q.item_id === selected.item_id,
                  )}
                  busy={busy}
                  onCommand={onCommand}
                  compact
                />
                {decisions.some((d) =>
                  d.operations?.some(
                    (o) => o.new_item?.title === selected.title,
                  ),
                ) && (
                  <DecisionRoom
                    decisions={decisions.filter((d) =>
                      d.operations?.some(
                        (o) => o.new_item?.title === selected.title,
                      ),
                    )}
                    busy={busy}
                    canVote={canVote}
                    onVote={onVote}
                  />
                )}
              </section>
            </>
          )}
        </CalendarOverlay>
      )}
    </div>
  );
}
function QuestionForm({ busy, onSubmit }) {
  const [body, setBody] = useState("");
  return (
    <form
      className="cc-question"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await onSubmit(body)) setBody("");
      }}
    >
      <label>
        Ask the group
        <textarea
          placeholder="Should we check the weather before booking?"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          required
        />
      </label>
      <button className="wm-secondary" disabled={busy}>
        Start discussion
      </button>
    </form>
  );
}

function ActivityForm({
  trip,
  timezone,
  item,
  branch,
  initial,
  version,
  busy,
  events,
  actor,
  onSubmit,
}) {
  const [title, setTitle] = useState(item?.title || initial.idea?.title || "");
  const [start, setStart] = useState(
    initial.starts ||
      localParts(item?.starts_at || branch?.starts_at, timezone).input,
  );
  const [end, setEnd] = useState(() => {
    const s = zonedInstant(
      initial.starts ||
        localParts(item?.starts_at || branch?.starts_at, timezone).input,
      timezone,
    );
    const duration = item
      ? Date.parse(item.ends_at) - Date.parse(item.starts_at)
      : (initial.idea?.duration_minutes || 60) * 60000;
    return localParts(Date.parse(s) + duration, timezone).input;
  });
  const [type, setType] = useState(
      item?.item_type || initial.idea?.item_type || "poi",
    ),
    [description, setDescription] = useState(
      item?.description || initial.idea?.description || "",
    ),
    [location, setLocation] = useState(item?.location || ""),
    [error, setError] = useState("");
  let conflicts = [];
  try {
    const times = {
      starts_at: zonedInstant(start, timezone),
      ends_at: zonedInstant(end, timezone),
    };
    conflicts = events.filter(
      (e) =>
        e.item_id !== item?.item_id &&
        overlaps(e, times) &&
        (e.branch_id === (branch?.branch_id || null) ||
          e.attendee_ids.includes(actor)),
    );
  } catch {}
  return (
    <form
      className="wm-form cc-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        try {
          const starts_at = zonedInstant(start, timezone),
            ends_at = zonedInstant(end, timezone);
          if (Date.parse(ends_at) <= Date.parse(starts_at))
            throw new Error("End time must be after start time.");
          await onSubmit({
            branch_id: branch?.branch_id || null,
            item_id: item?.item_id || null,
            kind: item ? "edit" : "add",
            expected_revision: branch?.revision ?? version,
            activity: {
              title,
              item_type: type,
              starts_at,
              ends_at,
              description,
              location,
            },
          });
        } catch (err) {
          setError(err.message);
        }
      }}
    >
      <p>
        {branch
          ? `In ${branch.title}. Shared branch changes go to its members for a vote.`
          : "Your group votes before this changes the main plan."}
      </p>
      <label>
        Activity
        <input
          autoFocus
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label>
        Starts
        <input
          type="datetime-local"
          required
          min={`${trip.start_date}T00:00`}
          max={`${trip.end_date}T23:59`}
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
      </label>
      <label>
        Ends
        <input
          type="datetime-local"
          required
          min={start}
          max={`${datePlus(trip.end_date, 1)}T00:00`}
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
      </label>
      <label>
        Kind
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {[
            "poi",
            "meal",
            "transfer",
            "hotel",
            "flight",
            "guide",
            "free",
            "package",
          ].map((t) => (
            <option key={t} value={t}>
              {t === "poi" ? "Activity" : t}
            </option>
          ))}
        </select>
      </label>
      <label>
        Location or city
        <input
          value={location}
          maxLength={200}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Optional · enter a place"
        />
      </label>
      <label>
        Notes
        <textarea
          value={description}
          maxLength={2000}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      {conflicts.length > 0 && (
        <p className="cc-warning">
          This overlaps {conflicts.map((e) => e.title).join(", ")}. Check who is
          attending; different groups can have separate plans.
        </p>
      )}
      {error && (
        <p role="alert" className="cc-warning">
          {error}
        </p>
      )}
      <button
        className="wm-primary"
        disabled={busy || !Number.isInteger(branch?.revision ?? version)}
      >
        {busy
          ? "Saving…"
          : branch &&
              branch.can_manage &&
              branch.member_ids.every((id) => id === actor)
            ? "Save activity"
            : "Send proposal →"}
      </button>
    </form>
  );
}

function BranchForm({
  trip,
  timezone,
  source,
  parent,
  items,
  reviewing,
  busy,
  onSubmit,
}) {
  const scope = reviewing ? parent?.parent_branch_id : source?.branch_id;
  const targets = items.filter(
    (i) =>
      i.branch_id === scope &&
      Date.parse(i.starts_at) >
        Date.parse(source?.starts_at || parent?.starts_at),
  );
  const [sourceId, setSourceId] = useState(
    source?.item_id || parent?.source_item_id,
  );
  const [title, setTitle] = useState(""),
    [start, setStart] = useState(
      localParts(source?.starts_at || parent?.starts_at, timezone).input,
    );
  const [target, setTarget] = useState(
    reviewing
      ? parent.rejoin_item_id || "custom"
      : targets[0]?.item_id || "custom",
  );
  const [end, setEnd] = useState(
    localParts(
      reviewing
        ? parent.rejoin_at
        : targets[0]?.starts_at ||
            zonedInstant(`${trip.end_date}T23:45`, timezone),
      timezone,
    ).input,
  );
  const [note, setNote] = useState(
      reviewing
        ? parent.rejoin_note
        : targets[0]?.title || "Meet at the end of the trip",
    ),
    [error, setError] = useState("");
  return (
    <form
      className="wm-form cc-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        try {
          const body = {
            source_item_id: sourceId,
            starts_at: zonedInstant(start, timezone),
            rejoin_at: zonedInstant(end, timezone),
            rejoin_item_id:
              target === "custom" || target === "end" ? null : target,
            rejoin_note: note,
          };
          if (Date.parse(body.rejoin_at) <= Date.parse(body.starts_at))
            throw new Error("Choose a rejoin time after the split.");
          await onSubmit(
            reviewing ? "branch.review" : "branch.create",
            reviewing
              ? {
                  ...body,
                  branch_id: parent.branch_id,
                  expected_revision: parent.revision,
                }
              : { ...body, title, parent_branch_id: scope || null },
          );
        } catch (err) {
          setError(err.message);
        }
      }}
    >
      <p>
        {reviewing
          ? "Reconnect this branch to its parent plan. Other members vote on shared changes."
          : "Your branch opens immediately. Add activities inside it, and let people choose whether to join."}
      </p>
      {!reviewing && (
        <label>
          Branch name
          <input
            required
            autoFocus
            maxLength={200}
            placeholder="A quiet day in the next town"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
      )}
      {reviewing && (
        <label>
          Split from
          <select
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
          >
            {items
              .filter((i) => i.branch_id === scope)
              .map((i) => (
                <option value={i.item_id} key={i.item_id}>
                  {i.title}
                </option>
              ))}
          </select>
        </label>
      )}
      <label>
        Branch starts
        <input
          type="datetime-local"
          required
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
      </label>
      <label>
        Rejoin the group at
        <select
          value={target}
          onChange={(e) => {
            setTarget(e.target.value);
            const item = targets.find((i) => i.item_id === e.target.value);
            if (item) {
              setEnd(localParts(item.starts_at, timezone).input);
              setNote(item.title);
            } else if (e.target.value === "end") {
              setEnd(`${datePlus(trip.end_date, 1)}T00:00`);
              setNote("Trip ends");
            }
          }}
        >
          {targets.map((i) => (
            <option value={i.item_id} key={i.item_id}>
              {localParts(i.starts_at, timezone).input.replace("T", " ")} ·{" "}
              {i.title}
            </option>
          ))}
          <option value="custom">Custom time & location</option>
          {!scope && <option value="end">Trip ends</option>}
        </select>
      </label>
      <label>
        Rejoin time
        <input
          type="datetime-local"
          required
          value={end}
          readOnly={target !== "custom"}
          onChange={(e) => setEnd(e.target.value)}
        />
      </label>
      <label>
        Meeting place / note
        <input
          required
          maxLength={200}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <p className="cc-warning">
        Travel time is not calculated. Include travel activities so this path
        can reach its meeting point.
      </p>
      {error && <p role="alert">{error}</p>}
      <button className="wm-primary" disabled={busy}>
        {busy
          ? "Saving…"
          : reviewing
            ? "Save connection review"
            : "Create branch →"}
      </button>
    </form>
  );
}
