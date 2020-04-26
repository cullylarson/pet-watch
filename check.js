const fs = require('fs')
const url = require('url')
const urlJoin = require('url-join')
const path = require('path')
const fetch = require('node-fetch')
const sendmail = require('sendmail')
const escape = require('escape-html')
const {JSDOM} = require('jsdom')
const {curry, map} = require('@cullylarson/f')

const storedDataVersion = 1 // increment if the structure of stored data changes

const loadDom = html => new JSDOM(html)

const getAnimalEls = dom => dom.window.document.querySelectorAll('.list-item')

const getElPhotoUrl = el => {
    return el
        ? el.src
        : null
}

const getElHref = el => {
    return el
        ? el.href
        : null
}

const getElText = el => {
    return el
        ? el.textContent.trim()
        : null
}

const relativeProfileUrlToAbsolute = (checkUrl, profileUrl) => {
    if(!profileUrl) return null

    // already absolute
    if(
        profileUrl.indexOf('//') === 0
        || profileUrl.indexOf('http://') === 0
        || profileUrl.indexOf('https://') === 0
    ) return profileUrl

    const u = url.parse(checkUrl)

    return u.protocol
        + '//'
        + urlJoin(
            u.host || '',
            path.basename(u.pathname) || '',
            profileUrl,
        )
}

const animalElToObj = curry((checkUrl, el) => {
    return {
        photoUrl: getElPhotoUrl(el.querySelector('.list-animal-photo')),
        profileUrl: relativeProfileUrlToAbsolute(
            checkUrl,
            getElHref(el.querySelector('.list-animal-name a')),
        ),
        name: getElText(el.querySelector('.list-animal-name')),
        id: getElText(el.querySelector('.list-animal-id')),
        sex: getElText(el.querySelector('.list-animal-sexSN')),
        breed: getElText(el.querySelector('.list-animal-breed')),
        age: getElText(el.querySelector('.list-animal-age')),
        location: getElText(el.querySelector('.hidden')),
    }
})

const nodeListToArray = els => ([...els])

const readHtml = url => {
    if(url === 'test1') {
        return fs.promises.readFile('./example1.html', {encoding: 'utf-8'})
    }
    else if(url === 'test2') {
        return fs.promises.readFile('./example2.html', {encoding: 'utf-8'})
    }
    else {
        return fetch(url)
            .then(res => res.text())
    }
}

const readSavedData = path => {
    return fs.promises.readFile(path, {encoding: 'utf-8'})
        .then(content => JSON.parse(content))
        .then(data => {
            if(!data.version) {
                return {
                    status: 'first',
                    data: {},
                }
            }
            else if(data.version !== storedDataVersion) {
                return {
                    status: 'version-mismatch',
                    data: {},
                }
            }
            else {
                return {
                    status: 'version-match',
                    data,
                }
            }
        })
        .catch(err => {
            if(err.code === 'ENOENT') {
                return {
                    status: 'first',
                    data: {}
                }
            }
            else {
                console.error('Something went wrong while reading the the data file: ' + err + "\n" + err.stack)
                process.exit(3)
            }
        })
}

const saveNewData = (savedDataPath, fetchedData) => {
    const dataToWrite = JSON.stringify({
        version: storedDataVersion,
        data: fetchedData,
    })

    return fs.promises.writeFile(savedDataPath, dataToWrite, {encoding: 'utf-8'})
        .catch(err => {
            console.error('Something went wrong saving data to file: ' + err + "\n" + err.stack)
            process.exit(4)
        })
}

const buildEmailHtml = (message) => {
    return message
}

const sendEmail = (from, to, subject, message) =>{
    return new Promise((resolve, reject) => {
        sendmail({
            from,
            to,
            subject,
            html: buildEmailHtml(message),
        }, (err, reply) => {
            if(err) reject(err)
            else resolve(reply)
        })
    })
}

const findNewItems = (oldData, newData) => {
    return newData.filter(x => {
        // no items in oldData match this item's id
        return !oldData.some(y => y.id === x.id)
    })
}

const itemsToHtml = (items) => {
    const itemToHtml = item => {
        return `
            <p>
                <img src='${item.photoUrl}' /><br />
                <b><a href='${item.profileUrl}'>${escape(item.name)}</a></b><br />
                ${escape(item.sex)}<br />
                ${escape(item.breed)}<br />
                ${escape(item.age)}<br />
                <i>${escape(item.location)}</i><br />
            </p>
        `
    }

    return items.map(itemToHtml).join("\n")
}

const handleFirst = (emailFrom, emailRecipients, storedData, fetchedData) => {
    // don't do anything. no need to send any notifications on the first fetch.
    return Promise.resolve()
}

const handleVersionMismatch = (emailFrom, emailRecipients, storedData, fetchedData) => {
    return sendEmail(emailFrom, emailRecipients, 'CATS: maybe something changed?', "The structure of the data used to store cats from previous checks has changed. That might mean there are new cats, or that nothing changed. You'll need to check for yourself.")
}

const endPlural = (items, ending = 's') => items.length === 1 ? '' : ending

const handleVersionMatch = (emailFrom, emailRecipients, storedData, fetchedData) => {
    const newItems = findNewItems(storedData, fetchedData)

    // do nothing if nothing has changed
    if(!newItems.length) return Promise.resolve()

    return sendEmail(
        emailFrom,
        emailRecipients,
        'CATS: There are new cats!',
        `
            <p><i>Found ${newItems.length} new cat${endPlural(newItems)}</i>:<p>

            ${itemsToHtml(newItems)}
        `
    )
}

const processData = (emailFrom, emailRecipients, storedInfo, fetchedData) => {
    const storedData = storedInfo.data.data

    if(storedInfo.status === 'first') {
        handleFirst(emailFrom, emailRecipients, storedData, fetchedData)
    }
    else if(storedInfo.status === 'version-mismatch') {
        handleVersionMismatch(emailFrom, emailRecipients, storedData, fetchedData)
    }
    else if(storedInfo.status === 'version-match') {
        handleVersionMatch(emailFrom, emailRecipients, storedData, fetchedData)
    }
}

const printUsage = () => {
    console.error(`Usage: ${path.basename(process.argv[1])} path-to-saved-data url-to-check eamil-from-address email-recipients`)
    process.exit(1)
}

if(!process.argv[2] || !process.argv[3] || !process.argv[4] || !process.argv[5]) printUsage()

const savedDataPath = process.argv[2]
const checkUrl = process.argv[3]
const emailFrom = process.argv[4]
const emailRecipients = process.argv[5]

Promise.all([
    readSavedData(savedDataPath),
    readHtml(checkUrl)
        .then(loadDom)
        .then(getAnimalEls)
        .then(nodeListToArray)
        .then(map(animalElToObj(checkUrl)))
        .catch(err => {
            console.error('Something went wrong while reading the provided URL: ' + err + "\n" + err.stack)
            process.exit(2)
        }),
])
    .then(([storedInfo, fetchedData]) => {
        return saveNewData(savedDataPath, fetchedData)
            .then(() => ({storedInfo, fetchedData}))
    })
    .then(({storedInfo, fetchedData}) => {
        processData(emailFrom, emailRecipients, storedInfo, fetchedData)
    })
