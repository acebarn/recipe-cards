<script lang="ts">
  import { tick } from "svelte";
  import { enhance } from "$app/forms";
  import type { ActionData, PageData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  // Schnell-Erfassung (kontrolliert, damit Vorlagen-Chips vorbelegen können)
  let qName = $state("");
  let qAmount = $state(1);
  let qLoc = $state<"pantry" | "freezer">("pantry");
  let qGroup = $state("");
  let nameInput = $state<HTMLInputElement>();

  let showConfig = $state(false); // Gruppen-Verwaltung (Popup)
  let showTemplateAdd = $state(false); // Standardartikel-Eingabe ausklappen

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

  // enhance-Helfer: Antwort übernehmen, Formularfelder aber nicht zurücksetzen
  const keep = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) =>
    update({ reset: false });

  // Live-Speicherung mit Debounce (z. B. Gruppen-Umbenennung) – pro Formular ein Timer.
  const timers = new WeakMap<HTMLFormElement, ReturnType<typeof setTimeout>>();
  function debouncedSubmit(formEl: HTMLFormElement | null, ms = 1200) {
    if (!formEl) return;
    const t = timers.get(formEl);
    if (t) clearTimeout(t);
    timers.set(
      formEl,
      setTimeout(() => formEl.requestSubmit(), ms),
    );
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") showConfig = false;
  }

  $effect(() => {
    if (data.enabled) focusName();
  });
</script>

<svelte:head><title>Inventar · SCHMACKOFATZ</title></svelte:head>
<svelte:window onkeydown={onKey} />

<p class="back"><a href="/">← Übersicht</a></p>

{#if form?.error}<p class="msg err">{form.error}</p>{/if}
{#if form?.ok}<p class="msg ok">{form.ok}</p>{/if}

{#if !data.enabled}
  <h2 class="page-title">📦 Inventar</h2>
  <div class="panel">
    <p>
      Die Inventarfunktion ist deaktiviert. Aktiviere sie in den Einstellungen, um deinen
      Vorrat zu pflegen – die Einkaufsliste fragt dann beim Hinzufügen, was du noch da hast.
    </p>
    <form method="POST" action="?/toggleEnabled" use:enhance>
      <input type="hidden" name="enabled" value="1" />
      <button class="btn primary" type="submit">Inventar aktivieren</button>
    </form>
  </div>
{:else}
  <div class="topbar">
    <h2 class="page-title">📦 Inventar</h2>
    <div class="topbar-r">
      <span class="hh">🏠 {data.householdName}{data.memberCount > 1 ? ` · ${data.memberCount}` : ""}</span>
      <button class="btn" type="button" onclick={() => (showConfig = true)}>⚙️ Konfigurieren</button>
    </div>
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
          qAmount = 1;
          qGroup = "";
          focusName();
        }
      };
    }}
  >
    <input
      class="f-name"
      name="name"
      placeholder="Artikel hinzufügen (z. B. Kichererbsen)"
      list="known-items"
      autocomplete="off"
      bind:value={qName}
      bind:this={nameInput}
      required
    />
    <input class="f-amt" name="amount" type="number" min="1" step="1" bind:value={qAmount} aria-label="Menge" />
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

  <!-- Standardartikel + kürzlich eingekauft (subtil, oberhalb der Bereiche) -->
  <section class="aux">
    <div class="aux-row">
      <span class="aux-h">★ Standardartikel</span>
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
      {#if !showTemplateAdd}
        <button class="addbtn" type="button" title="Standardartikel anlegen" aria-label="Standardartikel anlegen" onclick={() => (showTemplateAdd = true)}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 2.5v11 M2.5 8h11" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
          </svg>
        </button>
      {/if}
    </div>
    {#if showTemplateAdd}
      <form
        class="inline"
        method="POST"
        action="?/addTemplate"
        use:enhance={() => async ({ update }) => update({ reset: true })}
      >
        <input name="name" placeholder="Neuer Standardartikel" required />
        <input name="group" placeholder="Gruppe" list="known-groups" />
        <select name="location">
          <option value="pantry">🗄️ Vorrat</option>
          <option value="freezer">🧊 Tiefkühl</option>
        </select>
        <button class="btn" type="submit">Speichern</button>
        <button class="btn primary" type="button" onclick={() => (showTemplateAdd = false)}>Fertig</button>
      </form>
    {/if}

    {#if data.recentlyBought.length}
      <div class="aux-row">
        <span class="aux-h">🛒 Kürzlich eingekauft</span>
        {#each data.recentlyBought as n}
          <button type="button" class="chip suggest" onclick={() => prefill(n)}>+ {n}</button>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Bereiche = Protagonisten -->
  {#snippet area(heading: string, icon: string, kind: "pantry" | "freezer", groups: typeof data.pantry)}
    {@const count = groups.reduce((s, g) => s + g.items.length, 0)}
    <section class="area area--{kind}">
      <header class="area-h">
        <span class="area-ic">{icon}</span>
        <h3>{heading}</h3>
        <span class="area-count">{count} {count === 1 ? "Artikel" : "Artikel"}</span>
      </header>
      <div class="area-body">
        {#if groups.length === 0}
          <p class="muted">Noch nichts erfasst.</p>
        {:else}
          {#each groups as grp (grp.group)}
            <div class="grp">
              <div class="grp-h">{grp.group}</div>
              {#each grp.items as item (item.id)}
                <div class="item" class:islow={item.low}>
                  <span class="i-name">{item.name}</span>
                  <div class="i-ctrl">
                    {#if item.low}<span class="badge-low">wenig</span>{/if}
                    <form class="spin" method="POST" action="?/adjustAmount" use:enhance={keep}>
                      <input type="hidden" name="id" value={item.id} />
                      <button class="sp" type="submit" name="delta" value="-1" aria-label="weniger">−</button>
                      <span class="amt">{item.amount}</span>
                      <button class="sp" type="submit" name="delta" value="1" aria-label="mehr">+</button>
                    </form>
                    <form method="POST" action="?/toggleLow" use:enhance={keep}>
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="low" value={item.low ? "" : "1"} />
                      <button class="lowbtn" class:on={item.low} type="submit" title={item.low ? "Bestand ist ok" : "als „wenig“ markieren"}>⚠</button>
                    </form>
                    <form method="POST" action="?/setGroup" use:enhance={keep}>
                      <input type="hidden" name="id" value={item.id} />
                      <select
                        class="grp-sel"
                        name="group"
                        value={item.group ?? ""}
                        onchange={(e) => e.currentTarget.form?.requestSubmit()}
                        aria-label="Gruppe"
                      >
                        <option value="">— ohne —</option>
                        {#each data.groupNames as g}<option value={g}>{g}</option>{/each}
                      </select>
                    </form>
                    <form method="POST" action="?/removeItem" use:enhance={keep}>
                      <input type="hidden" name="id" value={item.id} />
                      <button class="rm" type="submit" title="Entfernen" aria-label="Entfernen">🗑</button>
                    </form>
                  </div>
                </div>
              {/each}
            </div>
          {/each}
        {/if}
      </div>
    </section>
  {/snippet}

  <div class="areas">
    {@render area("Vorratsschrank", "🗄️", "pantry", data.pantry)}
    {@render area("Tiefkühlschrank", "🧊", "freezer", data.freezer)}
  </div>

  <!-- Gruppen-Verwaltung (Popup) -->
  {#if showConfig}
    <div class="modal-backdrop">
      <button class="scrim" type="button" aria-label="Schließen" onclick={() => (showConfig = false)}></button>
      <div class="modal" role="dialog" aria-modal="true" aria-label="Gruppen verwalten">
        <div class="modal-head">
          <h3>Gruppen verwalten</h3>
          <button class="rm" type="button" onclick={() => (showConfig = false)} title="Schließen" aria-label="Schließen">✕</button>
        </div>
        <p class="hint">Änderungen werden automatisch gespeichert.</p>
        {#if form?.groupError}<p class="msg err">{form.groupError}</p>{/if}
        {#if form?.groupOk}<p class="msg ok">{form.groupOk}</p>{/if}
        <div class="groups">
          {#each data.groups as g (g.id)}
            <form class="grow" method="POST" action="?/renameGroup" use:enhance={keep}>
              <input type="hidden" name="id" value={g.id} />
              <input
                class="g-name"
                name="name"
                value={g.name}
                oninput={(e) => debouncedSubmit(e.currentTarget.form)}
                onblur={(e) => e.currentTarget.form?.requestSubmit()}
              />
              <button class="iconbtn danger" type="submit" formaction="?/deleteGroup" title="Gruppe löschen" aria-label="Gruppe löschen">🗑</button>
            </form>
          {/each}
        </div>
        <form class="inline" method="POST" action="?/addGroup" use:enhance={() => async ({ update }) => update({ reset: true })}>
          <input name="name" placeholder="Neue Gruppe" required />
          <button class="btn" type="submit">+ Gruppe</button>
        </form>
      </div>
    </div>
  {/if}
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
    margin: 0.3rem 0;
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
    gap: 0.8rem 1rem;
    flex-wrap: wrap;
    margin-bottom: 0.8rem;
  }
  .topbar-r {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    flex-wrap: wrap;
  }
  .topbar-r .hh {
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    font-size: 0.85rem;
  }

  /* Schnell-Erfassung */
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
  .grow input {
    border: 2px solid var(--ink);
    border-radius: var(--radius);
    padding: 0.45rem 0.55rem;
    font: inherit;
    background: #fff;
  }
  .quick .f-name {
    flex: 3 1 12rem;
  }
  .quick .f-amt {
    flex: 0 0 4.5rem;
    width: 4.5rem;
  }
  .quick .f-grp {
    flex: 1 1 8rem;
  }

  /* Nebeninfos (Standardartikel / kürzlich eingekauft) – bewusst subtil */
  .aux {
    margin: 0 0 1.4rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .aux-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.45rem;
  }
  .aux-h {
    font-weight: 700;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    margin-right: 0.2rem;
  }
  .muted {
    color: var(--muted);
    font-size: 0.9rem;
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
    font-size: 0.85rem;
    padding: 0.25rem 0.15rem 0.25rem 0.65rem;
    cursor: pointer;
  }
  .chip .chip-x {
    border: 0;
    background: none;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    color: var(--muted);
    font: inherit;
  }
  .chip .chip-x:hover {
    color: var(--red);
  }
  .chip.suggest {
    border-style: dashed;
    padding: 0.3rem 0.65rem;
    font-weight: 600;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .addbtn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.9rem;
    height: 1.9rem;
    padding: 0;
    border: 2px dashed var(--ink);
    border-radius: 50%;
    background: #fff;
    cursor: pointer;
    color: var(--ink);
  }
  .addbtn svg {
    width: 14px;
    height: 14px;
    display: block;
  }
  .addbtn:hover {
    background: var(--paper-2);
  }

  /* Bereiche – die Protagonisten */
  .areas {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1.2rem;
  }
  .area {
    border: 3px solid var(--ink);
    border-radius: var(--radius);
    background: #fff;
    box-shadow: 6px 6px 0 var(--ink);
    overflow: hidden;
  }
  .area-h {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.7rem 0.9rem;
    border-bottom: 3px solid var(--ink);
  }
  .area--pantry .area-h {
    background: var(--yellow);
  }
  .area--freezer .area-h {
    background: var(--blue);
    color: #fff;
  }
  .area-ic {
    font-size: 1.5rem;
    line-height: 1;
  }
  .area-h h3 {
    margin: 0;
    flex: 1;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 1.15rem;
    font-weight: 700;
  }
  .area-count {
    font-weight: 700;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0.15rem 0.55rem;
    border: 2px solid var(--ink);
    border-radius: 999px;
    background: #fff;
    color: var(--ink);
  }
  .area-body {
    padding: 0.6rem 0.9rem 0.9rem;
  }

  .grp {
    margin-bottom: 0.7rem;
  }
  .grp-h {
    font-weight: 700;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    margin: 0.5rem 0 0.25rem;
    border-bottom: 2px solid var(--paper-2);
    padding-bottom: 0.15rem;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 0;
    border-bottom: 1px solid var(--paper-2);
  }
  .item:last-child {
    border-bottom: 0;
  }
  .item.islow {
    background: #fff7e6;
  }
  .i-name {
    flex: 1;
    min-width: 0;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .i-ctrl {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    flex: none;
  }
  .badge-low {
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #9a6a00;
    background: #ffe7a8;
    border: 1.5px solid #d8a417;
    border-radius: 999px;
    padding: 0.05rem 0.4rem;
  }

  /* Spinner */
  .spin {
    display: inline-flex;
    align-items: center;
    border: 2px solid var(--ink);
    border-radius: 999px;
    overflow: hidden;
    background: #fff;
  }
  .spin .sp {
    border: 0;
    background: none;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
    width: 1.6rem;
    height: 1.7rem;
    line-height: 1;
  }
  .spin .sp:hover {
    background: var(--paper-2);
  }
  .spin .amt {
    min-width: 1.4rem;
    text-align: center;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .lowbtn,
  .rm {
    border: 2px solid transparent;
    background: none;
    cursor: pointer;
    font: inherit;
    line-height: 1;
    padding: 0.25rem 0.35rem;
    border-radius: var(--radius);
    opacity: 0.55;
  }
  .lowbtn:hover,
  .rm:hover {
    opacity: 1;
    background: var(--paper-2);
  }
  .lowbtn.on {
    opacity: 1;
    border-color: #d8a417;
  }
  .rm:hover {
    color: var(--red);
  }
  .grp-sel {
    border: 2px solid var(--paper-2);
    border-radius: var(--radius);
    background: #fff;
    font: inherit;
    font-size: 0.8rem;
    padding: 0.2rem 0.25rem;
    max-width: 8.5rem;
    color: var(--muted);
  }
  .grp-sel:hover {
    border-color: var(--ink);
  }

  /* Popup */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgba(26, 26, 26, 0.45);
  }
  .scrim {
    position: absolute;
    inset: 0;
    background: none;
    border: 0;
    margin: 0;
    padding: 0;
    cursor: default;
  }
  .modal {
    position: relative;
    z-index: 1;
    width: min(460px, 100%);
    max-height: 85vh;
    overflow: auto;
    background: var(--paper);
    border: 2.5px solid var(--ink);
    border-radius: var(--radius);
    box-shadow: 6px 6px 0 var(--ink);
    padding: 1rem 1.1rem 1.1rem;
  }
  .modal .hint {
    margin: 0 0 0.7rem;
    font-size: 0.82rem;
    color: var(--muted);
  }
  .modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.7rem;
  }
  .modal-head h3 {
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .groups {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    margin-bottom: 0.8rem;
  }
  .grow {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .grow .g-name {
    flex: 1;
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
  }
  .inline input {
    flex: 1 1 9rem;
  }
</style>
