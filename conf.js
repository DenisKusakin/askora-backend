import {Address} from "@ton/core";

export const TG_API_TOKEN = process.env.TG_API_TOKEN;
export const TON_API_TOKEN = process.env.TON_API_TOKEN
export const TON_API_URL = process.env.TON_API_URL
export const ROOT_ACCOUNT_ADDR = Address.parse(process.env.ROOT_ACCOUNT_ADDR)

export const REDIS_CONFIG = {
    password: process.env.REDIS_PASSWORD,
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT
}
export const API_PORT = 3002;