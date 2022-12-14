const express = require('express')
const app = express()
const fs = require('fs')
const port = 25515
app.use(express.json())


let backupFile = fs.readFileSync('./backup.js', 'utf8')
if (!backupFile) throw new Error('backup.js not found')

let version = backupFile.match(/let version = "(.*)"/)?.[1]
if (!version) throw new Error('version not found')

console.log(version)


app.get('/update', function (req, res) {
    console.log('GET update')


    // req.body
    res.send(backupFile)

})


app.get('/ping', (req, res) => {
    res.send({ res: 'pong' })
})

app.get('/version', (req, res) => {
    res.send({ version: version })
})


let server = app.listen(port, function () {
    // @ts-ignore
    var host = server.address().address
    // @ts-ignore
    var port = server.address().port
    console.log("Api listening on http://%s:%s", host, port)
})