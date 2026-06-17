<script lang="ts">
  import { untrack } from "svelte";
  import { enhance } from "$app/forms";
  import type { ActionData, PageData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  // Aktiver Slot (Tag + Mahlzeit) für „Klick zum Hinzufügen".
  let activeDate = $state(
    untrack(() => {
      if (!(data.connected && data.hasCalendar)) return "";
      const today = new Date().toISOString().slice(0, 10);
      return data.days.find((d) => d.date === today)?.date ?? data.days[0].date;
    }),
  );
  let activeMeal = $state("dinner");
  let query = $state("");

  let tokens = $derived(query.toLowerCase().split(/\s+/).filter(Boolean));
  let filtered = $derived(
    data.connected && data.hasCalendar
      ? data.recipes
          .filter((r) => tokens.every((t) => `${r.title} ${r.category}`.toLowerCase().includes(t)))
          .slice(0, 40)
      : [],
  );

  const refresh = () => async ({ update }: { update: () => Promise<void> }) => {
    await update();
  };
</script>

<svelte:head><title>Wochenplan · SCHMACKOFATZ</title></svelte:head>

<p class="back"><a href="/">← Übersicht</a></p>
<h2 class="page-title">📅 Wochenplan</h2>

{#if !data.connected}
  <p class="hint">Kalender ist nicht verbunden. <a href="/kalender">📅 Kalender einrichten →</a></p>
{:else if !data.hasCalendar}
  <p class="hint">Noch kein Kalender gewählt. <a href="/kalender">Kalender wählen →</a></p>
{:else}
  {#if form?.error}<p class="msg err">{form.error}</p>{/if}
  {#if form?.ok}<p class="msg ok">{form.ok}</p>{/if}
  {#if data.evError}<p class="msg err">{data.evError}</p>{/if}

  <div class="weeknav">
    <a class="btn" href={`?start=${data.prevStart}`}>‹</a>
    <span class="wk">KW {data.kw}</span>
    <span class="range">{data.weekLabel}</span>
    <a class="btn" href={`?start=${data.nextStart}`}>›</a>
    <a class="btn ghost" href={`?start=${data.thisStart}`}>Diese Woche</a>
    {#if data.calendarName}<span class="cal">{data.calendarName}</span>{/if}
  </div>

  <!-- Planungsleiste: Tag + Mahlzeit wählen, dann Rezept per Klick hinzufügen -->
  <div class="planner">
    <div class="daypick">
      {#each data.days as d (d.date)}
        <button class="day-btn" class:active={activeDate === d.date} onclick={() => (activeDate = d.date)}>{d.label}</button>
      {/each}
    </div>
    <div class="mealpick">
      {#each data.meals as m (m.value)}
        <button class="meal-slot" class:active={activeMeal === m.value} onclick={() => (activeMeal = m.value)}>{m.label}</button>
      {/each}
    </div>
    <div class="searchrow">
      <input class="search" type="search" bind:value={query} placeholder="Rezept suchen …" autocomplete="off" />
    </div>
    {#if query}
      <ul class="recos">
        {#each filtered as r (r.slug)}
          <li>
            <form method="POST" action="?/addEvent" use:enhance={refresh}>
              <input type="hidden" name="slug" value={r.slug} />
              <input type="hidden" name="date" value={activeDate} />
              <input type="hidden" name="meal" value={activeMeal} />
              <button class="reco" type="submit">+ {r.title}<small>{r.category}</small></button>
            </form>
          </li>
        {:else}
          <li class="hint">Keine Treffer.</li>
        {/each}
      </ul>
    {/if}
  </div>

  <div class="week">
    {#each data.days as d (d.date)}
      <section class="daycol" class:active={activeDate === d.date}>
        <h3>{d.label}</h3>
        {#if d.events.length === 0}
          <p class="empty">–</p>
        {:else}
          <ul>
            {#each d.events as e (e.id)}
              <li>
                <span class="ev">
                  {#if e.meal}<span class="meal">{e.meal}</span>{:else if e.time}<span class="meal">{e.time}</span>{/if}
                  <span class="evtitle">{e.title}</span>
                </span>
                <form method="POST" action="?/removeEvent" use:enhance={refresh}>
                  <input type="hidden" name="eventId" value={e.id} />
                  <button class="x" type="submit" aria-label="Entfernen">✕</button>
                </form>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/each}
  </div>
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
    margin: 0.3rem 0 1rem;
  }
  .hint {
    color: var(--muted);
  }
  .hint a {
    color: var(--accent);
    font-weight: 700;
  }
  .msg {
    padding: 0.55rem 0.85rem;
    border: 2px solid var(--ink);
    border-radius: var(--radius);
    font-weight: 600;
    margin: 0 0 0.8rem;
  }
  .msg.err {
    background: #fde8e8;
    color: #9b1c1c;
  }
  .msg.ok {
    background: #e6f4ea;
    color: #1e6b34;
  }

  .weeknav {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
  }
  .weeknav .wk {
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    background: var(--ink);
    color: #fff;
    padding: 0.15rem 0.55rem;
    border-radius: var(--radius);
  }
  .weeknav .range {
    color: var(--muted);
    font-weight: 600;
  }
  .btn.ghost {
    background: #fff;
    color: var(--ink);
  }
  .cal {
    margin-left: auto;
    color: var(--muted);
    font-size: 0.85rem;
  }

  .planner {
    border: 2.5px solid var(--ink);
    border-radius: var(--radius);
    box-shadow: 4px 4px 0 var(--ink);
    background: #fff;
    padding: 0.8rem 0.9rem;
    margin-bottom: 1.4rem;
  }
  .daypick {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-bottom: 0.6rem;
  }
  .day-btn {
    border: 2px solid var(--ink);
    border-radius: 999px;
    background: #fff;
    padding: 0.25rem 0.6rem;
    font: inherit;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
  }
  .day-btn.active {
    background: var(--ink);
    color: #fff;
  }
  /* Mahlzeit-Slots untereinander */
  .mealpick {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    margin-bottom: 0.6rem;
  }
  .meal-slot {
    text-align: left;
    border: 2px solid var(--ink);
    border-radius: var(--radius);
    background: #fff;
    padding: 0.4rem 0.7rem;
    font: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
  }
  .meal-slot.active {
    background: var(--accent, var(--blue));
    color: #fff;
  }
  .searchrow {
    display: flex;
    gap: 0.5rem;
  }
  .search {
    flex: 1;
    border: 2.5px solid var(--ink);
    border-radius: var(--radius);
    padding: 0.5rem 0.7rem;
    font: inherit;
    background: #fff;
  }
  .recos {
    list-style: none;
    margin: 0.6rem 0 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    max-height: 14rem;
    overflow-y: auto;
  }
  .recos form {
    margin: 0;
  }
  .reco {
    display: inline-flex;
    align-items: baseline;
    gap: 0.4rem;
    border: 2px solid var(--ink);
    border-radius: var(--radius);
    background: var(--paper);
    padding: 0.3rem 0.6rem;
    font: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
  }
  .reco:hover {
    background: var(--accent, var(--blue));
    color: #fff;
  }
  .reco small {
    color: var(--muted);
    font-weight: 500;
  }
  .reco:hover small {
    color: #fff;
  }

  .week {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 0.5rem;
  }
  @media (max-width: 820px) {
    .week {
      grid-template-columns: 1fr;
    }
  }
  .daycol {
    border: 2px solid var(--ink);
    border-radius: var(--radius);
    background: #fff;
    padding: 0.5rem;
    min-height: 4rem;
  }
  .daycol.active {
    box-shadow: 3px 3px 0 var(--accent, var(--blue));
  }
  .daycol h3 {
    margin: 0 0 0.4rem;
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .daycol ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .daycol li {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.3rem;
    border-top: 1.5px dashed var(--ink);
    padding-top: 0.25rem;
  }
  .ev {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .meal {
    font-size: 0.66rem;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--muted);
  }
  .evtitle {
    font-size: 0.82rem;
    font-weight: 600;
  }
  .empty {
    color: var(--muted);
    margin: 0;
  }
  .x {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--muted);
    font-size: 0.85rem;
    line-height: 1;
    flex: none;
  }
  .x:hover {
    color: var(--red);
  }
</style>
