// Minimales Inline-Markdown (**fett**, *kursiv*) → HTML, XSS-sicher:
// erst HTML escapen, dann nur die beiden Auszeichnungen anwenden.
export function inlineMd(input: string): string {
  const escaped = input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
}
