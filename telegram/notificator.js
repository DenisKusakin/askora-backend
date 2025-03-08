import TelegramBot from 'node-telegram-bot-api'
import {Worker} from 'bullmq';
import {Address} from "@ton/core";
import {fetchTgIdByWalletAddr} from "../services/user-service.js";
import {REDIS_CONFIG, TG_API_TOKEN} from "../conf.js";
import {op_question_created, op_question_rejected, op_question_replied} from "../services/ton-service.js";

const bot = new TelegramBot(TG_API_TOKEN);

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    console.log("Received /start message");
    bot.sendMessage(chatId, "Welcome to Askora – your open Q&A platform! Tap 'Launch' to dive in and start exploring");
})

function botUrl(internalUrl) {
    return `https://t.me/AskoraBot/app?startapp=${internalUrl}`
}

function msgOptions(url, effectId) {
    const res = {
        disable_notification: true,
        reply_markup: {
            inline_keyboard: [
                [{
                    text: 'Open',
                    url: botUrl(url)
                }]
            ]
        }
    }

    if(effectId != null) {
        res.message_effect_id = effectId
    }
    return res
}

async function runNotificator() {
    const worker = new Worker('ton-notifications', async job => {
        let owner = Address.parse(job.data.owner)
        let submitter = Address.parse(job.data.submitter)
        let id = job.data.id
        let op = BigInt(job.data.op)

        let ownerTgId = await fetchTgIdByWalletAddr(owner.toRawString())
        let submitterTgId = await fetchTgIdByWalletAddr(submitter.toRawString())

        console.log("Sending notification", {
            owner: owner.toString(),
            submitter: submitter.toString(),
            op,
            ownerTgId,
            submitterTgId
        })
        if (op === op_question_created) {
            if (ownerTgId !== null) {
                let url = `1_${id}`
                await bot.sendMessage(ownerTgId, `🔔You've Got a New Question!`, msgOptions(url, "5046509860389126442"))
            }
        } else if (op === op_question_replied) {
            if (submitterTgId !== null) {
                let url = `2_${id}_${owner.toString()}`
                await bot.sendMessage(submitterTgId, `🔔You've got a response to your question`, msgOptions(url))
            }
        } else if (op === op_question_rejected) {
            if (submitterTgId !== null) {
                let url = `2_${id}_${owner.toString()}`
                await bot.sendMessage(submitterTgId, `🔔Your question has been rejected😔`, msgOptions(url))
            }
        }
    }, {
        connection: {
            host: REDIS_CONFIG.host,
            port: REDIS_CONFIG.port,
            password: REDIS_CONFIG.password
        }
    });

    const gracefulShutdown = async (signal) => {
        console.log(`Received ${signal}, closing server...`);
        await worker.close();
    }

    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);

    worker.on('error', err => console.log("Error", err))
}

await runNotificator()