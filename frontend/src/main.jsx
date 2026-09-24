import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import Workspace from "./Workspace";
import "./styles.css";
import "./warm-theme.css";
import "./workspace.css";

createRoot(document.getElementById("root")).render(
  window.location.pathname.startsWith("/app") ? <Workspace /> : <App />,
);
