<script lang="ts">
  import { signOut } from "@auth/sveltekit/client";
  import { navigating } from "$app/state";
  import "../app.css";
  import type { LayoutData } from "./$types";

  let { data, children }: { data: LayoutData; children: import("svelte").Snippet } = $props();

  let menuOpen = $state(false);
  const close = () => (menuOpen = false);

  // Manche Seiten holen beim Laden Daten von aussen (Einkaufsliste und Inventar
  // von Bring, Kalender von Google). Bis dahin passiert sichtbar nichts — der
  // Balken zeigt, dass die App arbeitet. Erst nach 150ms, damit schnelle
  // Wechsel nicht flackern.
  let navLaeuft = $state(false);
  $effect(() => {
    if (!navigating.to) {
      navLaeuft = false;
      return;
    }
    const t = setTimeout(() => (navLaeuft = true), 150);
    return () => clearTimeout(t);
  });
</script>

<header class="app-header" class:menu-open={menuOpen}>
  <a class="brand" href="/" aria-label="Rezepte – Startseite" onclick={close}>
    <svg class="logo" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="23" cy="26" r="13" fill="#f3c019" />
      <path d="M37 12 H55 V30 Z" fill="#e0382c" />
      <rect x="35" y="38" width="17" height="17" fill="#2350a8" />
      <rect x="11" y="46" width="18" height="6" rx="3" fill="#fff" />
    </svg>
    <span class="wordmark">SCHMACKOFATZ</span>
  </a>
  {#if data.user && data.user.status === "approved"}
    <button
      class="burger"
      aria-label="Menü"
      aria-expanded={menuOpen}
      onclick={() => (menuOpen = !menuOpen)}
    >
      {menuOpen ? "✕" : "☰"}
    </button>
    <nav class="nav" class:open={menuOpen}>
      <div class="nav-actions">
        <a class="navbtn" href="/restefest" onclick={close}>🥕 Restefest</a>
        <a class="navbtn" href="/einkaufsliste" onclick={close}>🛒 Einkaufsliste</a>
        {#if data.inventoryEnabled}
          <a class="navbtn" href="/inventar" onclick={close}>📦 Inventar</a>
        {/if}
        <a class="navbtn" href="/wochenplan" onclick={close}>📅 Wochenplan</a>
        <a class="navbtn" href="/statistik" onclick={close}>📊 Statistik</a>
        <a class="navbtn" href="/add" onclick={close}>+ Hinzufügen</a>
        <a class="navbtn" href="/feedback" onclick={close}>💬 Rückmeldung</a>
        <a class="navbtn" href="/einstellungen" onclick={close}>⚙️ Einstellungen</a>
      </div>
      <button class="navbtn logout" onclick={() => signOut({ callbackUrl: "/login" })}>Abmelden</button>
    </nav>
  {/if}
</header>

{#if navLaeuft}
  <div class="navbalken" role="status" aria-live="polite" aria-label="Seite wird geladen"></div>
{/if}

<main>
  {@render children()}
</main>

<style>
  /* Ladebalken bei Seitenwechseln, die auf externe Daten warten */
  .navbalken {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    z-index: 100;
    background: linear-gradient(90deg, var(--red), var(--yellow), var(--blue));
    background-size: 200% 100%;
    animation: navlauf 1.1s linear infinite;
  }
  @keyframes navlauf {
    to {
      background-position: -200% 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .navbalken {
      animation: none;
    }
  }
</style>
