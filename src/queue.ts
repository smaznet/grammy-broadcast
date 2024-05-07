import {BroadcastInfo, BroadcastOptions} from "./types";


export class BroadcastQueue {
    private reportIds: Record<string, number> = {};
    private lastReports: Record<string, Date> = {};

    constructor(private options: BroadcastOptions) {

    }

    async checkBroadcasts() {
        let broadcasts = await this.options.redisInstance.lrange(this.options.keyPrefix + 'list', 0, -1);
        if (broadcasts.length > 0) {
            for (let broadcastId of broadcasts) {
                await this.sendBroadcast(broadcastId,);
            }
        }
        setTimeout(this.checkBroadcasts, 60000);

    }

    async sendBroadcast(id: string) {
        let chats = await this.options.redisInstance.lpop(this.options.keyPrefix + 'chats:' + id, this.options.chunkSize);
        let broadcastInfo = await this.options.redisInstance.hgetall(this.options.keyPrefix + 'info:' + id) as unknown as BroadcastInfo;
        if (!broadcastInfo) {
            await this.options.redisInstance.lrem(this.options.keyPrefix + 'list', 1, id);
            return;
        }
        if (broadcastInfo.paused) return;

        if (chats.length === 0) {

            await this.options.redisInstance.del(this.options.keyPrefix + 'chats:' + id);
            await this.options.redisInstance.del(this.options.keyPrefix + 'info:' + id);
            await this.options.redisInstance.lrem(this.options.keyPrefix + 'list', 1, id);
            await this.sendReport(broadcastInfo, true);
            return;
        }
        broadcastInfo.sent = broadcastInfo.sent || '0';
        broadcastInfo.error = broadcastInfo.error || '0';
        for (let chat of chats) {
            let isSent = await this.sendToChat(chat, broadcastInfo);
            if (isSent) {
                broadcastInfo.sent = ((+broadcastInfo.sent) + 1).toString();
                await this.options.redisInstance.hincrby(this.options.keyPrefix + 'info:' + id, 'sent', 1);
            } else {
                broadcastInfo.error = ((+broadcastInfo.error) + 1).toString();
                await this.options.redisInstance.hincrby(this.options.keyPrefix + 'info:' + id, 'error', 1);

            }
        }
        await this.sendReport(broadcastInfo);
        await this.sendBroadcast(id);

    }

    async sendReport(broadcastInfo: BroadcastInfo, finished: boolean = false) {
        let error = +broadcastInfo.error;

        let progressText = `⌛ Progress: ${error + (+broadcastInfo.sent)}/${broadcastInfo.total}
✅ Sent: ${broadcastInfo.sent}
❌ Error: ${error} (${Math.floor((error / +broadcastInfo.total) * 10000) / 100}%)`;
        if (finished) {
            await this.options.api.sendMessage(broadcastInfo.chat_id, `✅ Broadcast finished
${progressText}`);
        }
        let msgId = this.reportIds[broadcastInfo.id];
        if (!msgId) {
            await this.options.api.sendMessage(broadcastInfo.chat_id, `✅ Broadcast Started
${progressText}`);
        } else {
            let lastReport = this.lastReports[broadcastInfo.id];
            if (lastReport && Date.now() - lastReport.getTime() < this.options.reportFrequency) {
                return;
            }
            await this.options.api.editMessageText(broadcastInfo.chat_id, msgId, `⌛ Broadcasting
${progressText}`);
        }


    }

    async sendToChat(chatId: string, broadcastInfo: BroadcastInfo): Promise<boolean> {
        let msgIds = broadcastInfo.message_ids?.split('_').map((e) => parseInt(e));
        if (broadcastInfo.type === 'text') {
            await this.options.api.sendMessage(chatId, broadcastInfo.text);
        } else if (broadcastInfo.type === 'forward') {
            await this.options.api.forwardMessages(chatId, broadcastInfo.chat_id, msgIds);
        } else if (broadcastInfo.type === 'copy') {
            await this.options.api.copyMessages(chatId, broadcastInfo.chat_id, msgIds);
        }
        return true;
    }


}
