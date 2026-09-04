<script lang="ts">
  import type { PageData } from "./$types";
  import type { Count } from "$core/services/stats.ts";

  let { data }: { data: PageData } = $props();
  let s = $derived(data.stats);
  let u = $derived(data.usage);

  // ---- Nutzung ----
  const AKTION_LABEL: Record<string, string> = {
    recipe_view: "Aufrufe",
    cook_start: "Kochmodus",
    pdf_export: "Rezeptkarten",
    import: "Importe",
    shopping_add: "Einkaufsliste",
    plan_meal: "Wochenplan",
    search: "Suchen",
  };
  const QUELLE_LABEL: Record<string, string> = {
    link: "Link",
    reel: "Reel",
    text: "Text",
    photo: "Foto",
  };
  const zaehler = (aktion: string) => u.perAction.find((a) => a.action === aktion)?.count ?? 0;
  let importBars = $derived(
    u.importSources.map((i) => ({ label: QUELLE_LABEL[i.action] ?? i.action, count: i.count })),
  );
  // Tagesreihe zu Wochen bündeln — bei 90 Tagen sind Tagesbalken unlesbar.
  let wochenBars = $derived.by(() => {
    const map = new Map<string, number>();
    for (const d of u.perDay) {
      const dt = new Date(d.day + "T00:00:00Z");
      const montag = new Date(dt);
      montag.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
      const key = montag.toISOString().slice(0, 10);
      map.set(key, (map.get(key) ?? 0) + d.count);
    }
    return [...map.entries()].map(([tag, count]) => ({
      label: new Date(tag + "T00:00:00Z").toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }),
      count,
    }));
  });
  const nieLabel = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("de-DE", { month: "short", year: "numeric" }) : "noch nie";

  const PALETTE = ["var(--red)", "var(--blue)", "var(--yellow)"];
  const colorAt = (i: number) => PALETTE[((i % 3) + 3) % 3];
  const pct = (n: number, max: number) => (max > 0 ? Math.round((n / max) * 100) : 0);
  const maxOf = (items: Count[]) => Math.max(1, ...items.map((i) => i.count));

  // ---- Welt-Bubble-Karte ----
  let sel = $state<string | null>(null);
  const toX = (lon: number) => lon + 180;
  const toY = (lat: number) => 90 - lat;
  const bubbleR = (c: number) => 3 + Math.sqrt(c) * 2.6;
  let mapped = $derived(s.regions.filter((r) => r.lon != null && r.lat != null));
  let unmapped = $derived(s.regions.filter((r) => r.lon == null || r.lat == null));
  let selRegion = $derived(s.regions.find((r) => r.region === sel) ?? null);
  const continents: [number, number, number, number, string][] = [
    // cx, cy, rx, ry (in lon/lat-Space → +180 / 90-lat), label
    [80, 45, 33, 22, "Nordamerika"],
    [120, 105, 16, 24, "Südamerika"],
    [195, 38, 20, 12, "Europa"],
    [198, 88, 24, 30, "Afrika"],
    [275, 46, 48, 27, "Asien"],
    [314, 115, 15, 11, "Ozeanien"],
  ];

  // ---- Donut (Schwierigkeit) ----
  type Seg = { label: string; count: number; color: string; pct: number; offset: number };
  let donut = $derived.by<Seg[]>(() => {
    const tot = s.difficulties.reduce((a, b) => a + b.count, 0) || 1;
    let acc = 0;
    return s.difficulties.map((d, i) => {
      const p = (d.count / tot) * 100;
      const seg = { label: d.label, count: d.count, color: colorAt(i), pct: p, offset: 25 - acc };
      acc += p;
      return seg;
    });
  });

  // ---- Tag-Wolke ----
  let tagMax = $derived(maxOf(s.tags));
  const tagSize = (c: number) => 0.8 + (c / tagMax) * 1.4;

  // ---- Zeitleiste ----
  let tlMax = $derived(Math.max(1, ...s.timeline.map((t) => t.count)));
  const monthLabel = (m: string) => {
    const [y, mo] = m.split("-");
    return `${mo}/${y.slice(2)}`;
  };
</script>

<svelte:head><title>Statistik · SCHMACKOFATZ</title></svelte:head>

<h1 class="page-title">Statistik</h1>
<p class="lead">Zahlen, Daten &amp; Fakten zur Sammlung — {s.total} Rezepte aus {s.regionCount} Regionen.</p>

<div class="sectionhead">
  <h2 class="sectitle">Nutzung</h2>
  <nav class="zeitraum">
    {#each [30, 90, 365] as t (t)}
      <a href={`/statistik?tage=${t}`} class:aktiv={u.days === t}>{t === 365 ? "1 Jahr" : `${t} Tage`}</a>
    {/each}
  </nav>
</div>

{#if u.total === 0}
  <section class="panel">
    <p class="leer">
      Noch keine Nutzungsdaten in diesem Zeitraum.
      {#if u.firstEventAt}
        Aufgezeichnet wird seit {new Date(u.firstEventAt).toLocaleDateString("de-DE")}.
      {:else}
        Die Aufzeichnung beginnt mit der nächsten Nutzung.
      {/if}
    </p>
  </section>
{:else}
  <section class="kpis">
    {@render kpi(String(zaehler("recipe_view")), "Aufrufe", "var(--blue)")}
    {@render kpi(String(zaehler("cook_start")), "mal gekocht", "var(--red)")}
    {@render kpi(String(zaehler("pdf_export")), "Karten gedruckt", "var(--yellow)")}
    {@render kpi(String(zaehler("search")), "Suchen", "var(--blue)")}
    {@render kpi(String(zaehler("import")), "Importe", "var(--red)")}
    {@render kpi(String(zaehler("shopping_add")), "auf die Liste", "var(--yellow)")}
    {@render kpi(String(zaehler("plan_meal")), "eingeplant", "var(--blue)")}
    {@render kpi(String(u.total), "Aktionen gesamt", "var(--red)")}
  </section>

  <div class="two">
    <section class="panel">
      <h2><span class="mk" style="background:var(--red)"></span>Meistgekocht</h2>
      {@render rezeptliste(u.topCooked, "mal")}
    </section>
    <section class="panel">
      <h2><span class="mk" style="background:var(--blue)"></span>Meistaufgerufen</h2>
      {@render rezeptliste(u.topViewed, "×")}
    </section>
  </div>

  <div class="two">
    <section class="panel">
      <h2><span class="mk" style="background:var(--yellow)"></span>Suchen ohne Treffer</h2>
      {#if u.emptySearches.length}
        <p class="hint">Wonach gesucht wurde, ohne dass es ein Rezept gab — die Wunschliste fürs nächste Importieren.</p>
        {@render suchliste(u.emptySearches)}
      {:else}
        <p class="leer">Jede Suche hatte Treffer.</p>
      {/if}
    </section>
    <section class="panel">
      <h2><span class="mk" style="background:var(--red)"></span>Häufigste Suchen</h2>
      {#if u.topSearches.length}
        {@render suchliste(u.topSearches)}
      {:else}
        <p class="leer">Noch keine Suchen aufgezeichnet.</p>
      {/if}
    </section>
  </div>

  <div class="two">
    <section class="panel">
      <h2><span class="mk" style="background:var(--blue)"></span>Karten gedruckt</h2>
      {@render rezeptliste(u.topPrinted, "×")}
    </section>
    <section class="panel">
      <h2><span class="mk" style="background:var(--yellow)"></span>Woher die Rezepte kamen</h2>
      {#if importBars.length}
        {@render bars(importBars)}
      {:else}
        <p class="leer">Kein Import in diesem Zeitraum.</p>
      {/if}
    </section>
  </div>

  {#if wochenBars.length > 1}
    <section class="panel">
      <h2><span class="mk" style="background:var(--red)"></span>Aktivität je Woche</h2>
      {@render bars(wochenBars)}
    </section>
  {/if}

  {#if u.neglected.length}
    <section class="panel">
      <h2><span class="mk" style="background:var(--blue)"></span>Lange nicht angefasst</h2>
      <p class="hint">Rezepte, die im gewählten Zeitraum niemand geöffnet hat.</p>
      <ul class="rliste">
        {#each u.neglected as r (r.slug)}
          <li><a href={`/recipe/${r.slug}`}>{r.title}</a><span class="rval">{nieLabel(r.lastAt)}</span></li>
        {/each}
      </ul>
    </section>
  {/if}
{/if}

<h2 class="sectitle">Sammlung</h2>

<!-- KPIs -->
<section class="kpis">
  {@render kpi(String(s.total), "Rezepte", "var(--red)")}
  {@render kpi(String(s.categoryCount), "Kategorien", "var(--blue)")}
  {@render kpi(String(s.regionCount), "Regionen", "var(--yellow)")}
  {@render kpi(s.avgMinutes != null ? `${s.avgMinutes}′` : "–", "Ø Zeit", "var(--blue)")}
  {@render kpi(String(s.avgIngredients), "Ø Zutaten", "var(--yellow)")}
  {@render kpi(String(s.avgSteps), "Ø Schritte", "var(--red)")}
  {@render kpi(String(s.uniqueIngredients), "Zutaten gesamt", "var(--red)")}
  {@render kpi(`${pct(s.withImage, s.total)}%`, "mit Bild", "var(--blue)")}
</section>

<!-- Kategorien -->
<section class="panel">
  <h2><span class="mk" style="background:var(--red)"></span>Nach Kategorie</h2>
  {@render bars(s.categories)}
</section>

<!-- Welt-Karte -->
<section class="panel">
  <h2><span class="mk" style="background:var(--blue)"></span>Nach Herkunft</h2>
  <div class="map-wrap">
    <svg class="worldmap" viewBox="0 0 360 180" role="img" aria-label="Weltkarte der Rezept-Herkünfte">
      <rect x="0" y="0" width="360" height="180" fill="var(--accent-soft, #eef1f6)" />
      {#each [30, 60, 90, 120, 150] as gy (gy)}<line x1="0" y1={gy} x2="360" y2={gy} class="grat" />{/each}
      {#each [60, 120, 180, 240, 300] as gx (gx)}<line x1={gx} y1="0" x2={gx} y2="180" class="grat" />{/each}
      {#each continents as [cx, cy, rx, ry, label] (label)}
        <ellipse {cx} {cy} {rx} {ry} class="cont" />
        <text x={cx} y={cy} class="cont-label">{label}</text>
      {/each}
      {#each mapped as r, i (r.region)}
        <g
          class="bubble"
          class:active={sel === r.region}
          role="button"
          tabindex="0"
          onclick={() => (sel = sel === r.region ? null : r.region)}
          onkeydown={(e) => (e.key === "Enter" || e.key === " ") && (sel = sel === r.region ? null : r.region)}
        >
          <circle cx={toX(r.lon!)} cy={toY(r.lat!)} r={bubbleR(r.count)} fill={colorAt(i)} />
          <text x={toX(r.lon!)} y={toY(r.lat!)} class="bub-n">{r.count}</text>
          <title>{r.region}: {r.count}</title>
        </g>
      {/each}
    </svg>
  </div>

  <div class="region-list">
    {#each s.regions as r, i (r.region)}
      <button class="region-chip" class:active={sel === r.region} onclick={() => (sel = sel === r.region ? null : r.region)}>
        <span class="rc-dot" style="background:{r.lon != null ? colorAt(i) : 'var(--muted)'}"></span>
        {r.emoji} {r.region}<span class="rc-n">{r.count}</span>
      </button>
    {/each}
  </div>
  {#if unmapped.length}
    <p class="hint">Ohne festen Kartenpunkt: {unmapped.map((r) => `${r.emoji} ${r.region}`).join(", ")}.</p>
  {/if}

  {#if selRegion}
    <div class="region-detail">
      <h3>{selRegion.emoji} {selRegion.region} — {selRegion.count} Rezept{selRegion.count === 1 ? "" : "e"}</h3>
      <div class="rd-list">
        {#each selRegion.recipes as rec (rec.slug)}
          <a href={`/recipe/${rec.slug}`}>{rec.title}</a>
        {/each}
      </div>
    </div>
  {/if}
</section>

<!-- Top-Zutaten -->
<section class="panel">
  <h2><span class="mk" style="background:var(--yellow)"></span>Häufigste Zutaten</h2>
  <p class="sub">In wie vielen Rezepten die Zutat vorkommt.</p>
  {@render bars(s.topIngredients)}
</section>

<!-- Schwierigkeit + Zeitaufwand nebeneinander -->
<div class="two">
  <section class="panel">
    <h2><span class="mk" style="background:var(--red)"></span>Schwierigkeit</h2>
    <div class="donut-wrap">
      <svg class="donut" viewBox="0 0 42 42" role="img" aria-label="Schwierigkeitsverteilung">
        <circle class="donut-bg" cx="21" cy="21" r="15.915" />
        {#each donut as seg (seg.label)}
          <circle
            cx="21"
            cy="21"
            r="15.915"
            fill="none"
            stroke={seg.color}
            stroke-width="6"
            stroke-dasharray={`${seg.pct} ${100 - seg.pct}`}
            stroke-dashoffset={seg.offset}
          />
        {/each}
        <text x="21" y="21" class="donut-center">{s.total}</text>
      </svg>
      <ul class="legend">
        {#each donut as seg (seg.label)}
          <li><span class="lg-dot" style="background:{seg.color}"></span>{seg.label}<b>{seg.count}</b></li>
        {/each}
      </ul>
    </div>
  </section>

  <section class="panel">
    <h2><span class="mk" style="background:var(--blue)"></span>Zeitaufwand</h2>
    {@render bars(s.timeBuckets)}
    <h2 class="mt"><span class="mk" style="background:var(--yellow)"></span>Portionen</h2>
    {@render bars(s.servings)}
  </section>
</div>

<!-- Zeitleiste -->
<section class="panel">
  <h2><span class="mk" style="background:var(--red)"></span>Neuzugänge über die Zeit</h2>
  <div class="timeline">
    {#each s.timeline as t, i (t.month)}
      <div class="tl-col" title={`${t.count} Rezept(e)`}>
        <span class="tl-bar" style="height:{pct(t.count, tlMax)}%; background:{colorAt(i)}"></span>
        <span class="tl-cap">{monthLabel(t.month)}</span>
      </div>
    {/each}
  </div>
</section>

<!-- Tags + Zubehör -->
<div class="two">
  <section class="panel">
    <h2><span class="mk" style="background:var(--blue)"></span>Tag-Wolke</h2>
    <div class="cloud">
      {#each s.tags as t, i (t.label)}
        <span class="cloud-tag" style="font-size:{tagSize(t.count)}rem; color:{colorAt(i)}">{t.label}</span>
      {/each}
    </div>
  </section>

  <section class="panel">
    <h2><span class="mk" style="background:var(--yellow)"></span>Meistgenutztes Zubehör</h2>
    {@render bars(s.equipment)}
  </section>
</div>

<!-- Superlative -->
<section class="panel">
  <h2><span class="mk" style="background:var(--red)"></span>Rekorde</h2>
  <div class="records">
    {@render record("⚡", "Am schnellsten", s.superlatives.quickest)}
    {@render record("🐢", "Am aufwändigsten", s.superlatives.longest)}
    {@render record("🥗", "Meiste Zutaten", s.superlatives.mostIngredients)}
    {@render record("📋", "Meiste Schritte", s.superlatives.mostSteps)}
    {@render record("🔧", "Meiste Geräte", s.superlatives.mostEquipment)}
  </div>
</section>

{#snippet rezeptliste(items: { slug: string; title: string; count: number }[], einheit: string)}
  {#if items.length}
    <ul class="rliste">
      {#each items as r (r.slug)}
        <li><a href={`/recipe/${r.slug}`}>{r.title}</a><span class="rval">{r.count} {einheit}</span></li>
      {/each}
    </ul>
  {:else}
    <p class="leer">Nichts aufgezeichnet.</p>
  {/if}
{/snippet}

{#snippet suchliste(items: { query: string; count: number; hits: number }[])}
  <ul class="rliste">
    {#each items as q (q.query)}
      <li><span class="qtext">„{q.query}"</span><span class="rval">{q.count}× · {q.hits} Treffer</span></li>
    {/each}
  </ul>
{/snippet}

{#snippet kpi(value: string, label: string, color: string)}
  <div class="kpi" style="--kc:{color}">
    <span class="kpi-val">{value}</span>
    <span class="kpi-label">{label}</span>
  </div>
{/snippet}

{#snippet bars(items: Count[])}
  {@const max = maxOf(items)}
  <div class="bars">
    {#each items as it, i (it.label)}
      <div class="bar-row">
        <span class="bar-label" title={it.label}>{it.label}</span>
        <span class="bar-track"><span class="bar-fill" style="width:{pct(it.count, max)}%; background:{colorAt(i)}"></span></span>
        <span class="bar-val">{it.count}</span>
      </div>
    {/each}
  </div>
{/snippet}

{#snippet record(icon: string, label: string, sup?: { slug: string; title: string; value: string })}
  {#if sup}
    <a class="record" href={`/recipe/${sup.slug}`}>
      <span class="rec-icon">{icon}</span>
      <span class="rec-body">
        <span class="rec-label">{label}</span>
        <span class="rec-title">{sup.title}</span>
        <span class="rec-val">{sup.value}</span>
      </span>
    </a>
  {/if}
{/snippet}

<style>
  .sectionhead {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .sectitle {
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin: 1.8rem 0 0.9rem;
  }
  .sectionhead .sectitle {
    margin-top: 0.4rem;
  }
  .zeitraum {
    display: flex;
    gap: 0.4rem;
  }
  .zeitraum a {
    border: 2.5px solid var(--ink);
    border-radius: var(--radius);
    padding: 0.15rem 0.6rem;
    font-size: 0.78rem;
    font-weight: 600;
    text-decoration: none;
    color: var(--ink);
    background: #fff;
  }
  .zeitraum a.aktiv {
    background: var(--ink);
    color: #fff;
  }
  .rliste {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .rliste li {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.8rem;
    border-bottom: 1px dotted var(--muted);
    padding-bottom: 0.25rem;
  }
  .rliste a {
    color: var(--ink);
    font-weight: 600;
  }
  .qtext {
    font-weight: 600;
  }
  .rval {
    color: var(--muted);
    font-size: 0.8rem;
    white-space: nowrap;
  }
  .hint,
  .leer {
    color: var(--muted);
    font-size: 0.85rem;
    margin: 0 0 0.6rem;
  }
  .page-title {
    margin: 0.2rem 0 0.2rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .lead {
    color: var(--muted);
    margin: 0 0 1.5rem;
  }

  .kpis {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.7rem;
    margin-bottom: 1.6rem;
  }
  @media (max-width: 640px) {
    .kpis {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  .kpi {
    background: #fff;
    border: 2.5px solid var(--ink);
    border-left: 8px solid var(--kc);
    border-radius: var(--radius);
    box-shadow: 3px 3px 0 var(--ink);
    padding: 0.7rem 0.8rem;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .kpi-val {
    font-size: 1.7rem;
    font-weight: 700;
    line-height: 1;
  }
  .kpi-label {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
    font-weight: 600;
  }

  .panel {
    background: #fff;
    border: 2.5px solid var(--ink);
    border-radius: var(--radius);
    box-shadow: 4px 4px 0 var(--ink);
    padding: 1.1rem 1.2rem;
    margin-bottom: 1.4rem;
  }
  .panel h2 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1.05rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin: 0 0 0.9rem;
  }
  .panel h2.mt {
    margin-top: 1.4rem;
  }
  .mk {
    width: 15px;
    height: 15px;
    border: 2px solid var(--ink);
    flex: none;
  }
  .sub,
  .hint {
    color: var(--muted);
    font-size: 0.82rem;
    margin: -0.4rem 0 0.8rem;
  }
  .hint {
    margin: 0.7rem 0 0;
  }

  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.4rem;
  }
  @media (max-width: 720px) {
    .two {
      grid-template-columns: 1fr;
      gap: 0;
    }
  }

  /* Balken */
  .bars {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .bar-row {
    display: grid;
    grid-template-columns: 8.5rem 1fr 2.2rem;
    align-items: center;
    gap: 0.6rem;
  }
  .bar-label {
    font-size: 0.82rem;
    font-weight: 600;
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bar-track {
    background: var(--paper);
    border: 1.5px solid var(--ink);
    height: 1.25rem;
    border-radius: 2px;
    overflow: hidden;
  }
  .bar-fill {
    display: block;
    height: 100%;
    min-width: 2px;
    transition: width 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .bar-val {
    font-weight: 700;
    font-size: 0.85rem;
    text-align: right;
  }
  @media (max-width: 520px) {
    .bar-row {
      grid-template-columns: 6rem 1fr 1.8rem;
      gap: 0.4rem;
    }
  }

  /* Welt-Karte */
  .map-wrap {
    border: 2px solid var(--ink);
    border-radius: var(--radius);
    overflow: hidden;
    background: var(--accent-soft, #eef1f6);
  }
  .worldmap {
    display: block;
    width: 100%;
    height: auto;
  }
  .grat {
    stroke: var(--ink);
    stroke-width: 0.2;
    opacity: 0.18;
  }
  .cont {
    fill: var(--ink);
    opacity: 0.1;
  }
  .cont-label {
    fill: var(--ink);
    opacity: 0.4;
    font-size: 4px;
    font-weight: 700;
    text-anchor: middle;
    dominant-baseline: middle;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .bubble {
    cursor: pointer;
  }
  .bubble circle {
    stroke: var(--ink);
    stroke-width: 1.2;
    transition: opacity 0.15s;
  }
  .bubble:hover circle {
    opacity: 0.85;
  }
  .bubble.active circle {
    stroke-width: 2.4;
  }
  .bub-n {
    fill: #fff;
    font-size: 4.5px;
    font-weight: 700;
    text-anchor: middle;
    dominant-baseline: central;
    pointer-events: none;
    paint-order: stroke;
    stroke: var(--ink);
    stroke-width: 0.6;
  }
  .region-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-top: 0.9rem;
  }
  .region-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.25rem 0.6rem;
    border: 2px solid var(--ink);
    border-radius: 999px;
    background: #fff;
    font: inherit;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
  }
  .region-chip.active {
    background: var(--ink);
    color: #fff;
  }
  .rc-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    border: 1.5px solid var(--ink);
  }
  .rc-n {
    font-weight: 700;
    opacity: 0.7;
  }
  .region-detail {
    margin-top: 1rem;
    padding-top: 0.9rem;
    border-top: 2px dashed var(--ink);
  }
  .region-detail h3 {
    margin: 0 0 0.5rem;
    font-size: 0.95rem;
  }
  .rd-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .rd-list a {
    padding: 0.2rem 0.6rem;
    border: 1.5px solid var(--ink);
    border-radius: var(--radius);
    background: var(--paper);
    color: var(--ink);
    font-size: 0.82rem;
    font-weight: 600;
  }
  .rd-list a:hover {
    background: var(--accent, var(--blue));
    color: #fff;
  }

  /* Donut */
  .donut-wrap {
    display: flex;
    align-items: center;
    gap: 1.2rem;
    flex-wrap: wrap;
  }
  .donut {
    width: 150px;
    height: 150px;
    flex: none;
    transform: rotate(0deg);
  }
  .donut-bg {
    fill: none;
    stroke: var(--paper);
    stroke-width: 6;
  }
  .donut-center {
    fill: var(--ink);
    font-size: 9px;
    font-weight: 700;
    text-anchor: middle;
    dominant-baseline: central;
  }
  .legend {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .legend li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    font-weight: 600;
  }
  .legend b {
    margin-left: auto;
  }
  .lg-dot {
    width: 12px;
    height: 12px;
    border: 1.5px solid var(--ink);
  }

  /* Zeitleiste */
  .timeline {
    display: flex;
    align-items: flex-end;
    gap: 0.4rem;
    height: 160px;
    padding-top: 0.5rem;
    overflow-x: auto;
  }
  .tl-col {
    flex: 1;
    min-width: 1.6rem;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    gap: 0.3rem;
  }
  .tl-bar {
    width: 100%;
    max-width: 2.2rem;
    border: 2px solid var(--ink);
    border-bottom: 0;
    min-height: 3px;
    transition: height 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .tl-cap {
    font-size: 0.65rem;
    font-weight: 600;
    color: var(--muted);
    white-space: nowrap;
  }

  /* Tag-Wolke */
  .cloud {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.2rem 0.7rem;
    line-height: 1.3;
  }
  .cloud-tag {
    font-weight: 700;
  }

  /* Rekorde */
  .records {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 0.7rem;
  }
  .record {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.6rem 0.7rem;
    border: 2px solid var(--ink);
    border-radius: var(--radius);
    background: var(--paper);
    color: var(--ink);
    box-shadow: 2px 2px 0 var(--ink);
  }
  .record:hover {
    transform: translate(-1px, -1px);
    box-shadow: 4px 4px 0 var(--ink);
  }
  .rec-icon {
    font-size: 1.5rem;
    flex: none;
  }
  .rec-body {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .rec-label {
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
    font-weight: 700;
  }
  .rec-title {
    font-weight: 700;
    font-size: 0.88rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rec-val {
    font-size: 0.78rem;
    color: var(--muted);
    font-weight: 600;
  }
</style>
