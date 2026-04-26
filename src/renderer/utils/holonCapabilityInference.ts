import type { HolonCapabilityKind, HolonCapabilityModel } from '../../shared/holonCapabilityTypes';
import { holonTypeNameFromEnum } from '../services/holonTypeLabels';
import type { StarHolonRecord } from '../services/starApiService';

function textForHolon(h: StarHolonRecord): string {
  return `${h.name ?? ''} ${h.description ?? ''} ${holonTypeNameFromEnum(h.holonType)} ${Object.values(h.metaData ?? {}).join(' ')}`.toLowerCase();
}

function inferKind(text: string): HolonCapabilityKind {
  if (/\b(user|profile|avatar|identity|account|login|auth)\b/.test(text)) return 'identity';
  if (/\b(menu|catalog|item|sku|product|listing|marketplace|restaurant|venue|seller)\b/.test(text)) return 'catalog';
  if (/\b(cart|order|checkout|booking|purchase)\b/.test(text)) return 'order';
  if (/\b(delivery|courier|rider|dispatch|eta|fulfill|fulfillment)\b/.test(text)) return 'logistics';
  if (/\b(pay|payment|wallet|payout|billing|tip|fee)\b/.test(text)) return 'payment';
  if (/\b(notif|notification|message|chat|email|sms|push)\b/.test(text)) return 'communication';
  if (/\b(review|rating|karma|trust|reputation|comment|forum)\b/.test(text)) return 'trust';
  if (/\b(location|geo|map|address|zone|area)\b/.test(text)) return 'location';
  if (/\b(admin|moderation|support|ops|sop)\b/.test(text)) return 'admin';
  if (/\b(form|submission|field|survey)\b/.test(text)) return 'form';
  if (/\b(content|post|article|media|comment|forum)\b/.test(text)) return 'content';
  if (/\b(workflow|sop|process|state machine|status)\b/.test(text)) return 'workflow';
  return 'unknown';
}

function schemaHints(kind: HolonCapabilityKind): string[] {
  switch (kind) {
    case 'identity': return ['userId', 'avatarId', 'displayName', 'walletAddress'];
    case 'catalog': return ['itemId', 'title', 'description', 'price', 'availability', 'ownerId'];
    case 'order': return ['orderId', 'lineItems', 'status', 'buyerId', 'total'];
    case 'logistics': return ['deliveryId', 'orderId', 'courierId', 'pickup', 'dropoff', 'eta', 'status'];
    case 'payment': return ['paymentId', 'orderId', 'amount', 'currency', 'status', 'providerRef'];
    case 'communication': return ['messageId', 'recipientId', 'channel', 'template', 'payload', 'sentAt'];
    case 'trust': return ['reviewId', 'authorId', 'targetId', 'rating', 'comment', 'createdAt'];
    case 'location': return ['addressId', 'lat', 'lng', 'serviceArea', 'geohash'];
    case 'admin': return ['actorId', 'action', 'targetId', 'reason', 'auditStatus'];
    case 'form': return ['formId', 'fields', 'submissionId', 'submittedBy', 'status'];
    case 'content': return ['contentId', 'authorId', 'body', 'parentId', 'visibility'];
    case 'workflow': return ['workflowId', 'state', 'transition', 'actorId', 'timestamp'];
    default: return [];
  }
}

function ports(kind: HolonCapabilityKind): HolonCapabilityModel['ports'] {
  switch (kind) {
    case 'catalog':
      return [
        { id: 'catalog-query', direction: 'input', label: 'Query catalog', dataShape: 'filters/search/location' },
        { id: 'item-selected', direction: 'event', label: 'Item selected', dataShape: 'itemId + quantity/options' },
      ];
    case 'order':
      return [
        { id: 'order-create', direction: 'input', label: 'Create order', dataShape: 'user + lineItems + delivery preferences' },
        { id: 'order-status', direction: 'event', label: 'Order status changed', dataShape: 'orderId + status' },
      ];
    case 'logistics':
      return [
        { id: 'delivery-request', direction: 'input', label: 'Request delivery', dataShape: 'order + pickup/dropoff' },
        { id: 'delivery-status', direction: 'event', label: 'Delivery status changed', dataShape: 'deliveryId + eta/status' },
      ];
    case 'payment':
      return [
        { id: 'payment-request', direction: 'input', label: 'Request payment', dataShape: 'orderId + amount' },
        { id: 'payment-confirmed', direction: 'event', label: 'Payment confirmed', dataShape: 'paymentId + status' },
      ];
    case 'communication':
      return [{ id: 'notify', direction: 'input', label: 'Send notification', dataShape: 'recipient + channel + payload' }];
    case 'identity':
      return [{ id: 'current-user', direction: 'output', label: 'Current user', dataShape: 'user/avatar profile' }];
    default:
      return [{ id: 'domain-data', direction: 'output', label: 'Domain data', dataShape: 'holon-specific payload' }];
  }
}

function relationRules(kind: HolonCapabilityKind): HolonCapabilityModel['relationRules'] {
  switch (kind) {
    case 'catalog':
      return [{ relation: 'feeds_items_to', targetKinds: ['order'], reason: 'Catalog selections become order line items.' }];
    case 'order':
      return [
        { relation: 'requests_payment_from', targetKinds: ['payment'], reason: 'Orders require payment confirmation.' },
        { relation: 'hands_delivery_to', targetKinds: ['logistics'], reason: 'Orders create fulfillment/delivery work.' },
        { relation: 'publishes_status_to', targetKinds: ['communication'], reason: 'Order changes should notify users.' },
      ];
    case 'logistics':
      return [{ relation: 'publishes_delivery_status_to', targetKinds: ['communication'], reason: 'Delivery changes should notify users.' }];
    case 'identity':
      return [{ relation: 'owns_activity_in', targetKinds: ['order', 'trust', 'catalog'], reason: 'User identity owns app activity.' }];
    case 'trust':
      return [{ relation: 'reviews', targetKinds: ['catalog', 'order', 'logistics'], reason: 'Reviews attach to completed services or listings.' }];
    default:
      return [];
  }
}

function uiSurfaces(kind: HolonCapabilityKind): HolonCapabilityModel['uiSurfaces'] {
  switch (kind) {
    case 'catalog': return [{ kind: 'screen', label: 'Catalog/listing screen', description: 'Browse and select items or venues.' }];
    case 'order': return [{ kind: 'service', label: 'Order workflow service', description: 'Create and track order state.' }];
    case 'logistics': return [{ kind: 'screen', label: 'Delivery tracking screen', description: 'Show courier/delivery ETA and status.' }];
    case 'payment': return [{ kind: 'adapter', label: 'Payment adapter', description: 'Bridge checkout UI to payment rails.' }];
    case 'communication': return [{ kind: 'service', label: 'Notification service', description: 'Send status updates across channels.' }];
    case 'identity': return [{ kind: 'state', label: 'User session state', description: 'Store signed-in user/profile context.' }];
    case 'trust': return [{ kind: 'component', label: 'Review/rating component', description: 'Collect and display trust signals.' }];
    default: return [{ kind: 'service', label: 'Domain adapter', description: 'Expose this holon to app code through a typed adapter.' }];
  }
}

export function inferHolonCapability(h: StarHolonRecord): HolonCapabilityModel {
  const text = textForHolon(h);
  const kind = inferKind(text);
  return {
    kind,
    confidence: kind === 'unknown' ? 0.25 : 0.72,
    summary: kind === 'unknown' ? 'Generic holon capability inferred from limited catalog metadata.' : `Acts as the app's ${kind} capability.`,
    schemaHints: schemaHints(kind),
    ports: ports(kind),
    relationRules: relationRules(kind),
    runtimeBindings: [
      { kind: 'star-api', label: 'STAR catalog lookup', details: 'Use star_get_holon/star_get_oapp to fetch full metadata before implementation.' },
      { kind: 'local-adapter', label: 'Typed app adapter', details: 'Wrap this holon behind a local service/module before wiring UI screens.' },
    ],
    uiSurfaces: uiSurfaces(kind),
    verification: [
      'Verify catalog id resolves before wiring.',
      'Create a fixture/example payload for the inferred schema.',
      'Run the primary app flow using this holon capability.',
    ],
  };
}
