<script lang="ts">
  import { signIn } from "@auth/sveltekit/client";
</script>

<svelte:head><title>Anmelden</title></svelte:head>

<div class="auth-box">
  <div class="shapes" aria-hidden="true"><span class="c"></span><span class="t"></span><span class="s"></span></div>
  <h2>Anmelden</h2>
  <p>Die Rezeptbibliothek ist privat. Bitte melde dich mit deinem Google-Konto an.</p>
  <button class="btn-google" onclick={() => signIn("google", { callbackUrl: "/" })}>
    Mit Google anmelden
  </button>
</div>

<style>
  .auth-box {
    max-width: 440px;
    margin: 3rem auto;
    background: #fff;
    border: 3px solid var(--ink);
    border-radius: var(--radius);
    padding: 1.8rem 1.6rem;
    text-align: center;
    box-shadow: 8px 8px 0 var(--accent);
  }
  .shapes {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 1rem;
  }
  .shapes .c {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--yellow);
    border: 2.5px solid var(--ink);
  }
  .shapes .t {
    width: 0;
    height: 0;
    border-left: 15px solid transparent;
    border-right: 15px solid transparent;
    border-bottom: 26px solid var(--red);
  }
  .shapes .s {
    width: 24px;
    height: 24px;
    background: var(--blue);
    border: 2.5px solid var(--ink);
  }
  h2 {
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 700;
    margin: 0 0 0.6rem;
  }
  .btn-google {
    margin-top: 1.1rem;
    padding: 0.8rem 1.3rem;
    font: inherit;
    font-size: 1rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    border: 2.5px solid var(--ink);
    border-radius: var(--radius);
    background: var(--accent);
    color: #fff;
    cursor: pointer;
    box-shadow: 3px 3px 0 var(--ink);
    transition:
      transform 0.1s,
      box-shadow 0.1s;
  }
  .btn-google:hover {
    transform: translate(-1px, -1px);
    box-shadow: 4px 4px 0 var(--ink);
  }
  .btn-google:active {
    transform: translate(2px, 2px);
    box-shadow: 1px 1px 0 var(--ink);
  }
</style>
