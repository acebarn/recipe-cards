<script lang="ts">
  import { enhance } from "$app/forms";
  import type { ActionData, PageData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const confirmLeave = (e: SubmitEvent) => {
    if (
      !confirm(
        "Haushalt wirklich verlassen? Du bekommst danach einen leeren persönlichen Haushalt – das geteilte Inventar bleibt bei den übrigen Mitgliedern.",
      )
    ) {
      e.preventDefault();
    }
  };
</script>

<svelte:head><title>Haushalt · SCHMACKOFATZ</title></svelte:head>

<p class="back"><a href="/einstellungen">← Einstellungen</a></p>
<h2 class="page-title">🏠 Haushalt</h2>

{#if form?.error}<p class="msg err">{form.error}</p>{/if}
{#if form?.ok}<p class="msg ok">{form.ok}</p>{/if}

<p class="intro">
  Mitglieder eines Haushalts teilen sich das Inventar – Änderungen sind sofort für alle
  sichtbar. Neue Mitglieder fügst du direkt über ihre registrierte E-Mail hinzu.
</p>

<section class="panel">
  <h3>Name</h3>
  <form class="inline" method="POST" action="?/rename" use:enhance={() => async ({ update }) => update({ reset: false })}>
    <input name="name" value={data.name} required />
    <button class="btn" type="submit">Speichern</button>
  </form>
</section>

<section class="panel">
  <h3>Mitglieder ({data.members.length})</h3>
  <ul class="members">
    {#each data.members as m (m.id)}
      <li>
        <span class="m-name">{m.name}{m.id === data.me ? " (du)" : ""}</span>
        <span class="m-mail">{m.email}</span>
        {#if m.id === data.me}
          {#if data.members.length > 1}
            <form method="POST" action="?/leave" use:enhance onsubmit={confirmLeave}>
              <button class="btn danger" type="submit">Verlassen</button>
            </form>
          {/if}
        {:else if data.isCreator}
          <form method="POST" action="?/remove" use:enhance>
            <input type="hidden" name="id" value={m.id} />
            <button class="btn danger" type="submit">Entfernen</button>
          </form>
        {/if}
      </li>
    {/each}
  </ul>

  <div class="add">
    <span class="add-h">Mitglied hinzufügen</span>
    {#if data.candidates.length}
      <div class="cands">
        {#each data.candidates as c (c.id)}
          <form method="POST" action="?/add" use:enhance>
            <input type="hidden" name="id" value={c.id} />
            <button class="cand" type="submit" title={c.email}>
              <span class="c-name">{c.name}</span>
              <span class="c-plus">+</span>
            </button>
          </form>
        {/each}
      </div>
    {:else}
      <p class="muted">Keine weiteren freigegebenen Nutzer verfügbar.</p>
    {/if}
  </div>
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
    margin: 0.3rem 0 0.8rem;
  }
  .intro {
    color: var(--muted);
    max-width: 46rem;
    margin: 0 0 1.1rem;
  }
  .msg {
    padding: 0.5rem 0.8rem;
    border: 2px solid var(--ink);
    border-radius: var(--radius);
    font-weight: 600;
    margin: 0 0 0.9rem;
  }
  .msg.err {
    background: #fde8e8;
    color: #9b1c1c;
  }
  .msg.ok {
    background: #e6f4ea;
    color: #1e6b34;
  }
  .panel {
    background: #fff;
    border: 2.5px solid var(--ink);
    border-radius: var(--radius);
    box-shadow: 4px 4px 0 var(--ink);
    padding: 1rem;
    margin-bottom: 1.1rem;
  }
  .panel h3 {
    margin: 0 0 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    font-size: 1.05rem;
  }
  .inline {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }
  .inline input {
    flex: 1 1 14rem;
    border: 2px solid var(--ink);
    border-radius: var(--radius);
    padding: 0.5rem 0.6rem;
    font: inherit;
    background: #fff;
  }
  .members {
    list-style: none;
    padding: 0;
    margin: 0 0 0.9rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .members li {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    flex-wrap: wrap;
    padding: 0.45rem 0.6rem;
    border: 2px solid var(--ink);
    border-radius: var(--radius);
    background: var(--paper-2);
  }
  .members .m-name {
    font-weight: 700;
  }
  .members .m-mail {
    color: var(--muted);
    font-size: 0.85rem;
    flex: 1;
    min-width: 0;
  }
  .muted {
    color: var(--muted);
    font-size: 0.9rem;
    margin: 0;
  }
  .add-h {
    display: block;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    font-size: 0.78rem;
    color: var(--muted);
    margin-bottom: 0.5rem;
  }
  .cands {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .cand {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    border: 2px solid var(--ink);
    border-radius: 999px;
    background: #fff;
    font: inherit;
    font-weight: 600;
    padding: 0.35rem 0.4rem 0.35rem 0.8rem;
    cursor: pointer;
    transition:
      transform 0.1s,
      box-shadow 0.1s;
  }
  .cand:hover {
    transform: translate(-1px, -1px);
    box-shadow: 3px 3px 0 var(--accent);
  }
  .cand .c-plus {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.4rem;
    height: 1.4rem;
    border-radius: 50%;
    background: var(--accent);
    color: #fff;
    font-weight: 700;
  }
</style>
