import React, { useCallback, useEffect, useState } from "react";
import { auth, sessionConfigured } from "./lib/session";
import { core, describeError } from "./lib/api";
import { cities, cityName } from "./data/cities";
import { DiscoverTrips, Passport } from "./Discovery";

const tripIdFromUrl = () => new URLSearchParams(window.location.search).get("trip");
const viewFromUrl = () => new URLSearchParams(window.location.search).get("view") || "trips";
const plusDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const readableDate = (value) =>
  value
    ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(
        new Date(`${String(value).slice(0, 10)}T12:00:00`),
      )
    : "Date to be decided";
const readableTime = (value, timezone = "Asia/Kolkata") => {
  if (!value) return "Time to be decided";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone,
    }).format(new Date(value));
  } catch {
    return "Time to be decided";
  }
};
const asList = (value, key) =>
  Array.isArray(value) ? value : Array.isArray(value?.[key]) ? value[key] : [];
const isOrganizer = (role) => ["organizer", "co_organizer"].includes(role);

function Brand({ light = false }) {
  return (
    <a className={`wm-brand${light ? " wm-brand-light" : ""}`} href="/" aria-label="Convia home">
      <span className="wm-brand-mark" aria-hidden="true">⌒</span>
      convia<span className="wm-brand-dot">.</span>
    </a>
  );
}

function Notice({ children, tone = "neutral" }) {
  if (!children) return null;
  return <div className={`wm-notice wm-notice-${tone}`} role={tone === "error" ? "alert" : "status"}>{children}</div>;
}

function AuthScreen({ onSession }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = mode === "signin"
        ? await auth.auth.signInWithPassword({ email: email.trim(), password })
        : await auth.auth.signUp({
            email: email.trim(),
            password,
            options: { data: { full_name: name.trim() } },
          });
      if (result.error) return setError(result.error.message);
      if (result.data.session) return onSession(result.data.session);
      setMessage("Check your inbox for the confirmation link, then sign in here.");
    } catch {
      setError("Could not reach sign-in. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wm-auth-page">
      <div className="wm-auth-aside">
        <Brand light />
        <div>
          <span className="wm-kicker">THE TRIP STARTS TOGETHER</span>
          <h1>Somewhere good starts with your people.</h1>
          <p>Create a trip, bring your crew in, and give every idea a fair path into the plan.</p>
        </div>
        <span className="wm-auth-foot">A shared room for the journeys you make together.</span>
      </div>
      <div className="wm-auth-main">
        <a href="/" className="wm-back-link">← Back to Convia</a>
        <div className="wm-auth-card">
          <span className="wm-kicker">YOUR SPACE TO PLAN</span>
          <h2>{mode === "signin" ? "Welcome back." : "Make room for a new trip."}</h2>
          <p>{mode === "signin" ? "Sign in to pick up where your group left off." : "Create an account to start planning with your people."}</p>
          {!sessionConfigured ? (
            <Notice tone="error">Authentication is not configured for this build yet. Add the public Supabase URL and publishable key to the frontend environment.</Notice>
          ) : (
            <form className="wm-form" onSubmit={submit}>
              {mode === "signup" && <label>Your name<input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" /></label>}
              <label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
              <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete={mode === "signin" ? "current-password" : "new-password"} /></label>
              <Notice tone="error">{error}</Notice>
              <Notice tone="success">{message}</Notice>
              <button className="wm-primary" disabled={busy}>{busy ? "One moment…" : mode === "signin" ? "Sign in →" : "Create account →"}</button>
            </form>
          )}
          {sessionConfigured && <button className="wm-text-button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setMessage(""); }}>
            {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>}
        </div>
      </div>
    </div>
  );
}

function CreateTrip({ onCreate, busy }) {
  const [form, setForm] = useState({
    title: "",
    destination_city_id: cities[0].id,
    start_date: plusDays(7),
    end_date: plusDays(9),
    capacity: 6,
    visibility: "private",
    admission_policy: "invite_only",
    description: "",
  });
  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  return (
    <form className="wm-form wm-create-form" onSubmit={(event) => { event.preventDefault(); onCreate({ ...form, capacity: Number(form.capacity), timezone: "Asia/Kolkata", home_currency: "INR" }); }}>
      <div className="wm-form-grid">
        <label className="wm-wide">Trip name<input value={form.title} onChange={(e) => change("title", e.target.value)} placeholder="A long weekend in the mountains" maxLength={120} required /></label>
        <label>Destination<select value={form.destination_city_id} onChange={(e) => change("destination_city_id", e.target.value)}>{cities.map((city) => <option key={city.id} value={city.id}>{city.name}, {city.region}</option>)}</select></label>
        <label>Group size<input type="number" min="1" max="200" value={form.capacity} onChange={(e) => change("capacity", e.target.value)} required /></label>
        <label>Start date<input type="date" min={plusDays(0)} value={form.start_date} onChange={(e) => change("start_date", e.target.value)} required /></label>
        <label>End date<input type="date" min={form.start_date} value={form.end_date} onChange={(e) => change("end_date", e.target.value)} required /></label>
        <label>Who can find it?<select value={form.visibility} onChange={(e) => { change("visibility", e.target.value); change("admission_policy", e.target.value === "private" ? "invite_only" : "approval"); }}><option value="private">Only invited people</option><option value="public">Travellers looking for a group</option></select></label>
        <label>Joining<select value={form.admission_policy} onChange={(e) => change("admission_policy", e.target.value)}><option value="invite_only">By invitation</option>{form.visibility === "public" && <><option value="approval">Ask to join</option><option value="open">Join directly</option></>}</select></label>
        <label className="wm-wide">A little about this trip<textarea rows="3" value={form.description} onChange={(e) => change("description", e.target.value)} placeholder="What kind of time are you hoping to have together?" /></label>
      </div>
      <button className="wm-primary" disabled={busy || form.end_date < form.start_date}>{busy ? "Creating trip…" : "Create this trip →"}</button>
    </form>
  );
}

function Dashboard({ trips, loading, error, onCreate, onJoin, busy, openTrip }) {
  const [mode, setMode] = useState("trips");
  const [tripId, setTripId] = useState(new URLSearchParams(window.location.search).get("invite_trip") || "");
  const [code, setCode] = useState(new URLSearchParams(window.location.search).get("code") || "");
  return (
    <div className="wm-dashboard wm-container">
      <div className="wm-dashboard-intro">
        <div><span className="wm-kicker">YOUR NEXT CHAPTER</span><h1>Where shall we go <em>together?</em></h1><p>Start with your own people, or join a trip that has room for you.</p></div>
        <div className="wm-dashboard-actions"><button className="wm-primary" onClick={() => setMode("create")}>+ Create a trip</button><button className="wm-secondary" onClick={() => setMode("join")}>I have an invite</button></div>
      </div>
      <Notice tone="error">{error}</Notice>
      {mode === "create" && <section className="wm-panel wm-flow-panel"><div className="wm-panel-title"><div><span className="wm-kicker">A TRIP OF YOUR OWN</span><h2>Start something good.</h2></div><button className="wm-icon-button" onClick={() => setMode("trips")} aria-label="Close create form">×</button></div><CreateTrip onCreate={onCreate} busy={busy} /></section>}
      {mode === "join" && <section className="wm-panel wm-flow-panel"><div className="wm-panel-title"><div><span className="wm-kicker">YOU ARE INVITED</span><h2>Join your people.</h2></div><button className="wm-icon-button" onClick={() => setMode("trips")} aria-label="Close join form">×</button></div><form className="wm-form" onSubmit={(event) => { event.preventDefault(); onJoin(tripId.trim(), code.trim()); }}><div className="wm-form-grid"><label>Trip ID<input value={tripId} onChange={(e) => setTripId(e.target.value)} placeholder="trp_…" required /></label><label>Invite code<input value={code} onChange={(e) => setCode(e.target.value)} placeholder="From your organizer" required /></label></div><button className="wm-primary" disabled={busy}>{busy ? "Joining…" : "Join trip →"}</button></form></section>}
      <div className="wm-section-heading"><div><span className="wm-kicker">YOUR TRIP ROOMS</span><h2>Plans already in motion.</h2></div></div>
      {loading ? <div className="wm-empty">Finding your trips…</div> : error ? null : trips.length === 0 ? <div className="wm-empty"><span className="wm-empty-icon">⌁</span><h3>The page is yours to fill.</h3><p>Make your first trip and invite someone in.</p></div> : <div className="wm-trip-grid">{trips.map((trip) => <button className="wm-trip-card" key={trip.trip_id} onClick={() => openTrip(trip.trip_id)}><span className="wm-card-top"><span className="wm-kicker">{trip.app_role?.replace("_", " ") || "Member"}</span><span aria-hidden="true">↗</span></span><strong>{trip.title}</strong><span>{cityName(trip.destination_city_id)} · {readableDate(trip.start_date)}</span><span className="wm-card-bottom">Open trip room <span aria-hidden="true">→</span></span></button>)}</div>}
    </div>
  );
}

function AddProposal({ trip, version, onPublish, busy }) {
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [type, setType] = useState("poi");
  const [open, setOpen] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (!Number.isInteger(version)) return;
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (!(end > start)) return;
    const dayIndex = Math.round((Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()) - Date.parse(`${trip.start_date}T00:00:00Z`)) / 86400000) + 1;
    const finalDay = Math.round((Date.parse(`${trip.end_date}T00:00:00Z`) - Date.parse(`${trip.start_date}T00:00:00Z`)) / 86400000) + 1;
    if (dayIndex < 1 || dayIndex > finalDay) return;
    const completed = await onPublish({
      base_itinerary_version: version,
      title: `Add ${title.trim()}`,
      operations: [{
        action: "add",
        new_item: { title: title.trim(), item_type: type, day_index: dayIndex, starts_at: start.toISOString(), ends_at: end.toISOString() },
        cost_basis: "unknown",
      }],
      requested_closes_at: new Date(Date.now() + 86400000).toISOString(),
    });
    if (completed) { setTitle(""); setStartsAt(""); setEndsAt(""); setOpen(false); }
  }
  return <div className="wm-add-proposal"><button className="wm-secondary" onClick={() => setOpen(!open)}>{open ? "Close proposal" : "+ Propose an activity"}</button>{open && <form className="wm-form wm-proposal-form" onSubmit={submit}><p>Your group will vote before this joins the shared plan.</p><label>Activity<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sunset walk by the river" required /></label><div className="wm-form-grid"><label>Starts<input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required /></label><label>Ends<input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} min={startsAt} required /></label><label>Kind<select value={type} onChange={(e) => setType(e.target.value)}><option value="poi">Place or activity</option><option value="meal">Food</option><option value="guide">Guide</option><option value="free">Free time</option></select></label></div><button className="wm-primary" disabled={busy || !Number.isInteger(version)}>{busy ? "Publishing…" : "Send to the group →"}</button>{!Number.isInteger(version) && <small>Waiting for the current itinerary version before proposals can be published.</small>}</form>}</div>;
}

function TripRoom({ tripId, token, onBack }) {
  const [tab, setTab] = useState("plan");
  const [snapshot, setSnapshot] = useState(null);
  const [items, setItems] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [members, setMembers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [history, setHistory] = useState([]);
  const [unavailable, setUnavailable] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    const encoded = encodeURIComponent(tripId);
    const results = await Promise.allSettled([
      core(`/trips/${encoded}`, { token }),
      core(`/trips/${encoded}/itinerary`, { token }),
      core(`/trips/${encoded}/change-sets`, { token }),
      core(`/trips/${encoded}/members`, { token }),
      core(`/trips/${encoded}/history`, { token }),
      core(`/trips/${encoded}/join-requests`, { token }),
    ]);
    const [tripResult, planResult, decisionResult, memberResult, historyResult, requestResult] = results;
    if (tripResult.status === "fulfilled") { setSnapshot(tripResult.value); setError(""); setUpdatedAt(new Date()); }
    else setError(describeError(tripResult.reason));
    if (planResult.status === "fulfilled") setItems(asList(planResult.value, "items"));
    if (decisionResult.status === "fulfilled") setDecisions(asList(decisionResult.value, "change_sets"));
    if (memberResult.status === "fulfilled") setMembers(asList(memberResult.value, "members"));
    if (historyResult.status === "fulfilled") setHistory(asList(historyResult.value, "events"));
    if (requestResult.status === "fulfilled") setRequests(asList(requestResult.value, "requests"));
    setUnavailable({
      plan: planResult.status === "rejected" ? describeError(planResult.reason) : "",
      decisions: decisionResult.status === "rejected" ? describeError(decisionResult.reason) : "",
      members: memberResult.status === "rejected" ? describeError(memberResult.reason) : "",
      history: historyResult.status === "rejected" ? describeError(historyResult.reason) : "",
      requests: requestResult.status === "rejected" ? describeError(requestResult.reason) : "",
    });
    setLoading(false);
  }, [token, tripId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (snapshot && document.visibilityState === "visible") load(true); }, 5000);
    return () => window.clearInterval(timer);
  }, [load, snapshot]);

  async function mutate(path, body, after) {
    setBusy(true);
    setActionError("");
    try {
      const result = await core(path, { token, method: "POST", body });
      await load(true);
      after?.(result);
      return true;
    } catch (caught) { setActionError(describeError(caught)); return false; }
    finally { setBusy(false); }
  }

  const trip = snapshot?.trip;
  const settings = snapshot?.settings || {};
  const itinerary = snapshot?.itinerary || {};
  const version = Number.isInteger(itinerary.version) ? itinerary.version : null;
  const role = snapshot?.actor_role;
  const safeId = encodeURIComponent(tripId);
  const canVote = role && role !== "guest";
  const tabs = ["plan", "decisions", "people", "history"];

  return <div className="wm-room wm-container">
    <button className="wm-back-link wm-back-button" onClick={onBack}>← All your trips</button>
    <Notice tone="error">{error}</Notice>
    {loading && !snapshot ? <div className="wm-empty">Opening your trip room…</div> : !trip ? null : <>
      <div className="wm-room-hero"><div><span className="wm-kicker">{settings.visibility === "public" ? "OPEN GROUP" : "PRIVATE TRIP"} · {cityName(trip.destination_city_id)}</span><h1>{trip.title}</h1><p>{readableDate(trip.start_date)} — {readableDate(trip.end_date)} <span>·</span> {members.length || "Your"} travellers</p></div><div className="wm-room-meta"><span>Plan version <strong>v{version ?? "—"}</strong></span><small>{updatedAt ? `Checked ${readableTime(updatedAt.toISOString())}` : "Connecting…"}</small><button onClick={() => load()} className="wm-refresh">↻ Refresh</button></div></div>
      <nav className="wm-tabs" aria-label="Trip room sections">{tabs.map((name) => <button key={name} className={tab === name ? "active" : ""} aria-current={tab === name ? "page" : undefined} onClick={() => setTab(name)}>{name === "people" ? "People & invites" : name === "decisions" ? `Decisions${decisions.length ? ` · ${decisions.length}` : ""}` : name[0].toUpperCase() + name.slice(1)}</button>)}</nav>
      <Notice tone="error">{actionError}</Notice>
      {tab === "plan" && <div className="wm-room-grid"><section className="wm-panel"><div className="wm-panel-title"><div><span className="wm-kicker">THE SHARED PLAN</span><h2>One place for everyone.</h2></div></div>{unavailable.plan ? <Notice tone="error">{unavailable.plan}</Notice> : items.length === 0 ? <div className="wm-empty wm-empty-small"><h3>The itinerary starts here.</h3><p>Suggest the first activity and invite your group to decide.</p></div> : <div className="wm-item-list">{items.map((item, index) => { const locked = item.decision_locked ?? item.locked; return <article className="wm-plan-item" key={item.logical_item_id || item.item_id || index}><div className="wm-time">{readableTime(item.starts_at, settings.timezone)}</div><div><span className="wm-kicker">{item.item_type || "ACTIVITY"}</span><h3>{item.title}</h3><p>{item.status === "replaced" ? "Superseded" : item.status === "removed" ? "Removed from plan" : locked ? "Approved and locked" : "In the plan"}</p></div><span className={`wm-status ${locked ? "wm-status-locked" : ""}`}>{locked ? "Locked" : item.status || "Planned"}</span></article>; })}</div>}{canVote && <AddProposal trip={trip} version={version} busy={busy} onPublish={(body) => mutate(`/trips/${safeId}/change-sets`, body)} />}</section><aside className="wm-panel wm-side-note"><span className="wm-kicker">HOW THIS ROOM WORKS</span><h3>Every idea has a path.</h3><p>Members propose an activity. Your group votes. Once a proposal passes, the approved change joins the shared plan and its history stays visible.</p><div className="wm-side-rule"><span>01</span> Propose</div><div className="wm-side-rule"><span>02</span> Vote</div><div className="wm-side-rule"><span>03</span> Make it part of the trip</div></aside></div>}
      {tab === "decisions" && <section className="wm-panel"><div className="wm-panel-title"><div><span className="wm-kicker">THE DECISION ROOM</span><h2>Ideas your group can act on.</h2></div></div>{unavailable.decisions ? <Notice tone="error">{unavailable.decisions}</Notice> : decisions.length === 0 ? <div className="wm-empty wm-empty-small"><h3>No decisions waiting.</h3><p>When someone proposes a change, everyone can review it here.</p></div> : <div className="wm-decision-list">{decisions.map((decision, index) => { const id = decision.change_set_id || decision.id; return <article className="wm-decision" key={id || index}><div><span className="wm-kicker">{decision.status || "OPEN PROPOSAL"}</span><h3>{decision.title || "Trip change"}</h3><p>{decision.operations?.length || 1} change{decision.operations?.length === 1 ? "" : "s"} · {decision.yes_count ?? 0} of {decision.approval_threshold ?? "?"} yes votes needed</p></div>{decision.status === "open" && canVote && id && <div className="wm-decision-actions"><button className="wm-primary" disabled={busy} onClick={() => mutate(`/change-sets/${encodeURIComponent(id)}/votes`, { value: "yes" })}>Vote yes</button><button className="wm-secondary" disabled={busy} onClick={() => mutate(`/change-sets/${encodeURIComponent(id)}/votes`, { value: "no" })}>Vote no</button></div>}</article>; })}</div>}</section>}
      {tab === "people" && <div className="wm-room-grid"><section className="wm-panel"><div className="wm-panel-title"><div><span className="wm-kicker">THE PEOPLE IN THIS PLAN</span><h2>Your travel crew.</h2></div></div>{unavailable.members ? <Notice tone="error">{unavailable.members}</Notice> : members.length === 0 ? <div className="wm-empty wm-empty-small">Member list is coming in…</div> : <div className="wm-member-list">{members.map((member) => <div className="wm-member" key={member.user_id}><span className="wm-avatar">{(member.display_name || "T")[0].toUpperCase()}</span><div><strong>{member.display_name}</strong><small>{member.role?.replace("_", " ")}</small></div></div>)}</div>}</section><aside className="wm-panel"><span className="wm-kicker">BRING SOMEONE ALONG</span><h3>There’s room for more stories.</h3>{isOrganizer(role) ? <><p>Create a private invite. The code is shown once so you can share it with someone you trust.</p><button className="wm-secondary" disabled={busy} onClick={() => mutate(`/trips/${safeId}/invites`, { target_role: "participant", max_uses: 5, expires_at: new Date(Date.now() + 7 * 86400000).toISOString() }, setInvite)}>{busy ? "Creating…" : "+ Create invite"}</button>{invite?.code && <div className="wm-invite-result"><span>Invite code</span><code>{invite.code}</code><button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/app?invite_trip=${encodeURIComponent(tripId)}&code=${encodeURIComponent(invite.code)}`)}>Copy invite link</button></div>}</> : <p>Ask your organizer for an invitation link if you want someone else to join.</p>}{isOrganizer(role) && <div className="wm-request-list"><h4>Join requests</h4>{unavailable.requests ? <small>{unavailable.requests}</small> : requests.length === 0 ? <small>No requests waiting.</small> : requests.map((request) => <div className="wm-request" key={request.request_id}><strong>{request.display_name}</strong><p>{request.introduction}</p><button disabled={busy} onClick={() => mutate(`/join-requests/${encodeURIComponent(request.request_id)}/review`, { trip_id: tripId, decision: "accepted" })}>Accept</button><button disabled={busy} onClick={() => mutate(`/join-requests/${encodeURIComponent(request.request_id)}/review`, { trip_id: tripId, decision: "declined" })}>Decline</button></div>)}</div>}</aside></div>}
      {tab === "history" && <section className="wm-panel"><div className="wm-panel-title"><div><span className="wm-kicker">WHY THE PLAN CHANGED</span><h2>A story you can trace.</h2></div></div>{unavailable.history ? <Notice tone="error">{unavailable.history}</Notice> : history.length === 0 ? <div className="wm-empty wm-empty-small"><h3>Nothing has changed yet.</h3><p>Approved proposals and earlier versions will appear here.</p></div> : <div className="wm-history-list">{history.map((event, index) => <article key={event.event_id || index}><span className="wm-history-dot"/><div><strong>{event.title || event.kind || "Trip update"}</strong><p>{event.description || event.summary || "A change was recorded for this trip."}</p><small>{event.occurred_at ? readableDate(event.occurred_at) : ""}</small></div></article>)}</div>}</section>}
    </>}
  </div>;
}

export default function Workspace() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(sessionConfigured);
  const [tripId, setTripId] = useState(tripIdFromUrl);
  const [view, setView] = useState(viewFromUrl);
  const [trips, setTrips] = useState([]);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!auth) return;
    let active = true;
    auth.auth.getSession().then(({ data }) => { if (active) setSession(data.session); }).finally(() => { if (active) setAuthLoading(false); });
    const { data: { subscription } } = auth.auth.onAuthStateChange((_event, next) => { if (active) setSession(next); });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    const pop = () => { setTripId(tripIdFromUrl()); setView(viewFromUrl()); };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);

  const refreshTrips = useCallback(async () => {
    if (!session?.access_token) return;
    setTripsLoading(true);
    try { setTrips(asList(await core("/trips", { token: session.access_token }), "trips")); setError(""); }
    catch (caught) { setError(describeError(caught)); }
    finally { setTripsLoading(false); }
  }, [session?.access_token]);
  useEffect(() => { refreshTrips(); }, [refreshTrips]);

  function navigate(id, nextView = "trips") {
    const url = id ? `/app?trip=${encodeURIComponent(id)}` : nextView === "trips" ? "/app" : `/app?view=${encodeURIComponent(nextView)}`;
    window.history.pushState({}, "", url);
    setTripId(id);
    setView(nextView);
    setError("");
  }

  async function act(path, body, done) {
    setBusy(true);
    setError("");
    try { const result = await core(path, { token: session.access_token, method: "POST", body }); await refreshTrips(); done(result); }
    catch (caught) { setError(describeError(caught)); }
    finally { setBusy(false); }
  }

  if (authLoading) return <div className="wm-boot">Opening Convia…</div>;
  if (!session) return <AuthScreen onSession={setSession} />;
  return <div className="workspace">
    <header className="wm-app-header"><div className="wm-container wm-app-header-inner"><Brand /><nav aria-label="App navigation"><button aria-current={!tripId && view === "trips" ? "page" : undefined} onClick={() => navigate(null)}>Your trips</button><button aria-current={!tripId && view === "discover" ? "page" : undefined} onClick={() => navigate(null, "discover")}>Find a group</button><button aria-current={!tripId && view === "passport" ? "page" : undefined} onClick={() => navigate(null, "passport")}>Passport</button></nav><div className="wm-account"><span>{session.user.email}</span><button onClick={() => auth.auth.signOut()}>Sign out</button></div></div></header>
    {tripId ? <TripRoom key={tripId} tripId={tripId} token={session.access_token} onBack={() => navigate(null)} /> : view === "passport" ? <Passport token={session.access_token} onDiscover={() => navigate(null, "discover")} /> : view === "discover" ? <DiscoverTrips token={session.access_token} onPassport={() => navigate(null, "passport")} onOpenTrip={navigate} /> : <Dashboard trips={trips} loading={tripsLoading} error={error} busy={busy} openTrip={navigate} onCreate={(body) => act("/trips", body, (result) => navigate(result.trip_id))} onJoin={(id, code) => act("/invites/redeem", { trip_id: id, code }, () => navigate(id))} />}
    <footer className="wm-app-footer wm-container">Made for the trip you will talk about long after it ends. <span>Convia · Team pacmen</span></footer>
  </div>;
}
