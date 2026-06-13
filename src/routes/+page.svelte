<script lang="ts">
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Rezepte</title></svelte:head>

<p style="color: var(--muted);">{data.recipes.length} Rezepte</p>

<ul class="recipe-grid">
  {#each data.recipes as r (r.slug)}
    <li class="recipe-card">
      <a href={`/recipe/${r.slug}`}>
        {#if r.image}
          <img class="thumb" src={`/images/${r.image}`} alt={r.title} loading="lazy" />
        {:else}
          <div class="thumb"></div>
        {/if}
      </a>
      <div class="body">
        <div class="title"><a href={`/recipe/${r.slug}`} style="color: inherit;">{r.title}</a></div>
        {#if r.category}<div class="cat">{r.category}</div>{/if}
      </div>
    </li>
  {/each}
</ul>
