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
        setTimeout(this.checkBroadcasts.bind(this), this.options.checkQueueInterval);

    }

    async sendBroadcast(id: string) {
        let broadcastInfo = await this.options.redisInstance.hgetall(this.options.keyPrefix + 'info:' + id) as unknown as BroadcastInfo;
        if (broadcastInfo.total === '-1') {
            console.log("fetching chats")
            let fetcher = new ChatsFetcher(this.options);
            await fetcher.fetchChats(broadcastInfo);
        }
        if (!broadcastInfo) {
            await this.options.redisInstance.lrem(this.options.keyPrefix + 'list', 1, id);
            return;
        }
        let chats = await this.options.redisInstance.lpop(this.options.keyPrefix + 'chats:' + id, this.options!.chunkSize!);

        if (broadcastInfo.paused) return;

        if (!chats?.length) {
            await this.options.redisInstance.del(this.options.keyPrefix + 'chats:' + id);
            await this.options.redisInstance.del(this.options.keyPrefix + 'info:' + id);
            await this.options.redisInstance.lrem(this.options.keyPrefix + 'list', 1, id);
            await this.sendProgress(broadcastInfo, true);
            return;
        }
        broadcastInfo.sent = broadcastInfo.sent || '0';
        broadcastInfo.error = broadcastInfo.error || '0';
        for (let chat of chats!) {
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
                +broadcastInfo.sent!,
                +broadcastInfo.error!,
                +broadcastInfo.total!
            )
            return;
        }
        let error = +broadcastInfo.error!;
        let api = await this.options.getApi(+broadcastInfo.botId);

        let percent = ((error + (+broadcastInfo.sent!)) / +broadcastInfo.total!);
        let replyMarkup = new InlineKeyboard()
            .text(buildProgressBtnText(percent,), `brd:progress:${broadcastInfo.id}`)
            .row()
            .text("Pause", `brd:pause:${broadcastInfo.id}`)
            .text('Stop', `brd:stop:${broadcastInfo.id}`)

        let progressText = buildProgressText(error, +broadcastInfo.sent!, +broadcastInfo.total!);
        if (finished) {
            await api.sendMessage(broadcastInfo.chat_id, `✅ Broadcast finished
${progressText}`);
            return;
        }
        let msgId = this.reportIds[broadcastInfo.id];
        if (!msgId) {
            let msg = await api.sendMessage(broadcastInfo.chat_id, `✅ Broadcast Started
${progressText}`, {
                reply_markup: replyMarkup
            });
            this.reportIds[broadcastInfo.id] = msg.message_id;
        } else {
            let lastReport = this.lastReports[broadcastInfo.id];
            if (lastReport && Date.now() - lastReport.getTime() < this.options.reportFrequency!) {
                return;
            }
            await api.editMessageText(broadcastInfo.chat_id, msgId, `⌛ Broadcasting
${progressText}`, {
                reply_markup: replyMarkup
            });
        }


    }

    async sendToChat(chatId: string, broadcastInfo: BroadcastInfo): Promise<boolean> {
        let msgIds = broadcastInfo.message_ids?.split('_').map((e) => parseInt(e));
        let api = await this.options.getApi(+broadcastInfo.botId);
        try {
            let msgId;
            if (broadcastInfo.type === 'text') {
                let msg = await api.sendMessage(chatId, broadcastInfo.text!);
                msgId = msg.message_id;
            } else if (broadcastInfo.type === 'forward') {
                let msgs = await api.forwardMessages(chatId, broadcastInfo.chat_id, msgIds!);
                msgId = msgs.pop().message_id;
            } else if (broadcastInfo.type === 'copy') {
                let msgs = await api.copyMessages(chatId, broadcastInfo.chat_id, msgIds!);
                msgId = msgs.pop().message_id;
            }
            if (broadcastInfo.pin) {
                await api.pinChatMessage(chatId, msgId, {disable_notification: true});
            }
            if (this.waitTime) {
                await sleep(this.waitTime);
            }
            return true;
        } catch (err) {
            let retry = await this.handleError(+broadcastInfo.botId, chatId, err);
            if (retry) {
                await this.sendToChat(chatId, broadcastInfo);
                return true;
            }
            return false;
        }

    }

    async handleError(botId: number, chatId: string, error: Error | GrammyError): Promise<boolean> {
        try {
            const message = 'description' in error ? error.description : error.message;
            const errorMessage = (message).toLowerCase();
            const setRestricted = this.options.setRestricted?.bind(null, botId, chatId) || ((reason) => {
                console.log(`ChatId: ${chatId} is restricted for reason: ${reason} you didn't handled this error`);
            });
            if (errorMessage.includes('blocked')) {
                setRestricted('block');
            }
            if (errorMessage.includes('deactivated')) {
                setRestricted('deactivated');
            }
            if (errorMessage.includes('kicked')) {
                setRestricted('banned');
            }
            if (errorMessage.includes('restricted')) {
                setRestricted('restricted');
            }
            if (errorMessage.includes('initiate conversation')) {
                setRestricted('no-conv')
            }
            if ('parameters' in error) {
                if (error.parameters.retry_after) {
                    console.log(`we limited for ${error.parameters.retry_after} secs`)
                    await sleep(
                        error.parameters.retry_after * 1000
                    )
                    this.waitTime += 100;
                    // why we reached limits?
                    // in that case we add some sleep to requests
                    return true;
                }
            }
        } catch (err) {
            console.log("HandlerError error: ", err);
        } finally {
        }

        // todo: more errors
        return false;
    }


}
