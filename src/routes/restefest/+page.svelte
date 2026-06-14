<script lang="ts">
  import { flip } from "svelte/animate";
  import { fade } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  type R = PageData["recipes"][number];

  const fmtMin = (m: number | null) =>
    m == null ? "" : m < 60 ? `${m} Min` : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} Std`;

  // Zutat normalisieren + grob entpluralisieren (Tomaten→tomate, Zwiebeln→zwiebel)
  const norm = (s: string) => s.toLowerCase().trim();
  const stem = (w: string) => {
    const s = w.replace(/(en|n|e|s)$/u, "");
    return s.length >= 3 ? s : w;
  };

  let terms = $state<string[]>([]);
  let draft = $state("");

  function commit(part: string) {
    const t = norm(part);
    if (t && !terms.includes(t)) terms = [...terms, t];
  }
  function addDraft() {
    commit(draft);
    draft = "";
  }
  // Sobald ein Komma getippt/eingefügt wird: alles davor sofort als Chip.
  function onInput() {
    if (!draft.includes(",")) return;
    const parts = draft.split(",");
    draft = parts.pop() ?? "";
    for (const p of parts) commit(p);
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      addDraft();
    } else if (e.key === "Backspace" && !draft && terms.length) {
      terms = terms.slice(0, -1);
    }
  }
  const remove = (t: string) => (terms = terms.filter((x) => x !== t));

  function matched(r: R): string[] {
    const text = r.ingredients;
    return terms.filter((t) => text.includes(t) || text.includes(stem(t)));
  }

  let ranked = $derived(
    terms.length === 0
      ? []
      : data.recipes
          .map((r) => ({ r, hits: matched(r) }))
          .filter((x) => x.hits.length > 0)
          .sort((a, b) => b.hits.length - a.hits.length || a.r.title.localeCompare(b.r.title, "de")),
  );
</script>

<svelte:head><title>Restefest</title></svelte:head>

<h1 class="title">🥕 Restefest</h1>
<p class="lead">Was muss weg? Zutaten eintippen (Enter oder Komma) – wir finden Rezepte, die sie verwenden.</p>

<div class="entry">
  <div class="chips">
    {#each terms as t (t)}
      <button class="chip" onclick={() => remove(t)} title="Entfernen" animate:flip={{ duration: 250 }}>
        {t} <span class="x">×</span>
      </button>
    {/each}
    <input
      class="field"
      bind:value={draft}
      oninput={onInput}
      onkeydown={onKey}
      onblur={addDraft}
      placeholder={terms.length ? "" : "z. B. Zucchini, Feta, Eier …"}
      autocomplete="off"
    />
  </div>
  {#if terms.length}
    <button class="linkbtn" onclick={() => (terms = [])}>alle entfernen</button>
  {/if}
</div>

{#if terms.length === 0}
  <p class="empty">Trag deine übrigen Zutaten ein, um Vorschläge zu sehen.</p>
{:else if ranked.length === 0}
  <p class="empty">Kein Rezept gefunden, das diese Zutaten verwendet.</p>
{:else}
  <p class="count">{ranked.length} {ranked.length === 1 ? "Rezept" : "Rezepte"} gefunden</p>
  <ul class="results">
    {#each ranked as { r, hits } (r.slug)}
      <li animate:flip={{ duration: 450, easing: cubicOut }} in:fade={{ duration: 300, delay: 150 }} out:fade={{ duration: 200 }}>
        <a href={`/recipe/${r.slug}`}>
          {#if r.image}
            <img class="thumb" src={`/images/${r.image}`} alt="" loading="lazy" />
          {:else}
            <span class="thumb placeholder">{r.title.slice(0, 1)}</span>
          {/if}
          <span class="info">
            <span class="rtitle">{r.title}</span>
            <span class="hits">
              {#each terms as t (t)}
                <span class="hit" class:on={hits.includes(t)}>{t}</span>
              {/each}
            </span>
          </span>
          <span class="score">
            <span class="big">{hits.length}<span class="of">/{terms.length}</span></span>
            <span class="meta">
              {#if r.totalMinutes}🕒 {fmtMin(r.totalMinutes)}{/if}
            </span>
          </span>
        </a>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .title {
    margin: 0.2rem 0 0.3rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .lead {
    color: var(--muted);
    margin: 0 0 1.4rem;
    max-width: 42rem;
  }

  .entry {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1.6rem;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.55rem;
    border: 2.5px solid var(--ink);
    border-radius: var(--radius);
    background: #fff;
    box-shadow: 3px 3px 0 var(--ink);
  }
  .chips:focus-within {
    box-shadow: 3px 3px 0 var(--accent);
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.25rem 0.6rem;
    border: 2px solid var(--ink);
    border-radius: 999px;
    background: var(--yellow);
    font: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
  }
  .chip .x {
    font-weight: 700;
    line-height: 1;
  }
  .field {
    flex: 1;
    min-width: 9rem;
    border: 0;
    outline: none;
    font: inherit;
    font-size: 1rem;
    padding: 0.25rem;
    background: transparent;
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

  .results {
    list-style: none;
    margin: 0.4rem 0 2.2rem;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    position: relative;
  }
  .results li {
    background: #fff;
    border: 2.5px solid var(--ink);
    border-radius: var(--radius);
    box-shadow: 3px 3px 0 var(--ink);
    transition:
      transform 0.1s,
      box-shadow 0.1s;
  }
  .results li:hover {
    transform: translate(-2px, -2px);
    box-shadow: 6px 6px 0 var(--yellow);
  }
  .results a {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    padding: 0.55rem 0.8rem;
    color: var(--ink);
  }
  .thumb {
    width: 56px;
    height: 56px;
    object-fit: cover;
    border: 2px solid var(--ink);
    border-radius: var(--radius);
    flex: none;
  }
  .thumb.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--blue);
    color: #fff;
    font-weight: 700;
    font-size: 1.4rem;
  }
  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .rtitle {
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.01em;
  }
  .hits {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .hit {
    font-size: 0.72rem;
    font-weight: 600;
    padding: 0.08rem 0.45rem;
    border: 1.5px solid var(--ink);
    border-radius: 999px;
    background: #fff;
    color: var(--muted);
    opacity: 0.5;
  }
  .hit.on {
    background: var(--yellow);
    color: var(--ink);
    opacity: 1;
  }
  .score {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.2rem;
  }
  .score .big {
    font-weight: 700;
    font-size: 1.4rem;
    line-height: 1;
  }
  .score .of {
    font-size: 0.9rem;
    color: var(--muted);
  }
  .score .meta {
    font-size: 0.72rem;
    color: var(--muted);
    font-weight: 600;
  }
  @media (max-width: 520px) {
    .hits {
      display: none;
    }
  }
</style>
