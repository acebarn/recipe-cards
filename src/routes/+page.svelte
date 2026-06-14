<script lang="ts">
  import { browser } from "$app/environment";
  import { flip } from "svelte/animate";
  import { fade } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import type { PageData } from "./$types";

  // Out-Transition: Karte aus dem Layout-Fluss lösen (absolut an ihren
  // alten Platz pinnen), damit die übrigen Karten sofort per flip
  // nachrücken können, während diese hier zerfällt.
  function dissolve(node: HTMLElement, { duration = 450 } = {}) {
    const rect = node.getBoundingClientRect();
    const parent = node.offsetParent as HTMLElement | null;
    const prect = parent?.getBoundingClientRect();
    const top = rect.top - (prect?.top ?? 0) + (parent?.scrollTop ?? 0);
    const left = rect.left - (prect?.left ?? 0) + (parent?.scrollLeft ?? 0);
    const { width, height } = rect;
    return {
      duration,
      easing: cubicOut,
      css: (t: number) =>
        `position:absolute; top:${top}px; left:${left}px; width:${width}px; height:${height}px;` +
        `opacity:${t}; transform:scale(${0.8 + 0.2 * t}) rotate(${(1 - t) * -3}deg);` +
        `z-index:0; pointer-events:none;`,
    };
  }

  let { data }: { data: PageData } = $props();
  type R = PageData["recipes"][number];

  const PALETTE = ["var(--red)", "var(--blue)", "var(--yellow)"];
  const colorAt = (i: number) => PALETTE[((i % 3) + 3) % 3];
  const fmtMin = (m: number | null) =>
    m == null ? "" : m < 60 ? `${m} Min` : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} Std`;

  // ---- Filter-/Ansichts-State ----
  let query = $state("");
  let cat = $state<string | null>(null);
  let diff = $state<string | null>(null);
  let timeBucket = $state<"fast" | "mittel" | "lang" | null>(null);
  let view = $state<"grid" | "list">("grid");

  // Ansicht pro Gerät merken
  if (browser) {
    const v = localStorage.getItem("recipeView");
    if (v === "list" || v === "grid") view = v;
  }
  $effect(() => {
    if (browser) localStorage.setItem("recipeView", view);
  });

  // Chip-Optionen aus den Daten
  let categories = $derived([...new Set(data.recipes.map((r) => r.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "de")));
  let difficulties = $derived(
    ["Einfach", "Mittel", "Schwer"].filter((d) => data.recipes.some((r) => r.difficulty === d)),
  );

  const timeOk = (r: R) => {
    if (!timeBucket) return true;
    const t = r.totalMinutes;
    if (t == null) return false;
    if (timeBucket === "fast") return t < 30;
    if (timeBucket === "mittel") return t >= 30 && t <= 60;
    return t > 60;
  };
  let tokens = $derived(query.toLowerCase().split(/\s+/).filter(Boolean));

  let filtering = $derived(!!(tokens.length || cat || diff || timeBucket));
  let filtered = $derived(
    data.recipes.filter(
      (r) =>
        (!cat || r.category === cat) &&
        (!diff || r.difficulty === diff) &&
        timeOk(r) &&
        tokens.every((t) => r.search.includes(t)),
    ),
  );
  const byTitle = (a: R, b: R) => a.title.localeCompare(b.title, "de");
  let newest = $derived([...data.recipes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6));
  // Gruppen immer aus dem gefilterten Set — so wird in-place gefiltert.
  let groups = $derived.by(() => {
    const map = new Map<string, R[]>();
    for (const r of filtered) {
      const key = r.category || "Sonstige";
      (map.get(key) ?? map.set(key, []).get(key)!).push(r);
    }
    return [...map.entries()]
      .map(([cat, recipes]) => [cat, [...recipes].sort(byTitle)] as const)
      .sort((a, b) => a[0].localeCompare(b[0], "de"));
  });

  const reset = () => {
    query = "";
    cat = null;
    diff = null;
    timeBucket = null;
  };
</script>

<svelte:head><title>Rezepte</title></svelte:head>

<div class="bar">
  <div class="searchrow">
    <input class="search" type="search" bind:value={query} placeholder="Suchen … (Titel, Zutaten, Schritte)" autocomplete="off" />
    <div class="viewtoggle" role="group" aria-label="Ansicht">
      <button class:active={view === "grid"} onclick={() => (view = "grid")} aria-label="Kacheln" title="Kacheln">▦</button>
      <button class:active={view === "list"} onclick={() => (view = "list")} aria-label="Liste" title="Liste">☰</button>
    </div>
  </div>

  <div class="chips">
    <span class="lbl">Kategorie</span>
    <button class="chip" class:active={cat === null} onclick={() => (cat = null)}>Alle</button>
    {#each categories as c (c)}
      <button class="chip" class:active={cat === c} onclick={() => (cat = cat === c ? null : c)}>{c}</button>
    {/each}
  </div>

  <div class="chips">
    <span class="lbl">Aufwand</span>
    <button class="chip" class:active={timeBucket === null} onclick={() => (timeBucket = null)}>Alle</button>
    <button class="chip" class:active={timeBucket === "fast"} onclick={() => (timeBucket = timeBucket === "fast" ? null : "fast")}>⚡ &lt;30 Min</button>
    <button class="chip" class:active={timeBucket === "mittel"} onclick={() => (timeBucket = timeBucket === "mittel" ? null : "mittel")}>🕒 30–60 Min</button>
    <button class="chip" class:active={timeBucket === "lang"} onclick={() => (timeBucket = timeBucket === "lang" ? null : "lang")}>🍲 &gt;60 Min</button>
  </div>

  {#if difficulties.length}
    <div class="chips">
      <span class="lbl">Schwierigkeit</span>
      <button class="chip" class:active={diff === null} onclick={() => (diff = null)}>Alle</button>
      {#each difficulties as d (d)}
        <button class="chip" class:active={diff === d} onclick={() => (diff = diff === d ? null : d)}>{d}</button>
      {/each}
    </div>
  {/if}
</div>

{#if filtering}
  <p class="count">{filtered.length} Treffer · <button class="linkbtn" onclick={reset}>zurücksetzen</button></p>
{/if}

{#if !filtering}
  <section transition:fade={{ duration: 350 }}>
    <h2 class="cat-heading" style={`--c: ${colorAt(0)}`}><span class="mark"></span>Neu<span class="arrow">→</span></h2>
    {@render items(newest)}
  </section>
{/if}

{#if filtering && filtered.length === 0}
  <p class="empty">Keine Rezepte gefunden.</p>
{/if}

{#each groups as [category, recipes], gi (category)}
  <section transition:fade={{ duration: 350 }}>
    <h2 class="cat-heading" style={`--c: ${colorAt(gi + 1)}`}><span class="mark"></span>{category}<span class="arrow">→</span></h2>
    {@render items(recipes)}
  </section>
{/each}

{#snippet items(list: R[])}
  {#if view === "grid"}
    <ul class="recipe-grid">
      {#each list as r, i (r.slug)}
        <li class="recipe-card" style={`--c: ${colorAt(i)}`} animate:flip={{ duration: 600, easing: cubicOut }} in:fade={{ duration: 400, delay: 250 }} out:dissolve>
          <a href={`/recipe/${r.slug}`}>
            {#if r.image}
              <img class="thumb" src={`/images/${r.image}`} alt={r.title} loading="lazy" />
            {:else}
              <div class="thumb placeholder">{r.title.slice(0, 1)}</div>
            {/if}
          </a>
          <div class="body">
            <div class="title"><a href={`/recipe/${r.slug}`}>{r.title}</a></div>
            <div class="meta">
              {#if r.category}<span class="cat">{r.category}</span>{/if}
              {#if r.totalMinutes}<span class="m">🕒 {fmtMin(r.totalMinutes)}</span>{/if}
            </div>
          </div>
        </li>
      {/each}
    </ul>
  {:else}
    <ul class="recipe-list">
      {#each list as r, i (r.slug)}
        <li style={`--c: ${colorAt(i)}`} animate:flip={{ duration: 600, easing: cubicOut }} in:fade={{ duration: 400, delay: 250 }} out:dissolve>
          <a href={`/recipe/${r.slug}`}>
            {#if r.image}
              <img class="lthumb" src={`/images/${r.image}`} alt="" loading="lazy" />
            {:else}
              <span class="lthumb placeholder">{r.title.slice(0, 1)}</span>
            {/if}
            <span class="ltitle">{r.title}</span>
            <span class="lmeta">
              {#if r.category}<span class="cat">{r.category}</span>{/if}
              {#if r.difficulty}<span class="tag">{r.difficulty}</span>{/if}
              {#if r.totalMinutes}<span class="tag">🕒 {fmtMin(r.totalMinutes)}</span>{/if}
            </span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
{/snippet}

<style>
  /* Anker für die beim Filtern abgelösten (position:absolute) Karten */
  .recipe-grid,
  .recipe-list {
    position: relative;
  }

  .bar {
    margin: 0.2rem 0 1.6rem;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }
  .searchrow {
    display: flex;
    gap: 0.6rem;
  }
  .search {
    flex: 1;
    padding: 0.65rem 0.85rem;
    border: 2.5px solid var(--ink);
    border-radius: var(--radius);
    font: inherit;
    font-size: 1rem;
    background: #fff;
    box-shadow: 3px 3px 0 var(--ink);
  }
  .search:focus {
    outline: none;
    box-shadow: 3px 3px 0 var(--accent);
  }
  .viewtoggle {
    display: inline-flex;
    border: 2.5px solid var(--ink);
    border-radius: var(--radius);
    box-shadow: 3px 3px 0 var(--ink);
    overflow: hidden;
    flex: none;
  }
  .viewtoggle button {
    width: 2.6rem;
    border: 0;
    background: #fff;
    font-size: 1.2rem;
    line-height: 1;
    cursor: pointer;
    color: var(--ink);
  }
  .viewtoggle button + button {
    border-left: 2.5px solid var(--ink);
  }
  .viewtoggle button.active {
    background: var(--accent);
    color: #fff;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
  }
  .chips .lbl {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    margin-right: 0.2rem;
    min-width: 5.4rem;
  }
  .chip {
    padding: 0.28rem 0.7rem;
    border: 2px solid var(--ink);
    border-radius: 999px;
    background: #fff;
    font: inherit;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
  }
  .chip.active {
    background: var(--ink);
    color: #fff;
  }

  .count {
    color: var(--muted);
    font-weight: 500;
  }
  .empty {
    color: var(--muted);
    margin-top: 2.5rem;
    text-align: center;
    font-size: 1.1rem;
  }

  /* Karten-Meta (Grid) */
  .recipe-card .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.45rem;
  }
  .recipe-card .meta .m {
    font-size: 0.72rem;
    color: var(--muted);
    font-weight: 600;
  }

  /* Listenansicht */
  .recipe-list {
    list-style: none;
    margin: 0 0 2.2rem;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .recipe-list li {
    --c: var(--red);
    background: #fff;
    border: 2.5px solid var(--ink);
    border-left-width: 10px;
    border-left-color: var(--c);
    border-radius: var(--radius);
    box-shadow: 3px 3px 0 var(--ink);
    transition:
      transform 0.1s,
      box-shadow 0.1s;
  }
  .recipe-list li:hover {
    transform: translate(-2px, -2px);
    box-shadow: 6px 6px 0 var(--c);
  }
  .recipe-list a {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.5rem 0.8rem;
    color: var(--ink);
  }
  .lthumb {
    width: 48px;
    height: 48px;
    object-fit: cover;
    border: 2px solid var(--ink);
    border-radius: var(--radius);
    flex: none;
  }
  .lthumb.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--c);
    color: #fff;
    font-weight: 700;
    font-size: 1.3rem;
  }
  .ltitle {
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.01em;
    flex: 1;
    min-width: 0;
  }
  .lmeta {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    flex-wrap: wrap;
    flex: none;
  }
  .lmeta .cat {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    background: var(--c);
    border: 1.5px solid var(--ink);
    border-radius: 999px;
    padding: 0.08rem 0.5rem;
  }
  .lmeta .tag {
    font-size: 0.72rem;
    color: var(--muted);
    font-weight: 600;
  }
  @media (max-width: 520px) {
    .ltitle {
      flex: 1 1 100%;
      order: 2;
    }
  }

  .cat-heading {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 1.15rem;
    font-weight: 700;
    margin: 2rem 0 1rem;
    color: var(--ink);
  }
  .cat-heading .mark {
    width: 16px;
    height: 16px;
    background: var(--c);
    border: 2px solid var(--ink);
    flex: none;
  }
  .cat-heading .arrow {
    color: var(--c);
    -webkit-text-stroke: 1px var(--ink);
    font-weight: 700;
  }
</style>
