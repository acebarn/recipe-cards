<script lang="ts">
  import { enhance } from "$app/forms";
  import type { ActionData, PageData } from "./$types";
  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>Einkaufsliste verknüpfen · SCHMACKOFATZ</title></svelte:head>

<p class="back"><a href="/einstellungen">← Einstellungen</a></p>
<h2 class="page-title">🛒 Einkaufsliste (Bring)</h2>

{#if form?.error}<p class="msg err">{form.error}</p>{/if}
{#if form?.ok}<p class="msg ok">{form.ok}</p>{/if}

<section class="card">
  {#if !data.linked}
    <p class="hint">
      Verbinde dein eigenes Bring-Konto. Dein Passwort wird verschlüsselt gespeichert und nur
      genutzt, um in deinem Namen Einträge zu lesen und zu schreiben.
    </p>
    <form method="POST" action="?/linkBring" use:enhance class="stack">
      <input type="email" name="email" placeholder="Bring-E-Mail" required />
      <input type="password" name="password" placeholder="Bring-Passwort" required />
      <button class="btn" type="submit">Verknüpfen</button>
    </form>
  {:else}
    <p class="hint">Verknüpft als <strong>{data.email}</strong>.</p>
    {#if data.error}<p class="msg err">{data.error}</p>{/if}
    {#if data.lists.length}
      <p class="lbl">Aktive Liste</p>
      <div class="stack">
        {#each data.lists as l (l.listUuid)}
          <form method="POST" action="?/selectBringList" use:enhance class="row">
            <input type="hidden" name="listUuid" value={l.listUuid} />
            <input type="hidden" name="listName" value={l.name} />
            <span class="grow">{l.name}{l.listUuid === data.listUuid ? " ✓" : ""}</span>
            <button class="btn" type="submit" disabled={l.listUuid === data.listUuid}>
              {l.listUuid === data.listUuid ? "aktiv" : "aktivieren"}
            </button>
          </form>
        {/each}
      </div>
    {/if}
    <form method="POST" action="?/unlinkBring" use:enhance class="trennen">
      <button class="btn danger" type="submit">Konto trennen</button>
    </form>
  {/if}
</section>

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
    margin: 0.3rem 0 1.1rem;
  }
  .msg {
    padding: 0.6rem 0.85rem;
    border: 2px solid var(--ink);
    border-radius: var(--radius);
    font-weight: 600;
    margin: 0 0 1rem;
  }
  .msg.err {
    background: #fde8e8;
    color: #9b1c1c;
  }
  .msg.ok {
    background: #e6f4ea;
    color: #1e6b34;
  }
  .card {
    background: #fff;
    border: 2.5px solid var(--ink);
    border-radius: var(--radius);
    box-shadow: 4px 4px 0 var(--ink);
    padding: 1rem 1.1rem;
  }
  .hint {
    color: var(--muted);
    font-size: 0.9rem;
  }
  .lbl {
    font-size: 0.78rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
    margin: 0.6rem 0 0.3rem;
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .grow {
    flex: 1;
    font-weight: 600;
  }
  .stack input {
    border: 2.5px solid var(--ink);
    border-radius: var(--radius);
    padding: 0.5rem 0.6rem;
    font: inherit;
    background: #fff;
  }
  .trennen {
    margin-top: 0.9rem;
  }
</style>
