<script lang="ts">
  import { signIn } from "@auth/sveltekit/client";
</script>

<svelte:head><title>Anmelden</title></svelte:head>

<div class="auth-box">
  <h2>Anmelden</h2>
  <p>Die Rezeptbibliothek ist privat. Bitte melde dich mit deinem Google-Konto an.</p>
  <button class="btn-google" onclick={() => signIn("google", { callbackUrl: "/" })}>
    Mit Google anmelden
  </button>
</div>

<style>
  .auth-box {
    max-width: 420px;
    margin: 3rem auto;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.6rem;
    text-align: center;
  }
  .btn-google {
    margin-top: 1rem;
    padding: 0.7rem 1.2rem;
    font-size: 1rem;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: #fff;
    cursor: pointer;
    font-weight: 600;
  }
  .btn-google:hover {
    border-color: var(--accent);
  }
</style>
