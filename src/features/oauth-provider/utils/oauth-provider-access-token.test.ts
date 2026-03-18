import { APIError } from "better-call";
import { describe, expect, it } from "vitest";
import {
  assertJwtAccessTokenIsActive,
  assertOpaqueAccessTokenIsActive,
} from "./oauth-provider-access-token";

const REQUEST_URL = "https://blog.example.com/mcp";
const NOW = new Date("2026-03-17T00:00:00.000Z");

describe("oauth-provider access token utils", () => {
  it("rejects jwt tokens without a client id", () => {
    expect(() =>
      assertJwtAccessTokenIsActive(
        REQUEST_URL,
        {
          clientId: null,
          oauthClient: { disabled: false },
          oauthConsent: { id: "consent_123" },
          session: null,
          sessionId: null,
          userId: "user_123",
        },
        NOW,
      ),
    ).toThrowError(APIError);
  });

  it("rejects jwt tokens when consent has been removed", () => {
    expect(() =>
      assertJwtAccessTokenIsActive(
        REQUEST_URL,
        {
          clientId: "client_123",
          oauthClient: { disabled: false },
          oauthConsent: null,
          session: { expiresAt: new Date("2026-03-18T00:00:00.000Z") },
          sessionId: "session_123",
          userId: "user_123",
        },
        NOW,
      ),
    ).toThrowError(APIError);
  });

  it("rejects jwt tokens when the oauth client is disabled", () => {
    expect(() =>
      assertJwtAccessTokenIsActive(
        REQUEST_URL,
        {
          clientId: "client_123",
          oauthClient: { disabled: true },
          oauthConsent: { id: "consent_123" },
          session: { expiresAt: new Date("2026-03-18T00:00:00.000Z") },
          sessionId: "session_123",
          userId: "user_123",
        },
        NOW,
      ),
    ).toThrowError(APIError);
  });

  it("allows active jwt tokens with live client, consent, and session", () => {
    expect(() =>
      assertJwtAccessTokenIsActive(
        REQUEST_URL,
        {
          clientId: "client_123",
          oauthClient: { disabled: false },
          oauthConsent: { id: "consent_123" },
          session: { expiresAt: new Date("2026-03-18T00:00:00.000Z") },
          sessionId: "session_123",
          userId: "user_123",
        },
        NOW,
      ),
    ).not.toThrow();
  });

  it("keeps opaque token inactive checks aligned", () => {
    expect(() =>
      assertOpaqueAccessTokenIsActive(
        REQUEST_URL,
        {
          clientId: "client_123",
          createdAt: new Date("2026-03-16T00:00:00.000Z"),
          expiresAt: new Date("2026-03-18T00:00:00.000Z"),
          oauthClient: { disabled: false },
          scopes: [],
          session: { expiresAt: new Date("2026-03-18T00:00:00.000Z") },
          sessionId: "session_123",
          userId: "user_123",
        },
        NOW,
      ),
    ).not.toThrow();
  });
});
