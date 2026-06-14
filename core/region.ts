// Region/Herkunft → Emoji. Länder werden zu Flaggen, breitere Regionen/Kontinente
// zu einem passenden Globus. Unbekanntes liefert "" (dann nur der Text anzeigen).

const FLAGS: Record<string, string> = {
  deutschland: "🇩🇪",
  österreich: "🇦🇹",
  oesterreich: "🇦🇹",
  schweiz: "🇨🇭",
  italien: "🇮🇹",
  italienisch: "🇮🇹",
  frankreich: "🇫🇷",
  französisch: "🇫🇷",
  spanien: "🇪🇸",
  spanisch: "🇪🇸",
  portugal: "🇵🇹",
  griechenland: "🇬🇷",
  griechisch: "🇬🇷",
  türkei: "🇹🇷",
  tuerkei: "🇹🇷",
  türkisch: "🇹🇷",
  ungarn: "🇭🇺",
  ungarisch: "🇭🇺",
  polen: "🇵🇱",
  dänemark: "🇩🇰",
  daenemark: "🇩🇰",
  dänisch: "🇩🇰",
  schweden: "🇸🇪",
  norwegen: "🇳🇴",
  niederlande: "🇳🇱",
  belgien: "🇧🇪",
  england: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  großbritannien: "🇬🇧",
  vereinigtes_königreich: "🇬🇧",
  irland: "🇮🇪",
  marokko: "🇲🇦",
  marokkanisch: "🇲🇦",
  tunesien: "🇹🇳",
  ägypten: "🇪🇬",
  aegypten: "🇪🇬",
  libanon: "🇱🇧",
  libanesisch: "🇱🇧",
  syrien: "🇸🇾",
  israel: "🇮🇱",
  iran: "🇮🇷",
  persisch: "🇮🇷",
  indien: "🇮🇳",
  indisch: "🇮🇳",
  japan: "🇯🇵",
  japanisch: "🇯🇵",
  china: "🇨🇳",
  chinesisch: "🇨🇳",
  thailand: "🇹🇭",
  thailändisch: "🇹🇭",
  vietnam: "🇻🇳",
  korea: "🇰🇷",
  koreanisch: "🇰🇷",
  indonesien: "🇮🇩",
  mexiko: "🇲🇽",
  mexikanisch: "🇲🇽",
  peru: "🇵🇪",
  peruanisch: "🇵🇪",
  brasilien: "🇧🇷",
  argentinien: "🇦🇷",
  usa: "🇺🇸",
  "vereinigte staaten": "🇺🇸",
  amerikanisch: "🇺🇸",
};

// Breitere Regionen/Kontinente ohne eigene Flagge → passender Globus.
const REGIONS: Record<string, string> = {
  europa: "🌍",
  europäisch: "🌍",
  mediterran: "🌍",
  mittelmeer: "🌍",
  levante: "🌍",
  levantinisch: "🌍",
  arabisch: "🌍",
  orientalisch: "🌍",
  nahost: "🌍",
  naher_osten: "🌍",
  maghreb: "🌍",
  nordafrika: "🌍",
  nordafrikanisch: "🌍",
  afrika: "🌍",
  asien: "🌏",
  asiatisch: "🌏",
  ostasiatisch: "🌏",
  südostasiatisch: "🌏",
  amerika: "🌎",
  südamerika: "🌎",
  lateinamerikanisch: "🌎",
  international: "🌍",
};

/** Emoji für eine Region/Herkunft – Flagge wenn möglich, sonst Globus, sonst "". */
export function regionEmoji(region?: string | null): string {
  if (!region) return "";
  const key = region.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const flat = key.replace(/_/g, " ");
  return FLAGS[key] ?? FLAGS[flat] ?? REGIONS[key] ?? REGIONS[flat] ?? "";
}

/** "🇮🇹 Italien" bzw. nur "Italien", wenn kein Emoji bekannt ist. */
export function regionLabel(region?: string | null): string {
  if (!region) return "";
  const emoji = regionEmoji(region);
  return emoji ? `${emoji} ${region}` : region;
}
