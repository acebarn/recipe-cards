<script lang="ts">
  import { tick } from "svelte";
  import { enhance } from "$app/forms";
  import type { ActionData, PageData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  // Schnell-Erfassung (kontrolliert, damit Chips vorbelegen können)
  let qName = $state("");
  let qQty = $state("");
  let qLoc = $state<"pantry" | "freezer">("pantry");
  let qGroup = $state("");
  let nameInput = $state<HTMLInputElement>();

  async function focusName() {
    await tick();
    nameInput?.focus();
  }

  function prefill(name: string, group = "", location: "pantry" | "freezer" = "pantry") {
    qName = name;
    qGroup = group;
    qLoc = location;
    focusName();
  }

  $effect(() => {
    if (data.enabled) focusName();
  });
</script>

<svelte:head><title>Inventar · SCHMACKOFATZ</title></svelte:head>

<p class="back"><a href="/">← Übersicht</a></p>
<h2 class="page-title">📦 Inventar</h2>

{#if form?.error}<p class="msg err">{form.error}</p>{/if}
{#if form?.ok}<p class="msg ok">{form.ok}</p>{/if}

{#if !data.enabled}
  <div class="panel">
    <p>
      Die Inventarfunktion ist deaktiviert. Aktiviere sie, um deinen Vorrat zu pflegen –
      die Einkaufsliste fragt dann beim Hinzufügen, was du noch da hast.
    </p>
    <form method="POST" action="?/toggleEnabled" use:enhance>
      <input type="hidden" name="enabled" value="1" />
      <button class="btn primary" type="submit">Inventar aktivieren</button>
    </form>
  </div>
{:else}
  <div class="topbar">
    <span class="hh">🏠 {data.householdName}{data.memberCount > 1 ? ` · ${data.memberCount} Mitglieder` : ""}</span>
  </div>

  <!-- Schnell-Erfassung -->
  <form
    class="quick panel"
    method="POST"
    action="?/addItem"
    use:enhance={() => {
      return async ({ update, result }) => {
        await update({ reset: false });
        if (result.type === "success") {
          qName = "";
          qQty = "";
          qGroup = "";
          focusName();
        }
      };
    }}
  >
    <input
      class="f-name"
      name="name"
      placeholder="Artikel (z. B. Kichererbsen)"
      list="known-items"
      autocomplete="off"
      bind:value={qName}
      bind:this={nameInput}
      required
    />
    <input class="f-qty" name="quantity" placeholder="Menge (z. B. 2 Dosen)" bind:value={qQty} />
    <select class="f-loc" name="location" bind:value={qLoc}>
      <option value="pantry">🗄️ Vorrat</option>
      <option value="freezer">🧊 Tiefkühl</option>
    </select>
    <input class="f-grp" name="group" placeholder="Gruppe" list="known-groups" bind:value={qGroup} />
    <button class="btn primary" type="submit">+ Hinzufügen</button>
  </form>

  <datalist id="known-groups">
    {#each data.groupNames as g}<option value={g}></option>{/each}
  </datalist>
  <datalist id="known-items">
    {#each data.templates as t}<option value={t.name}></option>{/each}
    {#each data.recentlyBought as n}<option value={n}></option>{/each}
  </datalist>

  <!-- Standardartikel (Vorlagen) -->
  <section class="block">
    <h3>★ Standardartikel</h3>
    {#if data.templates.length}
      <div class="chips">
        {#each data.templates as t (t.id)}
          <span class="chip">
            <button
              type="button"
              class="chip-main"
              onclick={() => prefill(t.name, t.group ?? "", t.defaultLocation)}
            >
              {t.defaultLocation === "freezer" ? "🧊" : "🗄️"} {t.name}
            </button>
            <form method="POST" action="?/removeTemplate" use:enhance>
              <input type="hidden" name="id" value={t.id} />
              <button type="submit" class="chip-x" title="Vorlage entfernen">✕</button>
            </form>
          </span>
        {/each}
      </div>
    {:else}
      <p class="muted">Noch keine Standardartikel. Lege wiederkehrende Artikel an, um sie schnell zu wählen.</p>
    {/if}
    <form class="inline" method="POST" action="?/addTemplate" use:enhance={() => async ({ update }) => update({ reset: true })}>
      <input name="name" placeholder="Neuer Standardartikel" required />
      <input name="group" placeholder="Gruppe" list="known-groups" />
      <select name="location">
        <option value="pantry">🗄️ Vorrat</option>
        <option value="freezer">🧊 Tiefkühl</option>
      </select>
      <button class="btn" type="submit">Speichern</button>
    </form>
  </section>

  {#if data.recentlyBought.length}
    <section class="block">
      <h3>🛒 Kürzlich eingekauft</h3>
      <div class="chips">
        {#each data.recentlyBought as n}
          <button type="button" class="chip suggest" onclick={() => prefill(n)}>+ {n}</button>
        {/each}
      </div>
    </section>
  {/if}

  <!-- Bereiche -->
  {#snippet area(heading: string, groups: typeof data.pantry)}
    <section class="block">
      <h3>{heading}</h3>
      {#if groups.length === 0}
        <p class="muted">Noch nichts erfasst.</p>
      {:else}
        {#each groups as grp (grp.group)}
          <div class="grp">
            <div class="grp-h">{grp.group}</div>
            {#each grp.items as item (item.id)}
              <form class="item" method="POST" action="?/updateItem" use:enhance={() => async ({ update }) => update({ reset: false })}>
                <input type="hidden" name="id" value={item.id} />
                <span class="i-name">{item.name}</span>
                <input class="i-qty" name="quantity" value={item.quantity} placeholder="Menge" />
                <input class="i-grp" name="group" value={item.group ?? ""} list="known-groups" placeholder="Gruppe" />
                <button class="iconbtn" type="submit" title="Speichern">💾</button>
                <button class="iconbtn danger" type="submit" formaction="?/removeItem" title="Entfernen">✕</button>
              </form>
            {/each}
          </div>
        {/each}
      {/if}
    </section>
  {/snippet}

  {@render area("🗄️ Vorratsschrank", data.pantry)}
  {@render area("🧊 Tiefkühlschrank", data.freezer)}

  <!-- Gruppen verwalten -->
  <section class="block">
    <h3>Gruppen verwalten</h3>
    <div class="groups">
      {#each data.groups as g (g.id)}
        <form class="grow" method="POST" action="?/renameGroup" use:enhance={() => async ({ update }) => update({ reset: false })}>
          <input type="hidden" name="id" value={g.id} />
          <input class="g-name" name="name" value={g.name} />
          <button class="iconbtn" type="submit" title="Umbenennen">💾</button>
          <button class="iconbtn danger" type="submit" formaction="?/deleteGroup" title="Gruppe löschen">✕</button>
        </form>
      {/each}
    </div>
    <form class="inline" method="POST" action="?/addGroup" use:enhance={() => async ({ update }) => update({ reset: true })}>
      <input name="name" placeholder="Neue Gruppe" required />
      <button class="btn" type="submit">+ Gruppe</button>
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
    margin-bottom: 1.2rem;
  }
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
    margin-bottom: 0.9rem;
  }
  .topbar .hh {
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .quick {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }
  .quick input,
  .quick select,
  .inline input,
  .inline select,
  .item input,
  .grow input {
    border: 2px solid var(--ink);
    border-radius: var(--radius);
    padding: 0.45rem 0.55rem;
    font: inherit;
    background: #fff;
  }
  .quick .f-name {
    flex: 2 1 12rem;
  }
  .quick .f-qty {
    flex: 1 1 8rem;
  }
  .quick .f-grp {
    flex: 1 1 8rem;
  }

  .block {
    margin: 1.4rem 0;
  }
  .block h3 {
    text-transform: uppercase;
    letter-spacing: 0.03em;
    font-size: 1.05rem;
    margin: 0 0 0.6rem;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .muted {
    color: var(--muted);
    font-size: 0.9rem;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 0.7rem;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    border: 2px solid var(--ink);
    border-radius: 999px;
    background: #fff;
    overflow: hidden;
  }
  .chip .chip-main {
    border: 0;
    background: none;
    font: inherit;
    font-weight: 600;
    padding: 0.3rem 0.2rem 0.3rem 0.7rem;
    cursor: pointer;
  }
  .chip .chip-x {
    border: 0;
    background: none;
    cursor: pointer;
    padding: 0.3rem 0.55rem;
    color: var(--muted);
    font: inherit;
  }
  .chip .chip-x:hover {
    color: var(--red);
  }
  .chip.suggest {
    border-style: dashed;
    padding: 0.35rem 0.7rem;
    font-weight: 600;
    cursor: pointer;
  }

  .grp {
    margin-bottom: 0.8rem;
  }
  .grp-h {
    font-weight: 700;
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    margin: 0.4rem 0 0.3rem;
    border-bottom: 2px solid var(--ink);
    padding-bottom: 0.15rem;
  }
  .item,
  .grow {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0;
    flex-wrap: wrap;
  }
  .item .i-name {
    flex: 2 1 9rem;
    font-weight: 600;
  }
  .item .i-qty {
    flex: 1 1 6rem;
  }
  .item .i-grp {
    flex: 1 1 7rem;
  }
  .grow .g-name {
    flex: 1 1 12rem;
  }
  .iconbtn {
    border: 2px solid var(--ink);
    border-radius: var(--radius);
    background: #fff;
    cursor: pointer;
    font: inherit;
    padding: 0.35rem 0.5rem;
    line-height: 1;
  }
  .iconbtn:hover {
    background: var(--paper-2);
  }
  .iconbtn.danger:hover {
    background: #fde8e8;
  }

  .inline {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    margin-top: 0.6rem;
  }
  .inline input {
    flex: 1 1 9rem;
  }
  .groups {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
</style>
