import 'dotenv/config';
import { Bot, type Context } from 'grammy';
import { DELIVERY_HELP, parseDeliveryCommand, type DeliveryCommand } from './deliveryCommands.js';
import { callMcpTool, type McpToolResult } from './deliveryMcpClient.js';

// ── Config ────────────────────────────────────────────────────────────────────

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim();
if (!BOT_TOKEN) {
  console.error('[Bridge] TELEGRAM_BOT_TOKEN is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const BRIDGE_SECRET = process.env.OASIS_IDE_BRIDGE_SECRET?.trim();
if (!BRIDGE_SECRET) {
  console.error('[Bridge] OASIS_IDE_BRIDGE_SECRET is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const BRIDGE_PORT = parseInt(process.env.OASIS_IDE_BRIDGE_PORT ?? '7391', 10);
const IDE_ENDPOINT = `http://127.0.0.1:${BRIDGE_PORT}/api/ide/inbound`;

const ALLOWED_USER_IDS: Set<number> = new Set(
  (process.env.TELEGRAM_ALLOWED_USER_IDS ?? '')
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0)
);

const ALLOWED_CHAT_ID = process.env.TELEGRAM_ALLOWED_CHAT_ID
  ? parseInt(process.env.TELEGRAM_ALLOWED_CHAT_ID, 10)
  : null;

const CONFIRM_MESSAGE =
  process.env.CONFIRM_MESSAGE?.trim() ||
  'Task received. The IDE is working on it.';

const DELIVERY_BOT_ENABLED = /^(1|true|yes)$/i.test(process.env.DELIVERY_BOT_ENABLED ?? '');
const DELIVERY_MCP_ENDPOINT = process.env.OASIS_MCP_HTTP_URL?.trim() || '';
const DELIVERY_MCP_TOKEN = process.env.OASIS_MCP_HTTP_TOKEN?.trim() || undefined;

const courierByChatId = new Map<number, string>(
  (process.env.TELEGRAM_COURIER_MAP ?? '')
    .split(',')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const [chatId, courierHolonId] = pair.split(':').map((s) => s.trim());
      return [Number(chatId), courierHolonId] as const;
    })
    .filter(([chatId, courierHolonId]) => Number.isFinite(chatId) && Boolean(courierHolonId))
);

if (ALLOWED_USER_IDS.size === 0) {
  console.warn('[Bridge] TELEGRAM_ALLOWED_USER_IDS is empty — ALL users can send tasks. Set it in .env to restrict access.');
}

// ── Bot ───────────────────────────────────────────────────────────────────────

const bot = new Bot<Context>(BOT_TOKEN);

/** Check whether a message is from an authorized user. */
function isAuthorized(ctx: Context): boolean {
  const userId = ctx.from?.id;
  if (!userId) return false;
  if (ALLOWED_USER_IDS.size > 0 && !ALLOWED_USER_IDS.has(userId)) return false;
  if (ALLOWED_CHAT_ID !== null && ctx.chat?.id !== ALLOWED_CHAT_ID) return false;
  return true;
}

/** Forward a task to the IDE bridge server. */
async function sendToIDE(payload: {
  taskId: string;
  text: string;
  fromId: number;
  fromUsername?: string;
  fromFirstName?: string;
  chatId: number;
  receivedAt: string;
}): Promise<void> {
  const res = await fetch(IDE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bridge-secret': BRIDGE_SECRET as string,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`IDE returned ${res.status}: ${body}`);
  }
}

/** Reply with the sender's ID so they can add it to TELEGRAM_ALLOWED_USER_IDS. */
async function replyUnauthorized(ctx: Context): Promise<void> {
  const uid = ctx.from?.id;
  console.warn(`[Bridge] Rejected message from user ID: ${uid}`);
  await ctx.reply(
    `Not authorized.\n\nYour Telegram user ID is: ${uid}\n\nAdd it to TELEGRAM_ALLOWED_USER_IDS in telegram-bridge/.env, then restart the bridge.`
  );
}

function findFirstId(value: unknown, depth = 0): string | null {
  if (depth > 5 || value === null || value === undefined) return null;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const id = record.id ?? record.Id;
    if (typeof id === 'string' && id.length > 0) return id;
    for (const child of Object.values(record)) {
      const found = findFirstId(child, depth + 1);
      if (found) return found;
    }
  }
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findFirstId(child, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function formatDeliveryResult(command: DeliveryCommand, result: McpToolResult): string {
  if (result.error) {
    return `Delivery command failed: ${result.message ?? 'Unknown MCP error'}`;
  }

  switch (command.kind) {
    case 'registerCourier': {
      const id = findFirstId(result) ?? '(id not returned)';
      return `Courier registered: ${command.displayName}\nCourierHolon: ${id}\nUse /available ${id} to go online.`;
    }
    case 'setAvailability':
      return command.isOnline
        ? `Courier is online: ${command.courierHolonId}`
        : `Courier is offline: ${command.courierHolonId}`;
    case 'acceptOrder':
      return `Order accepted.\nOrder: ${command.orderId}\nCourier: ${command.courierHolonId}`;
    case 'updateStatus':
      return `Order ${command.orderId} status updated to ${command.status}.`;
    case 'dispatchPreview': {
      const candidates = Array.isArray(result.candidates) ? result.candidates : [];
      if (candidates.length === 0) return `No available couriers found for order ${command.orderId}.`;
      const rows = candidates.slice(0, 5).map((candidate: any, index) => {
        const distance = typeof candidate.distanceMeters === 'number'
          ? ` · ${Math.round(candidate.distanceMeters)}m`
          : '';
        return `${index + 1}. ${candidate.displayName || candidate.courierHolonId}${distance} · trust ${candidate.trustScore ?? 0}`;
      });
      return [`Courier candidates for ${command.orderId}:`, ...rows].join('\n');
    }
    case 'unassignedOrders': {
      const orders = Array.isArray(result.orders) ? result.orders : [];
      if (orders.length === 0) return 'No unassigned placed/confirmed orders.';
      const rows = orders.slice(0, 10).map((order: any, index) => {
        const total = typeof order.totalAmount === 'number' ? ` · ${order.totalAmount} ${order.currency ?? ''}` : '';
        return `${index + 1}. ${order.id} · ${order.status}${total} · ${order.deliveryAddress ?? ''}`;
      });
      return ['Unassigned orders:', ...rows].join('\n');
    }
    case 'help':
      return DELIVERY_HELP;
  }
}

async function executeDeliveryCommand(command: DeliveryCommand): Promise<McpToolResult> {
  if (!DELIVERY_MCP_ENDPOINT) {
    throw new Error('OASIS_MCP_HTTP_URL is not set. Start the MCP HTTP server and set the bridge env var.');
  }

  switch (command.kind) {
    case 'help':
      return { ok: true };
    case 'registerCourier':
      return callMcpTool(DELIVERY_MCP_ENDPOINT, 'holon_courier_create', {
        avatarId: command.avatarId,
        vehicleType: command.vehicleType,
        displayName: command.displayName,
      }, DELIVERY_MCP_TOKEN);
    case 'setAvailability':
      return callMcpTool(DELIVERY_MCP_ENDPOINT, 'holon_courier_set_availability', {
        id: command.courierHolonId,
        isOnline: command.isOnline,
        lat: command.lat,
        lng: command.lng,
      }, DELIVERY_MCP_TOKEN);
    case 'acceptOrder':
      return callMcpTool(DELIVERY_MCP_ENDPOINT, 'holon_delivery_assign_courier', {
        id: command.orderId,
        courierHolonId: command.courierHolonId,
        status: 'confirmed',
      }, DELIVERY_MCP_TOKEN);
    case 'updateStatus':
      return callMcpTool(DELIVERY_MCP_ENDPOINT, 'holon_delivery_update_status', {
        id: command.orderId,
        status: command.status,
      }, DELIVERY_MCP_TOKEN);
    case 'dispatchPreview':
      return callMcpTool(DELIVERY_MCP_ENDPOINT, 'holon_delivery_dispatch_preview', {
        orderId: command.orderId,
        maxCandidates: command.maxCandidates ?? 5,
      }, DELIVERY_MCP_TOKEN);
    case 'unassignedOrders':
      return callMcpTool(DELIVERY_MCP_ENDPOINT, 'holon_delivery_unassigned_list', {}, DELIVERY_MCP_TOKEN);
  }
}

async function tryHandleDeliveryText(ctx: Context, text: string): Promise<boolean> {
  const command = parseDeliveryCommand(text);
  if (!command) return false;

  if (!DELIVERY_BOT_ENABLED) {
    await ctx.reply('Delivery bot mode is disabled. Set DELIVERY_BOT_ENABLED=true to handle courier commands.');
    return true;
  }

  if (command.kind === 'help') {
    await ctx.reply(DELIVERY_HELP);
    return true;
  }

  try {
    await ctx.replyWithChatAction('typing');
    const result = await executeDeliveryCommand(command);
    if (command.kind === 'setAvailability' || command.kind === 'acceptOrder') {
      const courierHolonId = command.kind === 'setAvailability' ? command.courierHolonId : command.courierHolonId;
      if (ctx.chat?.id) courierByChatId.set(ctx.chat.id, courierHolonId);
    }
    await ctx.reply(formatDeliveryResult(command, result));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`Delivery command failed: ${msg}`);
  }
  return true;
}

// ── /start ────────────────────────────────────────────────────────────────────
bot.command('start', async (ctx) => {
  if (!isAuthorized(ctx)) {
    await replyUnauthorized(ctx);
    return;
  }
  await ctx.reply(
    'OASIS IDE Bridge ready.\n\n' +
      'Send me any message or idea and I will queue it in the IDE for the agent to work on.\n\n' +
      'Commands:\n' +
      '/status — check IDE bridge connectivity\n' +
      '/help   — show this message'
  );
});

// ── /help ─────────────────────────────────────────────────────────────────────
bot.command('help', async (ctx) => {
  if (!isAuthorized(ctx)) {
    await replyUnauthorized(ctx);
    return;
  }
  await ctx.reply(
    'Send any text message to queue a task in the OASIS IDE.\n\n' +
      'The IDE will show a banner in the Composer — click "Work on it" to start the agent, ' +
      'or "Use as draft" to pre-fill the input and review first.\n\n' +
      '/status — ping the IDE bridge server\n' +
      '/help   — show this message'
  );
});

// ── /status ───────────────────────────────────────────────────────────────────
bot.command('status', async (ctx) => {
  if (!isAuthorized(ctx)) {
    await replyUnauthorized(ctx);
    return;
  }
  try {
    const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/api/ide/ping`, {
      headers: { 'x-bridge-secret': BRIDGE_SECRET as string },
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      await ctx.reply('IDE bridge is online.');
    } else {
      await ctx.reply(`IDE bridge responded with status ${res.status}. Is OASIS IDE running?`);
    }
  } catch {
    await ctx.reply(
      `IDE bridge unreachable on port ${BRIDGE_PORT}. Make sure OASIS IDE is running.`
    );
  }
});

// ── Text messages → IDE tasks ─────────────────────────────────────────────────
bot.on('message:text', async (ctx) => {
  if (!isAuthorized(ctx)) {
    await replyUnauthorized(ctx);
    return;
  }

  const text = ctx.message.text.trim();
  if (!text) return;

  if (await tryHandleDeliveryText(ctx, text)) {
    return;
  }

  if (text.startsWith('/')) return;

  const taskId = `tg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    await ctx.replyWithChatAction('typing');
    await sendToIDE({
      taskId,
      text,
      fromId: ctx.from!.id,
      fromUsername: ctx.from?.username,
      fromFirstName: ctx.from?.first_name,
      chatId: ctx.chat.id,
      receivedAt: new Date().toISOString(),
    });
    await ctx.reply(CONFIRM_MESSAGE, { parse_mode: 'Markdown' });
    console.log(`[Bridge] Queued task ${taskId}: ${text.slice(0, 80)}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Bridge] Failed to forward task to IDE:`, msg);
    await ctx.reply(
      'Could not reach the OASIS IDE right now. Make sure the IDE is open and try again.'
    );
  }
});

// ── Courier live location → CourierHolon ───────────────────────────────────────
bot.on('message:location', async (ctx) => {
  if (!isAuthorized(ctx)) {
    await replyUnauthorized(ctx);
    return;
  }

  if (!DELIVERY_BOT_ENABLED) {
    await ctx.reply('Delivery bot mode is disabled. Set DELIVERY_BOT_ENABLED=true to handle courier location updates.');
    return;
  }

  const courierHolonId = ctx.chat?.id ? courierByChatId.get(ctx.chat.id) : undefined;
  if (!courierHolonId) {
    await ctx.reply('No CourierHolon is linked to this chat. Send /available <courierHolonId> first.');
    return;
  }
  if (!DELIVERY_MCP_ENDPOINT) {
    await ctx.reply('OASIS_MCP_HTTP_URL is not set. Start the MCP HTTP server and set the bridge env var.');
    return;
  }

  try {
    const location = ctx.message.location;
    await callMcpTool(DELIVERY_MCP_ENDPOINT, 'holon_courier_update_location', {
      id: courierHolonId,
      lat: location.latitude,
      lng: location.longitude,
    }, DELIVERY_MCP_TOKEN);
    await ctx.reply('Location updated.');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`Could not update location: ${msg}`);
  }
});

// ── Photo / document messages ─────────────────────────────────────────────────
bot.on('message:photo', async (ctx) => {
  if (!isAuthorized(ctx)) {
    await replyUnauthorized(ctx);
    return;
  }
  const caption = ctx.message.caption?.trim() ?? '';
  const taskId = `tg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const text = caption
    ? `[Image received with caption: ${caption}]`
    : '[Image received — no caption]';
  try {
    await sendToIDE({
      taskId,
      text,
      fromId: ctx.from!.id,
      fromUsername: ctx.from?.username,
      fromFirstName: ctx.from?.first_name,
      chatId: ctx.chat.id,
      receivedAt: new Date().toISOString(),
    });
    await ctx.reply(CONFIRM_MESSAGE, { parse_mode: 'Markdown' });
  } catch {
    await ctx.reply('Could not reach the OASIS IDE right now.');
  }
});

// ── Error handling ────────────────────────────────────────────────────────────
bot.catch((err) => {
  console.error('[Bridge] Bot error:', err.message);
});

// ── Start polling ─────────────────────────────────────────────────────────────
console.log('[Bridge] Starting OASIS IDE Telegram bridge (long-polling)...');
console.log(`[Bridge] IDE endpoint: ${IDE_ENDPOINT}`);
if (ALLOWED_USER_IDS.size > 0) {
  console.log(`[Bridge] Authorized user IDs: ${[...ALLOWED_USER_IDS].join(', ')}`);
}

bot.start({
  onStart: (info) => {
    console.log(`[Bridge] Bot @${info.username} is running. Send a message to queue IDE tasks.`);
  },
}).catch((err) => {
  console.error('[Bridge] Failed to start bot:', err.message);
  process.exit(1);
});
