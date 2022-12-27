import fs from 'fs-extra'

function getLocalDateString(timeStamp, timeZone = 0) {
    return new Date(timeStamp + timeZone * 1000 * 3600).toLocaleDateString("uk-uk", { hour: "2-digit", minute: "2-digit"})
}

export { getLocalDateString }
  