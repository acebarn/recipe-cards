<script lang="ts">
  import { enhance } from "$app/forms";
  import type { ActionData } from "./$types";

  let { form }: { form: ActionData } = $props();

  type Tab = "link" | "text" | "photo";
  let tab = $state<Tab>("link");
  let busy = $state(false);

  const submit = () => {
    busy = true;
    return async ({ update }: { update: () => Promise<void> }) => {
      await update();
      busy = false;
    };
  };
</script>

<svelte:head><title>Rezept hinzufügen</title></svelte:head>

<p><a href="/">← Übersicht</a></p>
<h2>Rezept hinzufügen</h2>

<div class="tabs">
  <button class:active={tab === "link"} onclick={() => (tab = "link")}>🔗 Link</button>
  <button class:active={tab === "photo"} onclick={() => (tab = "photo")}>📷 Foto</button>
  <button class:active={tab === "text"} onclick={() => (tab = "text")}>📝 Text</button>
</div>

{#if form?.error}<p class="msg err">{form.error}</p>{/if}
{#if busy}<p class="msg info">Rezept wird extrahiert … das kann einen Moment dauern.</p>{/if}

{#if tab === "link"}
  <form method="POST" action="?/link" use:enhance={submit}>
    <input type="url" name="url" placeholder="https://… (Rezept-Webseite)" required />
    <button type="submit" disabled={busy}>Importieren</button>
  </form>
  <p class="hint">Die Webseite wird geladen und das Rezept per Gemini extrahiert.</p>
{:else if tab === "photo"}
  <form method="POST" action="?/photo" enctype="multipart/form-data" use:enhance={submit}>
    <input type="file" name="photos" accept="image/*,.heic,.heif" multiple required />
    <button type="submit" disabled={busy}>Importieren</button>
  </form>
  <p class="hint">Ein oder mehrere Fotos (z.B. Kochbuchseiten, auch HEIC). Mehrere = mehrseitiges Rezept.</p>
{:else}
  <form method="POST" action="?/text" use:enhance={submit}>
    <textarea name="text" rows="10" placeholder="Rezepttext einfügen …" required></textarea>
    <button type="submit" disabled={busy}>Importieren</button>
  </form>
  <p class="hint">Freier Rezepttext (Zutaten + Zubereitung).</p>
{/if}

<style>
  .tabs { display: flex; gap: 0.4rem; margin: 1rem 0; }
  .tabs button { padding: 0.5rem 0.9rem; border: 1px solid var(--border); background: #fff; border-radius: 999px; cursor: pointer; }
  .tabs button.active { background: var(--accent); color: #fff; border-color: var(--accent); }
  form { display: flex; flex-direction: column; gap: 0.7rem; max-width: 560px; }
  input, textarea { padding: 0.7rem 0.8rem; border: 1px solid var(--border); border-radius: 10px; font: inherit; }
  form button { align-self: flex-start; padding: 0.6rem 1.3rem; border: 0; border-radius: 10px; background: var(--accent); color: #fff; cursor: pointer; }
  form button:disabled { opacity: 0.6; cursor: default; }
  .hint { color: var(--muted); font-size: 0.88rem; }
  .msg { padding: 0.5rem 0.75rem; border-radius: 8px; max-width: 560px; }
  .msg.err { background: #fde8e8; color: #9b1c1c; }
  .msg.info { background: #fff7e6; color: #8a5a00; }
</style>
