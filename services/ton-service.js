import {TonApiClient} from "@ton-api/client";
import {ROOT_ACCOUNT_ADDR, TON_API_TOKEN, TON_API_URL} from "../conf.js";

// Initialize the TonApi
const client = new TonApiClient({
    baseUrl: TON_API_URL,
    apiKey: TON_API_TOKEN
});

export const op_question_created = BigInt("0x5d2c2cd5")
export const op_question_replied = BigInt("0xb67beedd")
export const op_question_rejected = BigInt("0xd7f75248")

export async function fetchNotifications(after_lt){
    let transactions = (await client.blockchain.getBlockchainAccountTransactions(ROOT_ACCOUNT_ADDR, {after_lt, sort_order: 'asc'})).transactions
    return transactions.filter(x => x.success)
        .map(x => {
            if(x.inMsg == null || x.inMsg.rawBody == null) {
                return null;
            }
            let op = x.inMsg.opCode
            if (op === op_question_created || op === op_question_replied || op === op_question_rejected) {
                let slice = x.inMsg.rawBody.beginParse().skip(32)
                let owner = slice.loadAddress()
                let id = slice.loadInt(32)
                let submitter = slice.loadAddress()

                return {owner, id, submitter, lt: x.lt, createdAt: x.utime, op: op.toString()}
            } else {
                return null
            }
        })
        .filter(x => x !== null)
}