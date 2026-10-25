import { describe, expect, it } from "vitest";
import { OAUTH_CALLBACK, isOAuthCallback } from "./nativeAuth";

describe("deep link do login Google no APK", () => {
  it("aceita o regresso do Clerk com o nonce", () => {
    expect(isOAuthCallback(`${OAUTH_CALLBACK}?rotating_token_nonce=abc123`)).toBe(true);
  });

  it("aceita o callback sem parâmetros", () => {
    expect(isOAuthCallback(OAUTH_CALLBACK)).toBe(true);
  });

  it("recusa outros esquemas, hosts e lixo", () => {
    expect(isOAuthCallback("https://sso-callback")).toBe(false);
    expect(isOAuthCallback("com.apexf1.hub://outro")).toBe(false);
    expect(isOAuthCallback("com.outra.app://sso-callback")).toBe(false);
    expect(isOAuthCallback("nao-e-um-url")).toBe(false);
  });
});
