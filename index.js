import axios from 'axios'
import { config } from 'dotenv'
import express from 'express'
import fs from 'fs-extra'
import path from 'path'
import * as tools from './tools.js'

config()
const TELEGRAM_URI = `https://api.telegram.org/bot${process.env.TELEGRAM_API_TOKEN}/sendMessage`
const PING_FILE_SUCCESS = path.join(process.cwd(), 'ping')
const PING_FILE_FAULT = path.join(process.cwd(), 'noping')

const app = express()

app.use(express.json())
app.use(
    express.urlencoded({
        extended: true
    })
)

app.post('/', async (req, res) => {
    const content = Date.now().toString() + "\n";
    const pingStatus = parseInt(req.body?.ping)
    const fileName = pingStatus ? PING_FILE_SUCCESS : PING_FILE_FAULT

    try {
        fs.writeFile(fileName, content, err => {
            if (err) {
                console.error(err);
                res.sendStatus(500);

                return;
            }
            // file written successfully
            res.sendStatus(200);
        })
    } catch (e) {
        console.error(e);
        res.sendStatus(500);
    }
})

app.post('/new-message', async (req, res) => {
    const { message } = req.body

    const messageText = message?.text?.toLowerCase()?.trim()
    const chatId = message?.chat?.id
    if (!messageText || !chatId) {
        return res.sendStatus(400)
    }

    // generate responseText
    let responseText = 'Невідома команда'
    if (messageText === 'svitlo' || messageText === 'світло') {
        const prevDateSuccess = parseInt(tools.getFileCotent(PING_FILE_SUCCESS)) || 0
        const prevDateFault = parseInt(tools.getFileCotent(PING_FILE_FAULT)) || 0
        const formattedDateSuccess = new Date(prevDateSuccess).toLocaleDateString("uk-uk", { hour: "2-digit", minute: "2-digit"})
        const formattedDateFault = new Date(prevDateFault).toLocaleDateString("uk-uk", { hour: "2-digit", minute: "2-digit"})
        console.log('ping   date is ' + formattedDateSuccess)
        console.log('noping date is ' + formattedDateFault)
        
        if (prevDateSuccess || prevDateFault)
            try {
                /*const buffer = fs.readFileSync(PING_FILE);
                const fileContent = buffer.toString();
                const prevDate = parseInt(fileContent.split(' ')[0])
                if (prevDate > 0) {
                    const delta = Date.now() - prevDate
                    if (delta > 300000) {
                        responseText = '🕯️ Світла немає'
                    } else if (delta > 60000) {
                        responseText = '🕯️ Світла скоріш за все немає'
                    } else {
                        responseText = '💡 Світло є'
                    }
                }*/
                if (prevDateSuccess > prevDateFault) {
                    const delta = Date.now() - prevDateSuccess
                    if (delta > 301000) {
                        responseText = '🕯️ Світла скоріш за все немає'
                    } else if (delta > 61000) {
                        responseText = '🕯️ Світла можливо немає'
                    } else {
                        responseText = '💡 Світло є'
                    }
                } else {
                    responseText = '🕯️ Світла немає'
                }
            } catch (e) {
                responseText = '😞 Помилка' + e
            }
        else
            responseText = '🤔 Невідомо'
    } else if (messageText === '/start') {
        responseText = 'Для того щоб дізнатись чи є світло напишіть боту слово "світло" або "svitlo" без лапків'
    }

    // send response
    try {
        await axios.post(TELEGRAM_URI, {
            chat_id: chatId,
            text: responseText
        })
        res.send('Done')
    } catch (e) {
        console.log(e)
        res.send(e)
    }
})

const PORT = process.env.PORT || 80
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})

//curl -F "url=https://.../new-message" https://api.telegram.org/bot5913469725:.../setWebhook