import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./warm-theme.css";
import "./workspace.css";
import "./discovery.css";

const screen = window.location.pathname.startsWith("/app")
  ? import("./Workspace")
  : import("./App");

screen.then(({ default: Screen }) => {
  createRoot(document.getElementById("root")).render(<Screen />);
});
