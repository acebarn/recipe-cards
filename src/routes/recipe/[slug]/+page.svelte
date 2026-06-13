<script lang="ts">
  import { enhance } from "$app/forms";
  import { formatQuantity, scaleIngredient } from "$core/scale.ts";
  import { inlineMd } from "$lib/inline-md.ts";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  let r = $derived(data.recipe);

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
</script>

<svelte:head><title>{r.title}</title></svelte:head>

<div class="toolbar">
  <a href="/">← Übersicht</a>
  <div class="tools">
    <label class="scale">×<input type="number" min="0.25" max="20" step="0.25" bind:value={scale} /></label>
    <a class="btn" href={cookHref}>🍳 Kochmodus</a>
    <a class="btn" href={pdfHref} target="_blank" rel="noopener">PDF</a>
    <a class="btn" href={`/recipe/${r.slug}/edit`}>Bearbeiten</a>
    <form method="POST" action="?/delete" use:enhance onsubmit={confirmDelete}>
      <button class="btn danger" type="submit">Löschen</button>
    </form>
  </div>
</div>

<article class="recipe">
  <header class="rhead">
    {#if r.image}
      <img class="hero" src={`/images/${r.image}`} alt={r.title} />
    {/if}
    <div>
      <h1>{r.title}</h1>
      <div class="chips">
        {#if r.category}<span class="chip">{r.category}</span>{/if}
        {#if r.difficulty}<span class="chip">{r.difficulty}</span>{/if}
        {#if scaledServings}<span class="chip">{scaledServings} Portion{scaledServings === "1" ? "" : "en"}</span>{/if}
        {#each timeChips as [label, val] (label)}<span class="chip">{label}: {val}</span>{/each}
      </div>
    </div>
  </header>

  <section class="cols">
    <div class="ingredients">
      <h2>Zutaten</h2>
      {#each r.ingredients as sec (sec.name ?? "_")}
        {#if sec.name}<h3>{sec.name}</h3>{/if}
        <ul>
          {#each sec.items as item (item)}<li>{scaleIngredient(item, scale)}</li>{/each}
        </ul>
      {/each}
      {#if r.equipment.length}
        <h3>Zubehör</h3>
        <ul>{#each r.equipment as e (e)}<li>{e}</li>{/each}</ul>
      {/if}
    </div>

    <div class="steps">
      <h2>Zubereitung</h2>
      <ol>
        {#each r.steps as step, i (i)}<li>{@html inlineMd(step)}</li>{/each}
      </ol>

      {#if r.notes.length}
        <h2>Hinweise</h2>
        <ul class="notes">
          {#each r.notes as note (note)}<li>{@html inlineMd(note)}</li>{/each}
        </ul>
      {/if}
    </div>
  </section>

  {#if r.tags.length}
    <p class="tags">{#each r.tags as t (t)}<span class="tag">#{t}</span>{/each}</p>
  {/if}
</article>

<style>
  .toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.6rem; }
  .tools { display: flex; align-items: center; gap: 0.5rem; }
  .scale { display: inline-flex; align-items: center; gap: 0.2rem; color: var(--muted); font-size: 0.9rem; }
  .scale input { width: 3.4rem; padding: 0.35rem 0.4rem; border: 1px solid var(--border); border-radius: 7px; font: inherit; }
  .tools form { margin: 0; }
  .btn { padding: 0.4rem 0.8rem; border: 1px solid var(--border); border-radius: 8px; background: #fff; color: #4a4236; cursor: pointer; font: inherit; text-decoration: none; }
  .btn:hover { border-color: var(--accent); }
  .btn.danger { color: #9b1c1c; }
  .btn.danger:hover { border-color: #9b1c1c; background: #fde8e8; }
  .recipe { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.2rem; }
  .rhead { display: flex; gap: 1rem; align-items: flex-start; flex-wrap: wrap; }
  .hero { width: 120px; height: 120px; object-fit: cover; border-radius: 12px; flex-shrink: 0; }
  .rhead h1 { margin: 0 0 0.5rem; font-size: 1.5rem; }
  .chips { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .chip { background: var(--chip-bg, #f0ece4); color: #5a5043; font-size: 0.8rem; padding: 0.2rem 0.6rem; border-radius: 999px; }
  .cols { display: grid; grid-template-columns: 1fr; gap: 1.5rem; margin-top: 1.4rem; }
  @media (min-width: 680px) { .cols { grid-template-columns: 1fr 1.4fr; } }
  h2 { font-size: 1.1rem; border-bottom: 2px solid var(--accent); padding-bottom: 0.2rem; }
  h3 { font-size: 0.95rem; margin: 0.8rem 0 0.3rem; color: #4a4236; }
  .steps ol { padding-left: 1.2rem; }
  .steps li { margin-bottom: 0.6rem; line-height: 1.5; }
  .notes { color: #5a5043; }
  .tags { margin-top: 1.2rem; }
  .tag { color: var(--muted); font-size: 0.85rem; margin-right: 0.5rem; }
</style>
