import {Queue} from "bullmq";
import {REDIS_CONFIG} from "./conf.js";

export const notificationsQueue = new Queue('ton-notifications', {
    connection: {
        host: REDIS_CONFIG.host,
        port: REDIS_CONFIG.port,
        password: REDIS_CONFIG.password
    },
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'fixed',
            delay: 3000,
        },
    }
})