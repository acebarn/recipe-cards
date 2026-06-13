<script lang="ts">
  import { signOut } from "@auth/sveltekit/client";
  import "../app.css";
  import type { LayoutData } from "./$types";

  let { data, children }: { data: LayoutData; children: import("svelte").Snippet } = $props();
</script>

<header class="app-header">
  <h1><a href="/" style="color: inherit;">🍳 Rezepte</a></h1>
  {#if data.user && data.user.status === "approved"}
    <nav class="nav">
      <a href="/add">+ Hinzufügen</a>
      {#if data.user.role === "owner"}<a href="/admin/members">Mitglieder</a>{/if}
      <button class="linkbtn" onclick={() => signOut({ callbackUrl: "/login" })}>Abmelden</button>
    </nav>
  {/if}
</header>

<main>
  {@render children()}
</main>
