// Mews Connector API client
// https://docs.mews.com/connector-api

import type { PmsClient, GuestInfo, ChargeParams, ChargeResult } from './pms-client.ts';

// --- Config ---

export interface MewsConfig {
  baseUrl: string;               // https://api.mews.com or https://api.mews-demo.com
  accessToken: string;           // Per-property token (from hotel)
  serviceId: string;             // Spa ServiceId in Mews
  accountingCategoryId?: string; // Optional accounting category
}

// ClientToken is global (identifies Lymfea app) — stored in env var MEWS_CLIENT_TOKEN
function getClientToken(): string {
  const token = Deno.env.get('MEWS_CLIENT_TOKEN');
  if (!token) {
    throw new Error('MEWS_CLIENT_TOKEN environment variable is not set');
  }
  return token;
}

// --- Mews API helper ---

async function mewsFetch(
  config: MewsConfig,
  endpoint: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const clientToken = getClientToken();

  return fetch(`${config.baseUrl}/api/connector/v1/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ClientToken: clientToken,
      AccessToken: config.accessToken,
      Client: 'Lymfea',
      ...body,
    }),
  });
}

// --- Test Connection ---

async function testMewsConnection(config: MewsConfig): Promise<{ connected: boolean; error?: string }> {
  try {
    const response = await mewsFetch(config, 'configuration/get', {});

    if (!response.ok) {
      const errorText = await response.text();
      return {
        connected: false,
        error: `Mews error (${response.status}): ${errorText}`,
      };
    }

    return { connected: true };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// --- Guest Lookup by Room ---

async function mewsLookupGuestByRoom(
  config: MewsConfig,
  roomNumber: string,
): Promise<GuestInfo | null> {
  try {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const response = await mewsFetch(config, 'reservations/getAll', {
      StartUtc: now.toISOString(),
      EndUtc: tomorrow.toISOString(),
      States: ['Started'], // InHouse
      Extent: {
        Reservations: true,
        Customers: true,
        Resources: true,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Mews reservations lookup failed:', response.status, errorText);
      return null;
    }

    const data = await response.json();

    const reservations = data?.Reservations || [];
    const customers: Record<string, any> = {};
    for (const c of data?.Customers || []) {
      customers[c.Id] = c;
    }
    const resources: Record<string, any> = {};
    for (const r of data?.Resources || []) {
      resources[r.Id] = r;
    }

    // Find reservation matching the room number
    for (const reservation of reservations) {
      const resourceId = reservation.AssignedResourceId;
      const resource = resources[resourceId];
      if (!resource) continue;

      // Match by resource name (= room number/name in Mews)
      if (resource.Name === roomNumber || resource.Name === roomNumber.toString()) {
        const customerId = reservation.CustomerId;
        const customer = customers[customerId];

        if (!customer) continue;

        return {
          firstName: customer.FirstName || '',
          lastName: customer.LastName || '',
          email: customer.Email || undefined,
          phone: customer.Phone || undefined,
          reservationId: reservation.Id,
          checkIn: reservation.StartUtc || undefined,
          checkOut: reservation.EndUtc || undefined,
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Mews guest lookup error:', error);
    return null;
  }
}

// --- Post Charge ---

async function mewsPostCharge(
  config: MewsConfig,
  params: ChargeParams,
): Promise<ChargeResult> {
  try {
    const body: Record<string, unknown> = {
      ServiceId: config.serviceId,
      AccountId: params.reservationId, // In Mews, we use CustomerId as AccountId
      Items: [{
        Name: params.description,
        UnitCount: 1,
        UnitAmount: {
          Currency: params.currency,
          GrossValue: params.amount,
        },
        ...(config.accountingCategoryId
          ? { AccountingCategoryId: config.accountingCategoryId }
          : {}),
      }],
      Notes: `Lymfea ${params.referenceNumber}`,
    };

    const response = await mewsFetch(config, 'orders/add', body);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Mews charge posting failed:', response.status, errorText);
      return {
        success: false,
        error: `Mews error (${response.status}): ${errorText}`,
      };
    }

    const data = await response.json();

    return {
      success: true,
      chargeId: data?.OrderId || data?.ChargeId || 'posted',
    };
  } catch (error) {
    console.error('Mews post charge error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// --- Fetch available services (for admin setup) ---

export interface MewsService {
  id: string;
  name: string;
  isActive: boolean;
  type: string;
}

export async function fetchMewsServices(config: MewsConfig): Promise<MewsService[]> {
  const response = await mewsFetch(config, 'services/getAll', {});

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Mews error (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  return (data?.Services || [])
    .filter((s: any) => s.IsActive)
    .map((s: any) => ({
      id: s.Id,
      name: s.Name,
      isActive: s.IsActive,
      type: s.Data?.Discriminator || s.Type,
    }));
}

// --- Client Factory ---

export function createMewsClient(config: MewsConfig): PmsClient {
  return {
    testConnection: () => testMewsConnection(config),
    lookupGuestByRoom: (roomNumber: string) => mewsLookupGuestByRoom(config, roomNumber),
    postCharge: (params: ChargeParams) => mewsPostCharge(config, params),
  };
}
