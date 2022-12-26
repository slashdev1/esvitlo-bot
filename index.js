import axios from 'axios'
import { config } from 'dotenv'
import express from 'express'
import fs from 'fs-extra'
import path from 'path'

config()
const TELEGRAM_URI = `https://api.telegram.org/bot${process.env.TELEGRAM_API_TOKEN}/sendMessage`
const PING_FILE = path.join(process.cwd(), 'ping')

const app = express()

app.use(express.json())
app.use(
  express.urlencoded({
    extended: true
  })
)

app.post('/', async (req, res) => {
    const content = Date.now().toString() + " " + req.body?.ping + "\n";
    try {
        //fs.appendFile(path.join(process.cwd(), 'test.txt'), content, err => {
        fs.writeFile(PING_FILE, content, err => {
            if (err) {
                console.error(err);
                res.status(500);
                res.send(null);
                return;
            }
            // file written successfully
            res.status(200);
            res.send(null);
        })
    } catch (e) {
        console.error(e);
        res.status(500);
        res.send(null);
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
        if (fs.existsSync(PING_FILE))
            try {
                const buffer = fs.readFileSync(PING_FILE);
                const fileContent = buffer.toString();
                const prevDate = parseInt(fileContent.split(' ')[0])
                if (prevDate > 0) {
                    const delta = Date.now() - prevDate
                    if (delta > 300000) {
                        responseText = 'Світла немає'
                    } else if (delta > 60000) {
                        responseText = 'Світла скоріш за все немає'
                    } else {
                        responseText = 'Світло є'
                    }
                }
            } catch (e) {
                responseText = 'Помилка' + e
            }
        else
            responseText = 'Невідомо'
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