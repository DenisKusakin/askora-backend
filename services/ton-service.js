import {TonApiClient} from "@ton-api/client";
import {
    ALLOWED_DOMAINS,
    ROOT_ACCOUNT_ADDR,
    SPONSOR_WALLET_MNEMONIC,
    TON_API_TOKEN,
    TON_API_URL,
    TON_PROOF_VALID_AUTH_TIME
} from "../conf.js";
import {tryParsePublicKey} from "../utils.js";
import {Address, beginCell, Cell, internal, loadStateInit, SendMode, storeMessage, toNano} from "@ton/core";
import {contractAddress, WalletContractV4, WalletContractV5R1} from "@ton/ton";
import {mnemonicToWalletKey, sha256} from "@ton/crypto";
import {ContractAdapter} from "@ton-api/ton-adapter";

import pkg from "tweetnacl";
import {redisClient} from "../redis-client.js";

const {randomBytes, sign} = pkg;

const tonApiClient = new TonApiClient({
    baseUrl: TON_API_URL,
    apiKey: TON_API_TOKEN
});

export const op_question_created = BigInt("0x5d2c2cd5")
export const op_question_replied = BigInt("0xb67beedd")
export const op_question_rejected = BigInt("0xd7f75248")

//These functions rely on the internal structure of the contracts
//TODO: move this to wrappers and use them on the backend
console.log("Fetch data from the root account...")
const rootContractData = await tonApiClient.blockchain.getBlockchainRawAccount(ROOT_ACCOUNT_ADDR)
    .then(rootAcc => rootAcc.data)
    .then(data => {
        let ds = data.beginParse()
        let accountCode = ds.loadRef()
        let questionCode = ds.loadRef()
        let questionRefCode = ds.loadRef()
        let owner = ds.loadAddress()

        console.log("Data from the root account received")
        return {
            accountCode,
            questionCode,
            questionRefCode
        }
    })

function calculateAccountAddress(owner) {
    const data = beginCell()
        .storeAddress(owner)
        .storeAddress(ROOT_ACCOUNT_ADDR)
        .storeRef(rootContractData.questionCode)
        .storeRef(rootContractData.questionRefCode)
        .endCell()

    return contractAddress(0, {code: rootContractData.accountCode, data})
}

function calculateQuestionAddress(owner, qId) {
    const accountAddress = calculateAccountAddress(owner)
    const data = beginCell()
        .storeAddress(accountAddress)
        .storeUint(qId, 32)
        .endCell()

    return contractAddress(0, {code: rootContractData.questionCode, data})
}

export async function fetchNotifications(after_lt) {
    let transactions = (await tonApiClient.blockchain.getBlockchainAccountTransactions(ROOT_ACCOUNT_ADDR, {
        after_lt,
        sort_order: 'asc'
    })).transactions
    return transactions.filter(x => x.success)
        .map(x => {
            if (x.inMsg == null || x.inMsg.rawBody == null || x.inMsg.source == null) {
                return null;
            }
            let op = x.inMsg.opCode
            if (op === op_question_created || op === op_question_replied || op === op_question_rejected) {
                let slice = x.inMsg.rawBody.beginParse().skip(32)
                let owner = slice.loadAddress()
                let id = slice.loadInt(32)
                let submitter = slice.loadAddress()

                //Anyone could send such messages, need to make sure that the sender is actually a valid question contract
                const expectedSenderAddress = calculateQuestionAddress(owner, id)
                const actualSenderAddr = x.inMsg.source.address
                if (!expectedSenderAddress.equals(actualSenderAddr)) {
                    console.error("Notification came from unexpected sender, will be ignored", actualSenderAddr.toString())
                    return null
                }

                return {owner, id, submitter, lt: x.lt, createdAt: x.utime, op: op.toString()}
            } else {
                return null
            }
        })
        .filter(x => x !== null)
}

const tonProofPrefix = 'ton-proof-item-v2/';
const tonConnectPrefix = 'ton-connect';

export async function verifyTonProof(payload) {
    try {
        console.log("Ton proof", payload)
        const address = Address.parse(payload.address)
        let stateInit = null;
        if (payload.proof.state_init) {
            stateInit = loadStateInit(Cell.fromBase64(payload.proof.state_init).beginParse())
        }

        let publicKey = tryParsePublicKey(stateInit)
        if (publicKey == null) {
            publicKey = await tonApiClient.accounts.getAccountPublicKey(address)
                .then(x => {
                    return x.publicKey
                })
                .then(x => Buffer.from(x, 'hex'))
        }
        const wantedPublicKey = Buffer.from(payload.public_key, 'hex');
        if (!publicKey.equals(wantedPublicKey)) {
            return false;
        }

        const wantedAddress = Address.parse(payload.address);
        const walletAddress = contractAddress(wantedAddress.workChain, stateInit);
        if (!walletAddress.equals(wantedAddress)) {
            console.log("Wallet addr does not match")
            return false;
        }

        if (!ALLOWED_DOMAINS.includes(payload.proof.domain.value)) {
            console.log("Domain does not match", payload.proof.domain.value)
            return false;
        }
        const now = Math.floor(Date.now() / 1000);
        if (now - TON_PROOF_VALID_AUTH_TIME > payload.proof.timestamp) {
            return false;
        }

        const message = {
            workchain: walletAddress.workChain,
            address: walletAddress.hash,
            domain: {
                lengthBytes: payload.proof.domain.lengthBytes,
                value: payload.proof.domain.value,
            },
            signature: Buffer.from(payload.proof.signature, 'base64'),
            payload: payload.proof.payload,
            stateInit: payload.proof.state_init,
            timestamp: payload.proof.timestamp
        };

        const wc = Buffer.alloc(4);
        wc.writeUInt32BE(message.workchain, 0);

        const ts = Buffer.alloc(8);
        ts.writeBigUInt64LE(BigInt(message.timestamp), 0);

        const dl = Buffer.alloc(4);
        dl.writeUInt32LE(message.domain.lengthBytes, 0);

        // message = utf8_encode("ton-proof-item-v2/") ++
        //           Address ++
        //           AppDomain ++
        //           Timestamp ++
        //           Payload
        const msg = Buffer.concat([
            Buffer.from(tonProofPrefix),
            wc,
            message.address,
            dl,
            Buffer.from(message.domain.value),
            ts,
            Buffer.from(message.payload),
        ]);
        return await sha256(msg).then(msgHash => {
            const fullMsg = Buffer.concat([
                Buffer.from([0xff, 0xff]),
                Buffer.from(tonConnectPrefix),
                msgHash,
            ]);
            return sha256(fullMsg).then(x => Buffer.from(x))
        })
            .then(result => sign.detached.verify(result, message.signature, publicKey));
    } catch (e) {
        return false
    }
}

function sleep(delay) {
    return new Promise(resolve => {
        setTimeout(resolve, delay)
    })
}

const adapter = new ContractAdapter(tonApiClient)
const keyPair = await mnemonicToWalletKey(SPONSOR_WALLET_MNEMONIC)
const wallet = WalletContractV4.create({workchain: 0, publicKey: keyPair.publicKey});

async function acquireLock() {
    while (true) {
        let isOk = await redisClient.set('sponsor-wallet-lock', 'lock', {NX: true, EX: 10})
        if (isOk == null) {
            console.log("Waiting for lock...")
            await sleep(500)
        } else {
            console.log("Lock received")
            return;
        }
    }
}

async function releaseLock() {
    await redisClient.del('sponsor-wallet-lock')
}

async function sendSponsoredTransaction(msgBody, amount, targetAddr) {
    await acquireLock()
    try {
        const contract = adapter.open(wallet);
        const seqno = await contract.getSeqno();

        const transfer = await contract.createTransfer({
            seqno,
            secretKey: keyPair.secretKey,
            sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
            messages: [
                internal({
                    value: amount,
                    to: targetAddr.toRawString(),
                    body: msgBody
                })
            ]
        });
        await sleep(1000)
        console.log(`Sending sponsored transaction with amount=${amount}`)
        try {
            await contract.send(transfer)
        } catch (e) {
            throw new Error("failed to send external message")
        }

        // await sleep(2000)
        // while (true) {
        //     const currentSeqNo = await contract.getSeqno()
        //     if (seqno === currentSeqNo) {
        //         await sleep(2000)
        //     } else {
        //         return;
        //     }
        // }
    } finally {
        await releaseLock()
    }
}

export async function createAccountSponsored(ownerAddr, price, description) {
    console.log("create account sponsored", ownerAddr.toString(), price)
    const msgBody = beginCell()
        .storeUint(BigInt('0x74385f77'), 32)
        .storeAddress(ownerAddr)
        .storeCoins(price)
        .storeRef(beginCell().storeStringTail(description).endCell())
        .endCell()

    return sendSponsoredTransaction(msgBody, toNano(0.07), ROOT_ACCOUNT_ADDR)
}

export async function replySponsored(ownerAddr, qId, replyContent) {
    console.log("create question sponsored", ownerAddr.toString(), qId)
    const msgBody = beginCell()
        .storeUint(BigInt('0xd9c2a251'), 32)
        .storeAddress(ownerAddr)
        .storeUint(qId, 32)
        .storeRef(beginCell().storeStringTail(replyContent).endCell())
        .endCell()

    return sendSponsoredTransaction(msgBody, toNano(0.03), ROOT_ACCOUNT_ADDR)
}

export async function rejectSponsored(ownerAddr, qId) {
    console.log("reject question sponsored", ownerAddr.toString(), qId)
    const msgBody = beginCell()
        .storeUint(BigInt('0x23b39f85'), 32)
        .storeAddress(ownerAddr)
        .storeUint(qId, 32)
        .endCell()

    return sendSponsoredTransaction(msgBody, toNano(0.03), ROOT_ACCOUNT_ADDR)
}

export async function changePriceSponsored(ownerAddr, newPrice) {
    console.log("change price sponsored", ownerAddr.toString(), newPrice)
    const msgBody = beginCell()
        .storeUint(BigInt('0xbef672d6'), 32)
        .storeAddress(ownerAddr)
        .storeCoins(newPrice)
        .endCell()

    return sendSponsoredTransaction(msgBody, toNano(0.03), ROOT_ACCOUNT_ADDR)
}

export async function changeDescriptionSponsored(ownerAddr, newDescription) {
    console.log("create description sponsored", ownerAddr.toString())
    const msgBody = beginCell()
        .storeUint(BigInt('0xcc3612de'), 32)
        .storeAddress(ownerAddr)
        .storeStringRefTail(newDescription)
        .endCell()

    return sendSponsoredTransaction(msgBody, toNano(0.03), ROOT_ACCOUNT_ADDR)
}

export async function refundSponsored(questionAddr) {
    console.log("refund sponsored", questionAddr.toString())
    const msgBody = beginCell()
        .storeUint(BigInt('0x5616c572'), 32)
        .endCell()

    return sendSponsoredTransaction(msgBody, toNano(0.03), questionAddr)
}