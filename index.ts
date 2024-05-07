import {Bot} from "grammy";
import {BroadcastOptions} from "./src/types";
import Broadcast from "./src/broadcast";
import {broadcastMiddleware} from "./src/middleware";

export function initBroadcaster(bot: Bot, options: Omit<BroadcastOptions, 'api'>) {
    let broadcast = new Broadcast({
        api: bot.api,
        ...options
    });
    if (options.isMainInstance) {
        broadcast.initQueue();
    }

    bot.use(broadcastMiddleware);

}