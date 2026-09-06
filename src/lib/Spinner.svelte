<script lang="ts">
  /**
   * Ladeanzeige für Aktionen, die auf etwas Langsames warten (Gemini-Import,
   * Bildgenerierung, Bring, Kalender, Typst-Render, Telegram).
   *
   * Bewusst schlicht und in der Bauhaus-Sprache der App: ein rotierender Bogen
   * in der aktuellen Textfarbe, damit er in hellen wie dunklen Knöpfen sitzt.
   * Wer Animationen reduziert hat, bekommt einen ruhigen Punkt statt Rotation.
   */
  let { size = "1em", label = "" }: { size?: string; label?: string } = $props();
</script>

<span class="ladeanzeige" style="--sz:{size}" role="status" aria-live="polite">
  <span class="bogen"></span>
  {#if label}<span class="sr">{label}</span>{/if}
</span>

<style>
  .ladeanzeige {
    display: inline-flex;
    align-items: center;
    vertical-align: -0.12em;
  }
  .bogen {
    width: var(--sz);
    height: var(--sz);
    border: 0.16em solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: dreh 0.7s linear infinite;
  }
  @keyframes dreh {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .bogen {
      animation: none;
      border-right-color: currentColor;
      opacity: 0.45;
    }
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
