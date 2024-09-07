import {Redis} from "ioredis";
import {Api, Context} from "grammy";

export type OptionalKeys<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? K : never }[keyof T];
export type Defaults<T> = Required<Pick<T, OptionalKeys<T>>>

export type getBroadcastChats = (botId: number, offset: number, limit: number, filter?: string) => Promise<string[] | number[]>

// because of redis hgetall return type of all fields is string
export interface BroadcastInfo {
    paused?: string,
    user_id: string,
    id: string,
    botId: string,
    sent?: string,
    error?: string,
    total?: string,
    type: 'forward' | 'copy' | 'text',
    message_ids?: string,
    chat_id: string,
    text?: string,
    chatOffset?: string
    chatFilter: string,

}

type MaybePromise<T> = T | Promise<T>;
export type setRestricted = (chatId: string, type: /*Users: */ 'block' | 'deactivated' | /*Groups: */ 'banned' | 'restricted') => Promise<void>
export type progressCallback = (id: string, sent: number, error: number, total: number) => void;

export interface BroadcastOptions {
    // we use redis because of fast and easy to use for pause and stop the broadcast
    redisInstance: Redis,
    // we need a callback for getting chats
    getBroadcastChats: getBroadcastChats,
    // set chat restricted
    setRestricted?: setRestricted | null,
    // how much user we fetch user in each db query (lower values more queries to database but better control on the broadcast shutdown's or pause and stop)
    chunkSize?: number,
    // redis key prefix
    keyPrefix?: string,
    // list of sudo users which can use /broadcast command if its empty you should use your own guard
    sudoUsers: number[],
    hasPermission?: (ctx: Context) => MaybePromise<boolean>;
    getApi: (botId: number) => MaybePromise<Api>,
    // in case of using worker or cluster if its main instance pass true to init queue in this instance
    isMainInstance: boolean,
    reportFrequency?: number,
    checkQueueInterval?: number,
    progressCallback?: progressCallback | null,
    cmds?: {
        broadcast?: string,
        copy?: string,
        forward?: string,
        addmsg?: string,
    }
}