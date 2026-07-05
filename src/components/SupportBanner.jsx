import { useState } from "react";
import { dismissSupportBanner, isSupportBannerHidden } from "../lib/supportBanner.js";

// Where the "buy me a coffee" button points. Swap this for your own link.
const COFFEE_URL = "https://www.buymeacoffee.com/xexiodev";

export function SupportBanner() {
  const [hidden, setHidden] = useState(isSupportBannerHidden);
  if (hidden) return null;

  function dismiss() {
    dismissSupportBanner();
    setHidden(true);
  }

  return (
    <div className="support-banner" role="complementary">
      <span className="support-banner-icon" aria-hidden="true">☕</span>
      <p>
        Enjoying Point Taken? If you find it useful, please consider{" "}
        <a href={COFFEE_URL} target="_blank" rel="noopener noreferrer">
          buying me a coffee
        </a>
        .
      </p>
      <button aria-label="Dismiss for a week" onClick={dismiss} type="button">
        ×
      </button>
    </div>
  );
}
