import React, { useEffect, useState } from "react";
import { core, describeError } from "./lib/api";
import { cities, cityName } from "./data/cities";
import { parseTravelContext, travelContextPrompt } from "./lib/contextImport";
import { GroupGenome } from "./RoomExtras";

const interests = ["Adventure", "Culture", "Food", "Nature", "Wellness", "Photography", "History", "Nightlife"];
const blankPassport = { interests: [], pace: "", budget_band: "" };

function Feedback({ error, success }) {
  return <>{error && <div className="wm-notice wm-notice-error" role="alert">{error}</div>}{success && <div className="wm-notice wm-notice-success" role="status">{success}</div>}</>;
}

export function Passport({ token, onDiscover }) {
  const [form, setForm] = useState(blankPassport);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [pastedContext, setPastedContext] = useState("");
  const [importSuggestion, setImportSuggestion] = useState(null);
  const [importError, setImportError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");

  useEffect(() => {
    let active = true;
    core("/me/passport", { token })
      .then((value) => {
        if (!active) return;
        const fields = value?.confirmed_fields || value?.passport?.confirmed_fields || {};
        setForm({
          interests: Array.isArray(fields.interests) ? fields.interests : [],
          pace: fields.pace || "",
          budget_band: fields.budget_band || "",
        });
      })
      .catch((caught) => { if (active) setError(describeError(caught)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  function toggleInterest(value) {
    setForm((current) => ({
      ...current,
      interests: current.interests.includes(value)
        ? current.interests.filter((item) => item !== value)
        : [...current.interests, value],
    }));
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await core("/me/passport", { token, method: "PUT", body: { schema_version: 1, confirmed_fields: form } });
      setSuccess("Your Passport is saved. You can change it whenever your travel style changes.");
    } catch (caught) { setError(describeError(caught)); }
    finally { setSaving(false); }
  }

  async function copyPrompt() {
    try { await navigator.clipboard.writeText(travelContextPrompt); setCopyMessage("Prompt copied. Paste it into your own AI chat."); }
    catch { setCopyMessage("Clipboard unavailable. Select and copy the prompt below."); }
  }

  function reviewImport() {
    setImportError("");
    try { setImportSuggestion(parseTravelContext(pastedContext)); }
    catch (caught) { setImportSuggestion(null); setImportError(caught.message); }
  }

  function applyImport() {
    setForm((current) => ({
      interests: [...new Set([...current.interests, ...importSuggestion.interests])],
      pace: importSuggestion.pace || current.pace,
      budget_band: importSuggestion.budget_band || current.budget_band,
    }));
    setPastedContext("");
    setImportSuggestion(null);
    setImportOpen(false);
    setSuccess("Suggestions applied for review. They are not saved until you choose Save my Passport.");
  }

  return <main className="wm-container wm-discovery-page">
    <div className="wm-page-intro"><span className="wm-kicker">A LITTLE ABOUT YOUR WAY OF GOING</span><h1>Your travel <em>Passport.</em></h1><p>Only what you choose to confirm shapes your group recommendations. Skip any part that feels too early.</p></div>
    <div className="wm-room-grid"><section className="wm-panel wm-discovery-panel">
      {loading ? <div className="wm-empty wm-empty-small">Opening your Passport…</div> : <form className="wm-form" onSubmit={save}>
        <div className="wm-context-invite"><div><span className="wm-kicker">AN OPTIONAL SHORTCUT</span><h2>Bring what your AI already knows.</h2><p>Use a prompt in your own ChatGPT or Claude chat, then paste its travel-only answer here. Nothing connects to your account or saves raw chat text.</p></div><button type="button" className="wm-secondary" onClick={() => { if (importOpen) { setPastedContext(""); setImportSuggestion(null); setImportError(""); } setImportOpen(!importOpen); }}>{importOpen ? "Close handoff" : "Bring AI context →"}</button></div>
        {importOpen && <div className="wm-context-panel"><p>Copy this prompt into a chat where you have discussed travel. Check the answer before applying it—AI can be wrong.</p><pre>{travelContextPrompt}</pre><button type="button" className="wm-secondary" onClick={copyPrompt}>Copy prompt</button>{copyMessage && <small role="status">{copyMessage}</small>}<label>Paste the JSON answer<textarea rows="5" maxLength={12000} value={pastedContext} onChange={(event) => { setPastedContext(event.target.value); setImportSuggestion(null); }} placeholder='{"interests":["Nature"],"pace":"balanced","budget_band":null}' /></label><button type="button" className="wm-secondary" onClick={reviewImport} disabled={!pastedContext.trim()}>Review suggestions</button>{importError && <Feedback error={importError} />}{importSuggestion && <div className="wm-context-review"><strong>Review before applying</strong><p>Interests: {importSuggestion.interests.join(", ") || "unknown"} · Pace: {importSuggestion.pace || "unknown"} · Budget: {importSuggestion.budget_band || "unknown"}</p><button type="button" className="wm-primary" onClick={applyImport}>Use these in my Passport →</button></div>}</div>}
        <div><span className="wm-kicker">01 · THE THINGS YOU LOVE</span><h2>What makes a trip yours?</h2><div className="wm-chip-grid">{interests.map((item) => <button type="button" key={item} aria-pressed={form.interests.includes(item)} className={`wm-choice-chip ${form.interests.includes(item) ? "selected" : ""}`} onClick={() => toggleInterest(item)}>{item}</button>)}</div></div>
        <div><span className="wm-kicker">02 · YOUR PACE</span><h2>How do you like the day to feel?</h2><div className="wm-choice-grid">{[["relaxed", "No rush", "Slow mornings and room to wander."], ["balanced", "A little of both", "A plan, with space for surprises."], ["active", "Keep moving", "Make the most of every day."]].map(([value, title, detail]) => <button type="button" key={value} aria-pressed={form.pace === value} className={`wm-choice-card ${form.pace === value ? "selected" : ""}`} onClick={() => setForm((current) => ({ ...current, pace: current.pace === value ? "" : value }))}><strong>{title}</strong><small>{detail}</small></button>)}</div></div>
        <div><span className="wm-kicker">03 · COMFORT ZONE</span><h2>What kind of spend feels right?</h2><div className="wm-chip-grid">{[["shoestring", "Shoestring"], ["value", "Good value"], ["mid", "Mid-range"], ["premium", "Premium"], ["luxury", "Luxury"]].map(([value, label]) => <button type="button" key={value} aria-pressed={form.budget_band === value} className={`wm-choice-chip ${form.budget_band === value ? "selected" : ""}`} onClick={() => setForm((current) => ({ ...current, budget_band: current.budget_band === value ? "" : value }))}>{label}</button>)}</div></div>
        <Feedback error={error} success={success} />
        <div className="wm-form-actions"><button className="wm-primary" disabled={saving}>{saving ? "Saving…" : "Save my Passport →"}</button><button type="button" className="wm-text-button" onClick={onDiscover}>Explore without it</button></div>
      </form>}
    </section><aside className="wm-panel wm-side-note"><span className="wm-kicker">YOUR CHOICE, ALWAYS</span><h3>A better starting point. Not a box.</h3><p>These details help explain why a group may fit. Missing preferences stay unknown; they do not count against you.</p><p>Your AI chat stays yours. Convia only saves the specific Passport fields you review and submit.</p></aside></div>
  </main>;
}

function candidateTrip(candidate) { return candidate.trip || candidate; }
function scoreLabel(candidate) {
  const raw = candidate.match_score ?? candidate.score;
  const coverage = candidate.coverage ?? candidate.evidence_coverage;
  if (typeof raw !== "number" || !Number.isFinite(raw) || typeof coverage !== "number" || coverage < 0.75) return null;
  return raw >= 0.7 ? "Shared travel style" : "Worth a conversation";
}

function guideAnchor(guide, passport) {
  const linked = {
    Adventure: ["trekking"], Culture: ["heritage", "religious"],
    Food: ["food"], Nature: ["wildlife"], Photography: ["photography"],
    History: ["heritage"], Nightlife: ["food", "shopping"],
  };
  const interests = Array.isArray(passport?.interests) ? passport.interests : [];
  const match = interests.find((interest) => (linked[interest] || []).includes(guide.specialisation)
    || (linked[interest] || []).includes(guide.secondary_specialisation));
  return match ? `Shares ${match.toLowerCase()}` : "";
}

function money(amount, currency) {
  if (amount == null || !currency) return null;
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(amount)); }
  catch { return `${currency} ${Number(amount).toLocaleString("en-IN")}`; }
}

function TripBudget({ token, preview }) {
  const [quote, setQuote] = useState(null);
  const [rateError, setRateError] = useState("");
  const budget = preview.budget || {};
  const destinationCurrency = preview.destination_currency || budget.currency;
  const viewerCurrency = preview.viewer_currency || "INR";
  const hasBudget = budget.amount != null && Number(budget.amount) > 0;
  const from = hasBudget ? budget.currency : destinationCurrency;
  const amount = hasBudget ? String(budget.amount) : "1";

  useEffect(() => {
    setQuote(null); setRateError("");
    if (!from || !viewerCurrency) return;
    let active = true;
    core(`/fx/convert?${new URLSearchParams({ from, to: viewerCurrency, amount })}`, { token })
      .then((value) => { if (active) setQuote(value); })
      .catch(() => { if (active) setRateError("Reference rate unavailable right now."); });
    return () => { active = false; };
  }, [token, from, viewerCurrency, amount]);

  return <div className="wm-preview-budget">
    <span className="wm-kicker">TRIP BUDGET</span>
    {hasBudget ? <div className="wm-budget-amounts">
      <div><small>ORIGINAL · {budget.currency}</small><strong>{money(budget.amount, budget.currency)}</strong></div>
      {quote && <div><small>YOUR CURRENCY · {quote.to}</small><strong>≈ {money(quote.converted, quote.to)}</strong></div>}
    </div> : <strong>Budget not set</strong>}
    <small>{hasBudget ? "Recorded itinerary total · indicative, not a quote" : "No amount recorded for this itinerary."}</small>
    {quote && <p>{!hasBudget && `1 ${quote.from} ≈ ${money(quote.converted, quote.to)}`}<small>{!hasBudget ? <br /> : null}Reference rate {quote.rate_date} · Frankfurter. Bank/card rates may differ.</small></p>}
    {rateError && <small>{rateError}</small>}
  </div>;
}

export function DiscoverTrips({ token, cityOptions = cities, onOpenTrip, onPassport }) {
  const [kind, setKind] = useState("groups");
  const [cityId, setCityId] = useState("");
  const [date, setDate] = useState("");
  const [results, setResults] = useState([]);
  const [guides, setGuides] = useState([]);
  const [sampleTrips, setSampleTrips] = useState([]);
  const [visibleSamples, setVisibleSamples] = useState(18);
  const [visibleGuides, setVisibleGuides] = useState(12);
  const [passportFields, setPassportFields] = useState(blankPassport);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [requesting, setRequesting] = useState("");
  const [requested, setRequested] = useState({});
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  async function search(event, nextKind = kind) {
    event?.preventDefault();
    setLoading(true);
    setError("");
    setSearched(true);
    try {
      const params = new URLSearchParams();
      if (nextKind === "guides") {
        const query = cityId ? `?city_id=${encodeURIComponent(cityId)}` : "";
        const [value, saved] = await Promise.all([
          core(`/guides${query}`, { token }),
          core("/me/passport", { token }),
        ]);
        setGuides(Array.isArray(value?.guides) ? value.guides : []);
        setVisibleGuides(12);
        setPassportFields(saved?.confirmed_fields || blankPassport);
      } else if (nextKind === "samples") {
        if (cityId) params.set("destination_city_id", cityId);
        if (date) params.set("start_date", date);
        const value = await core(`/catalog/trips${params.size ? `?${params}` : ""}`, { token });
        setSampleTrips(Array.isArray(value?.trips) ? value.trips : []);
        setVisibleSamples(18);
      } else {
        if (cityId) params.set("destination_city_id", cityId);
        if (date) params.set("start_date", date);
        const value = await core(`/discover/trips${params.size ? `?${params}` : ""}`, { token });
        setResults(Array.isArray(value) ? value : Array.isArray(value?.trips) ? value.trips : []);
      }
    } catch (caught) { setError(describeError(caught)); setResults([]); setGuides([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { search(); }, []);

  async function askToJoin(id) {
    setRequesting(id);
    setError("");
    try {
      const result = await core(`/trips/${encodeURIComponent(id)}/join-requests`, { token, method: "POST", body: { introduction: "I'd love to join this trip." } });
      setRequested((current) => ({ ...current, [id]: result.state || "pending" }));
      if (result.state === "accepted") onOpenTrip(id);
    } catch (caught) { setError(describeError(caught)); }
    finally { setRequesting(""); }
  }

  async function viewPublicTrip(id) {
    setPreviewError("");
    setPreviewLoading(true);
    setPreview({ trip_id: id });
    try {
      const value = await core(`/public/trips/${encodeURIComponent(id)}`, { token });
      setPreview(value);
    } catch (caught) { setPreviewError(describeError(caught)); }
    finally { setPreviewLoading(false); }
  }

  async function viewSampleTrip(id) {
    setPreviewError("");
    setPreviewLoading(true);
    setPreview({ trip_id: id });
    try { setPreview(await core(`/catalog/trips/${encodeURIComponent(id)}`, { token })); }
    catch (caught) { setPreviewError(describeError(caught)); }
    finally { setPreviewLoading(false); }
  }

  return <main className="wm-container wm-discovery-page">
    <div className="wm-page-intro wm-discover-intro"><div><span className="wm-kicker">FIND YOUR PEOPLE</span><h1>Your next trip has <em>room for you.</em></h1><p>Explore open groups. When your Passport has confirmed preferences, Convia can show why a group might fit.</p></div><button className="wm-secondary" onClick={onPassport}>Edit my Passport →</button></div>
    <div className="wm-discover-kind" role="group" aria-label="What to discover"><button type="button" className={kind === "groups" ? "active" : ""} onClick={() => { setKind("groups"); search(null, "groups"); }}>Open groups</button><button type="button" className={kind === "samples" ? "active" : ""} onClick={() => { setKind("samples"); search(null, "samples"); }}>Trip inspiration</button><button type="button" className={kind === "guides" ? "active" : ""} onClick={() => { setKind("guides"); search(null, "guides"); }}>Find guides</button></div>
    <form className="wm-panel wm-discover-filters" onSubmit={search}><label>Where to?<select value={cityId} onChange={(event) => setCityId(event.target.value)}><option value="">Anywhere</option>{cityOptions.map((city) => <option key={city.id} value={city.id}>{city.name}, {city.country || city.region}</option>)}</select></label>{kind !== "guides" && <label>Starting from<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>}<button className="wm-primary" disabled={loading}>{loading ? "Looking…" : kind === "groups" ? "Find open trips →" : kind === "samples" ? "Explore sample trips →" : "Find sample guides →"}</button></form>
    <Feedback error={error} />
    {kind === "guides" ? <><p className="wm-sample-disclosure">These are sample guide profiles from the supplied synthetic WanderMatch dataset—not verified bookable guides.</p>{loading ? <div className="wm-empty">Finding guide profiles…</div> : searched && !error && guides.length === 0 ? <div className="wm-empty"><h3>No sample guides found here.</h3><p>Try a different destination.</p></div> : <><div className="wm-discover-grid">{[...guides].sort((a, b) => Number(guideAnchor(b, passportFields) !== "") - Number(guideAnchor(a, passportFields) !== "") || Number(b.rating || 0) - Number(a.rating || 0)).slice(0, visibleGuides).map((guide) => <article className="wm-panel wm-discover-card wm-guide-card" key={guide.guide_id}><div className="wm-discover-card-top"><span className="wm-kicker">{cityName(guide.city_id)} · {guide.specialisation}</span>{guideAnchor(guide, passportFields) && <strong className="wm-fit-label">{guideAnchor(guide, passportFields)}</strong>}</div><h2>{guide.display_name}</h2><p>{guide.bio}</p><div className="wm-discover-detail">{guide.rating ? `${guide.rating} / 5 · ` : ""}{guide.years_experience} years experience · {guide.languages}</div><div className="wm-match-reasons"><span>{guide.currency} {Number(guide.half_day_rate).toLocaleString("en-IN")} half day</span><span>{guide.currency} {Number(guide.day_rate).toLocaleString("en-IN")} full day</span></div><small>Sample profile · no booking in Convia</small></article>)}</div>{visibleGuides < guides.length && <button className="wm-secondary wm-more-guides" onClick={() => setVisibleGuides((count) => count + 12)}>Show more sample guides →</button>}</>}</> : kind === "samples" ? <><p className="wm-sample-disclosure">{sampleTrips.length} trip records from the supplied synthetic WanderMatch dataset. For inspiration only; these are not live or joinable groups, and recorded costs are not current prices.</p>{loading ? <div className="wm-empty">Opening the trip catalogue…</div> : <><div className="wm-discover-grid">{sampleTrips.slice(0, visibleSamples).map((trip) => <article className="wm-panel wm-discover-card" key={trip.trip_id}><div className="wm-discover-card-top"><span className="wm-kicker">{cityName(trip.destination_city_id)}</span><strong className="wm-fit-label">Sample</strong></div><h2>{trip.title}</h2><p>{trip.is_group_trip ? "Group itinerary from the supplied dataset." : "Traveller itinerary from the supplied dataset."}</p><div className="wm-discover-detail">{String(trip.start_date).slice(0, 10)} · {trip.status} · {trip.budget?.amount ? money(trip.budget.amount, trip.budget.currency) : "Budget not set"}</div><div className="wm-card-actions"><button className="wm-secondary" onClick={() => viewSampleTrip(trip.trip_id)}>View trip</button></div></article>)}</div>{visibleSamples < sampleTrips.length && <button className="wm-secondary wm-more-guides" onClick={() => setVisibleSamples((count) => count + 18)}>Show more trips →</button>}</>}</> : loading ? <div className="wm-empty">Finding groups with room for you…</div> : searched && !error && results.length === 0 ? <div className="wm-empty"><h3>No open trips found yet.</h3><p>Try another destination or date, or start a trip of your own.</p></div> : <div className="wm-discover-grid">{results.map((candidate, index) => { const trip = candidateTrip(candidate); const id = trip.trip_id; const reasons = candidate.match_reasons || candidate.reasons || []; const score = scoreLabel(candidate); return <article className="wm-panel wm-discover-card" key={id || index}><div className="wm-discover-card-top"><span className="wm-kicker">{cityName(trip.destination_city_id)}</span>{score && <strong className="wm-fit-label">{score}</strong>}</div><h2>{trip.title}</h2><p>{trip.description || "A group trip with a place for new stories."}</p><div className="wm-discover-detail">{trip.start_date ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(`${String(trip.start_date).slice(0, 10)}T12:00:00`)) : "Dates open"}{trip.capacity ? ` · Up to ${trip.capacity} travellers` : ""}</div>{Array.isArray(reasons) && reasons.length > 0 && <div className="wm-match-reasons">{reasons.slice(0, 3).map((reason, reasonIndex) => <span key={reasonIndex}>{typeof reason === "string" ? reason : reason.label || reason.reason}</span>)}</div>}<div className="wm-card-actions">{id && <button className="wm-secondary" onClick={() => viewPublicTrip(id)}>View trip</button>}{id && <button className="wm-primary" disabled={requesting === id || Boolean(requested[id])} onClick={() => askToJoin(id)}>{requesting === id ? "Sending…" : requested[id] === "accepted" ? "Joined" : requested[id] ? "Request sent" : "Ask to join →"}</button>}</div></article>; })}</div>}
    {preview && <div className="wm-preview-backdrop" role="presentation" onClick={() => setPreview(null)}><section className="wm-preview-dialog wm-panel" role="dialog" aria-modal="true" aria-label="Trip preview" onClick={(event) => event.stopPropagation()}><button className="wm-icon-button" aria-label="Close preview" onClick={() => setPreview(null)}>×</button>{previewLoading ? <div className="wm-empty wm-empty-small">Opening this trip…</div> : previewError ? <Feedback error={previewError} /> : <><span className="wm-kicker">{preview.sample_only ? "SAMPLE ITINERARY" : "OPEN GROUP"} · {cityName((preview.trip || preview).destination_city_id)}</span><h2>{(preview.trip || preview).title}</h2><p>{(preview.trip || preview).description || (preview.sample_only ? "An itinerary from the supplied synthetic dataset. For inspiration only—not a bookable group." : "Meet the group, explore the plan, and see whether this feels like your kind of journey.")}</p><TripBudget key={(preview.trip || preview).trip_id} token={token} preview={preview} />{preview.genome && <GroupGenome genome={preview.genome} />}{Array.isArray(preview.itinerary_preview) && preview.itinerary_preview.length > 0 && <div className="wm-preview-items"><strong>A glimpse of the plan</strong>{preview.itinerary_preview.slice(0, 5).map((item, index) => <span key={item.item_id || index}>{item.title}</span>)}</div>}<div className="wm-card-actions">{!preview.sample_only && <button className="wm-primary" disabled={requesting === (preview.trip || preview).trip_id || Boolean(requested[(preview.trip || preview).trip_id])} onClick={() => askToJoin((preview.trip || preview).trip_id)}>{requested[(preview.trip || preview).trip_id] ? "Request sent" : "Ask to join →"}</button>}<button className="wm-secondary" onClick={() => setPreview(null)}>Keep exploring</button></div></>}</section></div>}
  </main>;
}
