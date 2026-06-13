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

<h2>Mitglieder</h2>

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
          {#if u.role === "owner"}
            <form method="POST" action="?/demote" use:enhance>
              <input type="hidden" name="id" value={u.id} /><button>Zu Mitglied</button>
            </form>
          {:else}
            <form method="POST" action="?/promote" use:enhance>
              <input type="hidden" name="id" value={u.id} /><button>Zu Owner</button>
            </form>
          {/if}
        {/if}
      </div>
    </li>
  {/each}
</ul>

<style>
  .msg { padding: 0.5rem 0.75rem; border-radius: 8px; }
  .msg.err { background: #fde8e8; color: #9b1c1c; }
  .msg.ok { background: #e6f4ea; color: #1e6b34; }
  .invite { display: flex; gap: 0.5rem; margin: 1rem 0; }
  .invite input { flex: 1; padding: 0.55rem 0.7rem; border: 1px solid var(--border); border-radius: 8px; }
  .invite button { padding: 0.55rem 1rem; border: 0; border-radius: 8px; background: var(--accent); color: #fff; cursor: pointer; }
  .members { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 0.6rem; }
  .members li { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 0.7rem 0.9rem; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; }
  .who { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .email { color: var(--muted); font-size: 0.85rem; }
  .badge { font-size: 0.72rem; padding: 0.1rem 0.45rem; border-radius: 999px; background: #eee; color: #444; }
  .badge.approved { background: #e6f4ea; color: #1e6b34; }
  .badge.invited { background: #fff3cd; color: #8a6d00; }
  .badge.blocked { background: #fde8e8; color: #9b1c1c; }
  .badge.owner { background: var(--accent); color: #fff; }
  .badge.unlinked { background: #eef; color: #556; }
  .actions { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .actions button { padding: 0.35rem 0.6rem; border: 1px solid var(--border); border-radius: 7px; background: #fff; cursor: pointer; font-size: 0.85rem; }
  .actions button:hover { border-color: var(--accent); }
</style>
