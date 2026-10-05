import type { Meta } from "../data";
import { ThemeSwitch } from "../ui";

/** The safety disclaimer, shared by the first-run sheet and the About screen. */
export function DisclaimerText() {
  return (
    <div class="legal">
      <p style="margin: 0 0 10px">
        This is an unofficial reading aid for your own copy of the plans — not a source of truth. <b>You use it entirely at your own risk.</b>
      </p>
      <ul>
        <li>
          <b>AI makes mistakes.</b> It can misread a drawing, swap left/right or fore/aft, or get a dimension, drill size, rivet callout, part number or
          step wrong — and still sound confident. The step text and figure notes in this app were transcribed by AI too.
        </li>
        <li>
          <b>The plans are the authority.</b> Check the actual page and drawing before you cut, drill, dimple, prime or rivet. Van's current revisions,
          service bulletins and notifications supersede anything here.
        </li>
        <li>
          <b>Ask people who know.</b> When something is unclear, structural, or you're unsure, check with Van's builder support, an EAA Technical
          Counselor and experienced builders of your model.
        </li>
        <li>
          <b>You are responsible for your aircraft</b> — its construction, inspection and airworthiness. Nothing here is engineering, inspection or
          airworthiness advice.
        </li>
        <li>
          Provided “as is”, with no warranty and no liability for errors, omissions, damage, injury or loss. Not affiliated with or endorsed by Van's
          Aircraft or Anthropic.
        </li>
      </ul>
    </div>
  );
}

const ACK_KEY = "disclaimerAck:v1";
export function hasAcknowledged(): boolean {
  try {
    return localStorage.getItem(ACK_KEY) === "1";
  } catch {
    return false;
  }
}
export function acknowledge() {
  try {
    localStorage.setItem(ACK_KEY, "1");
  } catch {
    /* storage unavailable: the sheet shows again next time */
  }
}

export function DisclaimerSheet({ onAccept }: { onAccept: () => void }) {
  return (
    <div class="modal-back" role="dialog" aria-modal="true" aria-labelledby="disclaimer-title">
      <div class="modal">
        <h2 id="disclaimer-title">Before you use this</h2>
        <DisclaimerText />
        <button
          type="button"
          class="btn primary"
          style="width: 100%"
          onClick={() => {
            acknowledge();
            onAccept();
          }}
        >
          I understand — I'll verify against the plans
        </button>
      </div>
    </div>
  );
}

export function About({ meta }: { meta: Meta }) {
  return (
    <div style="max-width: 720px; display: flex; flex-direction: column; gap: 16px">
      <h1 style="margin: 0; font-size: 24px">About & disclaimer</h1>
      <DisclaimerText />
      <section aria-label="Appearance">
        <h2 class="eyebrow">Appearance</h2>
        <ThemeSwitch />
        <p class="small muted" style="margin: 6px 0 0">System follows your device's light/dark setting. Saved on this device.</p>
      </section>
      <p class="small muted" style="margin: 0">
        {meta.model} plans · data version {meta.version} · <a href="https://github.com/particlep/rv-plans-assistant">rv-plans-assistant</a> (MIT)
      </p>
    </div>
  );
}
