import {BroadcastInfo, BroadcastOptions} from "./types";


export class ChatsFetcher {
    constructor(private options: BroadcastOptions) {
    }

    async fetchChats(broadcast: BroadcastInfo) {
        let chatOffset = +(broadcast.chatOffset || '0')


        while (true) {
            let chatIds = await this.options.getBroadcastChats(+broadcast.botId, chatOffset, this.options.chunkSize!, broadcast.chatFilter);
            await this.options.redisInstance.rpush(this.options.keyPrefix + 'chats:' + broadcast.id, ...chatIds);
            if (chatIds.length < this.options.chunkSize!) {
                await this.options.redisInstance.hset(this.options.keyPrefix + 'info:' + broadcast.id, 'total', (chatOffset + chatIds.length));
                broadcast.total = (chatOffset + chatIds.length).toString();
                break;
            }

            chatOffset += chatIds.length;
            await this.options.redisInstance.hset(this.options.keyPrefix + 'info:' + broadcast.id, 'chatOffset', chatOffset.toString());
        }


    }
}





