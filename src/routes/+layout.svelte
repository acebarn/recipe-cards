<script lang="ts">
  import "../app.css";

  let { children } = $props();
</script>

<header class="app-header">
  <h1><a href="/" style="color: inherit;">🍳 Rezepte</a></h1>
</header>

<main>
  {@render children()}
</main>
