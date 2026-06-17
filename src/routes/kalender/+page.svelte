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

  // Lokaler, gebundener State für das Zeiten-Formular (verhindert das Leeren beim
  // Speichern und hält die Schalter-Zustände). Init aus data, ohne reaktive Bindung.
  type MealKey = "breakfast" | "lunch" | "dinner" | "snack";
  const initTimes = () =>
    data.connected
      ? { ...data.settings.times }
      : { breakfast: "08:00", lunch: "12:30", dinner: "18:30", snack: "15:30" };
  const initAll = () =>
    data.connected
      ? { ...data.settings.allDay }
      : { breakfast: false, lunch: false, dinner: false, snack: false };
  let times = $state<Record<MealKey, string>>(untrack(initTimes));
  let allDay = $state<Record<MealKey, boolean>>(untrack(initAll));
  let marker = $state(untrack(() => (data.connected ? data.settings.markerMinutes : 15)));
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
    <form method="POST" action="?/setTimes" use:enhance={() => async ({ update }) => update({ reset: false })}>
      <div class="times">
        {#each MEALS as [key, label] (key)}
          {@const mk = key as MealKey}
          <div class="meal-field">
            <span class="meal-name">{label}</span>
            <input type="time" name={key} bind:value={times[mk]} disabled={allDay[mk]} />
            <button
              type="button"
              class="switch"
              class:on={allDay[mk]}
              role="switch"
              aria-checked={allDay[mk]}
              onclick={() => (allDay[mk] = !allDay[mk])}
            >
              <span class="knob"></span><span class="sw-lbl">ganztägig</span>
            </button>
            <input type="hidden" name={`${key}_allday`} value={allDay[mk] ? "1" : ""} />
          </div>
        {/each}
        <div class="meal-field">
          <span class="meal-name">Dauer (Min)</span>
          <input type="number" name="marker" min="5" max="240" step="5" bind:value={marker} />
        </div>
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
  .meal-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .meal-name {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--muted);
  }
  input:disabled {
    opacity: 0.45;
  }

  /* Bauhaus-Switch (wie der Vegan-Toggle auf der Startseite) */
  .switch {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.25rem 0.6rem 0.25rem 0.35rem;
    border: 2.5px solid var(--ink);
    border-radius: 999px;
    background: #fff;
    font: inherit;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    color: var(--ink);
  }
  .switch .knob {
    width: 36px;
    height: 22px;
    border: 2.5px solid var(--ink);
    border-radius: 999px;
    background: var(--paper);
    position: relative;
    flex: none;
    transition: background 0.15s;
  }
  .switch .knob::after {
    content: "";
    box-sizing: border-box;
    position: absolute;
    top: 50%;
    left: 2px;
    width: 14px;
    height: 14px;
    border: 2.5px solid var(--ink);
    border-radius: 50%;
    background: #fff;
    transform: translateY(-50%);
    transition: left 0.16s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .switch.on .knob {
    background: #3aaa5e;
  }
  .switch.on .knob::after {
    left: calc(100% - 14px - 2px);
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
