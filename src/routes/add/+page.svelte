<script lang="ts">
  import { enhance } from "$app/forms";
  import Spinner from "$lib/Spinner.svelte";
  import type { ActionData } from "./$types";

  let { form }: { form: ActionData } = $props();

  type Tab = "link" | "text" | "photo" | "reel";
  let tab = $state<Tab>("link");
  let busy = $state(false);

  // Der Import laeuft ueber Gemini und dauert je nach Quelle zehner Sekunden.
  // Ohne sichtbaren Fortschritt wirkt die Seite in der Zeit eingefroren, deshalb
  // eine mitlaufende Sekundenanzeige statt nur "bitte warten".
  let sekunden = $state(0);
  let ticker: ReturnType<typeof setInterval> | undefined;

  const submit = () => {
    busy = true;
    sekunden = 0;
    clearInterval(ticker);
    ticker = setInterval(() => (sekunden += 1), 1000);
    return async ({ update }: { update: () => Promise<void> }) => {
      await update();
      clearInterval(ticker);
      busy = false;
    };
  };

  const LABEL: Record<Tab, string> = {
    link: "Webseite wird geladen und ausgewertet",
    reel: "Reel-Caption wird geholt und ausgewertet",
    photo: "Fotos werden gelesen und ausgewertet",
    text: "Text wird ausgewertet",
  };
</script>

<svelte:head><title>Rezept hinzufügen</title></svelte:head>

<p class="back"><a href="/">← Übersicht</a></p>
<h2 class="page-title">Rezept hinzufügen</h2>

<div class="tabs">
  <button class:active={tab === "link"} onclick={() => (tab = "link")}>🔗 Link</button>
  <button class:active={tab === "reel"} onclick={() => (tab = "reel")}>🎬 Reel</button>
  <button class:active={tab === "photo"} onclick={() => (tab = "photo")}>📷 Foto</button>
  <button class:active={tab === "text"} onclick={() => (tab = "text")}>📝 Text</button>
</div>

{#if form?.error}<p class="msg err">{form.error}</p>{/if}
{#if form?.queued}<p class="msg ok">⏳ Der Rezept-Dienst ist gerade ausgelastet. Deine Eingabe wurde gespeichert und wird automatisch weiter versucht – das fertige Rezept erscheint danach in deiner Bibliothek.</p>{/if}
{#if busy}
  <p class="msg info arbeitet">
    <Spinner label="Import läuft" />
    <span>{LABEL[tab]} … <strong>{sekunden}s</strong></span>
  </p>
{/if}

{#if tab === "link"}
  <form method="POST" action="?/link" use:enhance={submit}>
    <input type="url" name="url" placeholder="https://… (Rezept-Webseite)" required />
    <button type="submit" class="btn primary" disabled={busy}>
      {#if busy}<Spinner /> Importiert …{:else}Importieren{/if}
    </button>
  </form>
  <p class="hint">Die Webseite wird geladen und das Rezept per Gemini extrahiert.</p>
{:else if tab === "reel"}
  <form method="POST" action="?/reel" use:enhance={submit}>
    <input type="url" name="url" placeholder="https://www.instagram.com/reel/…" required />
    <button type="submit" class="btn primary" disabled={busy}>
      {#if busy}<Spinner /> Importiert …{:else}Importieren{/if}
    </button>
  </form>
  <p class="hint">Holt die Caption des Reels und extrahiert daraus das Rezept. Funktioniert, wenn das Rezept in der Bildunterschrift steht (sonst Text kopieren).</p>
{:else if tab === "photo"}
  <form method="POST" action="?/photo" enctype="multipart/form-data" use:enhance={submit}>
    <input type="file" name="photos" accept="image/*,.heic,.heif" multiple required />
    <button type="submit" class="btn primary" disabled={busy}>
      {#if busy}<Spinner /> Importiert …{:else}Importieren{/if}
    </button>
  </form>
  <p class="hint">Ein oder mehrere Fotos (z.B. Kochbuchseiten, auch HEIC). Mehrere = mehrseitiges Rezept.</p>
{:else}
  <form method="POST" action="?/text" use:enhance={submit}>
    <textarea name="text" rows="10" placeholder="Rezepttext einfügen …" required></textarea>
    <button type="submit" class="btn primary" disabled={busy}>
      {#if busy}<Spinner /> Importiert …{:else}Importieren{/if}
    </button>
  </form>
  <p class="hint">Freier Rezepttext (Zutaten + Zubereitung).</p>
{/if}

<style>
  .msg.info.arbeitet {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .back a {
    color: var(--ink);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .page-title {
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 700;
    font-size: 1.5rem;
    margin: 0.3rem 0 1.1rem;
  }
  .tabs {
    display: flex;
    gap: 0.5rem;
    margin: 1rem 0;
    flex-wrap: wrap;
  }
  .tabs button {
    padding: 0.5rem 1rem;
    border: 2.5px solid var(--ink);
    background: #fff;
    border-radius: var(--radius);
    cursor: pointer;
    font: inherit;
    font-weight: 600;
    box-shadow: 3px 3px 0 var(--ink);
    transition:
      transform 0.1s,
      box-shadow 0.1s;
  }
  .tabs button.active {
    background: var(--accent);
    color: #fff;
    box-shadow: 3px 3px 0 var(--ink);
  }
  .tabs button:active {
    transform: translate(2px, 2px);
    box-shadow: 1px 1px 0 var(--ink);
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    max-width: 560px;
  }
  input,
  textarea {
    padding: 0.75rem 0.85rem;
    border: 2.5px solid var(--ink);
    border-radius: var(--radius);
    font: inherit;
    background: #fff;
    box-shadow: 3px 3px 0 var(--ink);
  }
  input:focus,
  textarea:focus {
    outline: none;
    box-shadow: 3px 3px 0 var(--accent);
  }
  form button {
    align-self: flex-start;
  }
  .hint {
    color: var(--muted);
    font-size: 0.88rem;
    max-width: 560px;
  }
  .msg {
    padding: 0.6rem 0.85rem;
    border: 2px solid var(--ink);
    border-radius: var(--radius);
    max-width: 560px;
    font-weight: 500;
  }
  .msg.err {
    background: #fde8e8;
    color: #9b1c1c;
  }
  .msg.info {
    background: var(--yellow);
    color: var(--ink);
  }
  .msg.ok {
    background: #bfe6c9;
    color: var(--ink);
  }
</style>
