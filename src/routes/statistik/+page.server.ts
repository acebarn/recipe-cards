import { computeStats } from "$core/services/stats.ts";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = () => ({ stats: computeStats() });
