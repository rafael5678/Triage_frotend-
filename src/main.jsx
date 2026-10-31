import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./views/App.jsx";
import Arrive from "./views/Arrive.jsx";
import PublicBoard from "./views/PublicBoard.jsx";
import "./styles.css";

function route() {
  const path = window.location.pathname;
  const hash = window.location.hash;
  if (path.includes("/llegue") || hash.startsWith("#/llegue")) return "arrive";
  if (hash.startsWith("#/sala")) return "board";
  return "app";
}

function Root() {
  const [page, setPage] = useState(route);
  useEffect(() => {
    const onChange = () => setPage(route());
    window.addEventListener("hashchange", onChange);
    window.addEventListener("popstate", onChange);
    return () => {
      window.removeEventListener("hashchange", onChange);
      window.removeEventListener("popstate", onChange);
    };
  }, []);
  if (page === "arrive") return <Arrive />;
  if (page === "board") return <PublicBoard />;
  return <App />;
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
