import express from 'express'
import cors from 'cors'
import {createHmac} from "node:crypto";
import {API_PORT, TG_API_TOKEN} from "./conf.js";
import {fetchTgIdByWalletAddr, removeTgIdForWallet, setTgIdToWallet} from "./services/user-service.js";
import {Address} from "@ton/core";

const app = express()

app.use(express.json())
app.use(cors())

function HMAC_SHA256(key, secret) {
    return createHmac("sha256", key).update(secret);
}

app.get('/subscribed', (req, res) => {
    let tgId = req.query.tg_id
    let walletAddrStr = req.query.wallet_addr
    let walletAddr = Address.parse(walletAddrStr)

    if (tgId == null || walletAddrStr == null) {
        res.sendStatus(400)
    } else {
        fetchTgIdByWalletAddr(walletAddr.toRawString()).then(subscribedTgId => {
            res.json({
                subscribed: subscribedTgId === tgId
            })
        })
    }
})

function getCheckString(data) {
    const items = [];

    for (const [k, v] of data.entries()) if (k !== "hash") items.push([k, v]);

    return items.sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join("\n");
}

function isTgDataValid(initDataStr) {
    let initData = new URLSearchParams(initDataStr)
    const data_check_string = getCheckString(initData);

    const secret_key = HMAC_SHA256("WebAppData", TG_API_TOKEN).digest();
    const hash = HMAC_SHA256(secret_key, data_check_string).digest("hex");

    return hash === initData.get("hash")
}

app.post('/subscribe', (req, res) => {
    let body = req.body
    let walletAddr = body.walletAddr

    let initDataStr = body.initData

    console.log("Subscribe", walletAddr)
    if(!isTgDataValid(initDataStr)){
        res.sendStatus(401)
    } else {
        let initData = new URLSearchParams(initDataStr)
        let userInfoStr = initData.get("user")
        let userInfo = JSON.parse(userInfoStr)
        let tgId = "" + userInfo.id
        let addr = Address.parse(walletAddr)

        setTgIdToWallet(addr.toRawString(), tgId)
            .then(() => {
                res.sendStatus(200)
            })
    }
})

app.post('/unsubscribe', (req, res) => {
    let body = req.body
    let walletAddr = body.walletAddr

    let initDataStr = body.initData
    if(!isTgDataValid(initDataStr)){
        res.sendStatus(401)
    } else {
        let initData = new URLSearchParams(initDataStr)
        let userInfoStr = initData.get("user")
        let userInfo = JSON.parse(userInfoStr)
        let tgId = "" + userInfo.id
        let addr = Address.parse(walletAddr)

        removeTgIdForWallet(addr.toRawString(), tgId)
            .then(() => {
                res.sendStatus(200)
            })
    }
})

app.listen(API_PORT, () => {
    console.log(`Askora API listening on port ${API_PORT}`)
})