import { Api, Bot } from 'grammy';
import { Redis } from 'ioredis';

type getBroadcastChats = (offset: number, limit: number, filter?: string) => Promise<string[] | number[]>;
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
    isMainInstance: boolean;
    reportFrequency?: number;
    progressCallback?: progressCallback | null;
    cmds?: {
        broadcast?: string;
        copy?: string;
        forward?: string;
        addmsg?: string;
    };
}

declare function initBroadcaster(bot: Bot, options: Omit<BroadcastOptions, 'api'>): void;

export { initBroadcaster };
