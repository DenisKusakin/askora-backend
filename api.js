import express from 'express'
import cors from 'cors'
import {createHmac} from "node:crypto";
import {API_PORT, TG_API_TOKEN} from "./conf.js";
import {fetchTgIdByWalletAddr, removeTgIdForWallet, setTgIdToWallet} from "./services/user-service.js";
import {Address} from "@ton/core";
import {
    changeDescriptionSponsored,
    changePriceSponsored,
    createAccountSponsored,
    rejectSponsored,
    replySponsored,
    verifyTonProof
} from "./services/ton-service.js";
import {generatePayload, generateToken, verifyToken} from "./services/jwt-service.js";

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
    if (!isTgDataValid(initDataStr)) {
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
    if (!isTgDataValid(initDataStr)) {
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

app.post('/generate-payload', (req, res) => {
    generatePayload().then(payload => {
        res.json({payload})
    })
})

app.post('/check_proof', async (req, res) => {
    let payload = req.body
    const address = Address.parse(payload.address)

    try {
        const isTonProofValid = verifyTonProof(payload)
        if (!isTonProofValid) {
            res.sendStatus(401)
        }
        // At his point we know that address belongs to the user
        if (await verifyToken(payload.proof.payload) != null) {
            const authToken = await generateToken(address)
            res.json({token: authToken})
        } else {
            res.sendStatus(401)
        }
    } catch (e) {
        console.log("Error", e)
        res.sendStatus(401)
    }

})

app.post('/create-account', async (req, res) => {
    const reqBody = req.body
    const token = req.headers.authorization?.replace('Bearer ', '');
    const verified = await verifyToken(token)
    if (!token || !verified) {
        res.sendStatus(401)
    } else {
        const addr = Address.parse(verified.addr);
        await createAccountSponsored(addr, BigInt(reqBody.price), reqBody.description)
        res.json({ok: 'ok'})
    }
})

app.post('/reply-question', async (req, res) => {
    const reqBody = req.body
    const token = req.headers.authorization?.replace('Bearer ', '');
    const verified = await verifyToken(token)
    if (!token || !verified) {
        res.sendStatus(401)
    } else {
        const addr = Address.parse(verified.addr);
        const qId = reqBody.qId;
        const replyContent = reqBody.replyContent;
        await replySponsored(addr, qId, replyContent)
        res.json({ok: 'ok'})
    }
})

app.post('/reject-question', async (req, res) => {
    const reqBody = req.body
    const token = req.headers.authorization?.replace('Bearer ', '');
    const verified = await verifyToken(token)
    if (!token || !verified) {
        res.sendStatus(401)
    } else {
        const addr = Address.parse(verified.addr);
        const qId = reqBody.qId;
        await rejectSponsored(addr, qId)
        res.json({ok: 'ok'})
    }
})

app.post('/change-price', async (req, res) => {
    const reqBody = req.body
    const token = req.headers.authorization?.replace('Bearer ', '');
    const verified = await verifyToken(token)
    if (!token || !verified) {
        res.sendStatus(401)
    } else {
        const addr = Address.parse(verified.addr);
        const newPrice = BigInt(reqBody.price);
        await changePriceSponsored(addr, newPrice)
        res.json({ok: 'ok'})
    }
})

app.post('/change-description', async (req, res) => {
    const reqBody = req.body
    const token = req.headers.authorization?.replace('Bearer ', '');
    const verified = await verifyToken(token)
    if (!token || !verified) {
        res.sendStatus(401)
    } else {
        const addr = Address.parse(verified.addr);
        const newDescription = reqBody.description;
        await changeDescriptionSponsored(addr, newDescription)
        res.json({ok: 'ok'})
    }
})

app.listen(API_PORT, () => {
    console.log(`Askora API listening on port ${API_PORT}`)
})