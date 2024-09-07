"use strict";Object.defineProperty(exports, "__esModule", {value: true}); var _class;// src/middleware.ts
var _grammy = require('grammy');

// src/utils.ts
function sleep(milli) {
  return new Promise((resolve) => {
    setTimeout(resolve, milli);
  });
}
function buildProgressBtnText(percent, chars = 10) {
  let progress = Math.floor(percent * chars);
  let empty = chars - progress;
  console.log({ progress, empty });
  return "\u2588".repeat(progress) + "\u2591".repeat(empty) + ` (${Math.floor(percent * 1e3) / 10}%)`;
}
function buildProgressText(error, sent, total) {
  return `\u231B Progress: ${error + sent}/${total}
\u2705 Sent: ${sent}
\u274C Error: ${error} (${Math.floor(error / total * 1e4) / 100}%)`;
}

// src/middleware.ts
function getMiddleware(options) {
  var _a;
  const middleware = new (0, _grammy.Composer)();
  let broadcastMiddleware;
  if ((_a = options.sudoUsers) == null ? void 0 : _a.length) {
    broadcastMiddleware = middleware.filter((ctx) => {
      var _a2;
      if ((_a2 = ctx.from) == null ? void 0 : _a2.id) {
        return options.sudoUsers.includes(ctx.from.id);
      }
      return false;
    });
  } else if (typeof options.hasPermission === "function") {
    broadcastMiddleware = middleware.filter(options.hasPermission);
  } else {
    broadcastMiddleware = middleware;
  }
  broadcastMiddleware.command([options.cmds.broadcast, options.cmds.copy, options.cmds.forward], async (ctx) => {
    var _a2;
    let [command, ...args] = ctx.message.text.substring(1).split(" ");
    let type;
    let filter;
    if (command === options.cmds.broadcast) {
      if (args.length < 1) {
        return ctx.reply(`Usage: /${options.cmds.broadcast} <type> [filter]

\`type\` should be copy or forward
\`filter\` is anything that want to passed to getBroadcastChats
`, {
          parse_mode: "Markdown"
        });
      }
      type = args[0];
      filter = args.slice(1).join(" ");
    } else if (command === options.cmds.copy) {
      type = "copy";
      filter = args.join(" ");
    } else if (command === options.cmds.forward) {
      type = "forward";
      filter = args.join(" ");
    }
    if (!["copy", "forward"].includes(type)) {
      return ctx.reply(`Invalid type ${type}`);
    }
    let brdId = Math.random().toString(36).substring(7);
    if (!ctx.message.reply_to_message) {
      return ctx.reply("Reply to a message");
    }
    await options.redisInstance.hset(options.keyPrefix + "info:" + brdId, {
      type,
      chatFilter: filter,
      message_ids: (_a2 = ctx.message.reply_to_message) == null ? void 0 : _a2.message_id.toString(),
      chat_id: ctx.chat.id.toString(),
      user_id: ctx.from.id,
      id: brdId,
      error: "0",
      sent: "0",
      total: "-1"
    });
    return ctx.reply(`
Ready to broadcast!
currently 1 message is in queue
for send multi message in this broadcast reply this command to another message
<code>/${options.cmds.addmsg} ${brdId}</code>
`, {
      parse_mode: "HTML",
      reply_markup: new (0, _grammy.InlineKeyboard)().text("Preview", "brd:preview:" + brdId).row().text("Start", "brd:start:" + brdId).text("Cancel", "brd:stop:" + brdId)
    });
  });
  broadcastMiddleware.command(options.cmds.addmsg, async (ctx) => {
    var _a2;
    let args = ctx.message.text.split(" ").slice(1);
    if (args.length < 1) {
      return ctx.reply(`Usage: /${options.cmds.addmsg} <id>`);
    }
    let brdId = args[0];
    if (!ctx.message.reply_to_message) {
      return ctx.reply("Reply to a message");
    }
    let newMsgId = (_a2 = ctx.message.reply_to_message) == null ? void 0 : _a2.message_id;
    let messageIds = await options.redisInstance.hget(options.keyPrefix + "info:" + brdId, "message_ids");
    let currentIds = messageIds.split("_").map((e) => Number.parseInt(e));
    if (Math.max(newMsgId, ...currentIds) !== newMsgId) {
      return ctx.reply("Message should be newer than previous messages");
    }
    if (currentIds.includes(newMsgId)) {
      return ctx.reply("Message already in queue");
    }
    currentIds.push(newMsgId);
    await options.redisInstance.hset(options.keyPrefix + "info:" + brdId, "message_ids", currentIds.join("_"));
    return ctx.reply(`Message added to queue

Messages Count ${currentIds.length}`, {
      reply_markup: new (0, _grammy.InlineKeyboard)().text("Preview", "brd:preview:" + brdId).row().text("Start", "brd:start:" + brdId).text("Cancel", "brd:stop:" + brdId)
    });
  });
  broadcastMiddleware.callbackQuery(/brd:progress:(\w+)/, async (ctx) => {
    let info = await options.redisInstance.hgetall(options.keyPrefix + "info:" + ctx.match[1]);
    return ctx.answerCallbackQuery(
      {
        text: buildProgressText(+info.error, +info.sent, +info.total),
        show_alert: true
      }
    );
  });
  broadcastMiddleware.callbackQuery(/brd:pause:(\w+)/, async (ctx) => {
    await options.redisInstance.hset(options.keyPrefix + "info:" + ctx.match[1], "paused", "1");
    return ctx.editMessageText("Broadcast paused!", {
      reply_markup: new (0, _grammy.InlineKeyboard)().text("Resume", "brd:resume:" + ctx.match[1]).text("Stop", "brd:stop:" + ctx.match[1])
    });
  });
  broadcastMiddleware.callbackQuery(/brd:resume:(\w+)/, async (ctx) => {
    await options.redisInstance.hdel(options.keyPrefix + "info:" + ctx.match[1], "paused");
    return ctx.editMessageText(
      "Lets begin...",
      {
        reply_markup: new (0, _grammy.InlineKeyboard)().text("Pause", "brd:pause:" + ctx.match[1]).text("Stop", "brd:stop:" + ctx.match[1])
      }
    );
  });
  broadcastMiddleware.callbackQuery(/brd:preview:(\w+)/, async (ctx) => {
    let info = await options.redisInstance.hgetall(options.keyPrefix + "info:" + ctx.match[1]);
    let messageIds = info.message_ids.split("_").map((e) => Number.parseInt(e));
    if (info.type === "copy") {
      return ctx.copyMessages(info.chat_id, messageIds);
    } else if (info.type === "forward") {
      return ctx.forwardMessages(info.chat_id, messageIds);
    }
  });
  broadcastMiddleware.callbackQuery(/brd:start:(\w+)/, async (ctx) => {
    let id = ctx.match[1];
    await options.redisInstance.rpush(options.keyPrefix + "list", id);
    return ctx.editMessageText(`Broadcast added to queue it takes some time to start...`, {
      reply_markup: new (0, _grammy.InlineKeyboard)().text("Pause", "brd:pause:" + id).text("Stop", "brd:stop:" + id)
    });
  });
  broadcastMiddleware.callbackQuery(/brd:stop:(\w+)/, async (ctx) => {
    return ctx.editMessageReplyMarkup({
      reply_markup: new (0, _grammy.InlineKeyboard)().text("Sure?").row().text("Yes", "brd:stop_confirm:" + ctx.match[1]).text("No", `brd:stop_cancel:${ctx.match[1]}`)
    });
  });
  broadcastMiddleware.callbackQuery(/brd:stop_cancel/, async (ctx) => {
    return ctx.editMessageReplyMarkup(
      {
        reply_markup: new (0, _grammy.InlineKeyboard)().text("Pause", "brd:pause:" + ctx.match[1])
      }
    );
  });
  broadcastMiddleware.callbackQuery(/brd:stop_confirm:(\w+)/, async (ctx) => {
    let id = ctx.match[1];
    await options.redisInstance.del(options.keyPrefix + "chats:" + id);
    await options.redisInstance.del(options.keyPrefix + "info:" + id);
    await options.redisInstance.lrem(options.keyPrefix + "list", 1, id);
    return ctx.editMessageText("Broadcast stopped");
  });
  return middleware;
}

// src/broadcast.queue.ts


// src/initChats.queue.ts
var ChatsFetcher = class {
  constructor(options) {
    this.options = options;
  }
  async fetchChats(broadcast) {
    let chatOffset = +(broadcast.chatOffset || "0");
    while (true) {
      let chatIds = await this.options.getBroadcastChats(chatOffset, this.options.chunkSize, broadcast.chatFilter);
      await this.options.redisInstance.rpush(this.options.keyPrefix + "chats:" + broadcast.id, ...chatIds);
      if (chatIds.length < this.options.chunkSize) {
        await this.options.redisInstance.hset(this.options.keyPrefix + "info:" + broadcast.id, "total", chatOffset + chatIds.length);
        broadcast.total = (chatOffset + chatIds.length).toString();
        break;
      }
      chatOffset += chatIds.length;
      await this.options.redisInstance.hset(this.options.keyPrefix + "info:" + broadcast.id, "chatOffset", chatOffset.toString());
    }
  }
};

// src/broadcast.queue.ts
var BroadcastQueue = (_class = class {
  constructor(options) {;_class.prototype.__init.call(this);_class.prototype.__init2.call(this);_class.prototype.__init3.call(this);
    this.options = options;
  }
  __init() {this.reportIds = {}}
  __init2() {this.lastReports = {}}
  __init3() {this.waitTime = 0}
  async checkBroadcasts() {
    let broadcasts = await this.options.redisInstance.lrange(this.options.keyPrefix + "list", 0, -1);
    if (broadcasts.length > 0) {
      for (let broadcastId of broadcasts) {
        await this.sendBroadcast(broadcastId);
      }
    }
    setTimeout(this.checkBroadcasts.bind(this), this.options.checkQueueInterval);
  }
  async sendBroadcast(id) {
    let broadcastInfo = await this.options.redisInstance.hgetall(this.options.keyPrefix + "info:" + id);
    if (broadcastInfo.total === "-1") {
      console.log("fetching chats");
      let fetcher = new ChatsFetcher(this.options);
      await fetcher.fetchChats(broadcastInfo);
    }
    if (!broadcastInfo) {
      await this.options.redisInstance.lrem(this.options.keyPrefix + "list", 1, id);
      return;
    }
    let chats = await this.options.redisInstance.lpop(this.options.keyPrefix + "chats:" + id, this.options.chunkSize);
    if (broadcastInfo.paused)
      return;
    if (!(chats == null ? void 0 : chats.length)) {
      await this.options.redisInstance.del(this.options.keyPrefix + "chats:" + id);
      await this.options.redisInstance.del(this.options.keyPrefix + "info:" + id);
      await this.options.redisInstance.lrem(this.options.keyPrefix + "list", 1, id);
      await this.sendProgress(broadcastInfo, true);
      return;
    }
    broadcastInfo.sent = broadcastInfo.sent || "0";
    broadcastInfo.error = broadcastInfo.error || "0";
    for (let chat of chats) {
      let isSent = await this.sendToChat(chat, broadcastInfo);
      if (isSent) {
        broadcastInfo.sent = (+broadcastInfo.sent + 1).toString();
        await this.options.redisInstance.hincrby(this.options.keyPrefix + "info:" + id, "sent", 1);
      } else {
        broadcastInfo.error = (+broadcastInfo.error + 1).toString();
        await this.options.redisInstance.hincrby(this.options.keyPrefix + "info:" + id, "error", 1);
      }
    }
    await this.sendProgress(broadcastInfo);
    await this.sendBroadcast(id);
  }
  async sendProgress(broadcastInfo, finished = false) {
    if (this.options.progressCallback) {
      this.options.progressCallback(
        broadcastInfo.id,
        +broadcastInfo.sent,
        +broadcastInfo.error,
        +broadcastInfo.total
      );
      return;
    }
    let error = +broadcastInfo.error;
    let percent = error + +broadcastInfo.sent / +broadcastInfo.total;
    let replyMarkup = new (0, _grammy.InlineKeyboard)().text(buildProgressBtnText(percent), `brd:progress:${broadcastInfo.id}`).row().text("Pause", `brd:pause:${broadcastInfo.id}`).text("Stop", `brd:stop:${broadcastInfo.id}`);
    let progressText = buildProgressText(error, +broadcastInfo.sent, +broadcastInfo.total);
    if (finished) {
      await this.options.api.sendMessage(broadcastInfo.chat_id, `\u2705 Broadcast finished
${progressText}`);
      return;
    }
    let msgId = this.reportIds[broadcastInfo.id];
    if (!msgId) {
      await this.options.api.sendMessage(broadcastInfo.chat_id, `\u2705 Broadcast Started
${progressText}`, {
        reply_markup: replyMarkup
      });
    } else {
      let lastReport = this.lastReports[broadcastInfo.id];
      if (lastReport && Date.now() - lastReport.getTime() < this.options.reportFrequency) {
        return;
      }
      await this.options.api.editMessageText(broadcastInfo.chat_id, msgId, `\u231B Broadcasting
${progressText}`, {
        reply_markup: replyMarkup
      });
    }
  }
  async sendToChat(chatId, broadcastInfo) {
    var _a;
    let msgIds = (_a = broadcastInfo.message_ids) == null ? void 0 : _a.split("_").map((e) => parseInt(e));
    try {
      if (broadcastInfo.type === "text") {
        await this.options.api.sendMessage(chatId, broadcastInfo.text);
      } else if (broadcastInfo.type === "forward") {
        await this.options.api.forwardMessages(chatId, broadcastInfo.chat_id, msgIds);
      } else if (broadcastInfo.type === "copy") {
        await this.options.api.copyMessages(chatId, broadcastInfo.chat_id, msgIds);
      }
      if (this.waitTime) {
        await sleep(this.waitTime);
      }
      return true;
    } catch (err) {
      let retry = await this.handleError(chatId, err);
      if (retry) {
        await this.sendToChat(chatId, broadcastInfo);
        return true;
      }
      return false;
    }
  }
  async handleError(chatId, error) {
    var _a;
    const message = "description" in error ? error.description : error.message;
    const errorMessage = message.toLowerCase();
    const setRestricted = ((_a = this.options.setRestricted) == null ? void 0 : _a.bind(null, chatId)) || ((reason) => {
      console.log(`ChatId: ${chatId} is restricted for reason: ${reason} you didn't handled this error`);
    });
    if (errorMessage.includes("blocked")) {
      setRestricted("block");
    }
    if (errorMessage.includes("deactivated")) {
      setRestricted("deactivated");
    }
    if (errorMessage.includes("kicked")) {
      setRestricted("banned");
    }
    if (errorMessage.includes("restricted")) {
      setRestricted("restricted");
    }
    if ("parameters" in error) {
      if (error.parameters.retry_after) {
        await sleep(
          error.parameters.retry_after * 1e3
        );
        this.waitTime += 100;
        return true;
      }
    }
    return false;
  }
}, _class);

// src/index.ts
var defaultOptions = {
  chunkSize: 100,
  keyPrefix: "brdc:",
  reportFrequency: 60 * 1e3,
  progressCallback: null,
  setRestricted: null,
  checkQueueInterval: 60 * 1e3,
  hasPermission: null,
  cmds: {
    broadcast: "broadcast",
    copy: "copy",
    forward: "forward",
    addmsg: "addmsg"
  }
};
function initBroadcaster(bot, options) {
  const allOptions = {
    api: bot.api,
    ...defaultOptions,
    cmds: {
      ...defaultOptions.cmds,
      ...options.cmds
    },
    ...options
  };
  if (options.isMainInstance) {
    const queue = new BroadcastQueue(allOptions);
    queue.checkBroadcasts().then(() => {
    });
  }
  bot.use(getMiddleware(allOptions));
}


exports.initBroadcaster = initBroadcaster;
//# sourceMappingURL=index.js.map