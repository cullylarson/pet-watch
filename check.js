const fs = require('fs')
const url = require('url')
const urlJoin = require('url-join')
const path = require('path')
const fetch = require('node-fetch')
const sendmail = require('sendmail')({silent: true})
const escape = require('escape-html')
const Twilio = require('twilio')
const {JSDOM} = require('jsdom')
const {curry, map} = require('@cullylarson/f')

const storedDataVersion = 1 // increment if the structure of stored data changes

const loadDom = html => new JSDOM(html)

const getAnimalEls = dom => dom.window.document.querySelectorAll('.list-item')

const getElPhotoUrl = el => {
    return el
        ? protocolizeUrl(el.src)
        : null
}

const protocolizeUrl = (url, protocol = 'https:') => {
    return url.indexOf('//') === 0
        ? protocol + url
        : url
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
            // if it starts with a /, then we just need the hostname, otherwise the folder name
            profileUrl.indexOf('/') === 0 ? '' : path.dirname(u.pathname) || '',
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
        .then(content => content ? JSON.parse(content) : {})
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

const sendEmail = (contact, subject, message) => {
    if(!contact.emailFrom || !contact.emailTo) return Promise.resolve()

    return new Promise((resolve, reject) => {
        sendmail({
            from: contact.emailFrom,
            to: contact.emailTo,
            subject,
            html: buildEmailHtml(message),
        }, (err, reply) => {
            if(err) reject(err)
            else resolve(reply)
        })
    })
}

const sendSms = (contact, message) => {
    if(!contact.accountSid || !contact.authToken || !contact.smsFrom || !contact.smsTo) return Promise.resolve()

    const client = Twilio(contact.accountSid, contact.authToken)

    const recipients = contact.smsTo.split(',').map(x => x.trim())

    return Promise.all(recipients.map(to => {
        return client.messages.create({body: message, from: contact.smsFrom, to})
    }))
}

const sendText = (contact, message) => {
    if(!contact.emailFrom || !contact.emailTo) return Promise.resolve()
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
                <a href='${item.profileUrl}'><img src='${item.photoUrl}' /></a><br />
                <b><a href='${item.profileUrl}'>${escape(item.name)}</a></b><br />
                ${escape(item.sex)}<br />
                ${escape(item.breed)}<br />
                ${escape(item.age)}<br />
                <i>${escape(item.location)}</i><br />
            </p>
            <p>&nbsp;</p>
        `
    }

    return items.map(itemToHtml).join("\n")
}

const handleFirst = (contact, checkUrl, storedData, fetchedData) => {
    // don't do anything. no need to send any notifications on the first fetch.
    return Promise.resolve()
}

const handleVersionMismatch = (contact, checkUrl, storedData, fetchedData) => {
    return Promise.all([
        sendEmail(contact, 'CATS: maybe something changed?', "The structure of the data used to store cats from previous checks has changed. That might mean there are new cats, or that nothing changed. You'll need to check for yourself."),
        sendSms(contact, `
There might be new cats, but I tell for sure.

${checkUrl}
`),
    ])
}

const endPlural = (items, ending = 's') => items.length === 1 ? '' : ending

const itemsToEmailMessage = items => {
    return `
        <p><i>Found ${items.length} new cat${endPlural(items)}</i>:<p>

        ${itemsToHtml(items)}
    `
}

const itemsToSmsMessage = (listAllUrl, items) => {
    const renderOneItem = item => `${item.name} -- ${item.sex}, ${item.age}`

    return `
${items.length} new cat${endPlural(items)}:

${items.map(renderOneItem).join("\n\n")}

${listAllUrl}
`
}

const handleVersionMatch = (contact, checkUrl, storedData, fetchedData) => {
    const newItems = findNewItems(storedData, fetchedData)

    // do nothing if nothing has changed
    if(!newItems.length) return Promise.resolve()

    return Promise.all([
        sendEmail(
            contact,
            'CATS: There are new cats!',
            itemsToEmailMessage(newItems)
        ),
        sendSms(
            contact,
            itemsToSmsMessage(checkUrl, newItems)
        )
    ])
}

const processData = (contact, checkUrl, storedInfo, fetchedData) => {
    const storedData = storedInfo.data.data

    if(storedInfo.status === 'first') {
        handleFirst(contact, checkUrl, storedData, fetchedData)
    }
    else if(storedInfo.status === 'version-mismatch') {
        handleVersionMismatch(contact, checkUrl, storedData, fetchedData)
    }
    else if(storedInfo.status === 'version-match') {
        handleVersionMatch(contact, checkUrl, storedData, fetchedData)
    }
}

const loadTwilio = filePath => {
    if(!filePath) return Promise.resolve({})

    return fs.promises.readFile(filePath, {encoding: 'utf-8'})
        .then(x => JSON.parse(x))
        .catch(err => {
            console.error('Something went wrong while reading your Twilio file: ' + err + "\n" + err.stack)
            process.exit(5)
        })
}

const argv = require('yargs')
    .usage('Usage: $0 [options]')
    .demandOption(['savedDataPath', 'url'])
    .help('h')
    .describe('savedDataPath', 'Path to the file where this app should save data.')
    .describe('url', 'The url to the pets list.')
    .describe('emailFrom', 'Send notification emails from this address.')
    .describe('emailTo', 'Send notification emails to this address (or multiple, comma-separated).')
    .describe('twilio', 'The path to a file that contains Twilio credentials, if you want to send SMS text notifications.')
    .describe('smsFrom', 'The phone number to send SMS messages from. Listed in your Twilio account.')
    .describe('smsTo', 'Send SMS notifications to this phone number (or multiple, comma-separated).')
    .argv

const savedDataPath = argv.savedDataPath
const checkUrl = argv.url

Promise.all([
    loadTwilio(argv.twilio),
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
    .then(([twilioInfo, storedInfo, fetchedData]) => {
        return saveNewData(savedDataPath, fetchedData)
            .then(() => ({twilioInfo, storedInfo, fetchedData}))
    })
    .then(({twilioInfo, storedInfo, fetchedData}) => {
        const contact = {
            emailFrom: argv.emailFrom,
            emailTo: argv.emailTo,
            smsFrom: argv.smsFrom,
            smsTo: argv.smsTo,
            ...twilioInfo,
        }

        processData(contact, checkUrl, storedInfo, fetchedData)
    })
