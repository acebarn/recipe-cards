<script lang="ts">
  import { untrack } from "svelte";
  import { enhance } from "$app/forms";
  import { signIn } from "@auth/sveltekit/client";
  import type { ActionData, PageData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const MEALS: [string, string][] = [
    ["breakfast", "Frühstück"],
    ["lunch", "Mittagessen"],
    ["dinner", "Abendessen"],
    ["snack", "Zwischendurch"],
  ];

  // Kalenderwahl: Name aus der gewählten ID ableiten (für den versteckten Submit-Wert).
  let calId = $state(untrack(() => (data.connected ? (data.settings.calendarId ?? "") : "")));
  let calName = $derived(
    data.connected ? (data.calendars.find((c) => c.id === calId)?.summary ?? "") : "",
  );
</script>

<svelte:head><title>Kalender · SCHMACKOFATZ</title></svelte:head>

<p class="back"><a href="/">← Übersicht</a></p>
<h2 class="page-title">📅 Kalender</h2>

{#if form?.error}<p class="msg err">{form.error}</p>{/if}
{#if form?.ok}<p class="msg ok">{form.ok}</p>{/if}

{#if !data.connected}
  <div class="card">
    <p>Verbinde deinen Google-Kalender, um Rezepte als Mahlzeiten einzuplanen.</p>
    <p class="hint">Du wirst zu Google geleitet und gewährst die Kalender-Berechtigung. Danach kannst du hier deinen Kalender wählen.</p>
    <button class="btn" onclick={() => signIn("google")}>Kalender verbinden</button>
  </div>
{:else}
  {#if data.error}
    <p class="msg err">{data.error}</p>
    <button class="btn" onclick={() => signIn("google")}>Neu verbinden</button>
  {/if}

  <section class="card">
    <h3>Kalender</h3>
    <form method="POST" action="?/setCalendar" use:enhance class="row">
      <select bind:value={calId} name="calendarId" aria-label="Kalender">
        <option value="" disabled>– wählen –</option>
        {#each data.calendars as c (c.id)}
          <option value={c.id}>{c.summary}{c.primary ? " (Standard)" : ""}</option>
        {/each}
      </select>
      <input type="hidden" name="calendarName" value={calName} />
      <button class="btn" type="submit" disabled={!calId}>Speichern</button>
    </form>
    {#if data.settings.calendarName}
      <p class="hint">Aktiv: <strong>{data.settings.calendarName}</strong></p>
    {/if}
  </section>

  <section class="card">
    <h3>Mahlzeit-Zeiten</h3>
    <form method="POST" action="?/setTimes" use:enhance>
      <div class="times">
        {#each MEALS as [key, label] (key)}
          <label>{label}
            <input type="time" name={key} value={data.settings.times[key as keyof typeof data.settings.times]} />
          </label>
        {/each}
        <label>Dauer (Min)
          <input type="number" name="marker" min="5" max="240" step="5" value={data.settings.markerMinutes} />
        </label>
      </div>
      <button class="btn" type="submit">Zeiten speichern</button>
    </form>
  </section>

  <form method="POST" action="?/disconnect" use:enhance>
    <button class="btn danger" type="submit">Kalender trennen</button>
  </form>
{/if}

<style>
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
  .msg {
    padding: 0.6rem 0.85rem;
    border: 2px solid var(--ink);
    border-radius: var(--radius);
    font-weight: 600;
    margin: 0 0 1rem;
  }
  .msg.err {
    background: #fde8e8;
    color: #9b1c1c;
  }
  .msg.ok {
    background: #e6f4ea;
    color: #1e6b34;
  }
  .card {
    background: #fff;
    border: 2.5px solid var(--ink);
    border-radius: var(--radius);
    box-shadow: 4px 4px 0 var(--ink);
    padding: 1rem 1.1rem;
    margin-bottom: 1.2rem;
  }
  .card h3 {
    margin: 0 0 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    font-size: 1rem;
  }
  .hint {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .row {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
    align-items: center;
  }
  .times {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
    margin-bottom: 0.9rem;
  }
  .times label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--muted);
  }
  select,
  input[type="time"],
  input[type="number"] {
    border: 2.5px solid var(--ink);
    border-radius: var(--radius);
    padding: 0.45rem 0.55rem;
    font: inherit;
    background: #fff;
  }
</style>
