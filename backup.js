const process = require("child_process")
const readline = require("readline")
const fs = require("fs")
/**@type {import("https") | import("http")} */
let networking



/******ONLY CHANGE STUFF IN THE CONFIG AREA******/
let version = "3.1.0"
let configStartDefinition = "/10*config10*/"
let configEndDefinition = "/10*config end10*/"
/******EVERYTHING BELOW CAN BE CHANGED IN THE CONFIG AREA******/
/******DO NOT CHANGE IT HERE!!******/


/** @type {Job[]} */
let jobs = []
/**
 * these will run after all jobs are done
 * @type {PostProcess[]} 
 */
let postPorcessing = []
let alwaysArgs = ""
let autoUpdate = true
let updateURL = "http://localhost:25515"
let ignoreUpdateIfServerIsDown = true

let updateOn = {
    patch: true,
    minor: true,
    major: false,
}




function setConfig() {
    /**********config**********/
    // this code here will NOT be affected during updates

    alwaysArgs = "/J /ETA /COMPRESS /MIR /R:3 /W:5"


    postPorcessing.push(new PostProcess(() => {
        console.log("post processing script that is triggered after all jobs are done, is running...")
    }))

    jobs.push(new Job(
        "src",
        "dest",
        ["ignoreDir1", "ignoreDir2"],
        ["ignoreFile1", "ignoreFile2"],
        new PostProcess(() => {
            console.log("post processing script that is triggered after this job is done, is running...")
        })
    ))

    /**********config end**********/

    if (autoUpdate) {
        if (updateURL.startsWith("https://")) {
            console.log("using https")
            networking = require("https")
        }
        else if (updateURL.startsWith("http://")) {
            console.log("using http")
            networking = require("http")
        }
    }
}
class PostProcess {
    constructor(script) {
        this.script = script
    }

    async run() {
        await this.script()
    }
}
class Job {
    /**
     * @param {string} scr
     * @param {string} [dst]
     * @param {string[]} [xcludeDirs]
     * @param {string[]} [xcludeFiles]
     * @param {PostProcess} [postPorcess]
     */
    constructor(scr, dst = "", xcludeDirs = [], xcludeFiles = [], postPorcess) {
        this.scr = scr
        this.dst = dst
        this.xcludeDirs = xcludeDirs
        this.xcludeFiles = xcludeFiles
        this.postPorcess = postPorcess
    }
}

function log(message) {
    message = message.toString("utf8")
    console.log(message)
    return message
}

async function execute(command, args) {
    let child = process.spawn(command, args)

    let stdout = ""
    let stderr = ""

    let readlines = function (input, listener) {
        readline.createInterface({
            input: input,
        }).on("line", listener)
    }

    readlines(child.stdout, function (line) {
        stdout += log(line)
    })
    readlines(child.stderr, function (line) {
        stderr += log(line)
    })

    return new Promise((resolve, reject) => {
        child.on("close", function (code) {
            if (code === 0) {
                resolve(stdout)
            } else {
                reject(stderr)
            }
        })
    })
}

async function existsRobocopy() {
    return new Promise((resolve, reject) => {
        execute("where", ["robocopy"])
            .then((stdout) => {
                resolve(true)
            })
            .catch((stderr) => {
                resolve(false)
            })
    })
}

function fixDefinition(definition) {
    // parse n* to n times *
    let regex = /(\d+)\*/g
    let match = regex.exec(definition)
    while (match != null) {
        let n = parseInt(match[1])
        let stars = ""
        for (let i = 0; i < n; i++) {
            stars += "*"
        }
        definition = definition.replace(match[0], stars)
        match = regex.exec(definition)
    }
    return definition
}

/**
 * @param {string} version
 * @returns {{major: number, minor: number, patch: number} | null}
 */
function parseVersion(version) {
    let regex = /(\d+)\.(\d+)\.(\d+)/g
    let match = regex.exec(version)
    if (match === null) {
        return null
    }
    return {
        major: parseInt(match[1]),
        minor: parseInt(match[2]),
        patch: parseInt(match[3])
    }


}

/**
 * 
 * @returns {Promise<number>} -1 if update failed, 0 if update is successful, 1 if no update is available
 */
async function update() {
    if (!autoUpdate) {
        console.log("auto update is disabled... not updating")
        return -1
    }
    if (updateURL === "") {
        console.log("update url not set... not updating")
        return -1
    }

    if (version === "") {
        console.log("version not set... not updating")
        return -1
    }
    if (networking === undefined)
        throw new Error("networking is undefined")
    let scriptName = __filename.split("\\").pop()

    let script = fs.readFileSync(__filename, "utf8")

    configStartDefinition = fixDefinition(configStartDefinition)
    configEndDefinition = fixDefinition(configEndDefinition)




    let configStart = script.indexOf(configStartDefinition)

    let configEnd = script.indexOf(configEndDefinition)

    if (configStart === -1 || configEnd === -1) {
        console.log("could not update... config not found")
        return -1
    }

    let config = script.substring(configStart, configEnd + configEndDefinition.length)

    function errorHandler(err) {
        if (ignoreUpdateIfServerIsDown) {
            console.log("ignoring update because server is down")
            return 1
        }
        console.error("could not update. the connection to the server failed")
        throw err
    }
    // first compare versions
    return new Promise((resolveV, rejectV) => {

        networking.get(updateURL + "/version", (res) => {

            let data = ""
            res.on("data", (chunk) => {
                data += chunk
            })
            res.on("end", async () => {
                let parsedData = JSON.parse(data)
                let update = false

                let latestVersion = parseVersion(parsedData.version)
                let currentVersion = parseVersion(version)
                console.log("current version: ", currentVersion)
                console.log("latest version: ", latestVersion)

                if (currentVersion === null || latestVersion === null) {
                    console.log("could not update... version not found")
                    resolveV(-1)
                    return
                }

                if (latestVersion.major > currentVersion.major) {
                    update = updateOn.major

                }
                else if (latestVersion.minor > currentVersion.minor) {
                    update = updateOn.minor
                }
                else if ((!update) && latestVersion.patch > currentVersion.patch) {
                    update = updateOn.patch
                }


                if (!update) {
                    console.log("no update available or update on that change is disabled (minor, major, patch)")
                    resolveV(1)
                    return
                }

                console.log("downloading update...")


                let newScriptData = ""
                let contentLength
                let request = networking.get(updateURL + "/update", (response) => {
                    response.on('error', (err) => {
                        resolveV(errorHandler(err))
                    })
                    response.once('data', (chunk) => {

                        // get the size of the incomming file
                        // @ts-ignore
                        contentLength = parseInt(response.headers["content-length"])
                        console.log("content length: " + contentLength)

                    })
                    response.on("data", (chunk) => {
                        newScriptData += chunk

                        // display graphical progress bar

                        let percent = Math.round((newScriptData.length / contentLength) * 100)
                        console.log("downloaded: " + percent + "%")


                    })
                    response.on("end", () => {
                        let newScriptConfigStart = newScriptData.indexOf(configStartDefinition)
                        let newScriptConfigEnd = newScriptData.indexOf(configEndDefinition)

                        if (newScriptConfigStart === -1 || newScriptConfigEnd === -1) {
                            console.log("could not update... config after update not found")
                            resolveV(-1)
                            return
                        }

                        let newScriptConfig = newScriptData.substring(newScriptConfigStart, newScriptConfigEnd + configEndDefinition.length)

                        let newScript = newScriptData.replace(newScriptConfig, config)

                        fs.writeFileSync(`${scriptName}`, newScript, "utf8")

                        resolveV(0)
                    })

                })





            }).on('error', (err) => {
                resolveV(errorHandler(err))
            })
        }).on('error', (err) => {
            resolveV(errorHandler(err))
        })
    })



}

; (async () => {

    setConfig()

    let updateStatus = await update()
    if (updateStatus === 0) {
        console.log("update successful... exiting...")
        return
    }

    let robocopyExists = await existsRobocopy()

    console.log(robocopyExists ? "robocopy exists" : "robocopy does not exist. exiting...")
    if (!robocopyExists) {
        throw new Error("robocopy does not exist")
    }

    for (let job of jobs) {
        let args = alwaysArgs.split(" ")
        args.push(job.scr)
        args.push(job.dst)
        args.push("/XD")
        args = args.concat(job.xcludeDirs)
        args.push("/XF")
        args = args.concat(job.xcludeFiles)
        try {
            await execute("robocopy", args)
            if (job.postPorcess && job.postPorcess instanceof PostProcess) {
                await job.postPorcess.run()
            }
        } catch (error) {
            console.log(error)

            if (job.postPorcess && job.postPorcess instanceof PostProcess) {
                console.log("skipped post processing script because job failed")
            }

        }
    }
    console.log("all jobs done. running post processing scripts...")
    for (let script of postPorcessing) {
        await script.run()
    }
})()
