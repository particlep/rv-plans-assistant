import { render } from "preact";
import { App } from "./app";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./styles.css";

render(<App />, document.getElementById("app")!);

if ("serviceWorker" in navigator && !import.meta.env.DEV) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
