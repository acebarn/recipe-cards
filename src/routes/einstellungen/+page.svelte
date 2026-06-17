<script lang="ts">
  import type { PageData } from "./$types";
  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Einstellungen · SCHMACKOFATZ</title></svelte:head>

<p class="back"><a href="/">← Übersicht</a></p>
<h2 class="page-title">⚙️ Einstellungen</h2>

<div class="cards">
  {#if data.isAdmin}
    <a class="setting" href="/admin/members">
      <span class="ic">👥</span>
      <span class="body">
        <span class="t">Benutzerverwaltung</span>
        <span class="d">Mitglieder einladen, freigeben, Admin-Rechte, löschen.</span>
      </span>
      <span class="arrow">→</span>
    </a>
  {/if}

  <a class="setting" href="/einkaufsliste">
    <span class="ic">🛒</span>
    <span class="body">
      <span class="t">Einkaufsliste (Bring)</span>
      <span class="d">{data.bringLinked ? `Verknüpft${data.bringList ? ` · Liste „${data.bringList}"` : ""}` : "Bring-Konto verknüpfen"}</span>
    </span>
    <span class="status" class:on={data.bringLinked}>{data.bringLinked ? "verbunden" : "offen"}</span>
    <span class="arrow">→</span>
  </a>

  <a class="setting" href="/kalender">
    <span class="ic">📅</span>
    <span class="body">
      <span class="t">Google Kalender</span>
      <span class="d">{data.calendarConnected ? "Verbunden · Kalender & Mahlzeit-Zeiten" : "Kalender verbinden"}</span>
    </span>
    <span class="status" class:on={data.calendarConnected}>{data.calendarConnected ? "verbunden" : "offen"}</span>
    <span class="arrow">→</span>
  </a>
</div>

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
  .cards {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }
  .setting {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    background: #fff;
    border: 2.5px solid var(--ink);
    border-radius: var(--radius);
    box-shadow: 4px 4px 0 var(--ink);
    padding: 0.85rem 1rem;
    color: var(--ink);
    transition:
      transform 0.1s,
      box-shadow 0.1s;
  }
  .setting:hover {
    transform: translate(-2px, -2px);
    box-shadow: 6px 6px 0 var(--accent);
  }
  .ic {
    font-size: 1.6rem;
    flex: none;
  }
  .body {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }
  .t {
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  .d {
    font-size: 0.85rem;
    color: var(--muted);
  }
  .status {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0.12rem 0.5rem;
    border: 1.5px solid var(--ink);
    border-radius: 999px;
    background: #eee;
    flex: none;
  }
  .status.on {
    background: #bfe6c9;
  }
  .arrow {
    font-weight: 700;
    color: var(--accent);
    flex: none;
  }
</style>
