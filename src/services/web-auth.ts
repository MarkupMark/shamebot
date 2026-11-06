const textEncoder = new TextEncoder();
const telegramMiniAppSecret = "WebAppData";

export type TelegramLoginPayload = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

export type VerifiedTelegramUser = {
  telegramId: number;
  username: string | null;
  displayName: string;
  photoUrl: string | null;
  authDate: number;
};

type TelegramMiniAppUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

export async function verifyTelegramLogin(
  payload: unknown,
  botToken: string,
  maxAgeSeconds = 86_400,
): Promise<VerifiedTelegramUser> {
  const normalized = normalizePayload(payload);
  const expectedHash = await computeTelegramLoginHash(normalized, botToken);

  if (!constantTimeEqual(expectedHash, normalized.hash)) {
    throw new Error("Firma Telegram non valida");
  }

  const currentUnixTime = Math.floor(Date.now() / 1000);
  if (currentUnixTime - normalized.auth_date > maxAgeSeconds) {
    throw new Error("Login Telegram scaduto");
  }

  return {
    telegramId: normalized.id,
    username: normalized.username?.toLowerCase() ?? null,
    displayName: [normalized.first_name, normalized.last_name].filter(Boolean).join(" ").trim() || normalized.first_name,
    photoUrl: normalized.photo_url ?? null,
    authDate: normalized.auth_date,
  };
}

export async function computeTelegramLoginHash(payload: TelegramLoginPayload, botToken: string): Promise<string> {
  const secretKey = await crypto.subtle.digest("SHA-256", textEncoder.encode(botToken));
  const dataCheckString = buildDataCheckString(payload);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    secretKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, textEncoder.encode(dataCheckString));
  return bytesToHex(new Uint8Array(signature));
}

export async function verifyTelegramMiniAppInitData(
  initDataRaw: string,
  botToken: string,
  maxAgeSeconds = 86_400,
): Promise<VerifiedTelegramUser> {
  const normalized = normalizeTelegramMiniAppInitData(initDataRaw);
  const expectedHash = await computeTelegramMiniAppHash(normalized.entries, botToken);
  const expectedHashWithSignature = normalized.hasSignature
    ? await computeTelegramMiniAppHash(normalized.entries, botToken, { includeSignature: true })
    : null;

  const hashIsValid = constantTimeEqual(expectedHash, normalized.hash)
    || (expectedHashWithSignature ? constantTimeEqual(expectedHashWithSignature, normalized.hash) : false);

  if (!hashIsValid) {
    throw new Error("Firma Mini App Telegram non valida");
  }

  const currentUnixTime = Math.floor(Date.now() / 1000);
  if (currentUnixTime - normalized.authDate > maxAgeSeconds) {
    throw new Error("Sessione Mini App Telegram scaduta");
  }

  return {
    telegramId: normalized.user.id,
    username: normalized.user.username?.toLowerCase() ?? null,
    displayName: [normalized.user.first_name, normalized.user.last_name].filter(Boolean).join(" ").trim() || normalized.user.first_name,
    photoUrl: normalized.user.photo_url ?? null,
    authDate: normalized.authDate,
  };
}

export async function computeTelegramMiniAppHash(
  initData: string | URLSearchParams | Record<string, string> | Array<[string, string]>,
  botToken: string,
  options: { includeSignature?: boolean } = {},
): Promise<string> {
  const dataCheckString = buildTelegramMiniAppDataCheckString(initData, options);
  const secretKey = await computeHmacSha256Bytes(botToken, textEncoder.encode(telegramMiniAppSecret));
  const signature = await computeHmacSha256Bytes(dataCheckString, secretKey);
  return bytesToHex(signature);
}

function buildDataCheckString(payload: TelegramLoginPayload): string {
  const entries = Object.entries(payload)
    .filter(([key, value]) => key !== "hash" && value !== undefined && value !== null)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`);

  return entries.join("\n");
}

function buildTelegramMiniAppDataCheckString(
  initData: string | URLSearchParams | Record<string, string> | Array<[string, string]>,
  { includeSignature = false }: { includeSignature?: boolean } = {},
): string {
  return normalizeTelegramMiniAppEntries(initData)
    .filter(([key]) => key !== "hash" && (includeSignature || key !== "signature"))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function normalizePayload(payload: unknown): TelegramLoginPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload Telegram mancante");
  }

  const record = payload as Record<string, unknown>;
  const id = Number(record.id);
  const firstName = typeof record.first_name === "string" ? record.first_name.trim() : "";
  const authDate = Number(record.auth_date);
  const hash = typeof record.hash === "string" ? record.hash.trim() : "";

  if (!Number.isSafeInteger(id) || id <= 0 || !firstName || !Number.isSafeInteger(authDate) || !hash) {
    throw new Error("Payload Telegram non valido");
  }

  return {
    id,
    first_name: firstName,
    last_name: typeof record.last_name === "string" ? record.last_name.trim() : undefined,
    username: typeof record.username === "string" ? record.username.trim() : undefined,
    photo_url: typeof record.photo_url === "string" ? record.photo_url.trim() : undefined,
    auth_date: authDate,
    hash,
  };
}

function normalizeTelegramMiniAppInitData(initDataRaw: string): {
  authDate: number;
  hash: string;
  user: TelegramMiniAppUser;
  entries: Array<[string, string]>;
  hasSignature: boolean;
} {
  if (typeof initDataRaw !== "string" || !initDataRaw.trim()) {
    throw new Error("InitData Mini App Telegram mancante");
  }

  const entries = normalizeTelegramMiniAppEntries(initDataRaw);
  const params = new URLSearchParams(initDataRaw);
  const authDate = Number(params.get("auth_date"));
  const hash = params.get("hash")?.trim() ?? "";
  const userRaw = params.get("user");

  if (!Number.isSafeInteger(authDate) || !hash || !userRaw) {
    throw new Error("InitData Mini App Telegram non valida");
  }

  return {
    authDate,
    hash,
    user: normalizeTelegramMiniAppUser(userRaw),
    entries,
    hasSignature: params.has("signature"),
  };
}

function normalizeTelegramMiniAppUser(userRaw: string): TelegramMiniAppUser {
  let parsedUser: unknown;

  try {
    parsedUser = JSON.parse(userRaw);
  } catch {
    throw new Error("Utente Mini App Telegram non valido");
  }

  if (!parsedUser || typeof parsedUser !== "object") {
    throw new Error("Utente Mini App Telegram non valido");
  }

  const record = parsedUser as Record<string, unknown>;
  const id = Number(record.id);
  const firstName = typeof record.first_name === "string" ? record.first_name.trim() : "";

  if (!Number.isSafeInteger(id) || id <= 0 || !firstName) {
    throw new Error("Utente Mini App Telegram non valido");
  }

  return {
    id,
    first_name: firstName,
    last_name: typeof record.last_name === "string" ? record.last_name.trim() : undefined,
    username: typeof record.username === "string" ? record.username.trim() : undefined,
    photo_url: typeof record.photo_url === "string" ? record.photo_url.trim() : undefined,
  };
}

function normalizeTelegramMiniAppEntries(
  initData: string | URLSearchParams | Record<string, string> | Array<[string, string]>,
): Array<[string, string]> {
  if (typeof initData === "string") {
    return Array.from(new URLSearchParams(initData).entries());
  }

  if (initData instanceof URLSearchParams) {
    return Array.from(initData.entries());
  }

  if (Array.isArray(initData)) {
    return initData
      .filter((entry): entry is [string, string] => Array.isArray(entry) && entry.length === 2)
      .map(([key, value]) => [String(key), String(value)]);
  }

  return Object.entries(initData)
    .filter(([, value]) => typeof value === "string");
}

async function computeHmacSha256Bytes(message: string, keyData: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  const rawKey = keyData instanceof Uint8Array ? keyData.slice().buffer : keyData;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, textEncoder.encode(message));
  return new Uint8Array(signature);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}
