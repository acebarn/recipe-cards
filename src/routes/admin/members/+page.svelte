<script lang="ts">
  import { enhance } from "$app/forms";
  import type { ActionData, PageData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const statusLabel: Record<string, string> = {
    approved: "freigegeben",
    invited: "wartet",
    blocked: "gesperrt",
  };
</script>

<svelte:head><title>Mitglieder</title></svelte:head>

<p class="back"><a href="/">← Übersicht</a></p>
<h2 class="page-title">Mitglieder</h2>

{#if form?.error}<p class="msg err">{form.error}</p>{/if}
{#if form?.ok}<p class="msg ok">{form.ok}</p>{/if}

<form method="POST" action="?/invite" use:enhance class="invite">
  <input type="email" name="email" placeholder="email@beispiel.de" required />
  <button type="submit">Einladen</button>
</form>

<ul class="members">
  {#each data.users as u (u.id)}
    <li>
      <div class="who">
        <strong>{u.name ?? u.email}</strong>
        {#if u.name}<span class="email">{u.email}</span>{/if}
        <span class="badge {u.status}">{statusLabel[u.status] ?? u.status}</span>
        {#if u.role === "owner"}<span class="badge owner">Owner</span>{/if}
        {#if u.role === "admin"}<span class="badge admin">Admin</span>{/if}
        {#if !u.linked}<span class="badge unlinked">noch nie angemeldet</span>{/if}
      </div>
      <div class="actions">
        {#if u.status !== "approved"}
          <form method="POST" action="?/approve" use:enhance>
            <input type="hidden" name="id" value={u.id} /><button>Freigeben</button>
          </form>
        {/if}
        {#if u.id !== data.me}
          {#if u.status !== "blocked"}
            <form method="POST" action="?/block" use:enhance>
              <input type="hidden" name="id" value={u.id} /><button>Sperren</button>
            </form>
          {/if}
          {#if u.role !== "owner"}
            {#if u.role === "admin"}
              <form method="POST" action="?/revokeAdmin" use:enhance>
                <input type="hidden" name="id" value={u.id} /><button>Admin entfernen</button>
              </form>
            {:else}
              <form method="POST" action="?/makeAdmin" use:enhance>
                <input type="hidden" name="id" value={u.id} /><button>Zu Admin</button>
              </form>
            {/if}
          {/if}
        {/if}
      </div>
    </li>
  {/each}
</ul>

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
  }
  .msg.err {
    background: #fde8e8;
    color: #9b1c1c;
  }
  .msg.ok {
    background: #e6f4ea;
    color: #1e6b34;
  }
  .invite {
    display: flex;
    gap: 0.6rem;
    margin: 1rem 0 1.6rem;
    flex-wrap: wrap;
  }
  .invite input {
    flex: 1;
    min-width: 200px;
    padding: 0.6rem 0.8rem;
    border: 2.5px solid var(--ink);
    border-radius: var(--radius);
    font: inherit;
    background: #fff;
    box-shadow: 3px 3px 0 var(--ink);
  }
  .invite input:focus {
    outline: none;
    box-shadow: 3px 3px 0 var(--accent);
  }
  .invite button {
    padding: 0 1.1rem;
    height: 2.6rem;
    border: 2.5px solid var(--ink);
    border-radius: var(--radius);
    background: var(--accent);
    color: #fff;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
    box-shadow: 3px 3px 0 var(--ink);
  }
  .members {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }
  .members li {
    background: #fff;
    border: 2.5px solid var(--ink);
    border-radius: var(--radius);
    padding: 0.8rem 1rem;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    box-shadow: 4px 4px 0 var(--ink);
  }
  .who {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .who strong {
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  .email {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .badge {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    padding: 0.12rem 0.5rem;
    border: 1.5px solid var(--ink);
    border-radius: 999px;
    background: #eee;
    color: var(--ink);
  }
  .badge.approved {
    background: #bfe6c9;
  }
  .badge.invited {
    background: var(--yellow);
  }
  .badge.blocked {
    background: #f4b4ae;
  }
  .badge.owner {
    background: var(--blue);
    color: #fff;
  }
  .badge.admin {
    background: var(--red);
    color: #fff;
  }
  .badge.unlinked {
    background: #d8d8ea;
  }
  .actions {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
  .actions form {
    margin: 0;
  }
  .actions button {
    padding: 0.4rem 0.7rem;
    border: 2px solid var(--ink);
    border-radius: var(--radius);
    background: #fff;
    cursor: pointer;
    font: inherit;
    font-weight: 600;
    font-size: 0.82rem;
  }
  .actions button:hover {
    background: var(--accent);
    color: #fff;
  }
</style>
