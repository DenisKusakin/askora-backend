import {createClient} from "redis";
import {REDIS_CONFIG} from "./conf.js";

export const redisClient = createClient({
    password: REDIS_CONFIG.password,
    socket: {
        host: REDIS_CONFIG.host,
        port: REDIS_CONFIG.port
    }
});