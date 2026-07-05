import { useState } from "react";
import { useModal } from "../../hooks/useModal.js";

const FACILITATOR_GUIDE_STEPS = [
  {
    title: "Add the items to estimate",
    text: "Open the item manager and enter one item per line. Arrange them in the order you want to discuss them.",
    action: "Open item manager",
  },
  {
    title: "Invite your team",
    text: "Click Invite people in the header and share the room link. Wait for everyone to appear in the People list.",
  },
  {
    title: "Start the vote",
    text: "Select an item from the estimation queue, or enter a new one, then click Start voting.",
  },
  {
    title: "Wait for the votes",
    text: "The People list shows who has voted. When the team is ready, click Reveal cards.",
  },
  {
    title: "Agree and save",
    text: "Discuss the revealed cards, choose the final estimate, and click Save estimate. Then move to the next item.",
  },
];

export function FacilitatorGuide({ onClose, onManageItems }) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = FACILITATOR_GUIDE_STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === FACILITATOR_GUIDE_STEPS.length - 1;
  const dialogRef = useModal(onClose);

  return (
    <div className="workspace-backdrop guide-backdrop" onMouseDown={onClose}>
      <section
        aria-labelledby="facilitator-guide-title"
        aria-modal="true"
        className="facilitator-guide"
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <header>
          <div>
            <p className="eyebrow">Facilitator tutorial</p>
            <h2 id="facilitator-guide-title">Run your first planning session</h2>
          </div>
          <button className="workspace-close" onClick={onClose} type="button" aria-label="Close guide">×</button>
        </header>
        <div className="tutorial-progress">
          <span>Step {stepIndex + 1} of {FACILITATOR_GUIDE_STEPS.length}</span>
          <div>
            {FACILITATOR_GUIDE_STEPS.map((item, index) => (
              <i className={index <= stepIndex ? "active" : ""} key={item.title} />
            ))}
          </div>
        </div>
        <section className="tutorial-step">
          <span className="tutorial-number">{String(stepIndex + 1).padStart(2, "0")}</span>
          <h3>{step.title}</h3>
          <p>{step.text}</p>
          {step.action && (
            <button className="tutorial-action" onClick={onManageItems} type="button">
              {step.action} →
            </button>
          )}
        </section>
        <footer>
          <button
            className="secondary-button"
            disabled={isFirst}
            onClick={() => setStepIndex((index) => index - 1)}
            type="button"
          >
            Back
          </button>
          <button
            className="primary-button"
            onClick={isLast ? onClose : () => setStepIndex((index) => index + 1)}
            type="button"
          >
            {isLast ? "Finish" : "Next"}
          </button>
        </footer>
      </section>
    </div>
  );
}
