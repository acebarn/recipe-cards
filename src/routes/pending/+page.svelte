<script lang="ts">
  import { signOut } from "@auth/sveltekit/client";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Warten auf Freigabe</title></svelte:head>

<div class="auth-box">
  <h2>Fast geschafft 👋</h2>
  <p>
    Hallo{data.user ? ` ${data.user.name}` : ""}! Dein Zugang muss noch vom Owner
    freigegeben werden. Sobald das erledigt ist, hast du Zugriff auf die Rezeptbibliothek.
  </p>
  <button class="linkbtn" onclick={() => signOut({ callbackUrl: "/login" })}>Abmelden</button>
</div>

<style>
  .auth-box {
    max-width: 460px;
    margin: 3rem auto;
    background: #fff;
    border: 3px solid var(--ink);
    border-radius: var(--radius);
    padding: 1.8rem 1.6rem;
    text-align: center;
    box-shadow: 8px 8px 0 var(--blue);
  }
  h2 {
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 700;
    margin: 0 0 0.6rem;
  }
  .linkbtn {
    color: var(--ink);
    margin-top: 0.6rem;
  }
</style>
