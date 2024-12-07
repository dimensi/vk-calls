import { LocalStorage, OAuth, open } from "@raycast/api";
import { createDeeplink } from "@raycast/utils";
import fetch from "node-fetch";
import { CONFIG } from "./config";

export const client = new OAuth.PKCEClient({
  redirectMethod: OAuth.RedirectMethod.Web,
  providerName: "VK",
  providerIcon: "vk-oauth.png",
  providerId: "vk",
  description: "Авторизация в vk.com",
});

interface AuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user_id: number;
  device_id: string;
}

export async function authorize({ title }: { title: string }) {
  const deeplink = createDeeplink({
    command: "create-call",
    arguments: { title },
  });

  const authRequest = await client.authorizationRequest({
    scope: "email",
    endpoint: `${CONFIG.AUTH_BASE_URL}/authorize`,
    clientId: CONFIG.CLIENT_ID,
    extraParameters: {
      redirect_uri: `${CONFIG.REDIRECT_BASE_URL}/verify`,
    },
  });

  const authId = await initializeAuthSession(deeplink, authRequest.state);
  await LocalStorage.setItem("auth_id", authId);
  await LocalStorage.setItem("code_verifier", authRequest.codeVerifier);

  const authUrl = createAuthUrl(authId, authRequest.codeChallenge);
  await open(authUrl.toString());
}

export async function refreshTokens(): Promise<OAuth.TokenSetOptions> {
  const tokenSet = await client.getTokens();
  const deviceId: string | undefined = await LocalStorage.getItem("vk_device_id");

  if (!tokenSet?.refreshToken || !deviceId) {
    await client.removeTokens();
    throw new Error("Отсутствуют необходимые данные для обновления токена");
  }

  const response = await fetch(`${CONFIG.AUTH_BASE_URL}/oauth2/auth`, {
    method: "POST",
    body: createRefreshTokenParams(tokenSet.refreshToken, deviceId),
  });

  if (!response.ok) {
    throw new Error(`Ошибка обновления токена: ${response.statusText}`);
  }

  const data = (await response.json()) as AuthResponse;
  await updateDeviceId(data.device_id, deviceId);

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

export async function createTokens(tokenSet: { device_id: string; code: string }): Promise<AuthResponse> {
  const codeVerifier: string | undefined = await LocalStorage.getItem("code_verifier");

  const response = await fetch(`${CONFIG.AUTH_BASE_URL}/oauth2/auth`, {
    method: "POST",
    body: createTokenParams(tokenSet, codeVerifier || ""),
  });

  const data = (await response.json()) as AuthResponse;

  await LocalStorage.setItem("vk_user_id", data.user_id.toString());
  await LocalStorage.setItem("vk_device_id", tokenSet.device_id);

  await client.setTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  });

  return data;
}

// Вспомогательные функции
function createAuthUrl(authId: string, codeChallenge: string): URL {
  const url = new URL(`${CONFIG.AUTH_BASE_URL}/authorize`);
  const params = url.searchParams;

  params.append("response_type", "code");
  params.append("client_id", CONFIG.CLIENT_ID);
  params.append("redirect_uri", `${CONFIG.REDIRECT_BASE_URL}/verify`);
  params.append("scope", "email phone");
  params.append("state", authId);
  params.append("code_challenge", codeChallenge);
  params.append("code_challenge_method", "s256");
  params.append("scheme", "dark");

  return url;
}

function createRefreshTokenParams(refreshToken: string, deviceId: string): URLSearchParams {
  const params = new URLSearchParams();
  params.set("grant_type", "refresh_token");
  params.set("refresh_token", refreshToken);
  params.set("client_id", CONFIG.CLIENT_ID);
  params.set("device_id", deviceId);
  params.set("redirect_uri", `${CONFIG.REDIRECT_BASE_URL}/verify`);
  return params;
}

function createTokenParams(tokenSet: { device_id: string; code: string }, codeVerifier: string): URLSearchParams {
  const params = new URLSearchParams();
  params.set("grant_type", "authorization_code");
  params.set("code", tokenSet.code);
  params.set("client_id", CONFIG.CLIENT_ID);
  params.set("device_id", tokenSet.device_id);
  params.set("code_verifier", codeVerifier);
  params.set("redirect_uri", `${CONFIG.REDIRECT_BASE_URL}/verify`);
  return params;
}

async function initializeAuthSession(deeplink: string, state: string): Promise<string> {
  const url = new URL(`${CONFIG.REDIRECT_BASE_URL}/start`);
  url.searchParams.set("id", state);
  url.searchParams.set("deep_link", deeplink);

  const response = await fetch(url.toString());
  const data = (await response.json()) as { id: string };

  if (!data?.id) {
    throw new Error("Не удалось инициализировать сессию авторизации");
  }

  return data.id;
}

async function updateDeviceId(newDeviceId: string, oldDeviceId: string): Promise<void> {
  if (newDeviceId !== oldDeviceId) {
    await LocalStorage.setItem("vk_device_id", newDeviceId);
  }
}
