import type { JSONWebKeySet, JWTPayload } from "jose";
import { getAuth } from "@/lib/auth/auth.server";
import { serverEnv } from "@/lib/env/server.env";
import {
  findOAuthAccessTokenByToken,
  findOAuthClientByClientId,
  findOAuthConsentByClientIdAndUserId,
  findSessionById,
} from "../data/oauth-provider.data";
import {
  getOAuthProtectedResourceUrl,
  type OAuthScope,
} from "../oauth-provider.config";
import type { OAuthScopeRequest } from "../schema/oauth-provider.schema";
import {
  assertJwtAccessTokenIsActive,
  assertOpaqueAccessTokenIsActive,
  assertOpaqueAccessTokenScopes,
  buildOpaqueAccessTokenPayload,
  createOAuthVerificationError,
  hashOpaqueAccessToken,
  isLikelyJwtAccessToken,
  isOpaqueAccessToken,
  parsePersistedScopes,
} from "../utils/oauth-provider-access-token";
import {
  readJwtVerificationMetadata,
  verifyLocalOAuthJwtAccessToken,
} from "./oauth-provider.jwt-verifier";
import {
  getOAuthAuthorizationServer,
  getOAuthJwksUrl,
} from "./oauth-provider.service";

async function fetchLocalOAuthJwks(db: DB, env: Env): Promise<JSONWebKeySet> {
  const auth = getAuth({ db, env });
  const baseUrl = serverEnv(env).BETTER_AUTH_URL;
  const request = new Request(
    new URL("/api/auth/.well-known/jwks.json", baseUrl),
    {
      headers: {
        Accept: "application/json",
      },
      method: "GET",
    },
  );
  const response = await auth.handler(request);

  if (!response.ok) {
    throw new Error(`local jwks request failed with status ${response.status}`);
  }

  return (await response.json()) as JSONWebKeySet;
}

async function verifyJwtOAuthAccessToken(
  db: DB,
  env: Env,
  requestUrl: string,
  accessToken: string,
  requiredScopes: OAuthScope[] | OAuthScopeRequest = [],
): Promise<JWTPayload> {
  const startedAt = Date.now();
  const issuer = getOAuthAuthorizationServer(env);
  const audience = getOAuthProtectedResourceUrl(serverEnv(env).BETTER_AUTH_URL);
  const jwksUrl = getOAuthJwksUrl(env);
  const jwtMetadata = readJwtVerificationMetadata(accessToken);

  try {
    const jwt = await verifyLocalOAuthJwtAccessToken({
      accessToken,
      audience,
      fetchJwks: () => fetchLocalOAuthJwks(db, env),
      issuer,
      requestUrl,
      requiredScopes,
    });
    const clientId =
      typeof jwt.client_id === "string"
        ? jwt.client_id
        : typeof jwt.azp === "string"
          ? jwt.azp
          : null;
    const sessionId = typeof jwt.sid === "string" ? jwt.sid : null;
    const userId = typeof jwt.sub === "string" ? jwt.sub : null;
    const [oauthClient, oauthConsent, session] = await Promise.all([
      clientId
        ? findOAuthClientByClientId(db, clientId)
        : Promise.resolve(null),
      clientId && userId
        ? findOAuthConsentByClientIdAndUserId(db, clientId, userId)
        : Promise.resolve(null),
      sessionId ? findSessionById(db, sessionId) : Promise.resolve(null),
    ]);

    assertJwtAccessTokenIsActive(
      requestUrl,
      {
        clientId,
        oauthClient: oauthClient ?? null,
        oauthConsent: oauthConsent ?? null,
        session: session ?? null,
        sessionId,
        userId,
      },
      new Date(),
    );

    return jwt;
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "local oauth jwt verification failed",
        error: error instanceof Error ? error.message : String(error),
        request: {
          requestUrl,
        },
        verification: {
          audience,
          issuer,
          jwksUrl,
          durationMs: Date.now() - startedAt,
          ...jwtMetadata,
        },
      }),
    );

    throw error;
  }
}

async function findStoredOpaqueAccessToken(db: DB, accessToken: string) {
  const storedToken = await hashOpaqueAccessToken(accessToken);
  return await findOAuthAccessTokenByToken(db, storedToken);
}

async function verifyOpaqueOAuthAccessToken(
  db: DB,
  env: Env,
  requestUrl: string,
  accessToken: string,
  requiredScopes: OAuthScope[] | OAuthScopeRequest = [],
): Promise<JWTPayload> {
  const tokenRecord = await findStoredOpaqueAccessToken(db, accessToken);
  if (!tokenRecord) {
    throw createOAuthVerificationError(
      requestUrl,
      "UNAUTHORIZED",
      "token invalid",
    );
  }

  const now = new Date();
  const { expiresAt } = assertOpaqueAccessTokenIsActive(
    requestUrl,
    tokenRecord,
    now,
  );
  const grantedScopes = parsePersistedScopes(tokenRecord.scopes);

  assertOpaqueAccessTokenScopes(requestUrl, grantedScopes, requiredScopes);

  return buildOpaqueAccessTokenPayload(
    env,
    tokenRecord,
    expiresAt,
    grantedScopes,
  );
}

export async function verifyOAuthAccessToken(
  db: DB,
  env: Env,
  requestUrl: string,
  accessToken: string,
  requiredScopes: OAuthScope[] | OAuthScopeRequest = [],
) {
  if (isOpaqueAccessToken(accessToken)) {
    return await verifyOpaqueOAuthAccessToken(
      db,
      env,
      requestUrl,
      accessToken,
      requiredScopes,
    );
  }

  try {
    return await verifyJwtOAuthAccessToken(
      db,
      env,
      requestUrl,
      accessToken,
      requiredScopes,
    );
  } catch (error) {
    if (!isLikelyJwtAccessToken(accessToken)) {
      return await verifyOpaqueOAuthAccessToken(
        db,
        env,
        requestUrl,
        accessToken,
        requiredScopes,
      );
    }

    throw error;
  }
}
