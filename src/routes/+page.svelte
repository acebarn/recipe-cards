<script lang="ts">
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  type R = PageData["recipes"][number];

  // Bauhaus-Primärfarben fürs Farbspiel (zyklisch pro Karte/Kategorie).
  const PALETTE = ["var(--red)", "var(--blue)", "var(--yellow)"];
  const colorAt = (i: number) => PALETTE[((i % 3) + 3) % 3];

  // Ohne Suche nach Kategorie gruppieren; mit Suche flache Trefferliste.
  let groups = $derived.by(() => {
    if (data.q) return null;
    const map = new Map<string, R[]>();
    for (const r of data.recipes) {
      const key = r.category || "Sonstige";
      (map.get(key) ?? map.set(key, []).get(key)!).push(r);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "de"));
  });
</script>

<svelte:head><title>Rezepte</title></svelte:head>

<form method="GET" class="search">
  <input
    type="search"
    name="q"
    value={data.q}
    placeholder="Rezepte durchsuchen …"
    autocomplete="off"
  />
  <button type="submit" class="btn primary">Suchen</button>
</form>

{#if data.q}
  <p class="count">{data.recipes.length} Treffer für „{data.q}" · <a href="/">← zurück</a></p>
  {#if data.recipes.length}
    {@render grid(data.recipes)}
  {:else}
    <p class="empty">Keine Rezepte gefunden.</p>
  {/if}
{:else}
  {#each groups ?? [] as [category, recipes], gi (category)}
    <h2 class="cat-heading" style={`--c: ${colorAt(gi)}`}>
      <span class="mark"></span>{category}<span class="arrow">→</span>
    </h2>
    {@render grid(recipes)}
  {/each}
{/if}

{#snippet grid(recipes: R[])}
  <ul class="recipe-grid">
    {#each recipes as r, i (r.slug)}
      <li class="recipe-card" style={`--c: ${colorAt(i)}`}>
        <a href={`/recipe/${r.slug}`}>
          {#if r.image}
            <img class="thumb" src={`/images/${r.image}`} alt={r.title} loading="lazy" />
          {:else}
            <div class="thumb placeholder">{r.title.slice(0, 1)}</div>
          {/if}
        </a>
        <div class="body">
          <div class="title"><a href={`/recipe/${r.slug}`}>{r.title}</a></div>
          {#if r.category}<div class="cat">{r.category}</div>{/if}
        </div>
      </li>
    {/each}
  </ul>
{/snippet}

<style>
  .search {
    display: flex;
    gap: 0.6rem;
    margin: 0.3rem 0 1.8rem;
  }
  .search input {
    flex: 1;
    padding: 0.65rem 0.85rem;
    border: 2.5px solid var(--ink);
    border-radius: var(--radius);
    font: inherit;
    font-size: 1rem;
    background: #fff;
    box-shadow: 3px 3px 0 var(--ink);
  }
  .search input:focus {
    outline: none;
    box-shadow: 3px 3px 0 var(--accent);
  }
  .search :global(.btn.primary) {
    box-shadow: 3px 3px 0 var(--ink);
  }

  .count {
    color: var(--muted);
    font-weight: 500;
  }
  .empty {
    color: var(--muted);
    margin-top: 3rem;
    text-align: center;
    font-size: 1.1rem;
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
