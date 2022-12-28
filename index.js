import axios from 'axios'
import { config } from 'dotenv'
import express from 'express'
import bodyParser from 'body-parser'
import fs from 'fs-extra'
import path from 'path'
import * as tools from './tools.js'
import AWS from 'aws-sdk'

config()
const TELEGRAM_URI = `https://api.telegram.org/bot${process.env.TELEGRAM_API_TOKEN}/sendMessage`
const FOLDER_TO_STORE_JSON = process.env.FOLDER_TO_STORE_JSON || process.cwd()
const statusesFileName = 'statuses.json'
const PING_FILE = path.join(FOLDER_TO_STORE_JSON, statusesFileName)
const statusesObject = {
    lastSuccTimeStamp: 0,
    firstSuccTimeStamp: 0,
    lastFaultyTimeStamp: 0,
    firstFaultyTimeStamp: 0
}
const subscribersFileName = 'subscribers.json'
const SUBSCRIBERS_FILE = path.join(FOLDER_TO_STORE_JSON, subscribersFileName)
const suscribersObject = {}
const TIME_ZONE = parseInt(process.env.TIME_ZONE)
const DEBUG = parseInt(process.env.DEBUG)
const STORE_MODE = process.env.STORE_MODE || 'JSON'

const app = express()

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser.raw());

const s3 = new AWS.S3()

function handleMessageText(messageText, chatId) {
    const messageTextLC = messageText?.toLowerCase()
    let responseText = 'Невідома команда'

    if (messageTextLC === 'svitlo' || messageTextLC === 'світло') {
        if (DEBUG) {
            console.log(statusesObject)
        }
        
        if (statusesObject.lastSuccTimeStamp || statusesObject.lastFaultyTimeStamp)
            try {
                if (statusesObject.lastSuccTimeStamp > statusesObject.lastFaultyTimeStamp) {
                    const delta = Date.now() - statusesObject.lastSuccTimeStamp
                    if (delta > 301000) {
                        responseText = '🕯️ Світла скоріш за все немає'
                    } else if (delta > 61000) {
                        responseText = '🕯️ Світла можливо немає, запитайте через 5 хвилин'
                    } else {
                        responseText = '💡 Світло є' + (statusesObject.firstSuccTimeStamp ? ' з ' + tools.getLocalDateString(statusesObject.firstSuccTimeStamp, TIME_ZONE) : '')
                    }
                } else {
                    responseText = '🕯️ Світла немає' + (statusesObject.firstFaultyTimeStamp ? ' з ' + tools.getLocalDateString(statusesObject.firstFaultyTimeStamp, TIME_ZONE) : '')
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
                if (k in statusesObject) {
                    statusesObject[k] = obj[k]
                }
            })
            if (DEBUG) {
                console.log(statusesObject)
            }
            responseText = 'Ок'
        } else {
            responseText = '😞 Помилка: некоректний json'
        }
    } else if (messageTextLC.startsWith('/subscribe')) {
        suscribersObject[chatId] = true

        // store to file
        if (STORE_MODE === 'JSON')
            fs.writeJsonSync(SUBSCRIBERS_FILE, suscribersObject)
        else if (STORE_MODE === 'AWS-S3')
            s3.putObject({
                Body: JSON.stringify(suscribersObject),
                Bucket: process.env.BUCKET,
                Key: subscribersFileName,
            }).promise()
        responseText = 'Ви підписані на повідомлення про світло'
    } else if (messageTextLC.startsWith('/unsubscribe')) {
        delete(suscribersObject[chatId])

        // store to file
        fs.writeJSON(SUBSCRIBERS_FILE, suscribersObject)
        responseText = 'Ви відпідписані від повідомлень про світло'
    } else if (messageTextLC === '/start') {
        responseText = 'Для того щоб дізнатись чи є світло напишіть боту слово "світло" або "svitlo" без лапків'
    }

    return responseText
}

function sendNotificationToSubscribers(pingStatus) {
    let responseText
    if (pingStatus) {
        if (statusesObject.lastFaultyTimeStamp > statusesObject.lastSuccTimeStamp) {
            responseText = '🌞 Дали світло. Темрява тривала ' + tools.millisecondsToStr(Math.round((Date.now() - statusesObject.firstFaultyTimeStamp)))
        }
    } else {
        if (statusesObject.lastFaultyTimeStamp < statusesObject.lastSuccTimeStamp) {
            responseText = '🌚 Cвітла не стало'
        }
    }

    if (!responseText) {
        return
    }

    for (const chatId in suscribersObject) {
        axios.post(TELEGRAM_URI, {
            chat_id: chatId,
            text: responseText
        })
    }
}

app.post('/', async (req, res) => {
    const timeStamp = Date.now()
    const pingStatus = parseInt(req.body?.ping)

    sendNotificationToSubscribers(pingStatus)

    if (pingStatus) {
        statusesObject.lastSuccTimeStamp = timeStamp
        statusesObject.firstFaultyTimeStamp = 0
        statusesObject.firstSuccTimeStamp = statusesObject.firstSuccTimeStamp || statusesObject.lastSuccTimeStamp
    } else {
        statusesObject.lastFaultyTimeStamp = timeStamp
        statusesObject.firstSuccTimeStamp = 0
        statusesObject.firstFaultyTimeStamp = statusesObject.firstFaultyTimeStamp || statusesObject.lastFaultyTimeStamp
    }
    if (DEBUG) {
        console.log(`pingStatus=${pingStatus}`)
    }

    try {
        if (STORE_MODE === 'JSON') {
            fs.writeJSON(PING_FILE, statusesObject, err => {
                if (err) {
                    console.error(err);
                    res.sendStatus(500);

                    return;
                }
                // file written successfully
                res.sendStatus(200);
            })
        } else if (STORE_MODE === 'AWS-S3') {
            await s3.putObject({
                Body: JSON.stringify(statusesObject),
                Bucket: process.env.BUCKET,
                Key: statusesFileName,
            }).promise()

            res.sendStatus(200);
        }
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

if (STORE_MODE === 'JSON') {
    // fill object PING_OBJ from json file
    try {
        const obj = fs.readJSONSync(PING_FILE)
        Object.keys(obj).forEach(k => { if (k in statusesObject) { statusesObject[k] = obj[k] } } )
    } catch (error) { }

    // fill object SUBSCRIBERS from json file
    try {
        const obj = fs.readJSONSync(SUBSCRIBERS_FILE)
        Object.keys(obj).forEach(k => { suscribersObject[k] = obj[k] } )
    } catch (error) { }
}
else if (STORE_MODE === 'AWS-S3') {
    // fill object PING_OBJ from json file
    try {
        let s3File = await s3.getObject({
            Bucket: process.env.BUCKET,
            Key: statusesFileName,
        }).promise()

        const obj = JSON.parse(s3File.Body.toString())   
        Object.keys(obj).forEach(k => { if (k in statusesObject) { statusesObject[k] = obj[k] } } )
    } catch (error) {
        if (DEBUG) {
            console.error(error)
        }
    }

    // fill object SUBSCRIBERS from json file
    try {
        let s3File = await s3.getObject({
            Bucket: process.env.BUCKET,
            Key: subscribersFileName,
        }).promise()

        const obj = JSON.parse(s3File.Body.toString())   
        Object.keys(obj).forEach(k => { suscribersObject[k] = obj[k] } )
    } catch (error) {
        if (DEBUG) {
            console.error(error)
        }
    }
}
if (DEBUG) {
    console.log(statusesObject)
}

const PORT = process.env.PORT || 80
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})

// use this command to set webhook
// curl -F "url=https://{host}/new-message" https://api.telegram.org/bot{token}/setWebhook