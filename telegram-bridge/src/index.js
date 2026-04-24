"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var _a, _b, _c, _d, _e;
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
var grammy_1 = require("grammy");
// ── Config ────────────────────────────────────────────────────────────────────
var BOT_TOKEN = (_a = process.env.TELEGRAM_BOT_TOKEN) === null || _a === void 0 ? void 0 : _a.trim();
if (!BOT_TOKEN) {
    console.error('[Bridge] TELEGRAM_BOT_TOKEN is not set. Copy .env.example to .env and fill it in.');
    process.exit(1);
}
var BRIDGE_SECRET = (_b = process.env.OASIS_IDE_BRIDGE_SECRET) === null || _b === void 0 ? void 0 : _b.trim();
if (!BRIDGE_SECRET) {
    console.error('[Bridge] OASIS_IDE_BRIDGE_SECRET is not set. Copy .env.example to .env and fill it in.');
    process.exit(1);
}
var BRIDGE_PORT = parseInt((_c = process.env.OASIS_IDE_BRIDGE_PORT) !== null && _c !== void 0 ? _c : '7391', 10);
var IDE_ENDPOINT = "http://127.0.0.1:".concat(BRIDGE_PORT, "/api/ide/inbound");
var ALLOWED_USER_IDS = new Set(((_d = process.env.TELEGRAM_ALLOWED_USER_IDS) !== null && _d !== void 0 ? _d : '')
    .split(',')
    .map(function (s) { return parseInt(s.trim(), 10); })
    .filter(function (n) { return !isNaN(n) && n > 0; }));
var ALLOWED_CHAT_ID = process.env.TELEGRAM_ALLOWED_CHAT_ID
    ? parseInt(process.env.TELEGRAM_ALLOWED_CHAT_ID, 10)
    : null;
var CONFIRM_MESSAGE = ((_e = process.env.CONFIRM_MESSAGE) === null || _e === void 0 ? void 0 : _e.trim()) ||
    'Task received. The IDE is working on it.';
if (ALLOWED_USER_IDS.size === 0) {
    console.warn('[Bridge] TELEGRAM_ALLOWED_USER_IDS is empty — ALL users can send tasks. Set it in .env to restrict access.');
}
// ── Bot ───────────────────────────────────────────────────────────────────────
var bot = new grammy_1.Bot(BOT_TOKEN);
/** Check whether a message is from an authorized user. */
function isAuthorized(ctx) {
    var _a, _b;
    var userId = (_a = ctx.from) === null || _a === void 0 ? void 0 : _a.id;
    if (!userId)
        return false;
    if (ALLOWED_USER_IDS.size > 0 && !ALLOWED_USER_IDS.has(userId))
        return false;
    if (ALLOWED_CHAT_ID !== null && ((_b = ctx.chat) === null || _b === void 0 ? void 0 : _b.id) !== ALLOWED_CHAT_ID)
        return false;
    return true;
}
/** Forward a task to the IDE bridge server. */
function sendToIDE(payload) {
    return __awaiter(this, void 0, void 0, function () {
        var res, body;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fetch(IDE_ENDPOINT, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-bridge-secret': BRIDGE_SECRET,
                        },
                        body: JSON.stringify(payload),
                        signal: AbortSignal.timeout(8000),
                    })];
                case 1:
                    res = _a.sent();
                    if (!!res.ok) return [3 /*break*/, 3];
                    return [4 /*yield*/, res.text().catch(function () { return ''; })];
                case 2:
                    body = _a.sent();
                    throw new Error("IDE returned ".concat(res.status, ": ").concat(body));
                case 3: return [2 /*return*/];
            }
        });
    });
}
/** Reply with the sender's ID so they can add it to TELEGRAM_ALLOWED_USER_IDS. */
function replyUnauthorized(ctx) {
    return __awaiter(this, void 0, void 0, function () {
        var uid;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    uid = (_a = ctx.from) === null || _a === void 0 ? void 0 : _a.id;
                    console.warn("[Bridge] Rejected message from user ID: ".concat(uid));
                    return [4 /*yield*/, ctx.reply("Not authorized.\n\nYour Telegram user ID is: ".concat(uid, "\n\nAdd it to TELEGRAM_ALLOWED_USER_IDS in telegram-bridge/.env, then restart the bridge."))];
                case 1:
                    _b.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// ── /start ────────────────────────────────────────────────────────────────────
bot.command('start', function (ctx) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                if (!!isAuthorized(ctx)) return [3 /*break*/, 2];
                return [4 /*yield*/, replyUnauthorized(ctx)];
            case 1:
                _a.sent();
                return [2 /*return*/];
            case 2: return [4 /*yield*/, ctx.reply('OASIS IDE Bridge ready.\n\n' +
                    'Send me any message or idea and I will queue it in the IDE for the agent to work on.\n\n' +
                    'Commands:\n' +
                    '/status — check IDE bridge connectivity\n' +
                    '/help   — show this message')];
            case 3:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
// ── /help ─────────────────────────────────────────────────────────────────────
bot.command('help', function (ctx) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                if (!!isAuthorized(ctx)) return [3 /*break*/, 2];
                return [4 /*yield*/, replyUnauthorized(ctx)];
            case 1:
                _a.sent();
                return [2 /*return*/];
            case 2: return [4 /*yield*/, ctx.reply('Send any text message to queue a task in the OASIS IDE.\n\n' +
                    'The IDE will show a banner in the Composer — click "Work on it" to start the agent, ' +
                    'or "Use as draft" to pre-fill the input and review first.\n\n' +
                    '/status — ping the IDE bridge server\n' +
                    '/help   — show this message')];
            case 3:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
// ── /status ───────────────────────────────────────────────────────────────────
bot.command('status', function (ctx) { return __awaiter(void 0, void 0, void 0, function () {
    var res, _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                if (!!isAuthorized(ctx)) return [3 /*break*/, 2];
                return [4 /*yield*/, replyUnauthorized(ctx)];
            case 1:
                _b.sent();
                return [2 /*return*/];
            case 2:
                _b.trys.push([2, 8, , 10]);
                return [4 /*yield*/, fetch("http://127.0.0.1:".concat(BRIDGE_PORT, "/api/ide/ping"), {
                        headers: { 'x-bridge-secret': BRIDGE_SECRET },
                        signal: AbortSignal.timeout(4000),
                    })];
            case 3:
                res = _b.sent();
                if (!res.ok) return [3 /*break*/, 5];
                return [4 /*yield*/, ctx.reply('IDE bridge is online.')];
            case 4:
                _b.sent();
                return [3 /*break*/, 7];
            case 5: return [4 /*yield*/, ctx.reply("IDE bridge responded with status ".concat(res.status, ". Is OASIS IDE running?"))];
            case 6:
                _b.sent();
                _b.label = 7;
            case 7: return [3 /*break*/, 10];
            case 8:
                _a = _b.sent();
                return [4 /*yield*/, ctx.reply("IDE bridge unreachable on port ".concat(BRIDGE_PORT, ". Make sure OASIS IDE is running."))];
            case 9:
                _b.sent();
                return [3 /*break*/, 10];
            case 10: return [2 /*return*/];
        }
    });
}); });
// ── Text messages → IDE tasks ─────────────────────────────────────────────────
bot.on('message:text', function (ctx) { return __awaiter(void 0, void 0, void 0, function () {
    var text, taskId, err_1, msg;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                if (!!isAuthorized(ctx)) return [3 /*break*/, 2];
                return [4 /*yield*/, replyUnauthorized(ctx)];
            case 1:
                _c.sent();
                return [2 /*return*/];
            case 2:
                text = ctx.message.text.trim();
                if (!text || text.startsWith('/'))
                    return [2 /*return*/];
                taskId = "tg-".concat(Date.now(), "-").concat(Math.random().toString(36).slice(2, 8));
                _c.label = 3;
            case 3:
                _c.trys.push([3, 7, , 9]);
                return [4 /*yield*/, ctx.replyWithChatAction('typing')];
            case 4:
                _c.sent();
                return [4 /*yield*/, sendToIDE({
                        taskId: taskId,
                        text: text,
                        fromId: ctx.from.id,
                        fromUsername: (_a = ctx.from) === null || _a === void 0 ? void 0 : _a.username,
                        fromFirstName: (_b = ctx.from) === null || _b === void 0 ? void 0 : _b.first_name,
                        chatId: ctx.chat.id,
                        receivedAt: new Date().toISOString(),
                    })];
            case 5:
                _c.sent();
                return [4 /*yield*/, ctx.reply(CONFIRM_MESSAGE, { parse_mode: 'Markdown' })];
            case 6:
                _c.sent();
                console.log("[Bridge] Queued task ".concat(taskId, ": ").concat(text.slice(0, 80)));
                return [3 /*break*/, 9];
            case 7:
                err_1 = _c.sent();
                msg = err_1 instanceof Error ? err_1.message : String(err_1);
                console.error("[Bridge] Failed to forward task to IDE:", msg);
                return [4 /*yield*/, ctx.reply('Could not reach the OASIS IDE right now. Make sure the IDE is open and try again.')];
            case 8:
                _c.sent();
                return [3 /*break*/, 9];
            case 9: return [2 /*return*/];
        }
    });
}); });
// ── Photo / document messages ─────────────────────────────────────────────────
bot.on('message:photo', function (ctx) { return __awaiter(void 0, void 0, void 0, function () {
    var caption, taskId, text, _a;
    var _b, _c, _d, _e;
    return __generator(this, function (_f) {
        switch (_f.label) {
            case 0:
                if (!!isAuthorized(ctx)) return [3 /*break*/, 2];
                return [4 /*yield*/, replyUnauthorized(ctx)];
            case 1:
                _f.sent();
                return [2 /*return*/];
            case 2:
                caption = (_c = (_b = ctx.message.caption) === null || _b === void 0 ? void 0 : _b.trim()) !== null && _c !== void 0 ? _c : '';
                taskId = "tg-".concat(Date.now(), "-").concat(Math.random().toString(36).slice(2, 8));
                text = caption
                    ? "[Image received with caption: ".concat(caption, "]")
                    : '[Image received — no caption]';
                _f.label = 3;
            case 3:
                _f.trys.push([3, 6, , 8]);
                return [4 /*yield*/, sendToIDE({
                        taskId: taskId,
                        text: text,
                        fromId: ctx.from.id,
                        fromUsername: (_d = ctx.from) === null || _d === void 0 ? void 0 : _d.username,
                        fromFirstName: (_e = ctx.from) === null || _e === void 0 ? void 0 : _e.first_name,
                        chatId: ctx.chat.id,
                        receivedAt: new Date().toISOString(),
                    })];
            case 4:
                _f.sent();
                return [4 /*yield*/, ctx.reply(CONFIRM_MESSAGE, { parse_mode: 'Markdown' })];
            case 5:
                _f.sent();
                return [3 /*break*/, 8];
            case 6:
                _a = _f.sent();
                return [4 /*yield*/, ctx.reply('Could not reach the OASIS IDE right now.')];
            case 7:
                _f.sent();
                return [3 /*break*/, 8];
            case 8: return [2 /*return*/];
        }
    });
}); });
// ── Error handling ────────────────────────────────────────────────────────────
bot.catch(function (err) {
    console.error('[Bridge] Bot error:', err.message);
});
// ── Start polling ─────────────────────────────────────────────────────────────
console.log('[Bridge] Starting OASIS IDE Telegram bridge (long-polling)...');
console.log("[Bridge] IDE endpoint: ".concat(IDE_ENDPOINT));
if (ALLOWED_USER_IDS.size > 0) {
    console.log("[Bridge] Authorized user IDs: ".concat(__spreadArray([], ALLOWED_USER_IDS, true).join(', ')));
}
bot.start({
    onStart: function (info) {
        console.log("[Bridge] Bot @".concat(info.username, " is running. Send a message to queue IDE tasks."));
    },
}).catch(function (err) {
    console.error('[Bridge] Failed to start bot:', err.message);
    process.exit(1);
});
