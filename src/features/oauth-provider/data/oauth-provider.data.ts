import { and, eq } from "drizzle-orm";
import {
  oauthAccessToken,
  oauthClient,
  oauthConsent,
  session,
} from "@/lib/db/schema/auth.table";

export async function findOAuthAccessTokenByToken(db: DB, token: string) {
  return await db.query.oauthAccessToken.findFirst({
    where: eq(oauthAccessToken.token, token),
    with: {
      oauthClient: true,
      session: true,
    },
  });
}

export async function findOAuthClientByClientId(db: DB, clientId: string) {
  return await db.query.oauthClient.findFirst({
    where: eq(oauthClient.clientId, clientId),
  });
}

export async function findOAuthConsentByClientIdAndUserId(
  db: DB,
  clientId: string,
  userId: string,
) {
  return await db.query.oauthConsent.findFirst({
    where: and(
      eq(oauthConsent.clientId, clientId),
      eq(oauthConsent.userId, userId),
    ),
  });
}

export async function findSessionById(db: DB, sessionId: string) {
  return await db.query.session.findFirst({
    where: eq(session.id, sessionId),
  });
}
