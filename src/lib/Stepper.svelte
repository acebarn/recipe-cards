<script lang="ts">
  // Dicker Mengen-Stepper (− ×N +) im Bauhaus-Stil, mobil-tauglich.
  let {
    value = $bindable(1),
    min = 0.5,
    max = 20,
    step = 0.5,
  }: { value?: number; min?: number; max?: number; step?: number } = $props();

  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(n).replace(".", ","));
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n * 100) / 100));
  const dec = () => (value = clamp(value - step));
  const inc = () => (value = clamp(value + step));
</script>

<div class="stepper" role="group" aria-label="Menge skalieren">
  <button type="button" onclick={dec} disabled={value <= min} aria-label="weniger">−</button>
  <span class="val" aria-live="polite">×{fmt(value)}</span>
  <button type="button" onclick={inc} disabled={value >= max} aria-label="mehr">+</button>
</div>

<style>
  .stepper {
    display: inline-flex;
    align-items: stretch;
    height: 2.5rem;
    border: 2px solid var(--ink);
    border-radius: var(--radius);
    background: #fff;
    box-shadow: 3px 3px 0 var(--ink);
    overflow: hidden;
    user-select: none;
  }
  .stepper button {
    width: 2.6rem;
    border: 0;
    background: #fff;
    font: inherit;
    font-size: 1.4rem;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
    color: var(--ink);
    display: flex;
    align-items: center;
    justify-content: center;
    -webkit-tap-highlight-color: transparent;
  }
  .stepper button:hover:not(:disabled) {
    background: var(--accent-soft, #eee);
  }
  .stepper button:active:not(:disabled) {
    background: var(--accent);
    color: #fff;
  }
  .stepper button:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .stepper .val {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 3.1rem;
    padding: 0 0.5rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    border-left: 2px solid var(--ink);
    border-right: 2px solid var(--ink);
    background: var(--accent);
    color: #fff;
  }
</style>
