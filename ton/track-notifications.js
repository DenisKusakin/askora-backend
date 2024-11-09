import {beginCell} from "@ton/core";
import {notificationsQueue} from "../notification-queue.js";
import {fetchNotifications} from "../services/ton-service.js";
import {redisClient} from "../redis-client.js";

function getJobId(notification) {
    //Hash of cell is just a way to build unique notification id
    //(owner, id, operation) identifies notification
    return beginCell()
        .storeAddress(notification.owner)
        .storeUint(notification.id, 32)
        .storeUint(notification.op, 32)
        .endCell()
        .hash()
        .toString('hex')
}

await redisClient.connect()
const LAST_PROCESSED_KEY = "last-processed-lt";

async function runTrackNotifications() {
    let lastProcessedLtStr = await redisClient.get(LAST_PROCESSED_KEY)
    if (lastProcessedLtStr == null) {
        lastProcessedLtStr = "0";
    }
    let lastProcessedLt = BigInt(lastProcessedLtStr)
    if (lastProcessedLt > 0) {
        console.log(`Fetching transactions with lt > ${lastProcessedLt}`)
    } else {
        console.log('No last processed lt found, starting with the very beginning')
    }
    let isDone = false
    process.on('SIGINT', () => {
        isDone = true
    })
    process.on('SIGTERM', () => {
        isDone = true
    })

    while (!isDone) {
        const notifications = await fetchNotifications(lastProcessedLt)

        for (let i = 0; i < notifications.length; i++) {
            let notification = notifications[i]
            let jobId = getJobId(notification)

            await notificationsQueue.add('ton-notification', {
                owner: notification.owner.toRawString(),
                id: notification.id,
                submitter: notification.submitter.toRawString(),
                op: notification.op
            }, {
                jobId
            })
            lastProcessedLt = notification.lt
            await redisClient.set(LAST_PROCESSED_KEY, lastProcessedLt.toString())
        }
        await new Promise(resolve => setTimeout(resolve, 10_000))
    }
}

await runTrackNotifications()