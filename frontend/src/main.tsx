import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/global.css";
import { verifyBackendVersion } from "./utils/versionCheck";

// a11y: @axe-core/react logs WCAG / Section 508 violations to
// the browser DevTools console after every render in dev mode.
// devDependency-only — never shipped to production bundle. The
// 1000ms debounce keeps it responsive without thrashing the
// console during rapid re-renders. WCAG 2.1 SC 4.1.1 / 4.1.2.
if (import.meta.env.DEV) {
  void import("@axe-core/react").then(({ default: axe }) => {
    void axe(React, ReactDOM, 1000);
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);

void verifyBackendVersion();
