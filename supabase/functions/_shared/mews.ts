// Mews Connector API client
// https://docs.mews.com/connector-api

import type { PmsClient, GuestInfo, ChargeParams, ChargeResult } from './pms-client.ts';

// --- Config ---

export interface MewsConfig {
  baseUrl: string;               // https://api.mews.com or https://api.mews-demo.com
  clientToken: string;           // Per-property ClientToken (Connector API)
  accessToken: string;           // Per-property AccessToken
  serviceId: string;             // Spa ServiceId in Mews
  accountingCategoryId?: string; // Optional accounting category
}

// --- Mews API helper ---

async function mewsFetch(
  config: MewsConfig,
  endpoint: string,
  body: Record<string, unknown>,
): Promise<Response> {
  if (!config.clientToken) {
    throw new Error('Mews ClientToken is not configured for this venue');
  }
  if (!config.accessToken) {
    throw new Error('Mews AccessToken is not configured for this venue');
  }

  return fetch(`${config.baseUrl}/api/connector/v1/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ClientToken: config.clientToken,
      AccessToken: config.accessToken,
      Client: 'saoma',
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
//
// Uses Mews Connector API v2023-06-06 for reservations/getAll. The legacy
// (2017) version was discontinued in May 2025. Notable differences vs legacy:
// - URL is /reservations/getAll/2023-06-06
// - Time filter is `CollidingUtc: { StartUtc, EndUtc }` (no top-level StartUtc/EndUtc)
// - `Limitation` is mandatory
// - `Extent` no longer exists — customers/resources must be fetched separately
// - Response uses `AccountId` (with `AccountType`) instead of `CustomerId`
// - Response splits times into `Scheduled*Utc` and `Actual*Utc`

async function mewsLookupGuestByRoom(
  config: MewsConfig,
  roomNumber: string,
): Promise<GuestInfo | null> {
  try {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const response = await mewsFetch(config, 'reservations/getAll/2023-06-06', {
      CollidingUtc: {
        StartUtc: now.toISOString(),
        EndUtc: tomorrow.toISOString(),
      },
      States: ['Started'], // InHouse
      Limitation: { Count: 1000 },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Mews reservations lookup failed:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    const reservations: any[] = data?.Reservations || [];
    if (reservations.length === 0) return null;

    // Fetch resources (rooms) referenced by these reservations
    const resourceIds = Array.from(
      new Set(reservations.map((r) => r.AssignedResourceId).filter(Boolean)),
    );
    const resources = await fetchMewsResources(config, resourceIds);

    // Find reservation whose assigned resource name matches the room number
    const matched = reservations.find((reservation) => {
      const resource = resources[reservation.AssignedResourceId];
      if (!resource) return false;
      return resource.Name === roomNumber || resource.Name === String(roomNumber);
    });

    if (!matched) return null;

    // AccountId replaces CustomerId in 2023-06-06; only customer accounts have personal info
    const accountId: string | undefined = matched.AccountId;
    const accountType: string | undefined = matched.AccountType;
    if (!accountId || (accountType && accountType !== 'Customer')) return null;

    const customer = await fetchMewsCustomer(config, accountId);
    if (!customer) return null;

    return {
      firstName: customer.FirstName || '',
      lastName: customer.LastName || '',
      email: customer.Email || undefined,
      phone: customer.Phone || undefined,
      accountId,
      reservationId: matched.Id,
      checkIn: matched.ActualStartUtc || matched.ScheduledStartUtc || undefined,
      checkOut: matched.ActualEndUtc || matched.ScheduledEndUtc || undefined,
    };
  } catch (error) {
    console.error('Mews guest lookup error:', error);
    return null;
  }
}

// --- Resources lookup (rooms) ---

async function fetchMewsResources(
  config: MewsConfig,
  resourceIds: string[],
): Promise<Record<string, any>> {
  if (resourceIds.length === 0) return {};

  const response = await mewsFetch(config, 'resources/getAll', {
    ResourceIds: resourceIds,
    Limitation: { Count: 1000 },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Mews resources lookup failed:', response.status, errorText);
    return {};
  }

  const data = await response.json();
  const map: Record<string, any> = {};
  for (const r of data?.Resources || []) {
    map[r.Id] = r;
  }
  return map;
}

// --- Customer lookup ---

async function fetchMewsCustomer(
  config: MewsConfig,
  customerId: string,
): Promise<any | null> {
  const response = await mewsFetch(config, 'customers/getAll', {
    CustomerIds: [customerId],
    Limitation: { Count: 1 },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Mews customers lookup failed:', response.status, errorText);
    return null;
  }

  const data = await response.json();
  const customers: any[] = data?.Customers || [];
  return customers[0] || null;
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
    if (params.consumptionUtc) {
      body.ConsumptionUtc = params.consumptionUtc;
    }
    if (params.linkedReservationId) {
      body.LinkedReservationId = params.linkedReservationId;
    }

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
  const response = await mewsFetch(config, 'services/getAll', {
    Limitation: { Count: 1000 },
  });

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
