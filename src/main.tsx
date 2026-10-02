import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow/700.css";
import "@fontsource/barlow/800.css";
import "./fit.css";
import FitApp from "./ui/FitApp";

// fit.css reads both; an undefined var() would void the whole font stack.
document.documentElement.style.setProperty("--font-barlow", '"Barlow"');
document.documentElement.style.setProperty("--font-inter", "system-ui");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FitApp />
  </StrictMode>,
);
