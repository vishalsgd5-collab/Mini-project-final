import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth";
import { registerGuardian } from "./lib/notify";
import { armAudioUnlock } from "./lib/sound";
import "./styles/global.css";

registerGuardian();
armAudioUnlock();

createRoot(document.getElementById("root")).render(
  <HashRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </HashRouter>
);
