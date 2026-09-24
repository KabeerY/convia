import React, { useCallback, useEffect, useRef, useState } from "react";
import { core, describeError } from "./lib/api";

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || "");
      const comma = url.indexOf(",");
      if (!url.startsWith("data:image/") || comma < 0)
        return reject(new Error("Choose a JPEG, PNG or WebP photo."));
      resolve(url.slice(comma + 1));
    };
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

function jobFailureMessage(job) {
  const reason = job.result_reference || "";
  if (reason.includes("REFERENCE_NO_FACE"))
    return "The upload reached the server, but no face was detected. Try a clear, front-facing selfie.";
  if (reason.includes("REFERENCE_MULTIPLE_FACES"))
    return "The upload reached the server, but it found more than one face. Use a selfie with only you in frame.";
  if (reason.includes("REFERENCE_SINGLE_FACE"))
    return "The upload reached the server, but it could not select one face. Try a different selfie.";
  if (reason.startsWith("PROCESS_FAILED:") || reason.startsWith("INGEST_FAILED:"))
    return "The server received your photo, but face processing failed. Try again in a moment.";
  return "The server received your photo, but could not finish processing it. Try again.";
}

async function waitForJob(token, jobId, onProgress, tries = 45) {
  for (let i = 0; i < tries; i += 1) {
    const job = await core(`/jobs/${encodeURIComponent(jobId)}`, { token });
    if (job.state === "succeeded") return job;
    if (job.state === "failed") throw new Error(jobFailureMessage(job));
    onProgress?.(
      job.state === "running"
        ? "Photo received. Detecting a face…"
        : job.state === "retry_wait"
          ? "Photo received. Retrying face processing…"
          : "Photo received. Waiting for face processing…",
    );
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

function PhotoImg({ tripId, token, mediaId, alt }) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setSrc("");
    setFailed(false);
    core(`/trips/${encodeURIComponent(tripId)}/media/${encodeURIComponent(mediaId)}/url`, { token })
      .then((result) => {
        if (live) setSrc(result.url);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [tripId, token, mediaId]);
  if (failed) return <span className="wm-photo-fallback">Photo unavailable</span>;
  if (!src) return <span className="wm-photo-fallback">Loading…</span>;
  return <img src={src} alt={alt} loading="lazy" />;
}

export default function Memories({ tripId, token, members }) {
  const [me, setMe] = useState(null);
  const [references, setReferences] = useState([]);
  const [people, setPeople] = useState([]);
  const [selected, setSelected] = useState(null); // subject_user_id | "unassigned" | null
  const [photos, setPhotos] = useState([]);
  const [media, setMedia] = useState([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploads, setUploads] = useState([]); // {id, name, state, detail}
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const refreshSeq = useRef(0);
  const uploadSeq = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++refreshSeq.current;
    const encoded = encodeURIComponent(tripId);
    try {
      const [meResult, refResult, peopleResult, mediaResult] = await Promise.all([
        core("/me", { token }),
        core(`/trips/${encoded}/face-references`, { token }),
        core(`/trips/${encoded}/face-matches`, { token }),
        core(`/trips/${encoded}/media`, { token }),
      ]);
      if (seq !== refreshSeq.current) return;
      setMe(meResult);
      setReferences(refResult.references || []);
      setPeople(peopleResult.people || []);
      setMedia(mediaResult.media || []);
      setError("");
    } catch (caught) {
      if (seq !== refreshSeq.current) return;
      setError(describeError(caught));
    }
  }, [tripId, token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const loadSelection = useCallback(async (subject) => {
    setSelected(subject);
    setPhotos([]);
    if (!subject) return;
    const encoded = encodeURIComponent(tripId);
    try {
      if (subject === "unassigned") {
        const result = await core(`/trips/${encoded}/face-matches?unassigned=true`, { token });
        setPhotos((result.faces || []).map((f) => ({ ...f, unassigned: true })));
      } else {
        const result = await core(
          `/trips/${encoded}/face-matches?subject_user_id=${encodeURIComponent(subject)}`,
          { token },
        );
        setPhotos(result.photos || []);
      }
    } catch (caught) {
      setError(describeError(caught));
    }
  }, [tripId, token]);

  async function uploadFiles(files, kind) {
    if (!files.length) return;
    setBusy(true);
    setNotice("");
    setError("");
    const encoded = encodeURIComponent(tripId);
    for (const file of files.slice(0, 20)) {
      const entry = {
        id: `${Date.now()}-${uploadSeq.current++}`,
        name: file.name,
        kind,
        state: "uploading",
        detail: "",
      };
      setUploads((prev) => [...prev, entry]);
      const mark = (patch) =>
        setUploads((prev) => prev.map((u) => (u.id === entry.id ? { ...u, ...patch } : u)));
      try {
        if (file.size > 15 * 1024 * 1024) throw new Error("Larger than 15MB. Pick a smaller photo.");
        const image = await fileToBase64(file);
        mark({ state: "uploading", detail: "Sending photo securely…" });
        const path = kind === "reference" ? `/trips/${encoded}/face-references` : `/trips/${encoded}/media`;
        const body =
          kind === "reference"
            ? { image_base64: image, content_type: file.type || "image/jpeg", consent: true }
            : { image_base64: image, content_type: file.type || "image/jpeg" };
        const created = await core(path, { token, method: "POST", body });
        if (kind === "reference" && created.duplicate && created.job_kind !== "reference_enroll") {
          throw new Error(
            "The server reused an earlier photo upload but did not confirm a selfie face check. Your reference is not saved yet; the Core media migration needs to be applied before retrying.",
          );
        }
        mark({
          state: "processing",
          jobId: created.job_id,
          detail: "Photo received. Waiting for face processing…",
        });
        const job = created.job_id
          ? await waitForJob(token, created.job_id, (detail) => mark({ state: "processing", detail }))
          : null;
        if (!job) {
          mark({ state: "processing", detail: "Still processing. Check back in a moment." });
        } else {
          mark({
            state: "done",
            detail:
              kind === "reference"
                ? "Face detected. Your reference is ready for this trip."
                : "Photo checked for faces and added to the trip album.",
          });
        }
      } catch (caught) {
        mark({ state: "failed", detail: describeError(caught) });
      }
    }
    setBusy(false);
    await refresh();
    if (selected) await loadSelection(selected);
  }

  async function correct(faceId, subjectUserId) {
    try {
      await core(`/faces/${encodeURIComponent(faceId)}/correct`, {
        token,
        method: "POST",
        body: { subject_user_id: subjectUserId },
      });
      setNotice(subjectUserId ? "Thanks. Grouping will use your correction." : "Removed from that group.");
      await refresh();
      if (selected) await loadSelection(selected);
    } catch (caught) {
      setError(describeError(caught));
    }
  }

  async function revokeReference() {
    try {
      await core(`/trips/${encodeURIComponent(tripId)}/face-references`, { token, method: "DELETE" });
      setNotice("Your reference photo and its groupings were deleted.");
      await refresh();
      setSelected(null);
      setPhotos([]);
    } catch (caught) {
      setError(describeError(caught));
    }
  }

  const myReference = me && references.find((r) => r.subject_user_id === me.user_id);
  const latestReferenceUpload = uploads.filter((upload) => upload.kind === "reference").at(-1);
  const selectedPerson = selected && selected !== "unassigned"
    ? people.find((p) => p.subject_user_id === selected)
    : null;

  async function recheckUpload(upload) {
    if (!upload.jobId) return;
    const mark = (patch) =>
      setUploads((prev) => prev.map((item) => (item.id === upload.id ? { ...item, ...patch } : item)));
    try {
      const job = await core(`/jobs/${encodeURIComponent(upload.jobId)}`, { token });
      if (job.state === "succeeded") {
        mark({
          state: "done",
          detail:
            upload.kind === "reference"
              ? "Face detected. Your reference is ready for this trip."
              : "Photo checked for faces and added to the trip album.",
        });
        await refresh();
      } else if (job.state === "failed") {
        mark({ state: "failed", detail: jobFailureMessage(job) });
      } else {
        mark({
          state: "processing",
          detail:
            job.state === "running"
              ? "Photo received. Detecting a face…"
              : "Photo received. Waiting for face processing…",
        });
      }
    } catch (caught) {
      mark({ state: "processing", detail: `Could not check status: ${describeError(caught)}` });
    }
  }

  return (
    <div className="wm-room-grid wm-memories-grid">
      <section className="wm-panel">
        <span className="wm-kicker">FIND YOURSELF</span>
        <h2>Group photos by face.</h2>
        <p>
          Add a front-facing selfie so the trip album can group everyone&apos;s
          photos by person. Matching stays inside this trip, and you can delete
          your reference any time.
        </p>
        {myReference ? (
          <div className="wm-reference-state">
            <p>
              <strong>Reference ready.</strong> Face detected and saved for this trip. It will be used to find you in trip photos.
            </p>
            <small>{myReference.face_count} reference selfie{myReference.face_count === 1 ? "" : "s"} saved</small>
            <button className="wm-secondary" disabled={busy} onClick={revokeReference}>
              Delete my reference
            </button>
          </div>
        ) : (
          <div className="wm-form">
            <label className="wm-check">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              I agree to face grouping for this trip only.
            </label>
            <label className={`wm-file${busy || !consent ? " is-disabled" : ""}`}>
              Choose a selfie
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy || !consent}
                onChange={(e) => {
                  uploadFiles(Array.from(e.target.files || []), "reference");
                  e.target.value = "";
                }}
              />
            </label>
            {!consent && <small>Tick the consent box first. No reference, no matching.</small>}
            {latestReferenceUpload && (
              <div className={`wm-upload-feedback is-${latestReferenceUpload.state}`} role={latestReferenceUpload.state === "failed" ? "alert" : "status"}>
                <span className="wm-upload-feedback-dot" aria-hidden="true" />
                <div>
                  <strong>
                    {latestReferenceUpload.state === "uploading"
                      ? "Uploading selfie"
                      : latestReferenceUpload.state === "processing"
                        ? "Checking selfie"
                        : latestReferenceUpload.state === "done"
                          ? "Selfie processed"
                          : "Selfie not processed"}
                  </strong>
                  <p>{latestReferenceUpload.detail}</p>
                  {latestReferenceUpload.state === "processing" && !busy && (
                    <button className="wm-text-button wm-upload-recheck" onClick={() => recheckUpload(latestReferenceUpload)}>
                      Check status
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        <hr className="wm-divider" />
        <span className="wm-kicker">TRIP ALBUM</span>
        <h3>Add end-of-trip photos.</h3>
        <label className={`wm-file${busy ? " is-disabled" : ""}`}>
          Choose photos
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={busy}
            onChange={(e) => {
              uploadFiles(Array.from(e.target.files || []), "trip");
              e.target.value = "";
            }}
          />
        </label>
        {uploads.some((upload) => upload.kind === "trip") && (
          <ul className="wm-upload-list">
            {uploads.filter((upload) => upload.kind === "trip").slice(-6).map((u) => (
              <li key={u.id}>
                <strong>{u.name}</strong> — {u.state}
                {u.detail ? ` · ${u.detail}` : ""}
              </li>
            ))}
          </ul>
        )}
        {media.length > 0 && (
          <small>{media.length} photos · {media.filter((m) => m.status !== "ready").length} still processing</small>
        )}
      </section>

      <section className="wm-panel wm-memories-people">
        <span className="wm-kicker">PEOPLE IN THESE PHOTOS</span>
        <h2>Who&apos;s in the album?</h2>
        {error && <div className="wm-notice wm-notice-error" role="alert">{error}</div>}
        {notice && <div className="wm-notice wm-notice-success" role="status">{notice}</div>}
        {people.length === 0 ? (
          <div className="wm-empty wm-empty-small wm-memories-empty">
            <span className="wm-empty-icon" aria-hidden="true">✳</span>
            <h3>No grouped faces yet.</h3>
            <p>Once a selfie is processed, matching photos will appear here. One photo can belong to several people.</p>
          </div>
        ) : (
          <div className="wm-people-strip" role="group" aria-label="People found in photos">
            {people.map((person) => (
              <button
                key={person.subject_user_id}
                className={selected === person.subject_user_id ? "active" : ""}
                onClick={() => loadSelection(person.subject_user_id)}
              >
                <span className="wm-avatar">{(person.display_name || "?")[0].toUpperCase()}</span>
                <strong>{person.display_name}</strong>
                <small>{person.photo_count} photo{person.photo_count === 1 ? "" : "s"}</small>
              </button>
            ))}
            <button
              className={selected === "unassigned" ? "active" : ""}
              onClick={() => loadSelection("unassigned")}
            >
              <span className="wm-avatar">?</span>
              <strong>Unassigned</strong>
              <small>Review faces</small>
            </button>
          </div>
        )}
        {selected && (
          <div className="wm-photo-grid">
            {photos.length === 0 ? (
              <p>{selectedPerson ? `No photos of ${selectedPerson.display_name} yet.` : "No unassigned faces. Everything is grouped."}</p>
            ) : (
              photos.map((photo) => (
                <figure className="wm-photo-card" key={`${photo.media_id}-${photo.face_id || "all"}`}>
                  <PhotoImg
                    tripId={tripId}
                    token={token}
                    mediaId={photo.media_id}
                    alt={selectedPerson ? `Photo of ${selectedPerson.display_name}` : "Unassigned face"}
                  />
                  <figcaption>
                    {photo.confidence != null && <small>match {Math.round(photo.confidence * 100)}%</small>}
                    {photo.review_state === "confirmed" && <small> · confirmed by you</small>}
                    <div className="wm-photo-actions">
                      {selectedPerson && photo.face_id && (
                        <button
                          className="wm-text-button"
                          onClick={() => correct(photo.face_id, null)}
                        >
                          Not {selectedPerson.display_name}?
                        </button>
                      )}
                      {photo.unassigned && (
                        <select
                          aria-label="Tag this face as"
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) correct(photo.face_id, e.target.value);
                            e.target.value = "";
                          }}
                        >
                          <option value="">Tag as…</option>
                          {members
                            .filter((m) => m.role !== "guest")
                            .map((m) => (
                              <option key={m.user_id} value={m.user_id}>
                                {m.display_name}
                              </option>
                            ))}
                        </select>
                      )}
                    </div>
                  </figcaption>
                </figure>
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
}
