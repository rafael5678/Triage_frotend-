import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./views/App.jsx";
import PublicBoard from "./views/PublicBoard.jsx";
import "./styles.css";

function isBoard() {
  return window.location.hash.startsWith("#/sala");
}

/** #/sala es la pantalla pública de la sala de espera; el resto es la app del personal. */
function Root() {
  const [board, setBoard] = useState(isBoard);
  useEffect(() => {
    const onHash = () => setBoard(isBoard());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return board ? <PublicBoard /> : <App />;
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
