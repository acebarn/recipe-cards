import { SvelteKitAuth } from "@auth/sveltekit";
import Google from "@auth/sveltekit/providers/google";
import { recordLogin } from "$core/services/users.ts";

interface GoogleProfile {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

// AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET werden aus der Umgebung gelesen.
export const { handle: authHandle, signIn, signOut } = SvelteKitAuth({
  trustHost: true,
  providers: [Google({ allowDangerousEmailAccountLinking: true })],
  callbacks: {
    signIn: async ({ profile }) => {
      const p = profile as GoogleProfile | undefined;
      if (!p?.email) return false;
      if (p.email_verified === false) return false; // nur verifizierte Google-Mails
      // Login verbuchen: unbekannte Mail → 'invited', sonst google_sub/last_login aktualisieren.
      recordLogin({ email: p.email, googleSub: p.sub, name: p.name, picture: p.picture });
      return true;
    },
  },
});
