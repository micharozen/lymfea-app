// Oracle Opera Cloud PMS API client
// https://docs.oracle.com/en/industries/hospitality/integration-platform/ohipu/

// --- Interfaces ---

export interface PmsConfig {
  gatewayUrl: string;
  clientId: string;
  clientSecret: string;
  appKey: string;
  enterpriseId: string;
  pmsHotelId: string;
}

export interface GuestInfo {
  firstName: string;
  lastName: string;
  email?: string;
  reservationId: string;
}

export interface ChargeParams {
  hotelId: string;
  reservationId: string;
  amount: number;
  currency: string;
  description: string;
  referenceNumber: string;
}

export interface ChargeResult {
  success: boolean;
  chargeId?: string;
  error?: string;
}

// PMS-agnostic interface for future extensibility (Mews, etc.)
export interface PmsClient {
  testConnection(): Promise<{ connected: boolean; error?: string }>;
  lookupGuestByRoom(roomNumber: string): Promise<GuestInfo | null>;
  postCharge(params: ChargeParams): Promise<ChargeResult>;
}

// --- Token cache ---

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

const tokenCache = new Map<string, TokenCache>();

// --- Opera Cloud implementation ---

async function getOperaToken(config: PmsConfig): Promise<string> {
  const cacheKey = `${config.gatewayUrl}:${config.clientId}`;
  const cached = tokenCache.get(cacheKey);

  // Return cached token if still valid (5 min buffer)
  if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cached.accessToken;
  }

  const credentials = btoa(`${config.clientId}:${config.clientSecret}`);

  const response = await fetch(`${config.gatewayUrl}/oauth/v1/tokens`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
      'x-app-key': config.appKey,
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Opera Cloud OAuth failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  tokenCache.set(cacheKey, {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  });

  return data.access_token;
}

function invalidateToken(config: PmsConfig): void {
  const cacheKey = `${config.gatewayUrl}:${config.clientId}`;
  tokenCache.delete(cacheKey);
}

async function operaFetch(
  config: PmsConfig,
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<Response> {
  const token = await getOperaToken(config);

  const response = await fetch(`${config.gatewayUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'x-app-key': config.appKey,
      'x-hotelid': config.pmsHotelId,
      ...(options.headers || {}),
    },
  });

  // Retry once on 401 (expired token)
  if (response.status === 401 && retry) {
    invalidateToken(config);
    return operaFetch(config, path, options, false);
  }

  return response;
}

// --- Public API ---

export async function testOperaConnection(config: PmsConfig): Promise<{ connected: boolean; error?: string }> {
  try {
    await getOperaToken(config);
    return { connected: true };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function lookupGuestByRoom(
  config: PmsConfig,
  roomNumber: string,
): Promise<GuestInfo | null> {
  const path = `/rsv/v1/hotels/${encodeURIComponent(config.pmsHotelId)}/reservations?roomId=${encodeURIComponent(roomNumber)}&reservationStatuses=InHouse&limit=1`;

  const response = await operaFetch(config, path);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Opera Cloud guest lookup failed:', response.status, errorText);
    return null;
  }

  const data = await response.json();

  const reservations = data?.reservations?.reservationInfo;
  if (!reservations || reservations.length === 0) {
    return null;
  }

  const reservation = reservations[0];
  const guestProfile = reservation?.reservationGuest?.profileInfo?.profile;
  const resId = reservation?.reservationIdList?.[0]?.id;

  if (!guestProfile || !resId) {
    return null;
  }

  const name = guestProfile.customer?.personName?.[0];

  return {
    firstName: name?.givenName || '',
    lastName: name?.surname || '',
    email: guestProfile.emails?.emailInfo?.[0]?.email?.emailAddress,
    reservationId: resId,
  };
}

export async function postChargeToRoom(
  config: PmsConfig,
  params: ChargeParams,
): Promise<ChargeResult> {
  const path = `/csh/v1/hotels/${encodeURIComponent(params.hotelId)}/reservations/${encodeURIComponent(params.reservationId)}/charges`;

  const body = {
    criteria: {
      postings: [{
        transactionCode: 'SPA',
        amount: {
          amount: params.amount,
          currencyCode: params.currency,
        },
        description: params.description,
        reference: params.referenceNumber,
      }],
    },
  };

  const response = await operaFetch(config, path, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Opera Cloud charge posting failed:', response.status, errorText);
    return {
      success: false,
      error: `Opera Cloud error (${response.status}): ${errorText}`,
    };
  }

  const data = await response.json();

  return {
    success: true,
    chargeId: data?.postingId || data?.transactionNo || 'posted',
  };
}

// --- Factory for PMS-agnostic access ---

export function createOperaCloudClient(config: PmsConfig): PmsClient {
  return {
    testConnection: () => testOperaConnection(config),
    lookupGuestByRoom: (roomNumber: string) => lookupGuestByRoom(config, roomNumber),
    postCharge: (params: ChargeParams) => postChargeToRoom(config, params),
  };
}

export function getPmsClient(pmsType: string, config: PmsConfig): PmsClient {
  switch (pmsType) {
    case 'opera_cloud':
      return createOperaCloudClient(config);
    default:
      throw new Error(`Unsupported PMS type: ${pmsType}`);
  }
}
