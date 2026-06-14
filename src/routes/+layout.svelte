<script lang="ts">
  import { signOut } from "@auth/sveltekit/client";
  import "../app.css";
  import type { LayoutData } from "./$types";

  let { data, children }: { data: LayoutData; children: import("svelte").Snippet } = $props();
</script>

<header class="app-header">
  <a class="brand" href="/" aria-label="Rezepte – Startseite">
    <svg class="logo" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="23" cy="26" r="13" fill="#f3c019" />
      <path d="M37 12 H55 V30 Z" fill="#e0382c" />
      <rect x="35" y="38" width="17" height="17" fill="#2350a8" />
      <rect x="11" y="46" width="18" height="6" rx="3" fill="#fff" />
    </svg>
    <span class="wordmark">Rezepte</span>
  </a>
  {#if data.user && data.user.status === "approved"}
    <nav class="nav">
      <a href="/restefest">🥕 Restefest</a>
      <a href="/add">+ Hinzufügen</a>
      {#if data.user.role === "owner"}<a href="/admin/members">Mitglieder</a>{/if}
      <button class="linkbtn" onclick={() => signOut({ callbackUrl: "/login" })}>Abmelden</button>
    </nav>
  {/if}
</header>

<main>
  {@render children()}
</main>
