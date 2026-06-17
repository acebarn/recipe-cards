<script lang="ts">
  import { enhance } from "$app/forms";
  import { invalidateAll } from "$app/navigation";
  import { onDestroy } from "svelte";
  import type { ActionData, PageData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let editing = $state<string | null>(null);
  let autoRefresh = $state(false);
  let timer: ReturnType<typeof setInterval> | null = null;

  $effect(() => {
    if (timer) clearInterval(timer);
    if (autoRefresh) timer = setInterval(() => invalidateAll(), 20000);
  });
  onDestroy(() => timer && clearInterval(timer));
</script>

<svelte:head><title>Einkaufsliste</title></svelte:head>

<p class="back"><a href="/">← Übersicht</a></p>
<h2 class="page-title">🛒 Einkaufsliste</h2>

{#if form?.error}<p class="msg err">{form.error}</p>{/if}
{#if form?.ok}<p class="msg ok">{form.ok}</p>{/if}

{#if !data.linked}
  <!-- 1) Konto noch nicht verknüpft -->
  <div class="card">
    <h3>Bring!-Konto verknüpfen</h3>
    <p class="hint">
      Verbinde dein eigenes Bring-Konto. Dein Passwort wird verschlüsselt gespeichert und nur
      genutzt, um in deinem Namen Einträge zu lesen und zu schreiben.
    </p>
    <form method="POST" action="?/linkAccount" use:enhance class="stack">
      <input type="email" name="email" placeholder="Bring-E-Mail" required />
      <input type="password" name="password" placeholder="Bring-Passwort" required />
      <button class="btn primary" type="submit">Verknüpfen</button>
    </form>
  </div>
{:else if !data.hasList}
  <!-- 2) Verknüpft, aber Liste wählen -->
  <div class="card">
    <h3>Liste wählen</h3>
    <p class="hint">Verknüpft als <strong>{data.email}</strong>. Wähle die Bring-Liste:</p>
    {#if data.error}<p class="msg err">{data.error}</p>{/if}
    <div class="stack">
      {#each data.lists as l (l.listUuid)}
        <form method="POST" action="?/selectList" use:enhance class="row">
          <input type="hidden" name="listUuid" value={l.listUuid} />
          <input type="hidden" name="listName" value={l.name} />
          <span class="grow">{l.name}</span>
          <button class="btn" type="submit">Aktivieren</button>
        </form>
      {/each}
    </div>
    <form method="POST" action="?/unlink" use:enhance class="trennen">
      <button class="btn danger" type="submit">Konto trennen</button>
    </form>
  </div>
{:else}
  <!-- 3) Verknüpft + Liste aktiv -->
  <div class="account-bar">
    <span>Liste <strong>{data.listName}</strong> · {data.email}</span>
    <span class="bar-actions">
      <button class="btn" onclick={() => invalidateAll()}>Aktualisieren</button>
      <label class="auto"><input type="checkbox" bind:checked={autoRefresh} /> Auto</label>
      <form method="POST" action="?/unlink" use:enhance>
        <button class="btn danger" type="submit">Trennen</button>
      </form>
    </span>
  </div>

  {#if data.error}<p class="msg err">{data.error}</p>{/if}

  <form method="POST" action="?/addItem" use:enhance class="add-item">
    <input type="text" name="name" placeholder="Zutat" required />
    <input type="text" name="quantity" placeholder="Menge (optional)" />
    <button class="btn primary" type="submit">+</button>
  </form>

  {#each data.groups as g (g.aisle)}
    <section class="aisle">
      <h3>{g.aisle}</h3>
      <ul class="items">
        {#each g.items as it (it.name)}
          <li>
            <form method="POST" action="?/toggle" use:enhance class="check">
              <input type="hidden" name="name" value={it.name} />
              <input type="hidden" name="quantity" value={it.quantity} />
              <input type="hidden" name="done" value="true" />
              <input
                type="checkbox"
                aria-label={`„${it.name}" als gekauft markieren`}
                onchange={(e) => e.currentTarget.form?.requestSubmit()}
              />
            </form>
            {#if editing === it.name}
              <form method="POST" action="?/updateItem" use:enhance={() => {
                editing = null;
                return async ({ update }) => update();
              }} class="edit">
                <input type="hidden" name="name" value={it.name} />
                <input type="text" name="newName" value={it.name} />
                <input type="text" name="quantity" value={it.quantity} placeholder="Menge" />
                <button class="btn" type="submit">OK</button>
              </form>
            {:else}
              <button class="label" onclick={() => (editing = it.name)}>
                <span class="iname">{it.name}</span>
                {#if it.quantity}<span class="iqty">{it.quantity}</span>{/if}
              </button>
            {/if}
            <form method="POST" action="?/addStandard" use:enhance class="del">
              <input type="hidden" name="name" value={it.name} />
              <button class="star" type="submit" aria-label={`„${it.name}" als Standardzutat`} title="Als Standardzutat">★</button>
            </form>
            <form method="POST" action="?/removeItem" use:enhance class="del">
              <input type="hidden" name="name" value={it.name} />
              <button class="x" type="submit" aria-label="Entfernen">✕</button>
            </form>
          </li>
        {/each}
      </ul>
    </section>
  {/each}

  {#if data.groups.length === 0}
    <p class="hint empty">Die Liste ist leer.</p>
  {/if}

  {#if data.doneItems.length > 0}
    <details class="done">
      <summary>Gekauft ({data.doneItems.length})</summary>
      <ul class="items">
        {#each data.doneItems as it (it.name)}
          <li>
            <form method="POST" action="?/toggle" use:enhance class="check">
              <input type="hidden" name="name" value={it.name} />
              <input type="hidden" name="quantity" value={it.quantity} />
              <input type="hidden" name="done" value="false" />
              <input
                type="checkbox"
                checked
                aria-label={`„${it.name}" zurück auf die Liste`}
                onchange={(e) => e.currentTarget.form?.requestSubmit()}
              />
            </form>
            <span class="label done-label">{it.name}{#if it.quantity}<span class="iqty">{it.quantity}</span>{/if}</span>
          </li>
        {/each}
      </ul>
      {#if data.doneHidden > 0}
        <p class="hint">… und {data.doneHidden} weitere ältere Einträge (in Bring sichtbar).</p>
      {/if}
    </details>
  {/if}

  <section class="standard">
    <h3>Standardzutaten</h3>
    <p class="hint">Diese Zutaten werden beim „Auf die Einkaufsliste" aus Rezepten übersprungen.</p>
    <ul class="chips">
      {#each data.standard as s (s.id)}
        <li class="chip">
          <span>{s.name}</span>
          <form method="POST" action="?/quickAddStandard" use:enhance>
            <input type="hidden" name="name" value={s.name} />
            <button class="mini" type="submit" title="Auf die Liste">+</button>
          </form>
          <form method="POST" action="?/removeStandard" use:enhance>
            <input type="hidden" name="id" value={s.id} />
            <button class="mini x" type="submit" title="Entfernen">✕</button>
          </form>
        </li>
      {/each}
    </ul>
    <form method="POST" action="?/addStandard" use:enhance class="add-item">
      <input type="text" name="name" placeholder="Standardzutat (z. B. Salz)" required />
      <button class="btn" type="submit">+</button>
    </form>
  </section>
{/if}

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
    font-weight: 500;
    margin: 0.5rem 0;
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
    padding: 1rem 1.1rem;
    box-shadow: 4px 4px 0 var(--ink);
    max-width: 30rem;
  }
  .card h3,
  .aisle h3,
  .standard h3 {
    text-transform: uppercase;
    letter-spacing: 0.03em;
    margin: 0 0 0.6rem;
  }
  .hint {
    color: var(--muted);
    font-size: 0.9rem;
    margin: 0 0 0.8rem;
  }
  .hint.empty {
    margin-top: 1rem;
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .stack input {
    padding: 0.6rem 0.8rem;
    border: 2.5px solid var(--ink);
    border-radius: var(--radius);
    font: inherit;
    background: #fff;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .grow {
    flex: 1;
  }
  .trennen {
    margin-top: 0.9rem;
  }
  .account-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    background: var(--panel-bg, #f3f0e9);
    border: 2px solid var(--ink);
    border-radius: var(--radius);
    padding: 0.5rem 0.8rem;
    margin-bottom: 1rem;
    font-size: 0.9rem;
  }
  .bar-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .bar-actions form {
    margin: 0;
  }
  .auto {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.85rem;
  }
  .add-item {
    display: flex;
    gap: 0.5rem;
    margin: 0.8rem 0 1.4rem;
    flex-wrap: wrap;
  }
  .add-item input {
    flex: 1;
    min-width: 7rem;
    padding: 0.55rem 0.75rem;
    border: 2.5px solid var(--ink);
    border-radius: var(--radius);
    font: inherit;
    background: #fff;
  }
  .aisle {
    margin-bottom: 1.2rem;
  }
  .items {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .items li {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    background: #fff;
    border: 2px solid var(--ink);
    border-radius: var(--radius);
    padding: 0.45rem 0.6rem;
    box-shadow: 2px 2px 0 var(--ink);
  }
  .check {
    margin: 0;
    display: flex;
  }
  .check input {
    width: 1.2rem;
    height: 1.2rem;
  }
  .label {
    flex: 1;
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    background: none;
    border: none;
    text-align: left;
    font: inherit;
    cursor: pointer;
    padding: 0;
  }
  .iname {
    font-weight: 600;
  }
  .iqty {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .done-label {
    text-decoration: line-through;
    color: var(--muted);
    cursor: default;
  }
  .edit {
    flex: 1;
    display: flex;
    gap: 0.4rem;
    margin: 0;
  }
  .edit input {
    flex: 1;
    min-width: 4rem;
    padding: 0.35rem 0.5rem;
    border: 2px solid var(--ink);
    border-radius: var(--radius);
    font: inherit;
  }
  .del {
    margin: 0;
  }
  .x {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--muted);
    font-size: 1rem;
    line-height: 1;
  }
  .x:hover {
    color: var(--red);
  }
  .star {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--muted);
    font-size: 1rem;
    line-height: 1;
  }
  .star:hover {
    color: var(--yellow);
  }
  .done {
    margin: 0.5rem 0 1.4rem;
  }
  .done summary {
    cursor: pointer;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    font-size: 0.85rem;
    margin-bottom: 0.5rem;
  }
  .standard {
    border-top: 2px dashed var(--ink);
    padding-top: 1rem;
    margin-top: 1.5rem;
  }
  .chips {
    list-style: none;
    padding: 0;
    margin: 0 0 0.9rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }
  .chip {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    background: var(--yellow);
    border: 2px solid var(--ink);
    border-radius: 999px;
    padding: 0.2rem 0.55rem;
    font-size: 0.85rem;
    font-weight: 600;
  }
  .chip form {
    margin: 0;
    display: flex;
  }
  .mini {
    background: none;
    border: none;
    cursor: pointer;
    font-weight: 700;
    line-height: 1;
    padding: 0 0.1rem;
  }
  .mini.x:hover {
    color: var(--red);
  }
</style>
