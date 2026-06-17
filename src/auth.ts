import { SvelteKitAuth } from "@auth/sveltekit";
import Google from "@auth/sveltekit/providers/google";
import { recordLogin } from "$core/services/users.ts";
import { saveGoogleToken } from "$core/services/calendar/tokens.ts";

interface GoogleProfile {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

// Kalender-Scopes zusätzlich zum Basis-Login. Nutzer können sie granular abwählen;
// die Kalenderfunktionen aktivieren sich nur, wenn der Scope gewährt wurde.
const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
].join(" ");

// AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET werden aus der Umgebung gelesen.
export const { handle: authHandle, signIn, signOut } = SvelteKitAuth({
  trustHost: true,
  providers: [
    Google({
      allowDangerousEmailAccountLinking: true,
      authorization: { params: { scope: SCOPES, access_type: "offline", prompt: "consent" } },
    }),
  ],
  callbacks: {
    signIn: async ({ profile, account }) => {
      const p = profile as GoogleProfile | undefined;
      if (!p?.email) return false;
      if (p.email_verified === false) return false; // nur verifizierte Google-Mails
      // Login verbuchen: unbekannte Mail → 'invited', sonst google_sub/last_login aktualisieren.
      const user = recordLogin({ email: p.email, googleSub: p.sub, name: p.name, picture: p.picture });
      // Kalender-Tokens nur speichern, wenn der Calendar-Scope gewährt wurde.
      const scope = (account?.scope as string | undefined) ?? "";
      if (account?.provider === "google" && scope.includes("calendar")) {
        const exp = typeof account.expires_at === "number"
          ? new Date(account.expires_at * 1000).toISOString()
          : null;
        saveGoogleToken(user.id, {
          refreshToken: (account.refresh_token as string | undefined) ?? null,
          accessToken: (account.access_token as string | undefined) ?? null,
          expiresAt: exp,
          scope,
        });
      }
      return true;
    },
  },
});
