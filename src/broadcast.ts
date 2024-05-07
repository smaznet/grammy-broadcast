import {BroadcastOptions, Defaults} from "./types";
import {BroadcastQueue} from "./queue";


const defaultOptions: Defaults<BroadcastOptions> = {
    chunkSize: 100,
    keyPrefix: 'brdc:',
    reportFrequency: 60 * 1000
}

export default class Broadcast {

    constructor(private options: BroadcastOptions) {

    }

    initQueue() {
        let queue = new BroadcastQueue(this.options);
        queue.checkBroadcasts().then(() => {
            // do nothing
        });
    }

}