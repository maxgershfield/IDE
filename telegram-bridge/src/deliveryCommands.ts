export type DeliveryCommand =
  | { kind: 'help' }
  | { kind: 'registerCourier'; avatarId: string; vehicleType: string; displayName: string }
  | { kind: 'setAvailability'; courierHolonId: string; isOnline: boolean; lat?: number; lng?: number }
  | { kind: 'acceptOrder'; orderId: string; courierHolonId: string }
  | { kind: 'updateStatus'; orderId: string; status: 'en-route' | 'delivered' | 'cancelled' }
  | { kind: 'dispatchPreview'; orderId: string; maxCandidates?: number }
  | { kind: 'unassignedOrders' };

export const DELIVERY_HELP = [
  'Delivery commands:',
  '/courier_register <avatarId> <vehicle> <display name>',
  '/available <courierHolonId> [lat lng]',
  '/offline <courierHolonId>',
  '/orders',
  '/couriers <orderHolonId> [max]',
  'accept <orderHolonId> <courierHolonId>',
  'picked <orderHolonId>',
  'delivered <orderHolonId>',
].join('\n');

function maybeNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function parseDeliveryCommand(text: string): DeliveryCommand | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(/\s+/);
  const command = parts[0]?.toLowerCase();
  if (!command) return null;

  if (command === '/delivery_help' || command === '/delivery' || command === '/courier_help') {
    return { kind: 'help' };
  }

  if (command === '/courier_register') {
    const [, avatarId, vehicleType, ...nameParts] = parts;
    if (!avatarId || !vehicleType || nameParts.length === 0) return { kind: 'help' };
    return {
      kind: 'registerCourier',
      avatarId,
      vehicleType,
      displayName: nameParts.join(' '),
    };
  }

  if (command === '/available') {
    const [, courierHolonId, latRaw, lngRaw] = parts;
    if (!courierHolonId) return { kind: 'help' };
    return {
      kind: 'setAvailability',
      courierHolonId,
      isOnline: true,
      lat: maybeNumber(latRaw),
      lng: maybeNumber(lngRaw),
    };
  }

  if (command === '/offline') {
    const [, courierHolonId] = parts;
    if (!courierHolonId) return { kind: 'help' };
    return { kind: 'setAvailability', courierHolonId, isOnline: false };
  }

  if (command === '/couriers') {
    const [, orderId, maxRaw] = parts;
    if (!orderId) return { kind: 'help' };
    return { kind: 'dispatchPreview', orderId, maxCandidates: maybeNumber(maxRaw) };
  }

  if (command === '/orders') {
    return { kind: 'unassignedOrders' };
  }

  if (command === 'accept') {
    const [, orderId, courierHolonId] = parts;
    if (!orderId || !courierHolonId) return { kind: 'help' };
    return { kind: 'acceptOrder', orderId, courierHolonId };
  }

  if (command === 'picked') {
    const [, orderId] = parts;
    if (!orderId) return { kind: 'help' };
    return { kind: 'updateStatus', orderId, status: 'en-route' };
  }

  if (command === 'delivered') {
    const [, orderId] = parts;
    if (!orderId) return { kind: 'help' };
    return { kind: 'updateStatus', orderId, status: 'delivered' };
  }

  if (command === 'cancelled' || command === 'canceled') {
    const [, orderId] = parts;
    if (!orderId) return { kind: 'help' };
    return { kind: 'updateStatus', orderId, status: 'cancelled' };
  }

  return null;
}
