import {redisClient} from "../redis-client.js";

await redisClient.connect()

export async function fetchTgIdByWalletAddr(addr) {
    return await redisClient.get(`wallet-addr-${addr}`)
}

export async function setTgIdToWallet(addr, tgId) {
    return await redisClient.set(`wallet-addr-${addr}`, tgId)
}

export async function removeTgIdForWallet(addr, tgId) {
    let storedValue = await redisClient.get(`wallet-addr-${addr}`)
    if (storedValue == null) {
        return;
    }
    if (storedValue === tgId) {
        return await redisClient.del(`wallet-addr-${addr}`)
    }
}