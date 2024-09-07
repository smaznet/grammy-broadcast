import {BroadcastOptions, Defaults} from "./types";

import {getMiddleware} from "./middleware";
import {BroadcastQueue} from "./broadcast.queue";

const defaultOptions: Defaults<BroadcastOptions> = {
    chunkSize: 100,
    keyPrefix: 'brdc:',
    reportFrequency: 60 * 1000,
    progressCallback: null,
    setRestricted: null,
    checkQueueInterval: 60 * 1000,
    hasPermission: null,
    cmds: {
        broadcast: 'broadcast',
        copy: 'copy',
        forward: 'forward',
        addmsg: 'addmsg'
    }
}

class Broadcaster {
    static _instance?: Broadcaster;

    private constructor(private options: BroadcastOptions) {

    }

    static getInstance(options: BroadcastOptions) {
        if (Broadcaster._instance) {
            return Broadcaster._instance;
        }
        let instance = new Broadcaster(options);
        const queue = new BroadcastQueue(options);
        queue.checkBroadcasts().then(() => {
        });
        Broadcaster._instance = instance;
        return instance;
    }

    getMiddleware() {
        return getMiddleware(this.options);
    }


}

export function createBroadcaster(options: BroadcastOptions) {
    const allOptions = {
        ...defaultOptions,
        cmds: {
            ...defaultOptions.cmds,
            ...options.cmds
        },
        ...options
    }
    return Broadcaster.getInstance(allOptions);
}