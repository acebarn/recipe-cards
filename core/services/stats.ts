// Aggregierte Kennzahlen über die gesamte Rezeptsammlung (für /statistik).
// Rein lesend; rechnet aus listRecipes() alles Nötige zusammen.
import { prettyCategory, prettyDifficulty } from "../category.ts";
import { flattenIngredients, ingredientKeywords } from "../ingredients.ts";
import { regionCoords, regionEmoji } from "../region.ts";
import { totalMinutes } from "../time.ts";
import { listRecipes } from "./library.ts";

export interface Count {
  label: string;
  count: number;
}
export interface RegionStat {
  region: string;
  emoji: string;
  count: number;
  lon: number | null;
  lat: number | null;
  recipes: { slug: string; title: string }[];
}
export interface Superlative {
  slug: string;
  title: string;
  value: string;
}
export interface StatsResult {
  total: number;
  withImage: number;
  categoryCount: number;
  regionCount: number;
  avgMinutes: number | null;
  avgIngredients: number;
  avgSteps: number;
  totalIngredientLines: number;
  uniqueIngredients: number;
  categories: Count[];
  regions: RegionStat[];
  topIngredients: Count[];
  difficulties: Count[];
  timeBuckets: Count[];
  servings: Count[];
  tags: Count[];
  equipment: Count[];
  timeline: { month: string; count: number }[];
  superlatives: {
    quickest?: Superlative;
    longest?: Superlative;
    mostIngredients?: Superlative;
    mostSteps?: Superlative;
    mostEquipment?: Superlative;
  };
}

const inc = (m: Map<string, number>, k: string, by = 1) => m.set(k, (m.get(k) ?? 0) + by);
const sortedCounts = (m: Map<string, number>, limit?: number): Count[] => {
  const arr = [...m.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "de"));
  return limit ? arr.slice(0, limit) : arr;
};

export function computeStats(): StatsResult {
  const recipes = listRecipes();
  const total = recipes.length;

  const cat = new Map<string, number>();
  const diff = new Map<string, number>();
  const tags = new Map<string, number>();
  const equip = new Map<string, number>();
  const ingFreq = new Map<string, number>(); // Dokument-Frequenz (in wie vielen Rezepten)
  const months = new Map<string, number>();
  const regionMap = new Map<string, RegionStat>();
  const timeBucket = new Map<string, number>([
    ["⚡ Schnell (<30)", 0],
    ["🕒 Mittel (30–60)", 0],
    ["🍲 Aufwändig (>60)", 0],
    ["Ohne Angabe", 0],
  ]);
  const servBucket = new Map<string, number>([
    ["1–2", 0],
    ["3–4", 0],
    ["5–6", 0],
    ["7+", 0],
    ["Ohne Angabe", 0],
  ]);

  let withImage = 0;
  let minutesSum = 0;
  let minutesN = 0;
  let ingLinesSum = 0;
  let stepsSum = 0;

  let quickest: Superlative | undefined;
  let quickestMin = Infinity;
  let longest: Superlative | undefined;
  let longestMin = -1;
  let mostIngredients: Superlative | undefined;
  let mostIngN = -1;
  let mostSteps: Superlative | undefined;
  let mostStepsN = -1;
  let mostEquipment: Superlative | undefined;
  let mostEquipN = -1;

  for (const r of recipes) {
    const m = r.meta;
    if (r.imageFilename) withImage++;

    const c = prettyCategory(m.category) || "Ohne Kategorie";
    inc(cat, c);

    const d = prettyDifficulty(m.difficulty) || "Ohne Angabe";
    inc(diff, d);

    for (const t of m.tags ?? []) inc(tags, t.trim().toLowerCase());
    for (const e of m.equipment ?? []) inc(equip, e.trim());

    // Zutaten (Dokument-Frequenz der Schlagwörter)
    const lines = flattenIngredients(r.ingredients);
    ingLinesSum += lines.length;
    const kw = new Set<string>();
    for (const line of lines) for (const w of ingredientKeywords(line)) kw.add(w);
    for (const w of kw) inc(ingFreq, w);

    stepsSum += r.steps.length;

    // Zeit
    const mins = totalMinutes(m.prep_time, m.cook_time, m.rest_time);
    if (mins != null) {
      minutesSum += mins;
      minutesN++;
      if (mins < 30) inc(timeBucket, "⚡ Schnell (<30)");
      else if (mins <= 60) inc(timeBucket, "🕒 Mittel (30–60)");
      else inc(timeBucket, "🍲 Aufwändig (>60)");
      if (mins < quickestMin) {
        quickestMin = mins;
        quickest = { slug: r.slug, title: m.title, value: fmtMin(mins) };
      }
      if (mins > longestMin) {
        longestMin = mins;
        longest = { slug: r.slug, title: m.title, value: fmtMin(mins) };
      }
    } else {
      inc(timeBucket, "Ohne Angabe");
    }

    // Portionen
    const s = m.servings;
    if (s == null) inc(servBucket, "Ohne Angabe");
    else if (s <= 2) inc(servBucket, "1–2");
    else if (s <= 4) inc(servBucket, "3–4");
    else if (s <= 6) inc(servBucket, "5–6");
    else inc(servBucket, "7+");

    // Zeitleiste (Monat der Anlage)
    if (r.createdAt) inc(months, r.createdAt.slice(0, 7));

    // Region
    if (m.region) {
      const key = m.region.trim();
      let rs = regionMap.get(key);
      if (!rs) {
        const co = regionCoords(key);
        rs = { region: key, emoji: regionEmoji(key), count: 0, lon: co?.[0] ?? null, lat: co?.[1] ?? null, recipes: [] };
        regionMap.set(key, rs);
      }
      rs.count++;
      rs.recipes.push({ slug: r.slug, title: m.title });
    }

    // Superlative (Zutaten/Schritte/Zubehör)
    if (lines.length > mostIngN) {
      mostIngN = lines.length;
      mostIngredients = { slug: r.slug, title: m.title, value: `${lines.length} Zutaten` };
    }
    if (r.steps.length > mostStepsN) {
      mostStepsN = r.steps.length;
      mostSteps = { slug: r.slug, title: m.title, value: `${r.steps.length} Schritte` };
    }
    const eq = (m.equipment ?? []).length;
    if (eq > mostEquipN) {
      mostEquipN = eq;
      mostEquipment = { slug: r.slug, title: m.title, value: `${eq} Geräte` };
    }
  }

  const regions = [...regionMap.values()].sort(
    (a, b) => b.count - a.count || a.region.localeCompare(b.region, "de"),
  );

  return {
    total,
    withImage,
    categoryCount: cat.size,
    regionCount: regions.length,
    avgMinutes: minutesN ? Math.round(minutesSum / minutesN) : null,
    avgIngredients: total ? Math.round((ingLinesSum / total) * 10) / 10 : 0,
    avgSteps: total ? Math.round((stepsSum / total) * 10) / 10 : 0,
    totalIngredientLines: ingLinesSum,
    uniqueIngredients: ingFreq.size,
    categories: sortedCounts(cat),
    regions,
    topIngredients: sortedCounts(ingFreq, 24),
    difficulties: sortedCounts(diff),
    timeBuckets: [...timeBucket.entries()].map(([label, count]) => ({ label, count })),
    servings: [...servBucket.entries()].map(([label, count]) => ({ label, count })),
    tags: sortedCounts(tags, 30),
    equipment: sortedCounts(equip, 12),
    timeline: [...months.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, count]) => ({ month, count })),
    superlatives: { quickest, longest, mostIngredients, mostSteps, mostEquipment },
  };
}

function fmtMin(m: number): string {
  return m < 60 ? `${m} Min` : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} Std`;
}
