import fs from 'fs-extra'

function getLocalDateString(timeStamp, timeZone = 0) {
    return new Date(timeStamp + timeZone * 1000 * 3600).toLocaleDateString("uk-uk", { hour: "2-digit", minute: "2-digit"})
}

function millisecondsToStr (milliseconds) {
    var temp = Math.floor(milliseconds / 1000);
    var years = Math.floor(temp / 31536000);
    let result = ''
    if (years) {
        result = result + ' ' + years + ' р'
    }
    var days = Math.floor((temp %= 31536000) / 86400)
    if (days) {
        result = result + ' ' + days + ' дн'
    }
    var hours = Math.floor((temp %= 86400) / 3600)
    if (hours) {
        result = result + ' ' + hours + ' год'
    }
    var minutes = Math.floor((temp %= 3600) / 60)
    if (minutes) {
        result = result + ' ' + minutes + ' хв'
    }
    var seconds = temp % 60;
    if (seconds) {
        result = result + ' ' + seconds + ' сек'
    }
    if (!result)
        result = 'менше секунди'
    
    return result.trimLeft()
}

export { getLocalDateString, millisecondsToStr }
  