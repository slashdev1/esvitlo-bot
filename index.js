import axios from 'axios'
import { config } from 'dotenv'
import express from 'express'
import bodyParser from 'body-parser'
import fs from 'fs-extra'
import path from 'path'
import * as tools from './tools.js'

config()
const TELEGRAM_URI = `https://api.telegram.org/bot${process.env.TELEGRAM_API_TOKEN}/sendMessage`
const PING_FILE = path.join(process.cwd(), 'ping')
const PING_OBJ = {
    lastSuccTimeStamp: 0,
    firstSuccTimeStamp: 0,
    lastFaultyTimeStamp: 0,
    firstFaultyTimeStamp: 0
}
const TIME_ZONE = parseInt(process.env.TIME_ZONE)

const app = express()

/*app.use(express.json())
app.use(
    express.urlencoded({
        extended: true
    })
)*/
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser.raw());

function handleMessageText(messageText, chatId) {
    const messageTextLC = messageText?.toLowerCase()
    let responseText = 'Невідома команда'

    if (messageTextLC === 'svitlo' || messageTextLC === 'світло') {
        console.log(PING_OBJ)
        
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

        console.log(responseText)
    } else if (messageTextLC.startsWith('/set')) {
        let jsonText = messageText.slice(5)
        // handle json to use correct syntax
        jsonText = jsonText.replace(/(['"])?([a-z0-9A-Z_]+)(['"])?:/g, '"$2": ')
        const obj = JSON.parse(jsonText)
        if (typeof obj === 'object') {
            Object.keys(obj).forEach(k => {
                if (k in PING_OBJ) {
                    PING_OBJ[k] = obj[k]
                }
            })
            console.log(PING_OBJ)
            responseText = 'Ок'
        } else {
            responseText = '😞 Помилка: некоректний json'
        }
    } else if (messageTextLC === '/start') {
        responseText = 'Для того щоб дізнатись чи є світло напишіть боту слово "світло" або "svitlo" без лапків'
    }

    return responseText
}

app.post('/', async (req, res) => {
    const timeStamp = Date.now()
    const pingStatus = parseInt(req.body?.ping)

    if (pingStatus) {
        PING_OBJ.lastSuccTimeStamp = timeStamp
        PING_OBJ.firstFaultyTimeStamp = 0
        PING_OBJ.firstSuccTimeStamp = PING_OBJ.firstSuccTimeStamp || PING_OBJ.lastSuccTimeStamp
    } else {
        PING_OBJ.lastFaultyTimeStamp = timeStamp
        PING_OBJ.firstSuccTimeStamp = 0
        PING_OBJ.firstFaultyTimeStamp = PING_OBJ.firstFaultyTimeStamp || PING_OBJ.lastFaultyTimeStamp
    }
    console.log(`pingStatus=${pingStatus}`)

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

try {
    const obj = fs.readJSONSync(PING_FILE)
    Object.keys(obj).forEach(k => { if (k in PING_OBJ) { PING_OBJ[k] = obj[k] } } )
} catch (error) { }

// use this command to set webhook
// curl -F "url=https://{host}/new-message" https://api.telegram.org/bot{token}/setWebhook