import { Api, Context, RawApi, Bot } from 'grammy';
import { Redis } from 'ioredis';

type getBroadcastChats = (offset: number, limit: number, filter?: string) => Promise<string[] | number[]>;
type MaybePromise<T> = T | Promise<T>;
type setRestricted = (chatId: string, type: /*Users: */ 'block' | 'deactivated' | /*Groups: */ 'banned' | 'restricted') => Promise<void>;
type progressCallback = (id: string, sent: number, error: number, total: number) => void;
interface BroadcastOptions {
    redisInstance: Redis;
    api: Api;
    getBroadcastChats: getBroadcastChats;
    setRestricted?: setRestricted | null;
    chunkSize?: number;
    keyPrefix?: string;
    sudoUsers: number[];
    hasPermission?: (ctx: Context) => MaybePromise<boolean>;
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

declare function initBroadcaster<T extends Context, G extends Api<RawApi>>(bot: Bot<T, G>, options: Omit<BroadcastOptions, 'api'>): void;

export { initBroadcaster };
