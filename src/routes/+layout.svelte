<script lang="ts">
  import { signOut } from "@auth/sveltekit/client";
  import "../app.css";
  import type { LayoutData } from "./$types";

  let { data, children }: { data: LayoutData; children: import("svelte").Snippet } = $props();

  let menuOpen = $state(false);
  const close = () => (menuOpen = false);
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
        <a class="navbtn" href="/add" onclick={close}>+ Hinzufügen</a>
        {#if data.user.role === "owner"}<a class="navbtn" href="/admin/members" onclick={close}>Mitglieder</a>{/if}
      </div>
      <button class="navbtn logout" onclick={() => signOut({ callbackUrl: "/login" })}>Abmelden</button>
    </nav>
  {/if}
</header>

<main>
  {@render children()}
</main>
