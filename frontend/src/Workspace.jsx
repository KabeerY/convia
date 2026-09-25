import React, { useCallback, useEffect, useRef, useState } from "react";
import { auth, sessionConfigured } from "./lib/session";
import { core, describeError } from "./lib/api";
import { cities, cityName, cityDetails, setCityCatalog } from "./data/cities";
import { DiscoverTrips, GenderOnboarding, Passport } from "./Discovery";
import DecisionRoom from "./DecisionRoom";
import Memories from "./Memories";
import CalendarDiscussions from "./CalendarDiscussions";
import { ballotRequest } from "./lib/decisions";
import { isTrippyThinking } from "./lib/chatActivity";
import PlanDays from "./PlanDays";
import PlanCalendar from "./PlanCalendar";
import { ChatRoom, GroupGenome } from "./RoomExtras";
import BrandMark from "./BrandMark";

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
const asList = (value, key) =>
  Array.isArray(value) ? value : Array.isArray(value?.[key]) ? value[key] : [];
const isOrganizer = (role) => ["organizer", "co_organizer"].includes(role);
const historyCopy = (event) => {
  const kind = event.event_kind || event.kind;
  if (kind === "decision.published") return [event.decision?.title || event.detail?.title || "An idea went to a vote", "The group can review and vote before the plan changes."];
  if (kind === "decision.committed") return [event.decision?.title || "The group approved a change", `Approved in plan version ${event.detail?.itinerary_version || "—"}.`];
  if (kind?.startsWith("calendar.")) {
    const action = kind.slice(9), input = event.detail?.input || {};
    const labels = { "branch.create": "An alternate path opened", "branch.join": input.joining ? "A traveller joined a branch" : "A traveller left a branch", "branch.review": "Branch connections were reviewed", change: event.detail?.result?.status === "committed" ? "A branch activity changed" : "A calendar change went to a vote", vote: "A calendar vote was recorded", attendance: "An attendance response changed", question: "A discussion started", reply: "A discussion received a reply", withdraw: "A proposal was withdrawn" };
    return [labels[action] || "The calendar changed", input.title || input.activity?.title || input.body || "Saved in the shared trip history."];
  }
  if (kind === "item.moved") return ["An activity moved", "The approved move replaced the earlier time in the shared plan."];
  if (kind === "item.added") return ["An activity joined the plan", "Added after the group reached its voting threshold."];
  return [event.title || String(kind || "Trip update").replaceAll(".", " "), event.description || event.summary || "Recorded in the shared trip history."];
};

function Brand({ light = false }) {
  return (
    <a className={`wm-brand${light ? " wm-brand-light" : ""}`} href="/" aria-label="Convia home">
      <BrandMark />
      <span>convia</span><span className="wm-brand-register">®</span>
    </a>
  );
}

function AppHeader({ session, tripId, view, navigate }) {
  const [open, setOpen] = useState(false);
  const headerRef = useRef(null);
  const toggleRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = event => {
      if (!headerRef.current?.contains(event.target)) setOpen(false);
    };
    const escape = event => {
      if (event.key === "Escape") { setOpen(false); toggleRef.current?.focus(); }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const go = nextView => { setOpen(false); navigate(null, nextView); };
  return <header className="wm-app-header" ref={headerRef}>
    <div className="wm-container wm-app-header-inner">
      <Brand />
      <button ref={toggleRef} type="button" className="wm-menu-toggle" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="wm-app-navigation" onClick={() => setOpen(!open)}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">{open ? <path d="m6 6 12 12M6 18 18 6" /> : <path d="M4 6h16M4 12h16M4 18h16" />}</svg>
      </button>
      <div id="wm-app-navigation" className={`wm-header-navigation${open ? " is-open" : ""}`}>
        <nav aria-label="App navigation">
          <button aria-current={!tripId && view === "trips" ? "page" : undefined} onClick={() => go("trips")}>Your trips</button>
          <button aria-current={!tripId && view === "discover" ? "page" : undefined} onClick={() => go("discover")}>Find a group</button>
          <button aria-current={!tripId && view === "passport" ? "page" : undefined} onClick={() => go("passport")}>Passport</button>
        </nav>
        <div className="wm-account"><span>{session.user.email}</span><button onClick={() => { setOpen(false); auth.auth.signOut(); }}>Sign out</button></div>
      </div>
    </div>
  </header>;
}

function Notice({ children, tone = "neutral" }) {
  if (!children) return null;
  return <div className={`wm-notice wm-notice-${tone}`} role={tone === "error" ? "alert" : "status"}>{children}</div>;
}

function AuthScreen({ onSession }) {
  const [mode, setMode] = useState(() => new URLSearchParams(window.location.search).get("auth") === "signup" ? "signup" : "signin");
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

function CreateTrip({ onCreate, busy, cityOptions }) {
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
    <form className="wm-form wm-create-form" onSubmit={(event) => { event.preventDefault(); onCreate({ ...form, capacity: Number(form.capacity), timezone: cityDetails(form.destination_city_id)?.timezone || "Asia/Kolkata", home_currency: "INR" }); }}>
      <div className="wm-form-grid">
        <label className="wm-wide">Trip name<input value={form.title} onChange={(e) => change("title", e.target.value)} placeholder="A long weekend in the mountains" maxLength={120} required /></label>
        <label>Destination<select value={form.destination_city_id} onChange={(e) => change("destination_city_id", e.target.value)}>{cityOptions.map((city) => <option key={city.id} value={city.id}>{city.name}, {city.country || city.region}</option>)}</select></label>
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

function Dashboard({ trips, loading, error, onCreate, onJoin, onRetry, busy, openTrip, cityOptions }) {
  const [mode, setMode] = useState(() => new URLSearchParams(window.location.search).get("create") === "1" ? "create" : "trips");
  const [tripId, setTripId] = useState(new URLSearchParams(window.location.search).get("invite_trip") || "");
  const [code, setCode] = useState(new URLSearchParams(window.location.search).get("code") || "");
  return (
    <div className="wm-dashboard wm-container">
      <div className="wm-dashboard-intro">
        <div><span className="wm-kicker">YOUR NEXT CHAPTER</span><h1>Where shall we go <em>together?</em></h1><p>Start with your own people, or join a trip that has room for you.</p></div>
        <div className="wm-dashboard-actions"><button className="wm-primary" onClick={() => setMode("create")}>+ Create a trip</button><button className="wm-secondary" onClick={() => setMode("join")}>I have an invite</button></div>
      </div>
      {error && <div className="wm-retry-notice"><Notice tone="error">{error}</Notice><button className="wm-secondary" onClick={onRetry}>Retry loading trips</button></div>}
      {mode === "create" && <section className="wm-panel wm-flow-panel"><div className="wm-panel-title"><div><span className="wm-kicker">A TRIP OF YOUR OWN</span><h2>Start something good.</h2></div><button className="wm-icon-button" onClick={() => setMode("trips")} aria-label="Close create form">×</button></div><CreateTrip onCreate={onCreate} busy={busy} cityOptions={cityOptions} /></section>}
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
  const [formError, setFormError] = useState("");
  async function submit(event) {
    event.preventDefault();
    setFormError("");
    if (!Number.isInteger(version)) return;
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (!(end > start)) return setFormError("End time must be after the start time.");
    const dayIndex = Math.round((Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()) - Date.parse(`${trip.start_date}T00:00:00Z`)) / 86400000) + 1;
    const finalDay = Math.round((Date.parse(`${trip.end_date}T00:00:00Z`) - Date.parse(`${trip.start_date}T00:00:00Z`)) / 86400000) + 1;
    if (dayIndex < 1 || dayIndex > finalDay) return setFormError("Pick a time during the trip dates.");
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
  return <div className="wm-add-proposal"><button className="wm-secondary" onClick={() => setOpen(!open)}>{open ? "Close proposal" : "+ Propose an activity"}</button>{open && <form className="wm-form wm-proposal-form" onSubmit={submit}><p>Your group will vote before this joins the shared plan.</p><label>Activity<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sunset walk by the river" required /></label><div className="wm-form-grid"><label>Starts<input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required /></label><label>Ends<input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} min={startsAt} required /></label><label>Kind<select value={type} onChange={(e) => setType(e.target.value)}><option value="poi">Place or activity</option><option value="meal">Food</option><option value="guide">Guide</option><option value="free">Free time</option></select></label></div>{formError && <Notice tone="error">{formError}</Notice>}<button className="wm-primary" disabled={busy || !Number.isInteger(version)}>{busy ? "Publishing…" : "Send to the group →"}</button>{!Number.isInteger(version) && <small>Waiting for the current itinerary version before proposals can be published.</small>}</form>}</div>;
}

function BudgetConverter({ token, destinationCurrency, homeCurrency }) {
  const [amount, setAmount] = useState("100");
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState("");
  const from = destinationCurrency;
  const to = homeCurrency || "INR";
  useEffect(() => { setQuote(null); }, [from, to]);
  if (!from) return <section className="wm-panel wm-budget-converter"><div><span className="wm-kicker">BUDGET COMPANION</span><h3>Finding this destination’s currency…</h3><p>Reference currency data is not available yet. Your itinerary is unaffected.</p></div></section>;
  async function convert(event) {
    event.preventDefault();
    setError("");
    setQuote(null);
    try {
      setQuote(await core(`/fx/convert?${new URLSearchParams({ from, to, amount })}`, { token }));
    } catch (caught) { setError(describeError(caught)); }
  }
  return <section className="wm-panel wm-budget-converter"><div><span className="wm-kicker">BUDGET COMPANION</span><h3>What does it cost back home?</h3><p>Enter an amount in the destination currency. This is a reference conversion, not a trip cost estimate.</p></div><form onSubmit={convert}><label>{from}<input type="number" min="0" max="999999999" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label><span aria-hidden="true">→</span><div className="wm-budget-result"><small>{to}</small><strong>{quote ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(quote.converted)) : "—"}</strong></div><button className="wm-secondary">Convert</button></form>{quote && <small className="wm-budget-note">1 {from} = {quote.rate} {to} · reference rate {quote.rate_date}. Bank/card rates may differ.</small>}{error && <Notice tone="error">{error}</Notice>}</section>;
}

function TripRoom({ tripId, token, onBack }) {
  const [tab, setTab] = useState("plan");
  const [planView, setPlanView] = useState("calendar");
  const [mapDay, setMapDay] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [items, setItems] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [members, setMembers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [history, setHistory] = useState([]);
  const [forks, setForks] = useState([]);
  const [calendar, setCalendar] = useState(null);
  const loadSequence = useRef(0);
  const loadingRoom = useRef(false);
  const [messages, setMessages] = useState([]);
  const [genome, setGenome] = useState(null);
  const [unavailable, setUnavailable] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async (quiet = false) => {
    if (quiet && loadingRoom.current) return;
    loadingRoom.current = true;
    const sequence = ++loadSequence.current;
    if (!quiet) setLoading(true);
    const encoded = encodeURIComponent(tripId);
    const wanted = tab === "chat" ? ["chat", "members"]
      : tab === "decisions" ? ["decisions", "calendar"]
      : tab === "people" ? ["members", "requests", "genome"]
      : tab === "history" ? ["history"]
      : ["plan", "calendar", "decisions", "forks"];
    const paths = { trip: "", plan: "/itinerary", decisions: "/change-sets", members: "/members", history: "/history", requests: "/join-requests", forks: "/forks", chat: "/chat", genome: "/genome", calendar: "/calendar" };
    const keys = quiet ? wanted : ["trip", ...new Set([...wanted, "members"])];
    try {
      const settled = await Promise.allSettled(keys.map((key) => core(`/trips/${encoded}${paths[key]}`, { token })));
      if (sequence !== loadSequence.current) return;
      const updates = {};
      keys.forEach((key, index) => {
        const result = settled[index];
        if (result.status === "rejected") {
          // A single failed background poll must not hide a usable calendar or chat.
          if (!quiet && key === "trip") setError(describeError(result.reason));
          else if (!quiet) updates[key] = describeError(result.reason);
          return;
        }
        if (key === "trip") { setSnapshot(result.value); setError(""); }
        if (key === "plan") setItems(asList(result.value, "items"));
        if (key === "decisions") setDecisions(asList(result.value, "change_sets"));
        if (key === "members") setMembers(asList(result.value, "members"));
        if (key === "history") setHistory(asList(result.value, "events"));
        if (key === "requests") setRequests(asList(result.value, "requests"));
        if (key === "forks") setForks(asList(result.value, "forks"));
        if (key === "chat") setMessages(asList(result.value, "messages"));
        if (key === "genome") setGenome(result.value);
        if (key === "calendar") setCalendar(result.value);
        updates[key] = "";
      });
      setUnavailable((previous) => ({ ...previous, ...updates }));
      if (settled.some((result) => result.status === "fulfilled")) setUpdatedAt(new Date());
      setLoading(false);
    } finally {
      loadingRoom.current = false;
    }
  }, [token, tripId, tab]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (snapshot && document.visibilityState === "visible") load(true); }, tab === "chat" ? (isTrippyThinking(messages) ? 1200 : 3500) : 7000);
    return () => window.clearInterval(timer);
  }, [load, messages, snapshot, tab]);

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

  async function sendChat(body) {
    setBusy(true);
    setActionError("");
    try {
      const sent = await core(`/trips/${encodeURIComponent(tripId)}/chat`, { token, method: "POST", body });
      await load(true);
      if (/(?:^|\s)@trippy\b/i.test(body.body)) {
        // Keep the composer responsive while the model and its tools work.
        core(`/trips/${encodeURIComponent(tripId)}/chat/agent`, {
          token, method: "POST", body: { message_id: sent.message_id },
        }).then(() => load(true)).catch((caught) => setActionError(describeError(caught)));
      }
      return true;
    } catch (caught) { setActionError(describeError(caught)); return false; }
    finally { setBusy(false); }
  }

  function calendarCommand(action, body) { return mutate(`/trips/${encodeURIComponent(tripId)}/calendar/${action}`, body); }
  function voteOnDecision(decision, vote) {
    try { return mutate(`/change-sets/${encodeURIComponent(decision.change_set_id || decision.id)}/votes`, ballotRequest(decision, vote)); }
    catch (caught) { setActionError(describeError(caught)); return false; }
  }

  const trip = snapshot?.trip;
  const settings = snapshot?.settings || {};
  const itinerary = snapshot?.itinerary || {};
  const version = Number.isInteger(calendar?.version) ? calendar.version : Number.isInteger(itinerary.version) ? itinerary.version : null;
  const role = snapshot?.actor_role;
  const safeId = encodeURIComponent(tripId);
  const canVote = role && role !== "guest";
  const tabs = ["plan", "decisions", "chat", "people", "memories", "history"];

  return <div className="wm-room wm-container">
    <button className="wm-back-link wm-back-button" onClick={onBack}>← All your trips</button>
    {error && <div className="wm-retry-notice"><Notice tone="error">{error}</Notice><button className="wm-secondary" onClick={() => load()}>Retry opening trip</button></div>}
    {loading && !snapshot ? <div className="wm-empty">Opening your trip room…</div> : !trip ? null : <>
      <div className="wm-room-hero"><div><span className="wm-kicker">{settings.visibility === "public" ? "OPEN GROUP" : "PRIVATE TRIP"} · {cityName(trip.destination_city_id)}</span><h1>{trip.title}</h1><p>{readableDate(trip.start_date)} — {readableDate(trip.end_date)} <span>·</span> {members.length || "Your"} travellers</p></div><div className="wm-room-meta"><span>Plan version <strong>v{version ?? "—"}</strong></span><small className="wm-live-status"><span aria-hidden="true" />{updatedAt ? "Live sync on" : "Connecting…"}</small></div></div>
      <nav className="wm-tabs" aria-label="Trip room sections">{tabs.map((name) => <button key={name} className={tab === name ? "active" : ""} aria-current={tab === name ? "page" : undefined} onClick={() => setTab(name)}>{name === "people" ? "People & invites" : name === "decisions" ? `Decisions${decisions.length ? ` · ${decisions.length}` : ""}` : name[0].toUpperCase() + name.slice(1)}</button>)}</nav>
      <Notice tone="error">{actionError}</Notice>
      {tab === "plan" && <BudgetConverter key={tripId} token={token} destinationCurrency={cityDetails(trip.destination_city_id)?.currency} homeCurrency={trip.home_currency} />}
      {tab === "plan" && <section className="wm-panel cc-calendar-panel"><div className="wm-panel-title"><div><span className="wm-kicker">THE SHARED PLAN</span><h2>One place for everyone.</h2></div><div className="wm-plan-switch"><button className={planView === "calendar" ? "active" : ""} onClick={() => setPlanView("calendar")}>Calendar</button><button className={planView === "list" ? "active" : ""} onClick={() => setPlanView("list")}>Day list</button><button className={planView === "map" ? "active" : ""} onClick={() => setPlanView("map")}>Map</button></div></div>{unavailable.plan ? <Notice tone="error">{unavailable.plan}</Notice> : planView !== "list" ? <PlanCalendar selectedDay={mapDay} onDayChange={setMapDay} view={planView} items={items} forks={forks} calendar={calendar} unavailable={unavailable.calendar} trip={trip} timezone={settings.timezone} version={version} busy={busy} members={members} canVote={canVote && !!calendar && !unavailable.calendar} decisions={decisions} actionError={actionError} onVote={voteOnDecision} onCommand={calendarCommand} /> : <PlanDays selectedDay={mapDay} onDayChange={setMapDay} items={items} trip={trip} timezone={settings.timezone} />}</section>}
      {tab === "decisions" && <><DecisionRoom decisions={decisions} unavailable={unavailable.decisions} canVote={canVote} busy={busy} onVote={voteOnDecision} /><section className="wm-panel"><h2>Calendar changes & discussions</h2><Notice tone="error">{unavailable.calendar}</Notice><CalendarDiscussions proposals={calendar?.proposals || []} busy={busy} onCommand={calendarCommand} /></section></>}
      {tab === "chat" && <ChatRoom messages={messages} members={members} tripTitle={trip.title} unavailable={unavailable.chat} busy={busy} trippyThinking={isTrippyThinking(messages)} onSend={sendChat} onReviewProposal={() => setTab("decisions")} />}
      {tab === "people" && <div className="wm-room-grid"><section className="wm-panel"><div className="wm-panel-title"><div><span className="wm-kicker">THE PEOPLE IN THIS PLAN</span><h2>Your travel crew.</h2></div></div>{unavailable.members ? <Notice tone="error">{unavailable.members}</Notice> : members.length === 0 ? <div className="wm-empty wm-empty-small">Member list is coming in…</div> : <div className="wm-member-list">{members.map((member) => <div className="wm-member" key={member.user_id}><span className="wm-avatar">{(member.display_name || "T")[0].toUpperCase()}</span><div><strong>{member.display_name}</strong><small>{member.role?.replace("_", " ")}</small></div></div>)}</div>}</section><aside className="wm-panel"><span className="wm-kicker">BRING SOMEONE ALONG</span><h3>There’s room for more stories.</h3>{isOrganizer(role) ? <><p>Create a private invite. The code is shown once so you can share it with someone you trust.</p><button className="wm-secondary" disabled={busy} onClick={() => mutate(`/trips/${safeId}/invites`, { target_role: "participant", max_uses: 5, expires_at: new Date(Date.now() + 7 * 86400000).toISOString() }, setInvite)}>{busy ? "Creating…" : "+ Create invite"}</button>{invite?.code && <div className="wm-invite-result"><span>Invite code</span><code>{invite.code}</code><button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/app?invite_trip=${encodeURIComponent(tripId)}&code=${encodeURIComponent(invite.code)}`)}>Copy invite link</button></div>}</> : <p>Ask your organizer for an invitation link if you want someone else to join.</p>}{isOrganizer(role) && <div className="wm-request-list"><h4>Join requests</h4>{unavailable.requests ? <small>{unavailable.requests}</small> : requests.length === 0 ? <small>No requests waiting.</small> : requests.map((request) => <div className="wm-request" key={request.request_id}><strong>{request.display_name}</strong><p>{request.introduction}</p><button disabled={busy} onClick={() => mutate(`/join-requests/${encodeURIComponent(request.request_id)}/review`, { trip_id: tripId, decision: "accepted" })}>Accept</button><button disabled={busy} onClick={() => mutate(`/join-requests/${encodeURIComponent(request.request_id)}/review`, { trip_id: tripId, decision: "declined" })}>Decline</button></div>)}</div>}</aside></div>}
      {tab === "memories" && <Memories tripId={tripId} token={token} members={members} />}
      {tab === "history" && <section className="wm-panel"><div className="wm-panel-title"><div><span className="wm-kicker">WHY THE PLAN CHANGED</span><h2>A story you can trace.</h2></div></div>{unavailable.history ? <Notice tone="error">{unavailable.history}</Notice> : history.length === 0 ? <div className="wm-empty wm-empty-small"><h3>Nothing has changed yet.</h3><p>Approved proposals and earlier versions will appear here.</p></div> : <div className="wm-history-list">{history.map((event, index) => { const [title, description] = historyCopy(event); return <article key={event.history_id || event.event_id || index}><span className="wm-history-dot"/><div><strong>{title}</strong><p>{description}</p><small>{event.occurred_at ? readableDate(event.occurred_at) : ""}</small></div></article>; })}</div>}</section>}
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
  const [cityOptions, setCityOptions] = useState(cities);
  const [genderLoading, setGenderLoading] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [genderError, setGenderError] = useState("");

  const loadGender = useCallback(async () => {
    if (!session?.access_token) return;
    setGenderLoading(true);
    setGenderError("");
    try {
      const value = await core("/me/gender-disclosure", { token: session.access_token });
      setNeedsOnboarding(!value?.onboarding_completed);
    } catch (caught) { setGenderError(describeError(caught)); }
    finally { setGenderLoading(false); }
  }, [session?.access_token]);
  useEffect(() => { loadGender(); }, [loadGender]);

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
  useEffect(() => {
    if (!session?.access_token) return;
    let active = true;
    core("/catalog/cities", { token: session.access_token }).then((value) => {
      if (!active || !Array.isArray(value?.cities) || !value.cities.length) return;
      setCityCatalog(value.cities);
      setCityOptions(value.cities);
    }).catch(() => {});
    return () => { active = false; };
  }, [session?.access_token]);

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
  if (genderLoading) return <div className="wm-boot">Preparing your profile…</div>;
  if (genderError) return <div className="wm-boot"><div className="wm-notice wm-notice-error" role="alert">{genderError}</div><button className="wm-secondary" onClick={loadGender}>Retry</button></div>;
  if (needsOnboarding) return <GenderOnboarding token={session.access_token} onComplete={() => { setNeedsOnboarding(false); navigate(null, "discover"); }} />;
  return <div className="workspace">
    <AppHeader session={session} tripId={tripId} view={view} navigate={navigate} />
    {tripId ? <TripRoom key={tripId} tripId={tripId} token={session.access_token} onBack={() => navigate(null)} /> : view === "passport" ? <Passport token={session.access_token} onDiscover={() => navigate(null, "discover")} /> : view === "discover" ? <DiscoverTrips token={session.access_token} cityOptions={cityOptions} onPassport={() => navigate(null, "passport")} onOpenTrip={navigate} /> : <Dashboard trips={trips} loading={tripsLoading} error={error} onRetry={refreshTrips} busy={busy} cityOptions={cityOptions} openTrip={navigate} onCreate={(body) => act("/trips", body, (result) => navigate(result.trip_id))} onJoin={(id, code) => act("/invites/redeem", { trip_id: id, code }, () => navigate(id))} />}
    <footer className="wm-app-footer wm-container">Made for the trip you will talk about long after it ends. <span>Convia · Team pacmen</span></footer>
  </div>;
}
