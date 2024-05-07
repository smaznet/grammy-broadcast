import {Bot} from "grammy";
import {initBroadcaster} from "../index";
import Redis from 'ioredis'

let bot = new Bot("") // TOKEN HERE
let redis = new Redis()
initBroadcaster(bot, {
    redisInstance: redis,
    isMainInstance: true, // for clusters and multiple instances set true on main instances
    sudoUsers: [123456789],
    async getBroadcastChats(offset: number, limit: number, filter: string | undefined): Promise<number[]> {
        if (filter === 'users') {
            // you can use any database you want
            // @ts-ignore
            let users = await UserModel.find({blocked: {$ne: true}}, {uid: 1})
                .skip(offset)
                .limit(limit)
                .lean().fetch();
            return users.map(e => e.uid)
        }

        // you can pass any filter you want to /bbroadcast command
        if (filter === 'friends') {
            return Promise.resolve([123456, 789910])
        }
        if (filter === 'groups') {
            // @ts-ignore
            let groups = await GroupsModel.find({botRemoved: {$ne: true}}, {chatId: 1})
                .skip(offset)
                .limit(limit)
                .lean().fetch();
            return groups.map(e => e.chatId)
        }
        return Promise.resolve([]);
    },
    async setRestricted(chatId: number, type: "block" | "deactivated" | "banned" | "restricted"): Promise<void> {
        // update database for blocked users
        if (type === 'block' || type === 'deactivated') {
            // @ts-ignore
            await UserModel.updateOne({uid: chatId}, {blocked: true})
        } else {
            // @ts-ignore
            await GroupsModel.updateOne({chatId}, {botRemoved: true})
        }
        return
    } // sudo users
})