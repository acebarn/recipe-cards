export interface RecipeMeta {
  title: string;
  tags: string[];
  category?: string;
  grouping?: string;
  prep_time?: string;
  cook_time?: string;
  rest_time?: string;
  servings?: number;
  equipment: string[];
  difficulty?: string;
  /** Herkunft: Land, Kontinent oder Region (z.B. "Italien", "Levantinisch"). */
  region?: string;
  source_url: string[];
  last_modified?: string;
  /** Optionale Grundfarbe als #hex. Wenn gesetzt, hat sie Vorrang vor der Bild-/Titel-Ableitung. */
  theme_color?: string;
  /** Kurze ENGLISCHE Beschreibung des darzustellenden Gerichts (z.B. "a slice of onion tart with tofu cubes"). Wird in den Stil-Prompt eingebettet. */
  image_subject?: string;
  /** Vollständiger englischer Bild-Prompt; überschreibt image_subject und die Auto-Erzeugung komplett. */
  image_prompt?: string;
}

export interface IngredientSection {
  /** Untertitel wie "Teig" / "Füllung"; leer, wenn das Rezept keine Untergliederung hat. */
  name?: string;
  items: string[];
}

export interface Recipe {
  meta: RecipeMeta;
  ingredients: IngredientSection[];
  steps: string[];
  notes: string[];
  /** Pfad der Quelldatei, für Logging und Slug-Erzeugung. */
  sourceFile: string;
}
