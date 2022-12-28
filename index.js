import axios from 'axios'
import { config } from 'dotenv'
import express from 'express'
import bodyParser from 'body-parser'
import fs from 'fs-extra'
import path from 'path'
import * as tools from './tools.js'

config()
const TELEGRAM_URI = `https://api.telegram.org/bot${process.env.TELEGRAM_API_TOKEN}/sendMessage`
const FOLDER_TO_STORE_JSON = process.env.FOLDER_TO_STORE_JSON || process.cwd()
const PING_FILE = path.join(FOLDER_TO_STORE_JSON, 'ping.json')
const PING_OBJ = {
    lastSuccTimeStamp: 0,
    firstSuccTimeStamp: 0,
    lastFaultyTimeStamp: 0,
    firstFaultyTimeStamp: 0
}
const SUBSCRIBERS_FILE = path.join(FOLDER_TO_STORE_JSON, 'subscribers.json')
const SUBSCRIBERS = {}
const TIME_ZONE = parseInt(process.env.TIME_ZONE)
const DEBUG = parseInt(process.env.DEBUG)

const app = express()

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser.raw());

function handleMessageText(messageText, chatId) {
    const messageTextLC = messageText?.toLowerCase()
    let responseText = 'Невідома команда'

    if (messageTextLC === 'svitlo' || messageTextLC === 'світло') {
        if (DEBUG) {
            console.log(PING_OBJ)
        }
        
        if (PING_OBJ.lastSuccTimeStamp || PING_OBJ.lastFaultyTimeStamp)
            try {
                if (PING_OBJ.lastSuccTimeStamp > PING_OBJ.lastFaultyTimeStamp) {
                    const delta = Date.now() - PING_OBJ.lastSuccTimeStamp
                    if (delta > 301000) {
                        responseText = '🕯️ Світла скоріш за все немає'
                    } else if (delta > 61000) {
                        responseText = '🕯️ Світла можливо немає, запитайте через 5 хвилин'
                    } else {
                        responseText = '💡 Світло є' + (PING_OBJ.firstSuccTimeStamp ? ' з ' + tools.getLocalDateString(PING_OBJ.firstSuccTimeStamp, TIME_ZONE) : '')
                    }
                } else {
                    responseText = '🕯️ Світла немає' + (PING_OBJ.firstFaultyTimeStamp ? ' з ' + tools.getLocalDateString(PING_OBJ.firstFaultyTimeStamp, TIME_ZONE) : '')
                }
            } catch (error) {
                responseText = '😞 Помилка: ' + error
            }
        else {
            responseText = '🤔 Невідомо'
        }

        if (DEBUG) {
            console.log(responseText)
        }
    } else if (messageTextLC.startsWith('/set')) {
        let jsonText = messageText.slice(5)
        // handle json to use correct syntax
        jsonText = jsonText.replace(/(['"])?([a-z0-9A-Z_]+)(['"])?:/g, '"$2": ')
        let obj
        try {
            obj = JSON.parse(jsonText)   
        } catch (error) { }
        if (typeof obj === 'object') {
            Object.keys(obj).forEach(k => {
                if (k in PING_OBJ) {
                    PING_OBJ[k] = obj[k]
                }
            })
            if (DEBUG) {
                console.log(PING_OBJ)
            }
            responseText = 'Ок'
        } else {
            responseText = '😞 Помилка: некоректний json'
        }
    } else if (messageTextLC.startsWith('/subscribe')) {
        SUBSCRIBERS[chatId] = true

        // store to file
        fs.writeJsonSync(SUBSCRIBERS_FILE, SUBSCRIBERS)
        responseText = 'Ви підписані на повідомлення про світло'
    } else if (messageTextLC.startsWith('/unsubscribe')) {
        delete(SUBSCRIBERS[chatId])

        // store to file
        fs.writeJSON(SUBSCRIBERS_FILE, SUBSCRIBERS)
        responseText = 'Ви відпідписані від повідомлень про світло'
    } else if (messageTextLC === '/start') {
        responseText = 'Для того щоб дізнатись чи є світло напишіть боту слово "світло" або "svitlo" без лапків'
    }

    return responseText
}

function sendNotificationToSubscribers(pingStatus) {
    let responseText
    if (pingStatus) {
        if (PING_OBJ.lastFaultyTimeStamp > PING_OBJ.lastSuccTimeStamp) {
            responseText = '🌞 Дали світло. Темрява тривала ' + tools.millisecondsToStr(Math.round((Date.now() - PING_OBJ.firstFaultyTimeStamp)))
        }
    } else {
        if (PING_OBJ.lastFaultyTimeStamp < PING_OBJ.lastSuccTimeStamp) {
            responseText = '🌚 Cвітла не стало'
        }
    }

    if (!responseText) {
        return
    }

    for (const chatId in SUBSCRIBERS) {
        try {
            axios.post(TELEGRAM_URI, {
                chat_id: chatId,
                text: responseText
            })
        } catch (error) { }
    }
}

app.post('/', async (req, res) => {
    const timeStamp = Date.now()
    const pingStatus = parseInt(req.body?.ping)

    sendNotificationToSubscribers(pingStatus)

    if (pingStatus) {
        PING_OBJ.lastSuccTimeStamp = timeStamp
        PING_OBJ.firstFaultyTimeStamp = 0
        PING_OBJ.firstSuccTimeStamp = PING_OBJ.firstSuccTimeStamp || PING_OBJ.lastSuccTimeStamp
    } else {
        PING_OBJ.lastFaultyTimeStamp = timeStamp
        PING_OBJ.firstSuccTimeStamp = 0
        PING_OBJ.firstFaultyTimeStamp = PING_OBJ.firstFaultyTimeStamp || PING_OBJ.lastFaultyTimeStamp
    }
    if (DEBUG) {
        console.log(`pingStatus=${pingStatus}`)
    }

    try {
        fs.writeJSON(PING_FILE, PING_OBJ, err => {
            if (err) {
                console.error(err);
                res.sendStatus(500);

                return;
            }
            // file written successfully
            res.sendStatus(200);
        })
    } catch (error) {
        console.error(error);
        res.sendStatus(500);
    }
})

app.post('/new-message', async (req, res) => {
    const { message } = req.body

    const messageText = message?.text?.trim()
    const chatId = message?.chat?.id
    if (!messageText || !chatId) {
        return res.sendStatus(400)
    }

    // generate responseText
    const responseText = handleMessageText(messageText, chatId)

    // send response
    try {
        await axios.post(TELEGRAM_URI, {
            chat_id: chatId,
            text: responseText
        })
        res.send('Done')
    } catch (error) {
        console.log(error)
        res.send(error)
    }
})

const PORT = process.env.PORT || 80
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})

// fill object PING_OBJ from json file
try {
    const obj = fs.readJSONSync(PING_FILE)
    Object.keys(obj).forEach(k => { if (k in PING_OBJ) { PING_OBJ[k] = obj[k] } } )
} catch (error) { }

// fill object SUBSCRIBERS from json file
try {
    const obj = fs.readJSONSync(SUBSCRIBERS_FILE)
    Object.keys(obj).forEach(k => { SUBSCRIBERS[k] = obj[k] } )
} catch (error) { }

// use this command to set webhook
// curl -F "url=https://{host}/new-message" https://api.telegram.org/bot{token}/setWebhook