<script lang="ts">
  import { enhance } from "$app/forms";
  import type { ActionData, PageData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>Bearbeiten: {data.title}</title></svelte:head>

<p><a href={`/recipe/${data.slug}`}>← Zurück</a></p>
<h2>Bearbeiten: {data.title}</h2>

{#if form?.error}<p class="msg err">{form.error}</p>{/if}

<form method="POST" use:enhance>
  <textarea name="markdown" rows="24" spellcheck="false" value={form?.markdown ?? data.markdown}></textarea>
  <div class="row">
    <button type="submit">Speichern</button>
    <a class="cancel" href={`/recipe/${data.slug}`}>Abbrechen</a>
  </div>
</form>

<style>
  form { display: flex; flex-direction: column; gap: 0.8rem; }
  textarea { width: 100%; padding: 0.8rem; border: 1px solid var(--border); border-radius: 10px; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 0.9rem; line-height: 1.5; }
  .row { display: flex; gap: 1rem; align-items: center; }
  .row button { padding: 0.6rem 1.3rem; border: 0; border-radius: 10px; background: var(--accent); color: #fff; cursor: pointer; }
  .cancel { color: var(--muted); }
  .msg.err { background: #fde8e8; color: #9b1c1c; padding: 0.5rem 0.75rem; border-radius: 8px; }
</style>
