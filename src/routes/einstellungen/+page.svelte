<script lang="ts">
  import { enhance } from "$app/forms";
  import type { PageData } from "./$types";
  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Einstellungen · SCHMACKOFATZ</title></svelte:head>

<p class="back"><a href="/">← Übersicht</a></p>
<h2 class="page-title">⚙️ Einstellungen</h2>

<div class="cards">
  <a class="setting" href="/einstellungen/bring">
    <span class="ic">🛒</span>
    <span class="body">
      <span class="t">Einkaufsliste (Bring)</span>
      <span class="d">Bring-Konto verknüpfen und Liste wählen.</span>
    </span>
    <span class="status" class:on={data.bringLinked}>{data.bringLinked ? "verbunden" : "offen"}</span>
    <span class="arrow">→</span>
  </a>

  <a class="setting" href="/kalender">
    <span class="ic">📅</span>
    <span class="body">
      <span class="t">Google Kalender</span>
      <span class="d">Kalender verbinden, Mahlzeit-Zeiten konfigurieren.</span>
    </span>
    <span class="status" class:on={data.calendarConnected}>{data.calendarConnected ? "verbunden" : "offen"}</span>
    <span class="arrow">→</span>
  </a>

  <div class="setting static">
    <span class="ic">📦</span>
    <span class="body">
      <span class="t">Inventar</span>
      <span class="d">Vorrat &amp; Tiefkühl pflegen, Standardartikel und Gruppen.</span>
    </span>
    <form method="POST" action="?/toggleInventory" use:enhance>
      <input type="hidden" name="enabled" value={data.inventoryEnabled ? "" : "1"} />
      <button
        class="switch"
        class:on={data.inventoryEnabled}
        role="switch"
        aria-checked={data.inventoryEnabled}
        type="submit"
      >
        <span class="sw-lbl">{data.inventoryEnabled ? "aktiv" : "aus"}</span><span class="knob"></span>
      </button>
    </form>
  </div>

  <a class="setting" href="/einstellungen/haushalt">
    <span class="ic">🏠</span>
    <span class="body">
      <span class="t">Haushalt</span>
      <span class="d">Inventar mit anderen teilen: {data.householdName}.</span>
    </span>
    <span class="status on">{data.memberCount} {data.memberCount === 1 ? "Mitglied" : "Mitglieder"}</span>
    <span class="arrow">→</span>
  </a>

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
  /* Karte mit Toggle ist kein Link → nicht „anheben" beim Hover. */
  .setting.static:hover {
    transform: none;
    box-shadow: 4px 4px 0 var(--ink);
  }
  .switch {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.25rem 0.6rem 0.25rem 0.35rem;
    border: 2.5px solid var(--ink);
    border-radius: 999px;
    background: #fff;
    font: inherit;
    font-size: 0.78rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    cursor: pointer;
    color: var(--ink);
    flex: none;
  }
  .switch .knob {
    width: 36px;
    height: 22px;
    border: 2.5px solid var(--ink);
    border-radius: 999px;
    background: var(--paper);
    position: relative;
    flex: none;
    transition: background 0.15s;
  }
  .switch .knob::after {
    content: "";
    box-sizing: border-box;
    position: absolute;
    top: 50%;
    left: 2px;
    width: 14px;
    height: 14px;
    border: 2.5px solid var(--ink);
    border-radius: 50%;
    background: #fff;
    transform: translateY(-50%);
    transition: left 0.16s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .switch.on .knob {
    background: #3aaa5e;
  }
  .switch.on .knob::after {
    left: calc(100% - 14px - 2px);
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
