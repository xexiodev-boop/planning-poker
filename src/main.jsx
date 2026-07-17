import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import App from "./App.jsx";
import { syncCanonicalTag } from "./lib/canonical.js";
import { activateLocale, detectLocale } from "./lib/i18n.js";
import "./styles.css";

syncCanonicalTag();
activateLocale(detectLocale()).then(() => {
  createRoot(document.getElementById("root")).render(
    <StrictMode>
      <I18nProvider i18n={i18n}>
        <App />
      </I18nProvider>
    </StrictMode>,
  );
});
