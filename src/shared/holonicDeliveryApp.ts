export interface DeliveryShellScreen {
  id: string;
  title: string;
  primaryAction: string;
  holons: string[];
}

export interface DeliveryShellOperation {
  id: string;
  label: string;
  mcpTool: string;
  purpose: string;
}

export const HOLONIC_DELIVERY_SCREENS: DeliveryShellScreen[] = [
  {
    id: 'restaurants',
    title: 'Restaurants Near You',
    primaryAction: 'Choose a VenueHolon and browse its MenuItemHolons.',
    holons: ['VenueHolon', 'MenuItemHolon'],
  },
  {
    id: 'cart',
    title: 'Basket',
    primaryAction: 'Add menu items and checkout into a DeliveryOrderHolon.',
    holons: ['CartHolon', 'MenuItemHolon', 'DeliveryOrderHolon'],
  },
  {
    id: 'tracking',
    title: 'Order Tracker',
    primaryAction: 'Track status from placed to delivered.',
    holons: ['DeliveryOrderHolon', 'CourierHolon', 'NotificationHolon'],
  },
];

export const HOLONIC_DELIVERY_OPERATIONS: DeliveryShellOperation[] = [
  {
    id: 'list-restaurants',
    label: 'List restaurants',
    mcpTool: 'holon_venue_list',
    purpose: 'Load local VenueHolons with category=restaurant.',
  },
  {
    id: 'list-menu',
    label: 'List menu',
    mcpTool: 'holon_menuitem_list',
    purpose: 'Load MenuItemHolons for the selected VenueHolon.',
  },
  {
    id: 'create-cart',
    label: 'Create basket',
    mcpTool: 'holon_cart_create',
    purpose: 'Create a CartHolon for the customer avatar and venue.',
  },
  {
    id: 'add-item',
    label: 'Add item',
    mcpTool: 'holon_cart_add_item',
    purpose: 'Append a MenuItemHolon to the CartHolon line items.',
  },
  {
    id: 'checkout',
    label: 'Checkout',
    mcpTool: 'holon_cart_checkout',
    purpose: 'Stamp checkoutAt and create the DeliveryOrderHolon.',
  },
  {
    id: 'track-order',
    label: 'Track order',
    mcpTool: 'holon_delivery_get',
    purpose: 'Poll the canonical DeliveryOrderHolon status.',
  },
];

export const HOLONIC_DELIVERY_COURIER_COMMANDS = [
  '/courier_register <avatarId> <vehicle> <display name>',
  '/available <courierHolonId> [lat lng]',
  '/offline <courierHolonId>',
  '/orders',
  '/couriers <orderHolonId> [max]',
  'accept <orderHolonId> <courierHolonId>',
  'picked <orderHolonId>',
  'delivered <orderHolonId>',
] as const;

export function buildHolonicDeliverySummary(): string {
  const screens = HOLONIC_DELIVERY_SCREENS
    .map((screen) => `${screen.title}: ${screen.primaryAction}`)
    .join('\n');
  const operations = HOLONIC_DELIVERY_OPERATIONS
    .map((operation) => `${operation.mcpTool}: ${operation.purpose}`)
    .join('\n');
  return [
    'Holonic delivery customer shell',
    '',
    screens,
    '',
    'MCP operations',
    operations,
    '',
    'Courier Telegram commands',
    HOLONIC_DELIVERY_COURIER_COMMANDS.join('\n'),
  ].join('\n');
}
