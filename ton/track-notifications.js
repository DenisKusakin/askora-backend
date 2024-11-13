import {beginCell} from "@ton/core";
import {notificationsQueue} from "../notification-queue.js";
import {fetchNotifications} from "../services/ton-service.js";
import {redisClient} from "../redis-client.js";
import {ROOT_ACCOUNT_ADDR} from "../conf.js";

function getJobId(notification, rootAddr) {
    //Hash of cell is just a way to build unique notification id
    //(owner, id, operation) identifies notification
    return beginCell()
        .storeAddress(rootAddr)
        .storeAddress(notification.owner)
        .storeUint(notification.id, 32)
        .storeUint(notification.op, 32)
        .endCell()
        .hash()
        .toString('hex')
}

await redisClient.connect()
const LAST_PROCESSED_KEY = "last-processed-lt";

function lastProcessedLtKey(){
    return `${LAST_PROCESSED_KEY}-${ROOT_ACCOUNT_ADDR.toRawString()}`
}

async function fetchLastProcessedLt(lastProcessedKey){
    let lastProcessedLtStr = await redisClient.get(lastProcessedKey)
    if (lastProcessedLtStr == null) {
        lastProcessedLtStr = "0";
    }
    let lastProcessedLt = BigInt(lastProcessedLtStr)
    if (lastProcessedLt > 0) {
        console.log(`Fetching transactions with lt > ${lastProcessedLt}`)
    } else {
        console.log('No last processed lt found, starting with the very beginning')
    }

    return lastProcessedLt;
}

async function runTrackNotifications() {
    let isDone = false
    process.on('SIGINT', () => {
        isDone = true
    })
    process.on('SIGTERM', () => {
        isDone = true
    })

    while (!isDone) {
        const lastProcessedKey = lastProcessedLtKey()
        const lastProcessedLt = await fetchLastProcessedLt(lastProcessedKey)

        const notifications = await fetchNotifications(lastProcessedLt)
        for (let i = 0; i < notifications.length; i++) {
            let notification = notifications[i]
            let jobId = getJobId(notification, ROOT_ACCOUNT_ADDR)

            await notificationsQueue.add('ton-notification', {
                owner: notification.owner.toRawString(),
                id: notification.id,
                submitter: notification.submitter.toRawString(),
                op: notification.op
            }, {
                jobId
            })
            await redisClient.set(lastProcessedKey, notification.lt.toString())
            console.log("Notification received", {
                owner: notification.owner.toString(),
                submitter: notification.submitter.toString(),
                op: notification.op
            })
        }
        await new Promise(resolve => setTimeout(resolve, 10_000))
    }
}

await runTrackNotifications()