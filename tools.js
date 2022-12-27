import fs from 'fs-extra'


function getFileCotent(fileName) {
    if (fs.existsSync(fileName)) {
        try {
            return fs.readFileSync(fileName).toString();
        } catch (e) {}
    }

    return null
}

export { getFileCotent }
  