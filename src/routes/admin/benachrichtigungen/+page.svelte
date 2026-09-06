<script lang="ts">
  import { enhance } from "$app/forms";
  import type { ActionData, PageData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  // Nach „Verknüpfen" liefert die Action einen Einmal-Code; daraus wird der
  // Deeplink. Telegram übergibt den Code als /start-Parameter an den Webhook.
  let deeplink = $derived(
    form?.code && data.botUsername ? `https://t.me/${data.botUsername}?start=${form.code}` : null,
  );
  const KAT: Record<string, string> = { bug: "🐞 Fehler", wunsch: "💡 Wunsch", lob: "💬 Rückmeldung" };
  const datum = (iso: string) =>
    new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" });
  let offen = $derived(data.feedback.filter((f) => f.status === "neu").length);
</script>

<svelte:head><title>Benachrichtigungen · SCHMACKOFATZ</title></svelte:head>

<p class="back"><a href="/einstellungen">← Einstellungen</a></p>
<h2 class="page-title">🔔 Benachrichtigungen</h2>
<p class="lead">
  Freigabe-Anfragen nach einer Erstanmeldung und Rückmeldungen aus der App gehen per Telegram
  an alle hier eingetragenen Empfänger.
</p>

{#if !data.configured}
  <p class="fehler">Kein Bot-Token konfiguriert — Benachrichtigungen sind aus.</p>
{/if}

{#if form?.error}<p class="fehler">{form.error}</p>{/if}
{#if form?.ok && typeof form.ok === "string"}<p class="hinweis">{form.ok}</p>{/if}

<section class="panel">
  <h3>Empfänger</h3>
  {#if data.targets.length}
    <ul class="liste">
      {#each data.targets as t (t.id)}
        <li>
          <span class="wer">{t.person ?? t.label ?? "Unbekannt"}</span>
          <span class="meta">verbunden seit {datum(t.createdAt)}</span>
          <form method="POST" action="?/entfernen" use:enhance>
            <input type="hidden" name="id" value={t.id} />
            <button class="linkbtn" type="submit">entfernen</button>
          </form>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="leer">Noch niemand verbunden — es geht aktuell keine Benachrichtigung raus.</p>
  {/if}

  <div class="aktionen">
    <form method="POST" action="?/verknuepfen" use:enhance>
      <button class="btn" type="submit" disabled={!data.configured}>
        {data.selbstVerbunden ? "Neu verbinden" : "Telegram verbinden"}
      </button>
    </form>
    <form method="POST" action="?/test" use:enhance>
      <button class="btn ghost" type="submit" disabled={!data.targets.length}>Testnachricht</button>
    </form>
  </div>

  {#if deeplink}
    <div class="deeplink">
      <p class="t">Fast fertig — noch ein Klick in Telegram:</p>
      <a class="btn" href={deeplink} target="_blank" rel="noopener">In Telegram öffnen →</a>
      <p class="d">
        Dort auf <strong>Start</strong> tippen. Der Link gilt einmalig und läuft nach 24 Stunden ab.
        Danach diese Seite neu laden.
      </p>
    </div>
  {/if}
</section>

<section class="panel">
  <h3>Rückmeldungen {#if offen}<span class="badge">{offen} offen</span>{/if}</h3>
  {#if data.feedback.length}
    <ul class="fbliste">
      {#each data.feedback as f (f.id)}
        <li class:erledigt={f.status === "erledigt"}>
          <div class="kopf">
            <span class="kat">{KAT[f.category] ?? f.category}</span>
            <span class="meta">{f.author ?? "unbekannt"} · {datum(f.createdAt)}</span>
            <form method="POST" action="?/erledigt" use:enhance>
              <input type="hidden" name="id" value={f.id} />
              <input type="hidden" name="zurueck" value={f.status === "erledigt" ? "1" : ""} />
              <button class="linkbtn" type="submit">
                {f.status === "erledigt" ? "wieder öffnen" : "erledigt"}
              </button>
            </form>
          </div>
          <p class="text">{f.message}</p>
          {#if f.page}<p class="meta">Seite: {f.page}</p>{/if}
        </li>
      {/each}
    </ul>
  {:else}
    <p class="leer">Noch keine Rückmeldungen.</p>
  {/if}
</section>

<style>
  .lead {
    color: var(--muted);
    margin: 0 0 1.4rem;
    max-width: 46rem;
  }
  .panel {
    background: #fff;
    border: 2.5px solid var(--ink);
    border-radius: var(--radius);
    box-shadow: 4px 4px 0 var(--ink);
    padding: 1rem 1.1rem;
    margin-bottom: 1.4rem;
  }
  h3 {
    margin: 0 0 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .badge {
    background: var(--red);
    color: #fff;
    border-radius: 999px;
    padding: 0.1rem 0.55rem;
    font-size: 0.72rem;
  }
  .liste,
  .fbliste {
    list-style: none;
    margin: 0 0 0.9rem;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .liste li {
    display: flex;
    align-items: baseline;
    gap: 0.7rem;
    border-bottom: 1px dotted var(--muted);
    padding-bottom: 0.4rem;
  }
  .wer {
    font-weight: 600;
  }
  .meta {
    color: var(--muted);
    font-size: 0.78rem;
  }
  .liste form {
    margin-left: auto;
  }
  .aktionen {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
  }
  .deeplink {
    margin-top: 1rem;
    border: 2.5px dashed var(--ink);
    border-radius: var(--radius);
    padding: 0.8rem 0.9rem;
  }
  .deeplink .t {
    font-weight: 700;
    margin: 0 0 0.6rem;
  }
  .deeplink .d {
    margin: 0.6rem 0 0;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .fbliste li {
    border: 2px solid var(--ink);
    border-radius: var(--radius);
    padding: 0.6rem 0.75rem;
  }
  .fbliste li.erledigt {
    opacity: 0.55;
  }
  .kopf {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    flex-wrap: wrap;
    margin-bottom: 0.35rem;
  }
  .kat {
    font-weight: 700;
  }
  .kopf form {
    margin-left: auto;
  }
  .text {
    margin: 0;
    white-space: pre-wrap;
  }
  .linkbtn {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    font-size: 0.78rem;
    color: var(--muted);
    text-decoration: underline;
    cursor: pointer;
  }
  .fehler {
    border: 2.5px solid var(--red);
    border-radius: var(--radius);
    padding: 0.5rem 0.7rem;
    font-weight: 600;
  }
  .hinweis {
    border: 2.5px solid var(--ink);
    border-radius: var(--radius);
    padding: 0.5rem 0.7rem;
    font-weight: 600;
  }
  .leer {
    color: var(--muted);
    font-size: 0.85rem;
  }
</style>
