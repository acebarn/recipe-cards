import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = ({ locals }) => {
  const u = locals.user;
  return {
    user: u ? { name: u.name ?? u.email, role: u.role, status: u.status } : null,
  };
};
