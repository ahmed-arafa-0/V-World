const MAX_ID_LENGTH = 200;

function isNonBlankString(value: unknown, maxLength = MAX_ID_LENGTH): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function hasOnlyKeys(body: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(body).every((key) => allowed.includes(key));
}

function normalizeDigit(value: unknown): string | null {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0 || value > 9) return null;
    return String(value);
  }
  if (typeof value === 'string') {
    // Exactly one digit character — rejects "12", "1 ", "-1", "1.0", "a", "".
    if (!/^[0-9]$/.test(value)) return null;
    return value;
  }
  return null;
}

export interface ValidGateLoginInput {
  digits: string;
  deviceId: string;
  attemptId: string;
  language?: string;
}

export function validateGateLoginRequest(body: unknown): ValidGateLoginInput | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;

  if (!hasOnlyKeys(b, ['digits', 'deviceId', 'language', 'attemptId'])) return null;
  if (!Array.isArray(b.digits) || b.digits.length !== 4) return null;

  const normalized: string[] = [];
  for (const raw of b.digits) {
    const digit = normalizeDigit(raw);
    if (digit === null) return null;
    normalized.push(digit);
  }

  if (!isNonBlankString(b.deviceId)) return null;
  if (!isNonBlankString(b.attemptId)) return null;
  if (b.language !== undefined && typeof b.language !== 'string') return null;

  return {
    digits: normalized.join(''),
    deviceId: b.deviceId,
    attemptId: b.attemptId,
    language: typeof b.language === 'string' ? b.language : undefined,
  };
}

export interface ValidAdminLoginInput {
  username: string;
  password: string;
  deviceId: string;
  attemptId: string;
  language?: string;
}

export function validateAdminLoginRequest(body: unknown): ValidAdminLoginInput | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;

  if (!hasOnlyKeys(b, ['username', 'password', 'deviceId', 'language', 'attemptId'])) return null;
  if (!isNonBlankString(b.username)) return null;
  if (typeof b.password !== 'string' || b.password.length === 0 || b.password.length > 500)
    return null;
  if (!isNonBlankString(b.deviceId)) return null;
  if (!isNonBlankString(b.attemptId)) return null;
  if (b.language !== undefined && typeof b.language !== 'string') return null;

  return {
    username: b.username,
    password: b.password,
    deviceId: b.deviceId,
    attemptId: b.attemptId,
    language: typeof b.language === 'string' ? b.language : undefined,
  };
}

export interface ValidPageOpenInput {
  operationId: string;
  language?: string;
  route?: string;
  deviceId?: string;
}

export function validatePageOpenRequest(body: unknown): ValidPageOpenInput | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;

  if (!hasOnlyKeys(b, ['operationId', 'language', 'route', 'deviceId'])) return null;
  if (!isNonBlankString(b.operationId)) return null;
  if (b.language !== undefined && typeof b.language !== 'string') return null;
  if (b.route !== undefined && typeof b.route !== 'string') return null;
  if (b.deviceId !== undefined && typeof b.deviceId !== 'string') return null;

  return {
    operationId: b.operationId,
    language: typeof b.language === 'string' ? b.language : undefined,
    route: typeof b.route === 'string' ? b.route : undefined,
    deviceId: typeof b.deviceId === 'string' ? b.deviceId : undefined,
  };
}
