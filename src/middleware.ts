import {Composer, InlineKeyboard} from "grammy";
import {BroadcastOptions} from "./types";
import {buildProgressText} from "./utils";

export function getMiddleware(options: BroadcastOptions) {
    const broadcastMiddleware = new Composer().filter((ctx) => {
        if (ctx.from?.id) {
            return options.sudoUsers.includes(ctx.from.id)
        }
        return false;
    });
    broadcastMiddleware.command([options.cmds.broadcast, options.cmds.copy, options.cmds.forward], async (ctx) => {
        let [command, ...args] = ctx.message!.text.substring(1).split(' ');
        let type: string;
        let filter: string;
        if (command === options.cmds.broadcast) {
            if (args.length < 1) {
                return ctx.reply(`Usage: /${options.cmds.broadcast} <type> [filter]

\`type\` should be copy or forward
\`filter\` is anything that want to passed to getBroadcastChats
`, {
                    parse_mode: "Markdown",
                })
            }
            type = args[0];
            filter = args.slice(1).join(' ')
        } else if (command === options.cmds.copy) {
            type = 'copy';
            filter = args.join(' ')
        } else if (command === options.cmds.forward) {
            type = 'forward';
            filter = args.join(' ')
        }

        if (!['copy', 'forward'].includes(type)) {
            return ctx.reply(`Invalid type ${type}`)
        }

        let brdId = Math.random().toString(36).substring(7);
        if (!ctx.message!.reply_to_message) {
            return ctx.reply('Reply to a message')
        }
        await options.redisInstance.hset(options.keyPrefix + 'info:' + brdId, {
            type: type,
            chatFilter: filter,
            message_ids: ctx.message!.reply_to_message?.message_id.toString(),
            chat_id: ctx.chat.id.toString(),
            user_id: ctx.from!.id,
            id: brdId,
            error: '0',
            sent: '0',
            total: '-1'
        });
        return ctx.reply(`
Ready to broadcast!
currently 1 message is in queue
for send multi message in this broadcast reply this command to another message
<code>/${options.cmds.addmsg} ${brdId}</code>
`, {
            parse_mode: "HTML",
            reply_markup: new InlineKeyboard()
                .text('Preview', 'brd:preview:' + brdId)
                .row()
                .text('Start', 'brd:start:' + brdId)
                .text('Cancel', 'brd:stop:' + brdId)
        })
    })

    broadcastMiddleware.command(options.cmds.addmsg, async (ctx) => {
        let args = ctx.message!.text.split(' ').slice(1);
        if (args.length < 1) {
            return ctx.reply(`Usage: /${options.cmds.addmsg} <id>`)
        }
        let brdId = args[0];
        if (!ctx.message!.reply_to_message) {
            return ctx.reply('Reply to a message')
        }
        let newMsgId = ctx.message!.reply_to_message?.message_id;
        let messageIds = await options.redisInstance.hget(options.keyPrefix + 'info:' + brdId, 'message_ids');
        let currentIds = messageIds.split('_').map((e: string) => Number.parseInt(e));
        if (Math.max(newMsgId, ...currentIds) !== newMsgId) {
            return ctx.reply('Message should be newer than previous messages')
        }
        if (currentIds.includes(newMsgId)) {
            return ctx.reply('Message already in queue')
        }
        currentIds.push(newMsgId);
        await options.redisInstance.hset(options.keyPrefix + 'info:' + brdId, 'message_ids', currentIds.join('_'));
        return ctx.reply(`Message added to queue

Messages Count ${currentIds.length}`, {
            reply_markup: new InlineKeyboard()
                .text('Preview', 'brd:preview:' + brdId)
                .row()
                .text('Start', 'brd:start:' + brdId)
                .text('Cancel', 'brd:stop:' + brdId)
        })
    });


    broadcastMiddleware.callbackQuery(/brd:progress:(\w+)/, async (ctx) => {
        let info = await options.redisInstance.hgetall(options.keyPrefix + 'info:' + ctx.match[1]);
        return ctx.answerCallbackQuery(
            {
                text: buildProgressText(+info.error, +info.sent, +info.total),
                show_alert: true
            }
        )

    });
    broadcastMiddleware.callbackQuery(/brd:pause:(\w+)/, async (ctx) => {
        await options.redisInstance.hset(options.keyPrefix + 'info:' + ctx.match[1], 'paused', '1');
        return ctx.editMessageText('Broadcast paused!', {
            reply_markup: new InlineKeyboard()

                .text('Resume', 'brd:resume:' + ctx.match[1])
                .text('Stop', 'brd:stop:' + ctx.match[1])
        });

    });
    broadcastMiddleware.callbackQuery(/brd:resume:(\w+)/, async (ctx) => {
        await options.redisInstance.hdel(options.keyPrefix + 'info:' + ctx.match[1], 'paused');
        return ctx.editMessageText(
            "Lets begin...", {
                reply_markup: new InlineKeyboard()
                    .text('Pause', 'brd:pause:' + ctx.match[1])
                    .text('Stop', 'brd:stop:' + ctx.match[1])
            });
    });
    broadcastMiddleware.callbackQuery(/brd:preview:(\w+)/, async (ctx) => {
        let info = await options.redisInstance.hgetall(options.keyPrefix + 'info:' + ctx.match[1]);
        let messageIds = info.message_ids.split('_').map((e: string) => Number.parseInt(e));
        if (info.type === 'copy') {
            return ctx.copyMessages(info.chat_id, messageIds)
        } else if (info.type === 'forward') {
            return ctx.forwardMessages(info.chat_id, messageIds)
        }
    });
    broadcastMiddleware.callbackQuery(/brd:start:(\w+)/, async (ctx) => {
        let id = ctx.match[1];
        await options.redisInstance.rpush(options.keyPrefix + 'list', id);
        return ctx.editMessageText(`Broadcast added to queue it takes some time to start...`, {
            reply_markup: new InlineKeyboard()
                .text('Pause', 'brd:pause:' + id)
                .text('Stop', 'brd:stop:' + id)
        });
    });
    broadcastMiddleware.callbackQuery(/brd:stop:(\w+)/, async (ctx) => {
        return ctx.editMessageReplyMarkup({
            reply_markup: new InlineKeyboard().text('Sure?')
                .row()
                .text('Yes', 'brd:stop_confirm:' + ctx.match[1])
                .text('No', `brd:stop_cancel:${ctx.match[1]}`)
        });
    });
    broadcastMiddleware.callbackQuery(/brd:stop_cancel/, async (ctx) => {
        return ctx.editMessageReplyMarkup(
            {
                reply_markup: new InlineKeyboard()
                    .text('Pause', 'brd:pause:' + ctx.match[1])
            }
        )
    });
    broadcastMiddleware.callbackQuery(/brd:stop_confirm:(\w+)/, async (ctx) => {
        let id = ctx.match[1];

        await options.redisInstance.del(options.keyPrefix + 'chats:' + id);
        await options.redisInstance.del(options.keyPrefix + 'info:' + id);
        await options.redisInstance.lrem(options.keyPrefix + 'list', 1, id);
        return ctx.editMessageText('Broadcast stopped');
    });

    return broadcastMiddleware;
}


