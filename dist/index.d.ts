import * as grammy from 'grammy';
import { Context, Api } from 'grammy';
import { Redis } from 'ioredis';

type getBroadcastChats = (botId: number, offset: number, limit: number, filter?: string) => Promise<string[] | number[]>;
type MaybePromise<T> = T | Promise<T>;
type setRestricted = (chatId: string, type: /*Users: */ 'block' | 'deactivated' | /*Groups: */ 'banned' | 'restricted') => Promise<void>;
type progressCallback = (id: string, sent: number, error: number, total: number) => void;
interface BroadcastOptions {
    redisInstance: Redis;
    getBroadcastChats: getBroadcastChats;
    setRestricted?: setRestricted | null;
    chunkSize?: number;
    keyPrefix?: string;
    sudoUsers: number[];
    hasPermission?: (ctx: Context) => MaybePromise<boolean>;
    getApi: (botId: number) => MaybePromise<Api>;
    isMainInstance: boolean;
    reportFrequency?: number;
    checkQueueInterval?: number;
    progressCallback?: progressCallback | null;
    cmds?: {
        broadcast?: string;
        copy?: string;
        forward?: string;
        addmsg?: string;
    };
}

declare class Broadcaster {
    private options;
    static _instance?: Broadcaster;
    private constructor();
    static getInstance(options: BroadcastOptions): Broadcaster;
    getMiddleware(): grammy.Composer<grammy.Context>;
}
declare function createBroadcaster(options: BroadcastOptions): Broadcaster;

export { createBroadcaster };
