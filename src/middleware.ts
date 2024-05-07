import {Composer} from "grammy";

export const broadcastMiddleware = new Composer();
broadcastMiddleware.command('bbroadcast', (ctx, next) => {
    let args = ctx.message.text.split(' ').slice(1);
    if (args.length < 1) {
        return ctx.reply(`Usage: /bbroadcast <type> [filter] [text]

type should be copy or forward
filter is anything that want to passed to getBroadcastChats
text is required if you don't reply to any message`)
    }
})

function redirectCommand(cmd: string) {
    broadcastMiddleware.command(cmd, (ctx, next) => {
        ctx.message.text = ctx.message.text.replace(cmd, `/bbroadcast ${cmd.substring(1)}`)
        broadcastMiddleware.middleware()(ctx, next)
    })
}

// aliases
['bcopy', 'bforward'].map(redirectCommand)

