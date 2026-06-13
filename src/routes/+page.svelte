<script lang="ts">
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  type R = PageData["recipes"][number];

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
    placeholder="Rezepte durchsuchen … (Titel, Zutaten, Schritte)"
    autocomplete="off"
  />
  <button type="submit">Suchen</button>
</form>

{#if data.q}
  <p class="count">{data.recipes.length} Treffer für „{data.q}" · <a href="/">zurück</a></p>
  {#if data.recipes.length}
    {@render grid(data.recipes)}
  {:else}
    <p class="empty">Keine Rezepte gefunden.</p>
  {/if}
{:else}
  {#each groups ?? [] as [category, recipes] (category)}
    <h2 class="cat-heading">{category}</h2>
    {@render grid(recipes)}
  {/each}
{/if}

{#snippet grid(recipes: R[])}
  <ul class="recipe-grid">
    {#each recipes as r (r.slug)}
      <li class="recipe-card">
        <a href={`/recipe/${r.slug}`}>
          {#if r.image}
            <img class="thumb" src={`/images/${r.image}`} alt={r.title} loading="lazy" />
          {:else}
            <div class="thumb placeholder">{r.title.slice(0, 1)}</div>
          {/if}
        </a>
        <div class="body">
          <div class="title"><a href={`/recipe/${r.slug}`} style="color: inherit;">{r.title}</a></div>
          {#if r.category}<div class="cat">{r.category}</div>{/if}
        </div>
      </li>
    {/each}
  </ul>
{/snippet}

<style>
  .search { display: flex; gap: 0.5rem; margin: 0.5rem 0 1.2rem; }
  .search input { flex: 1; padding: 0.6rem 0.8rem; border: 1px solid var(--border); border-radius: 10px; font-size: 1rem; }
  .search button { padding: 0.6rem 1rem; border: 0; border-radius: 10px; background: var(--accent); color: #fff; cursor: pointer; }
  .count { color: var(--muted); }
  .empty { color: var(--muted); margin-top: 2rem; text-align: center; }
  .cat-heading { text-transform: capitalize; font-size: 1.05rem; margin: 1.4rem 0 0.6rem; color: #4a4236; }
  .thumb.placeholder { display: flex; align-items: center; justify-content: center; font-size: 2.4rem; color: #c9bfb0; font-weight: 700; }
</style>
