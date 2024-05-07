import {Bot} from "grammy";
import {BroadcastOptions, Defaults} from "./types";

import {getMiddleware} from "./middleware";
import {BroadcastQueue} from "./broadcast.queue";

const defaultOptions: Defaults<BroadcastOptions> = {
    chunkSize: 100,
    keyPrefix: 'brdc:',
    reportFrequency: 60 * 1000,
    progressCallback: null,
    setRestricted: null,
}

export function initBroadcaster(bot: Bot, options: Omit<BroadcastOptions, 'api'>) {
    let allOptions = {
        api: bot.api,
        ...defaultOptions,
        ...options
    }
    if (options.isMainInstance) {
        let queue = new BroadcastQueue(allOptions);
        queue.checkBroadcasts().then(() => {
        });
    }

    bot.use(getMiddleware(allOptions));

}