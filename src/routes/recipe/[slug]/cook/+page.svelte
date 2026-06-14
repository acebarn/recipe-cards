<script lang="ts">
  import { formatQuantity, scaleIngredient } from "$core/scale.ts";
  import { mentionedIn } from "$lib/cook.ts";
  import { inlineMd } from "$lib/inline-md.ts";
  import { untrack } from "svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  // bewusst einmaliger Initialwert aus der URL (?scale), danach lokaler State
  let scale = $state(untrack(() => data.initialScale));
  let stepIndex = $state(0);
  let showAll = $state(false);

  let total = $derived(data.steps.length);
  let current = $derived(data.steps[stepIndex] ?? "");
  let scaledServings = $derived(data.servings ? formatQuantity(data.servings * scale) : null);

  // flache (unskalierte) Zutatenzeilen fürs Matching
  let flat = $derived(
    data.ingredients.flatMap((s) => s.items.map((line) => ({ section: s.name ?? null, line }))),
  );
  // je Schritt benötigte Zutaten (skaliert): exakte Zuordnung (M3) falls vorhanden,
  // sonst Heuristik. Werkzeuge bleiben heuristisch.
  let needed = $derived.by(() => {
    const exact = data.stepIngredients?.[stepIndex];
    const lines = exact
      ? exact.map((idx) => flat[idx]?.line).filter((l): l is string => !!l)
      : flat.filter((i) => mentionedIn(current, i.line)).map((i) => i.line);
    return lines.map((l) => scaleIngredient(l, scale));
  });
  let neededTools = $derived(data.equipment.filter((e) => mentionedIn(current, e)));
  // alle Zutaten (skaliert), gruppiert
  let groups = $derived(
    data.ingredients.map((s) => ({ name: s.name, items: s.items.map((it) => scaleIngredient(it, scale)) })),
  );

  const prev = () => (stepIndex = Math.max(0, stepIndex - 1));
  const next = () => (stepIndex = Math.min(total - 1, stepIndex + 1));

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") prev();
    else if (e.key === "ArrowRight") next();
  };

  // Bildschirm beim Kochen anlassen (Wake Lock), inkl. Re-Acquire nach Tab-Wechsel.
  $effect(() => {
    let lock: { release?: () => void } | null = null;
    const nav = navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release?: () => void }> } };
    const acquire = async () => {
      try {
        lock = (await nav.wakeLock?.request("screen")) ?? null;
      } catch {
        /* nicht unterstützt → ignorieren */
      }
    };
    acquire();
    const onVis = () => document.visibilityState === "visible" && acquire();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      lock?.release?.();
    };
  });
</script>

<svelte:head><title>Kochen: {data.title}</title></svelte:head>
<svelte:window onkeydown={onKey} />

<div class="cook" style={`--accent:${data.accent};--note-bg:${data.noteBg}`}>
  <header class="cook-top">
    <a class="close" href={`/recipe/${data.slug}`} aria-label="Kochmodus schließen">✕</a>
    <div class="ttl">
      <strong>{data.title}</strong>
      <span class="sub">Schritt {stepIndex + 1} von {total}{scaledServings ? ` · ${scaledServings} Portion${scaledServings === "1" ? "" : "en"}` : ""}</span>
    </div>
    <label class="scale">×<input type="number" min="0.25" max="20" step="0.25" bind:value={scale} /></label>
  </header>

  <div class="progress"><div class="bar" style={`width: ${total ? ((stepIndex + 1) / total) * 100 : 0}%`}></div></div>

  <main class="stage">
    <p class="step-no">Schritt {stepIndex + 1}</p>
    <div class="step-text">{@html inlineMd(current)}</div>

    {#if needed.length || neededTools.length}
      <div class="needed">
        <h3>Jetzt brauchst du</h3>
        <ul>
          {#each needed as n (n)}<li>{n}</li>{/each}
          {#each neededTools as t (t)}<li class="tool">🔧 {t}</li>{/each}
        </ul>
      </div>
    {/if}

    <button class="toggle" onclick={() => (showAll = !showAll)}>
      {showAll ? "Alle Zutaten ausblenden" : "Alle Zutaten anzeigen"}
    </button>
    {#if showAll}
      <div class="all">
        {#each groups as g (g.name ?? "_")}
          {#if g.name}<h4>{g.name}</h4>{/if}
          <ul>{#each g.items as it (it)}<li>{it}</li>{/each}</ul>
        {/each}
      </div>
    {/if}
  </main>

  <nav class="cook-nav">
    <button onclick={prev} disabled={stepIndex === 0}>← Zurück</button>
    {#if stepIndex < total - 1}
      <button class="primary" onclick={next}>Weiter →</button>
    {:else}
      <a class="primary done" href={`/recipe/${data.slug}`}>Fertig ✓</a>
    {/if}
  </nav>
</div>

<style>
  .cook { max-width: 720px; margin: 0 auto; }
  .cook-top { display: flex; align-items: center; gap: 0.8rem; }
  .close {
    font-size: 1.1rem;
    color: var(--ink);
    text-decoration: none;
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid var(--ink);
    border-radius: 50%;
    flex: none;
  }
  .ttl { display: flex; flex-direction: column; flex: 1; line-height: 1.2; }
  .ttl strong { text-transform: uppercase; letter-spacing: 0.03em; }
  .ttl .sub { color: var(--muted); font-size: 0.85rem; font-weight: 500; }
  .scale { display: inline-flex; align-items: center; gap: 0.2rem; color: var(--muted); font-weight: 600; }
  .scale input { width: 3.4rem; padding: 0.35rem 0.4rem; border: 2px solid var(--ink); border-radius: var(--radius); font: inherit; background: #fff; }

  .progress { height: 10px; background: #fff; border: 2px solid var(--ink); border-radius: 999px; margin: 0.8rem 0 1.3rem; overflow: hidden; }
  .progress .bar { height: 100%; background: var(--accent); transition: width 0.25s ease; }

  .stage { background: #fff; border: 3px solid var(--ink); border-radius: var(--radius); padding: 1.5rem; min-height: 42vh; box-shadow: 7px 7px 0 var(--accent); }
  .step-no { color: #fff; background: var(--accent); display: inline-block; padding: 0.15rem 0.6rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 0.8rem; font-size: 0.85rem; }
  .step-text { font-size: 1.35rem; line-height: 1.6; }

  .needed { margin-top: 1.5rem; background: var(--note-bg, #f6f1e7); border: 2px solid var(--ink); border-radius: var(--radius); padding: 0.9rem 1.1rem; }
  .needed h3 { margin: 0 0 0.5rem; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.04em; }
  .needed ul { margin: 0; padding: 0; list-style: none; }
  .needed li { position: relative; padding-left: 1.1rem; margin: 0.25rem 0; }
  .needed li::before { content: ""; position: absolute; left: 0; top: 0.5em; width: 8px; height: 8px; background: var(--accent); }
  .needed li.tool::before { display: none; }
  .needed li.tool { padding-left: 0; }

  .toggle { margin-top: 1.1rem; background: none; border: 0; color: var(--accent); cursor: pointer; padding: 0; text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 3px; font: inherit; font-weight: 600; }
  .all { margin-top: 0.6rem; color: #4a4236; }
  .all h4 { margin: 0.7rem 0 0.2rem; }
  .all ul { margin: 0; padding-left: 1.1rem; }

  .cook-nav { position: sticky; bottom: 0; display: flex; gap: 0.8rem; padding: 1rem 0; background: linear-gradient(transparent, var(--paper) 45%); }
  .cook-nav button, .cook-nav a {
    flex: 1;
    text-align: center;
    padding: 0.95rem;
    border-radius: var(--radius);
    border: 2.5px solid var(--ink);
    background: #fff;
    font: inherit;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    cursor: pointer;
    text-decoration: none;
    color: var(--ink);
    box-shadow: 3px 3px 0 var(--ink);
  }
  .cook-nav .primary { background: var(--accent); color: #fff; }
  .cook-nav button:disabled { opacity: 0.35; cursor: default; box-shadow: none; }
</style>
