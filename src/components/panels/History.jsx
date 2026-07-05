import { useState } from "react";
import { useModal } from "../../hooks/useModal.js";
import { exportHistory } from "../../lib/export.js";

export function History({ room }) {
  const { history } = room;
  const [selected, setSelected] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <>
      <section className="side-section history-section">
        <div className="side-heading">
          <h2>Estimates</h2>
          <div className="history-heading-actions">
            {history.length > 0 && (
              <button onClick={() => setExportOpen(!exportOpen)} type="button">Export</button>
            )}
            <span>{history.length}</span>
          </div>
        </div>
        {exportOpen && (
          <div className="export-menu">
            <button onClick={() => exportHistory(room, "csv")} type="button">Download CSV</button>
            <button onClick={() => exportHistory(room, "markdown")} type="button">Download Markdown</button>
          </div>
        )}
        {history.length === 0 ? (
          <p className="empty-history">Finished tasks will collect here.</p>
        ) : (
          <ol className="history-list">
            {history.map((item) => (
              <li key={item.id}>
                <button onClick={() => setSelected(item)} type="button">
                  <span>{item.finalValue}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>
                      {item.metrics ? `${item.metrics.consensusPercent}% agreement` : `${item.votes.filter((vote) => vote.confirmed).length} votes`}
                    </small>
                  </div>
                  <i aria-hidden="true">›</i>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
      {selected && <ResultDetail item={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function ResultDetail({ item, onClose }) {
  const counts = new Map();
  item.votes.forEach((vote) => {
    if (vote.value) counts.set(vote.value, (counts.get(vote.value) ?? 0) + 1);
  });
  const dialogRef = useModal(onClose);

  return (
    <div className="workspace-backdrop" onMouseDown={onClose}>
      <section
        aria-labelledby="result-detail-title"
        aria-modal="true"
        className="results-screen workspace-modal"
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <header>
          <div>
            <p className="eyebrow">Completed estimate</p>
            <h1 id="result-detail-title">{item.title}</h1>
            <p>{new Date(item.completedAt).toLocaleString()}</p>
          </div>
          <div className="workspace-header-actions">
            <span className="completed-estimate">{item.finalValue}</span>
            <button className="workspace-close" onClick={onClose} type="button" aria-label="Close details">×</button>
          </div>
        </header>
        <main className="result-detail">
          <section className="result-detail-summary">
            <div>
              <span>Final estimate</span>
              <strong>{item.finalValue}</strong>
            </div>
            <div>
              <span>App suggestion</span>
              <strong>{item.suggestion?.value ?? "None"}</strong>
            </div>
            <div>
              <span>Agreement</span>
              <strong>{item.metrics ? `${item.metrics.consensusPercent}%` : "—"}</strong>
            </div>
            <div>
              <span>Vote range</span>
              <strong>
                {item.metrics?.low
                  ? item.metrics.low === item.metrics.high ? item.metrics.low : `${item.metrics.low}–${item.metrics.high}`
                  : "—"}
              </strong>
            </div>
          </section>
          <section className="vote-breakdown">
            <div>
              <p className="eyebrow">Vote breakdown</p>
              <h2>How the team voted</h2>
            </div>
            <div className="breakdown-bars">
              {[...counts.entries()].map(([value, count]) => (
                <div key={value}>
                  <strong>{value}</strong>
                  <span><i style={{ width: `${(count / item.votes.length) * 100}%` }} /></span>
                  <b>{count}</b>
                </div>
              ))}
            </div>
            <ol className="result-voter-list">
              {item.votes.map((vote) => (
                <li key={vote.participantId}>
                  <span>{vote.participantName}</span>
                  <strong>{vote.value ?? "No vote"}</strong>
                </li>
              ))}
            </ol>
          </section>
        </main>
      </section>
    </div>
  );
}
