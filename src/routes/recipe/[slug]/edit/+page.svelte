<script lang="ts">
  import { enhance } from "$app/forms";
  import type { ActionData, PageData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>Bearbeiten: {data.title}</title></svelte:head>

<p class="back"><a href={`/recipe/${data.slug}`}>← Zurück</a></p>
<h2 class="page-title">Bearbeiten: {data.title}</h2>

{#if form?.error}<p class="msg err">{form.error}</p>{/if}

<form method="POST" use:enhance>
  <textarea name="markdown" rows="24" spellcheck="false" value={form?.markdown ?? data.markdown}></textarea>
  <div class="row">
    <button type="submit" class="btn primary">Speichern</button>
    <a class="btn" href={`/recipe/${data.slug}`}>Abbrechen</a>
  </div>
</form>

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
    font-size: 1.4rem;
    margin: 0.3rem 0 1.1rem;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  textarea {
    width: 100%;
    padding: 0.9rem;
    border: 2.5px solid var(--ink);
    border-radius: var(--radius);
    background: #fff;
    box-shadow: 4px 4px 0 var(--accent);
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 0.9rem;
    line-height: 1.5;
    resize: vertical;
  }
  textarea:focus {
    outline: none;
    box-shadow: 4px 4px 0 var(--ink);
  }
  .row {
    display: flex;
    gap: 0.8rem;
    align-items: center;
  }
  .msg.err {
    background: #fde8e8;
    color: #9b1c1c;
    border: 2px solid var(--ink);
    border-radius: var(--radius);
    padding: 0.6rem 0.85rem;
    font-weight: 500;
  }
</style>
