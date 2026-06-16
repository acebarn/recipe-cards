// Fügt die Zutaten eines Rezepts (skaliert) zur Bring-Liste hinzu: führt Mengen mit
// bereits vorhandenen Posten zusammen und lässt Standardzutaten weg.
import { flattenIngredients } from "../../ingredients.ts";
import { normalizeName, parseIngredient } from "../../ingredient-parse.ts";
import { formatQuantity } from "../../scale.ts";
import type { IngredientSection } from "../../model.ts";
import type { BringProvider } from "./bring.ts";
import { isStandard } from "./standard.ts";

export interface AddResult {
  added: number;
  merged: number;
  skipped: number;
}

interface Agg {
  name: string; // Item-Name auf der Bring-Liste
  qty: number | null; // numerischer Akkumulator (nur bei einheitlicher Einheit)
  unit: string;
  texts: string[]; // nicht-zusammenführbare Mengen ("für die Soße", "1 Prise" …)
  isNew: boolean;
  touched: boolean;
}

function formatContribution(qty: number | null, unit: string): string {
  if (qty === null) return unit;
  return unit ? `${formatQuantity(qty)} ${unit}` : formatQuantity(qty);
}

function finalQuantity(a: Agg): string {
  const base = a.qty !== null ? formatContribution(a.qty, a.unit) : "";
  return [base, ...a.texts].filter(Boolean).join(" + ");
}

export async function addRecipeIngredients(
  provider: BringProvider,
  userId: number,
  ingredients: IngredientSection[],
  scale: number,
): Promise<AddResult> {
  // Aktuellen Stand der offenen Posten als Ausgangsbasis laden.
  const map = new Map<string, Agg>();
  for (const item of await provider.list()) {
    if (item.done) continue;
    const p = parseIngredient(item.quantity);
    map.set(normalizeName(item.name), {
      name: item.name,
      qty: p.qty,
      unit: p.unit,
      texts: p.qty === null && item.quantity.trim() ? [item.quantity.trim()] : [],
      isNew: false,
      touched: false,
    });
  }

  let skipped = 0;
  for (const line of flattenIngredients(ingredients)) {
    const { qty, unit, name } = parseIngredient(line);
    if (!name) continue;
    if (isStandard(userId, name)) {
      skipped++;
      continue;
    }
    const scaledQty = qty === null ? null : qty * scale;
    const norm = normalizeName(name);
    const existing = map.get(norm);
    if (!existing) {
      map.set(norm, { name, qty: scaledQty, unit, texts: [], isNew: true, touched: true });
      continue;
    }
    // Gleiche Einheit + beide numerisch → addieren, sonst als Zusatz anhängen.
    if (existing.qty !== null && scaledQty !== null && existing.unit === unit) {
      existing.qty += scaledQty;
    } else {
      existing.texts.push(formatContribution(scaledQty, unit));
    }
    existing.touched = true;
  }

  let added = 0;
  let merged = 0;
  for (const agg of map.values()) {
    if (agg.isNew) {
      await provider.add(agg.name, finalQuantity(agg));
      added++;
    } else if (agg.touched) {
      await provider.update(agg.name, { quantity: finalQuantity(agg) });
      merged++;
    }
  }

  return { added, merged, skipped };
}
