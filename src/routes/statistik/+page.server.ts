import { computeStats } from "$core/services/stats.ts";
import { computeUsage } from "$core/services/events.ts";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ url }) => {
  // Zeitraum über ?tage=30|90|365 umschaltbar, Standard 90 Tage.
  const roh = Number(url.searchParams.get("tage"));
  const tage = [30, 90, 365].includes(roh) ? roh : 90;
  return { stats: computeStats(), usage: computeUsage(tage) };
};
