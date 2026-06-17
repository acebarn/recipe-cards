<script lang="ts">
  import { untrack } from "svelte";
  import { enhance } from "$app/forms";
  import { formatQuantity, scaleIngredient } from "$core/scale.ts";
  import Stepper from "$lib/Stepper.svelte";
  import { inlineMd } from "$lib/inline-md.ts";
  import type { ActionData, PageData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();
  let r = $derived(data.recipe);
  let t = $derived(data.theme);

  let showImagePanel = $state(false);
  let imageSubject = $state(untrack(() => data.imageSubject));
  let regenerating = $state(false);
  let addingToList = $state(false);

  // Einplanen-Panel
  let showPlan = $state(false);
  let planning = $state(false);
  const today = new Date().toISOString().slice(0, 10);
  let planDate = $state(today);
  let planMealSel = $state<"breakfast" | "lunch" | "dinner" | "snack">("dinner");
  let planRecurrence = $state<"none" | "weekly" | "biweekly" | "monthly">("none");
  let planUntil = $state("");
  const MEAL_OPTS: [string, string][] = [
    ["breakfast", "Frühstück"],
    ["lunch", "Mittagessen"],
    ["dinner", "Abendessen"],
    ["snack", "Zwischendurch"],
  ];

  let scale = $state(1);
  let pdfHref = $derived(`/recipe/${r.slug}/pdf${scale !== 1 ? `?scale=${scale}` : ""}`);
  let cookHref = $derived(`/recipe/${r.slug}/cook${scale !== 1 ? `?scale=${scale}` : ""}`);
  let scaledServings = $derived(r.servings ? formatQuantity(r.servings * scale) : null);

  const confirmDelete = (e: SubmitEvent) => {
    if (!confirm(`„${r.title}" wirklich löschen? (auch aus Google Drive beim nächsten Sync)`)) {
      e.preventDefault();
    }
  };

  let timeChips = $derived(
    [
      ["Vorb.", r.times.prep],
      ["Koch", r.times.cook],
      ["Ruhe", r.times.rest],
    ].filter(([, v]) => v) as [string, string][],
  );

  let themeStyle = $derived(
    `--accent:${t.accent};--accent-soft:${t.accentSoft};--panel-bg:${t.panelBg};--panel-heading:${t.panelHeading};--chip-bg:${t.chipBg};--note-bg:${t.noteBg}`,
  );
</script>

<svelte:head><title>{r.title}</title></svelte:head>

<div class="page" style={themeStyle}>
  <div class="toolbar">
    <a class="back" href="/">← Übersicht</a>
    <div class="tools">
      <Stepper bind:value={scale} />
      <a class="btn" href={cookHref}>🍳 Kochmodus</a>
      <a class="btn" href={pdfHref} target="_blank" rel="noopener">Rezeptkarte</a>
      <form
        method="POST"
        action="?/addToList"
        use:enhance={() => {
          addingToList = true;
          return async ({ update }) => {
            await update();
            addingToList = false;
          };
        }}
      >
        <input type="hidden" name="scale" value={scale} />
        <button class="btn" type="submit" disabled={addingToList}>
          {addingToList ? "… wird hinzugefügt" : "🛒 Auf die Einkaufsliste"}
        </button>
      </form>
      <button class="btn" type="button" onclick={() => (showPlan = !showPlan)}>📅 Einplanen</button>
      {#if data.canManage}
        <a class="btn" href={`/recipe/${r.slug}/edit`}>Bearbeiten</a>
        <form method="POST" action="?/delete" use:enhance onsubmit={confirmDelete}>
          <button class="btn danger" type="submit">Löschen</button>
        </form>
      {/if}
    </div>
  </div>

  {#if form?.listError}<p class="msg err">{form.listError}</p>{/if}
  {#if form?.listOk}<p class="msg ok">🛒 {form.listOk}</p>{/if}

  {#if showPlan}
    <div class="plan-box">
      {#if data.canPlan}
        <form
          method="POST"
          action="?/planMeal"
          use:enhance={() => {
            planning = true;
            return async ({ update }) => {
              await update({ reset: false });
              planning = false;
            };
          }}
        >
          <div class="plan-row">
            <label>Tag <input type="date" name="date" bind:value={planDate} required /></label>
            <label>Mahlzeit
              <select name="meal" bind:value={planMealSel}>
                {#each MEAL_OPTS as [v, label] (v)}<option value={v}>{label}</option>{/each}
              </select>
            </label>
            <label>Wiederholung
              <select name="recurrence" bind:value={planRecurrence}>
                <option value="none">einmalig</option>
                <option value="weekly">wöchentlich</option>
                <option value="biweekly">alle 2 Wochen</option>
                <option value="monthly">monatlich</option>
              </select>
            </label>
            {#if planRecurrence !== "none"}
              <label>bis (optional) <input type="date" name="until" bind:value={planUntil} /></label>
            {/if}
            <button class="btn" type="submit" disabled={planning}>{planning ? "…" : "Einplanen"}</button>
          </div>
        </form>
      {:else}
        <p class="hint">
          Kalender ist noch nicht verbunden. <a href="/kalender">📅 Kalender einrichten →</a>
        </p>
      {/if}
      {#if form?.planError}<p class="msg err">{form.planError}</p>{/if}
      {#if form?.planOk}<p class="msg ok">📅 {form.planOk}</p>{/if}
    </div>
  {/if}

  <article class="recipe">
    <header class="rhead">
      {#if r.image}
        <div class="badge"><img class="hero" src={`/images/${r.image}?v=${data.imageVersion}`} alt={r.title} /></div>
      {/if}
      <div class="head-main">
        <h1 class="title-block">{r.title}</h1>
        <div class="chips">
          {#if r.category}<span class="chip">{r.category}</span>{/if}
          {#if r.region}<span class="chip">{r.region}</span>{/if}
          {#if r.difficulty}<span class="chip">{r.difficulty}</span>{/if}
          {#if scaledServings}<span class="chip">{scaledServings} Portion{scaledServings === "1" ? "" : "en"}</span>{/if}
          {#each timeChips as [label, val] (label)}<span class="chip">{label}: {val}</span>{/each}
          {#if data.createdByName}<span class="chip">👤 {data.createdByName}</span>{/if}
        </div>
      </div>
    </header>

    <div class="bauhaus-divider"><span class="rule"></span></div>

    <section class="cols">
      <div class="ingredients">
        <h2>Zutaten</h2>
        {#each r.ingredients as sec (sec.name ?? "_")}
          {#if sec.name}<h3>{sec.name}</h3>{/if}
          <ul class="ing">
            {#each sec.items as item (item)}<li>{scaleIngredient(item, scale)}</li>{/each}
          </ul>
        {/each}
        {#if r.equipment.length}
          <h3>Zubehör</h3>
          <div class="pills">{#each r.equipment as e (e)}<span class="pill">{e}</span>{/each}</div>
        {/if}
      </div>

      <div class="steps">
        <h2>Zubereitung</h2>
        <ol class="steps-list">
          {#each r.steps as step, i (i)}<li>{@html inlineMd(step)}</li>{/each}
        </ol>

        {#if r.notes.length}
          <div class="notes">
            <h3>Hinweise</h3>
            <ul class="ing">
              {#each r.notes as note (note)}<li>{@html inlineMd(note)}</li>{/each}
            </ul>
          </div>
        {/if}
      </div>
    </section>

    {#if r.tags.length}
      <p class="tags">{#each r.tags as tag (tag)}<span class="tag">#{tag}</span>{/each}</p>
    {/if}
  </article>

  {#if data.canAdmin}
    <div class="admin-box">
      <button class="admin-toggle" onclick={() => (showImagePanel = !showImagePanel)} aria-expanded={showImagePanel}>
        🖼️ Admin: Bild neu generieren <span class="ch">{showImagePanel ? "▾" : "▸"}</span>
      </button>
      {#if showImagePanel}
        <form
          method="POST"
          action="?/regenerateImage"
          use:enhance={() => {
            regenerating = true;
            return async ({ update }) => {
              await update({ reset: false });
              regenerating = false;
            };
          }}
        >
          <label for="imgsubj">Bild-Motiv (englisch, kurz)</label>
          <textarea
            id="imgsubj"
            name="image_subject"
            bind:value={imageSubject}
            rows="2"
            placeholder="z. B. a slice of apple pie with lattice crust"
          ></textarea>
          <div class="admin-row">
            <button class="btn" type="submit" disabled={regenerating}>
              {regenerating ? "Generiere …" : "Neu generieren"}
            </button>
            <span class="hint">Erzeugt ein neues Aquarell (dauert einige Sekunden).</span>
          </div>
          {#if form?.imgError}<p class="msg err">{form.imgError}</p>{/if}
          {#if form?.imgOk}<p class="msg ok">{form.imgOk}</p>{/if}
        </form>
      {/if}
    </div>
  {/if}
</div>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.6rem;
    margin-bottom: 1rem;
  }
  .back {
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--ink);
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .tools form {
    margin: 0;
    display: flex;
  }

  .admin-box {
    margin-top: 1.2rem;
    border: 2.5px dashed var(--ink);
    border-radius: var(--radius);
    padding: 0.6rem 0.9rem;
    background: var(--accent-soft, #f4efe3);
  }
  .admin-toggle {
    background: none;
    border: 0;
    font: inherit;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    font-size: 0.82rem;
    cursor: pointer;
    color: var(--ink);
    padding: 0;
  }
  .admin-toggle .ch {
    color: var(--muted);
  }
  .admin-box form {
    margin-top: 0.7rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .admin-box label {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--muted);
  }
  .admin-box textarea {
    width: 100%;
    border: 2px solid var(--ink);
    border-radius: var(--radius);
    padding: 0.5rem 0.6rem;
    font: inherit;
    resize: vertical;
    background: #fff;
  }
  .admin-row {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    flex-wrap: wrap;
  }
  .admin-row .hint {
    font-size: 0.78rem;
    color: var(--muted);
  }
  .admin-box .msg {
    margin: 0;
    padding: 0.4rem 0.7rem;
    border: 2px solid var(--ink);
    border-radius: var(--radius);
    font-size: 0.85rem;
    font-weight: 600;
  }
  .admin-box .msg.err {
    background: #fde8e8;
    color: #9b1c1c;
  }
  .admin-box .msg.ok {
    background: #e6f4ea;
    color: #1e6b34;
  }

  /* Seitenweite Feedback-Meldungen (Einkaufsliste/Einplanen) */
  .page > .msg {
    margin: 0 0 1rem;
    padding: 0.5rem 0.8rem;
    border: 2px solid var(--ink);
    border-radius: var(--radius);
    font-weight: 600;
  }
  .msg.err {
    background: #fde8e8;
    color: #9b1c1c;
  }
  .msg.ok {
    background: #e6f4ea;
    color: #1e6b34;
  }

  .plan-box {
    margin: 0 0 1rem;
    border: 2.5px dashed var(--ink);
    border-radius: var(--radius);
    padding: 0.8rem 0.9rem;
    background: var(--accent-soft, #f4efe3);
  }
  .plan-row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 0.6rem;
  }
  .plan-row label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--muted);
  }
  .plan-row input,
  .plan-row select {
    border: 2px solid var(--ink);
    border-radius: var(--radius);
    padding: 0.4rem 0.5rem;
    font: inherit;
    background: #fff;
  }
  .plan-box .hint {
    margin: 0;
    color: var(--muted);
  }
  .plan-box .hint a {
    color: var(--accent);
    font-weight: 700;
  }

  .recipe {
    background: #fff;
    border: 3px solid var(--ink);
    border-radius: var(--radius);
    padding: 1.4rem;
    box-shadow: 7px 7px 0 var(--accent);
  }

  .rhead {
    display: flex;
    gap: 1.3rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .badge {
    flex: none;
  }
  .hero {
    position: relative;
    z-index: 1;
    display: block;
    width: 132px;
    height: 132px;
    object-fit: cover;
    border-radius: 50%;
    border: 3px solid var(--accent);
  }
  .head-main {
    flex: 1;
    min-width: 240px;
  }
  /* Knockout-Titelblock wie auf der Kartenvorderseite */
  .title-block {
    display: inline-block;
    margin: 0 0 0.7rem;
    padding: 0.35rem 0.7rem;
    background: var(--accent);
    color: #fff;
    font-size: clamp(1.5rem, 4vw, 2.1rem);
    font-weight: 700;
    line-height: 1.05;
    text-transform: uppercase;
    letter-spacing: 0.01em;
  }
  .chips {
    display: flex;
    gap: 0.45rem;
    flex-wrap: wrap;
  }
  .chip {
    background: var(--chip-bg);
    color: var(--panel-heading);
    font-size: 0.78rem;
    font-weight: 600;
    padding: 0.18rem 0.6rem;
    border: 1.5px solid var(--ink);
    border-radius: 999px;
  }

  .cols {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1.4rem;
  }
  @media (min-width: 720px) {
    .cols {
      grid-template-columns: 1fr 1.35fr;
    }
  }

  h2 {
    font-size: 1.15rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin: 0 0 0.6rem;
  }
  h3 {
    font-size: 0.95rem;
    font-weight: 700;
    margin: 0.9rem 0 0.3rem;
    color: var(--panel-heading);
  }

  .ingredients {
    background: var(--panel-bg);
    border: 2.5px solid var(--ink);
    border-radius: var(--radius);
    padding: 1rem 1.1rem;
    align-self: start;
    color: var(--panel-heading);
  }
  ul.ing {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  ul.ing li {
    position: relative;
    padding-left: 1.1rem;
    margin: 0.32rem 0;
    line-height: 1.4;
  }
  ul.ing li::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0.46em;
    width: 8px;
    height: 8px;
    background: var(--accent);
  }
  .pills {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .pill {
    font-size: 0.8rem;
    background: #fff;
    border: 1.5px solid var(--ink);
    border-radius: 999px;
    padding: 0.15rem 0.6rem;
  }

  .steps-list {
    counter-reset: step;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .steps-list li {
    counter-increment: step;
    position: relative;
    padding-left: 2.7rem;
    margin-bottom: 1rem;
    line-height: 1.5;
    min-height: 1.9rem;
  }
  .steps-list li::before {
    content: counter(step);
    position: absolute;
    left: 0;
    top: 0;
    width: 1.9rem;
    height: 1.9rem;
    background: var(--accent);
    color: #fff;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 0.9rem;
  }

  .notes {
    margin-top: 1.2rem;
    background: var(--note-bg);
    border: 2px solid var(--ink);
    border-radius: var(--radius);
    padding: 0.8rem 1rem;
  }
  .notes h3 {
    margin-top: 0;
    color: var(--ink);
  }

  .tags {
    margin: 1.4rem 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .tag {
    color: var(--muted);
    font-size: 0.85rem;
    font-weight: 500;
  }
</style>
