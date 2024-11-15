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
export const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY
export const JWT_EXPIRATION_TIME = process.env.JWT_EXPIRATION_TIME || '1Y'
export const SPONSOR_WALLET_MNEMONIC = process.env.SPONSOR_WALLET_MNEMONIC.split(' ')
export const ALLOWED_DOMAINS = [
    'localhost',
    'askora-twa.vercel.app'
];
export const TON_PROOF_VALID_AUTH_TIME = 15 * 60; // 15 minute
export const API_PORT = 3002;