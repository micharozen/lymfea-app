// PMS-agnostic client interface and factory
// Supports: Oracle Opera Cloud, Mews

import { createMewsClient } from './mews.ts';
import type { MewsConfig } from './mews.ts';

// --- Agnostic Interfaces ---

export interface GuestInfo {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  reservationId: string;
  checkIn?: string;
  checkOut?: string;
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

export interface PmsClient {
  testConnection(): Promise<{ connected: boolean; error?: string }>;
  lookupGuestByRoom(roomNumber: string): Promise<GuestInfo | null>;
  postCharge(params: ChargeParams): Promise<ChargeResult>;
}

// ============================================================
// Oracle Opera Cloud Implementation
// ============================================================

export interface OperaCloudConfig {
  gatewayUrl: string;
  clientId: string;
  clientSecret: string;
  appKey: string;
  enterpriseId: string;
  pmsHotelId: string;
}

// Keep legacy alias for backwards compatibility with existing edge functions
export type PmsConfig = OperaCloudConfig;

// --- Token cache ---

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

const tokenCache = new Map<string, TokenCache>();

async function getOperaToken(config: OperaCloudConfig): Promise<string> {
  const cacheKey = `${config.gatewayUrl}:${config.clientId}`;
  const cached = tokenCache.get(cacheKey);

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

function invalidateToken(config: OperaCloudConfig): void {
  const cacheKey = `${config.gatewayUrl}:${config.clientId}`;
  tokenCache.delete(cacheKey);
}

async function operaFetch(
  config: OperaCloudConfig,
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

  if (response.status === 401 && retry) {
    invalidateToken(config);
    return operaFetch(config, path, options, false);
  }

  return response;
}

// --- Opera Cloud public API ---

export async function testOperaConnection(config: OperaCloudConfig): Promise<{ connected: boolean; error?: string }> {
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
  config: OperaCloudConfig,
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
  const roomStay = reservation?.roomStay;

  return {
    firstName: name?.givenName || '',
    lastName: name?.surname || '',
    email: guestProfile.emails?.emailInfo?.[0]?.email?.emailAddress,
    phone: guestProfile.phones?.phoneInfo?.[0]?.phone?.phoneNumber || undefined,
    reservationId: resId,
    checkIn: roomStay?.arrivalDate || undefined,
    checkOut: roomStay?.departureDate || undefined,
  };
}

export async function postChargeToRoom(
  config: OperaCloudConfig,
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

// --- Opera Cloud client factory ---

export function createOperaCloudClient(config: OperaCloudConfig): PmsClient {
  return {
    testConnection: () => testOperaConnection(config),
    lookupGuestByRoom: (roomNumber: string) => lookupGuestByRoom(config, roomNumber),
    postCharge: (params: ChargeParams) => postChargeToRoom(config, params),
  };
}

// ============================================================
// PMS Factory — dispatch by pms_type
// ============================================================

export function buildPmsConfigFromRow(pmsType: string, row: Record<string, any>): OperaCloudConfig | MewsConfig {
  switch (pmsType) {
    case 'opera_cloud':
      return {
        gatewayUrl: row.gateway_url,
        clientId: row.client_id,
        clientSecret: row.client_secret,
        appKey: row.app_key,
        enterpriseId: row.enterprise_id,
        pmsHotelId: row.pms_hotel_id,
      } as OperaCloudConfig;
    case 'mews':
      return {
        baseUrl: row.api_url,
        accessToken: row.access_token,
        serviceId: row.service_id,
        accountingCategoryId: row.accounting_category_id || undefined,
      } as MewsConfig;
    default:
      throw new Error(`Unsupported PMS type: ${pmsType}`);
  }
}

export function getPmsClient(pmsType: string, config: OperaCloudConfig | MewsConfig): PmsClient {
  switch (pmsType) {
    case 'opera_cloud':
      return createOperaCloudClient(config as OperaCloudConfig);
    case 'mews':
      return createMewsClient(config as MewsConfig);
    default:
      throw new Error(`Unsupported PMS type: ${pmsType}`);
  }
}
