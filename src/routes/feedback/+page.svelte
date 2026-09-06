<script lang="ts">
  import { enhance } from "$app/forms";
  import { page } from "$app/state";
  import type { ActionData, PageData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  // Kategorie erst wählen, dann schreiben — der Weg soll auf einen Blick klar sein.
  let gewaehlt = $state<string | null>(null);
  let text = $state("");
  const MAX = 2000;
  let rest = $derived(MAX - text.length);
  // Auf welcher Seite war die Person zuletzt? Hilft beim Nachstellen von Fehlern.
  let herkunft = $derived(page.url.searchParams.get("von") ?? "");
</script>

<svelte:head><title>Rückmeldung · SCHMACKOFATZ</title></svelte:head>

<p class="back"><a href="/">← Übersicht</a></p>
<h2 class="page-title">💬 Rückmeldung</h2>

{#if form?.ok}
  <section class="danke">
    <span class="ic">✅</span>
    <div>
      <p class="t">{form.hinweis}</p>
      <p class="d">
        <a href="/">Zurück zur Übersicht</a> ·
        <a href="/feedback" onclick={() => { gewaehlt = null; text = ""; }}>Noch etwas melden</a>
      </p>
    </div>
  </section>
{:else}
  <p class="lead">
    Was ist dir aufgefallen, {data.name}? Wähle zuerst, worum es geht — die Meldung geht direkt
    an die Betreuer der App.
  </p>

  <form method="POST" use:enhance>
    <input type="hidden" name="page" value={herkunft} />

    <!-- Schritt 1: Kategorie -->
    <p class="schritt"><span class="nr">1</span> Worum geht es?</p>
    <div class="kategorien">
      {#each data.categories as c (c.key)}
        <label class="kat" class:aktiv={gewaehlt === c.key}>
          <input
            type="radio"
            name="category"
            value={c.key}
            bind:group={gewaehlt}
            required
          />
          <span class="kic">{c.icon}</span>
          <span class="kt">{c.label}</span>
          <span class="kd">{c.hint}</span>
        </label>
      {/each}
    </div>

    <!-- Schritt 2: Text -->
    <p class="schritt" class:aus={!gewaehlt}><span class="nr">2</span> Erzähl kurz, was los ist</p>
    <textarea
      name="message"
      rows="6"
      maxlength={MAX}
      bind:value={text}
      disabled={!gewaehlt}
      placeholder={gewaehlt === "bug"
        ? "Was hast du gemacht, und was ist stattdessen passiert?"
        : gewaehlt === "wunsch"
          ? "Was würdest du dir wünschen — und wofür wäre es gut?"
          : "Schreib einfach los …"}
    ></textarea>
    <p class="zaehler" class:knapp={rest < 100}>{rest} Zeichen übrig</p>

    {#if form?.error}<p class="fehler">{form.error}</p>{/if}

    <div class="aktionen">
      <button class="btn" type="submit" disabled={!gewaehlt || text.trim().length < 5}>
        Abschicken
      </button>
      <span class="signatur">wird gesendet als <strong>{data.name}</strong></span>
    </div>
  </form>
{/if}

<style>
  .lead {
    color: var(--muted);
    margin: 0 0 1.4rem;
    max-width: 46rem;
  }
  .schritt {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    font-size: 0.82rem;
    margin: 1.4rem 0 0.6rem;
  }
  .schritt.aus {
    color: var(--muted);
  }
  .nr {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border: 2.5px solid var(--ink);
    border-radius: 999px;
    font-size: 0.8rem;
  }
  .kategorien {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.8rem;
  }
  @media (max-width: 640px) {
    .kategorien {
      grid-template-columns: 1fr;
    }
  }
  .kat {
    display: grid;
    grid-template-rows: auto auto auto;
    gap: 0.15rem;
    background: #fff;
    border: 2.5px solid var(--ink);
    border-radius: var(--radius);
    box-shadow: 4px 4px 0 var(--ink);
    padding: 0.9rem 1rem;
    cursor: pointer;
    transition:
      transform 0.1s,
      box-shadow 0.1s;
  }
  .kat:hover {
    transform: translate(-2px, -2px);
    box-shadow: 6px 6px 0 var(--accent);
  }
  .kat.aktiv {
    background: var(--ink);
    color: #fff;
    box-shadow: 4px 4px 0 var(--accent);
  }
  .kat input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }
  .kic {
    font-size: 1.6rem;
    line-height: 1.1;
  }
  .kt {
    font-weight: 700;
  }
  .kd {
    font-size: 0.78rem;
    opacity: 0.75;
  }
  textarea {
    width: 100%;
    border: 2.5px solid var(--ink);
    border-radius: var(--radius);
    box-shadow: 4px 4px 0 var(--ink);
    padding: 0.7rem 0.8rem;
    font: inherit;
    resize: vertical;
    background: #fff;
  }
  textarea:disabled {
    background: #f3f3f3;
    box-shadow: none;
    color: var(--muted);
  }
  .zaehler {
    text-align: right;
    font-size: 0.75rem;
    color: var(--muted);
    margin: 0.3rem 0 0;
  }
  .zaehler.knapp {
    color: var(--red);
    font-weight: 600;
  }
  .fehler {
    border: 2.5px solid var(--red);
    border-radius: var(--radius);
    padding: 0.5rem 0.7rem;
    margin: 0.8rem 0 0;
    font-weight: 600;
  }
  .aktionen {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    flex-wrap: wrap;
    margin-top: 1rem;
  }
  .signatur {
    font-size: 0.8rem;
    color: var(--muted);
  }
  .danke {
    display: flex;
    gap: 0.9rem;
    align-items: center;
    background: #fff;
    border: 2.5px solid var(--ink);
    border-radius: var(--radius);
    box-shadow: 4px 4px 0 var(--ink);
    padding: 1rem 1.1rem;
  }
  .danke .ic {
    font-size: 1.8rem;
  }
  .danke .t {
    font-weight: 700;
    margin: 0 0 0.2rem;
  }
  .danke .d {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
  }
</style>
