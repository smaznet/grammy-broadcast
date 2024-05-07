import {BroadcastInfo, BroadcastOptions} from "./types";
import {GrammyError, InlineKeyboard} from "grammy";
import {buildProgressBtnText, buildProgressText, sleep} from "./utils";
import {ChatsFetcher} from "./initChats.queue";


export class BroadcastQueue {
    private reportIds: Record<string, number> = {};
    private lastReports: Record<string, Date> = {};
    private waitTime: number = 0;

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
        let broadcastInfo = await this.options.redisInstance.hgetall(this.options.keyPrefix + 'info:' + id) as unknown as BroadcastInfo;
        if (!broadcastInfo.total || broadcastInfo.total !== '0') {
            let fetcher = new ChatsFetcher(this.options);
            await fetcher.fetchChats(broadcastInfo);
        }
        if (!broadcastInfo) {
            await this.options.redisInstance.lrem(this.options.keyPrefix + 'list', 1, id);
            return;
        }
        let chats = await this.options.redisInstance.lpop(this.options.keyPrefix + 'chats:' + id, this.options.chunkSize);

        if (broadcastInfo.paused) return;

        if (chats.length === 0) {

            await this.options.redisInstance.del(this.options.keyPrefix + 'chats:' + id);
            await this.options.redisInstance.del(this.options.keyPrefix + 'info:' + id);
            await this.options.redisInstance.lrem(this.options.keyPrefix + 'list', 1, id);
            await this.sendProgress(broadcastInfo, true);
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
        await this.sendProgress(broadcastInfo);
        await this.sendBroadcast(id);

    }

    async sendProgress(broadcastInfo: BroadcastInfo, finished: boolean = false) {
        if (this.options.progressCallback) {
            this.options.progressCallback(
                broadcastInfo.id,
                +broadcastInfo.sent,
                +broadcastInfo.error,
                +broadcastInfo.total
            )
            return;
        }
        let error = +broadcastInfo.error;

        let percent = (error + (+broadcastInfo.sent) / +broadcastInfo.total);
        let replyMarkup = new InlineKeyboard()
            .text(buildProgressBtnText(percent,), `brd:progress:${broadcastInfo.id}`)
            .row()
            .text("Pause", `brd:pause:${broadcastInfo.id}`)
            .text('Stop', `brd:stop:${broadcastInfo.id}`)

        let progressText = buildProgressText(error, +broadcastInfo.sent, +broadcastInfo.total);
        if (finished) {
            await this.options.api.sendMessage(broadcastInfo.chat_id, `✅ Broadcast finished
${progressText}`);
        }
        let msgId = this.reportIds[broadcastInfo.id];
        if (!msgId) {
            await this.options.api.sendMessage(broadcastInfo.chat_id, `✅ Broadcast Started
${progressText}`, {
                reply_markup: replyMarkup
            });
        } else {
            let lastReport = this.lastReports[broadcastInfo.id];
            if (lastReport && Date.now() - lastReport.getTime() < this.options.reportFrequency) {
                return;
            }
            await this.options.api.editMessageText(broadcastInfo.chat_id, msgId, `⌛ Broadcasting
${progressText}`, {
                reply_markup: replyMarkup
            });
        }


    }

    async sendToChat(chatId: string, broadcastInfo: BroadcastInfo): Promise<boolean> {
        let msgIds = broadcastInfo.message_ids?.split('_').map((e) => parseInt(e));
        try {
            if (broadcastInfo.type === 'text') {
                await this.options.api.sendMessage(chatId, broadcastInfo.text);
            } else if (broadcastInfo.type === 'forward') {
                await this.options.api.forwardMessages(chatId, broadcastInfo.chat_id, msgIds);
            } else if (broadcastInfo.type === 'copy') {
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
            }
        }

    }

    async handleError(chatId: string, error: Error | GrammyError): Promise<boolean> {
        let message = 'description' in error ? error.description : error.message;
        let errorMessage = (message).toLowerCase();
        let setRestricted = this.options.setRestricted?.bind(null, chatId) || ((reason) => {
            console.log(`ChatId: ${chatId} is restricted for reason: ${reason} you didn't handled this error`);
        });
        if (errorMessage.includes('blocked')) {
            await setRestricted('block');
        }
        if (errorMessage.includes('deactivated')) {
            await setRestricted('deactivated');
        }
        if (errorMessage.includes('kicked')) {
            await setRestricted('banned');
        }
        if (errorMessage.includes('restricted')) {
            await setRestricted('restricted');
        }
        if ('parameters' in error) {
            if (error.parameters.retry_after) {
                await sleep(
                    error.parameters.retry_after * 1000
                )
                this.waitTime += 100;
                // why we reached limits?
                // in that case we add some sleep to requests
                return true;
            }
        }
        // todo: more errors
        return false;
    }


}