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
    cmds: {
        broadcast: 'broadcast',
        copy: 'copy',
        forward: 'forward',
        addmsg: 'addmsg'
    }
}

export function initBroadcaster(bot: Bot, options: Omit<BroadcastOptions, 'api'>) {
    const allOptions = {
        api: bot.api,
        cmds: {
            ...defaultOptions.cmds,
            ...options.cmds
        },
        ...defaultOptions,
        ...options
    }
    if (options.isMainInstance) {
        const queue = new BroadcastQueue(allOptions);
        queue.checkBroadcasts().then(() => {
        });
    }

    bot.use(getMiddleware(allOptions));

}