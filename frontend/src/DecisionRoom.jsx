import React from "react";
import { decisionState, decisionThreshold } from "./lib/decisions";

export default function DecisionRoom({ decisions, unavailable, canVote, busy, onVote }) {
  return <section className="wm-panel">
    <div className="wm-panel-title"><div><span className="wm-kicker">THE DECISION ROOM</span><h2>Ideas your group can act on.</h2></div></div>
    {unavailable ? <div className="wm-notice wm-notice-error" role="alert">{unavailable}</div>
      : decisions.length === 0 ? <div className="wm-empty wm-empty-small"><h3>No decisions waiting.</h3><p>When someone proposes a change, everyone can review it here.</p></div>
        : <div className="wm-decision-list">{decisions.map((decision, index) => {
          const id = decision.change_set_id || decision.id;
          const state = decisionState(decision);
          const threshold = decisionThreshold(decision);
          const revisionReady = Number.isInteger(decision.revision) && decision.revision >= 0;
          const operationCount = decision.operations?.length ?? decision.operation_count ?? 1;
          return <article className="wm-decision" key={id || index}>
            <div><span className="wm-kicker">{state.replaceAll("_", " ")}</span><h3>{decision.title || "Trip change"}</h3><p>{operationCount} change{operationCount === 1 ? "" : "s"} · {decision.yes_count ?? 0} of {threshold ?? "?"} yes votes needed</p>{state === "open" && canVote && !revisionReady && <small className="wm-decision-note">Waiting for a decision revision from the trip service before voting.</small>}</div>
            {state === "open" && canVote && id && <div className="wm-decision-actions"><button className="wm-primary" disabled={busy || !revisionReady} onClick={() => onVote(decision, "yes")}>Vote yes</button><button className="wm-secondary" disabled={busy || !revisionReady} onClick={() => onVote(decision, "no")}>Vote no</button></div>}
          </article>;
        })}</div>}
  </section>;
}
