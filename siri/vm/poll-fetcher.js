import fetch from 'node-fetch'
import jp from 'jsonpath'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'

const requestorId = uuidv4()

const getUnixTimestamp = () => {
  return Math.floor(Date.now()/1000)
}


const sleep = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  })
} 

const run = async () => {
  console.log('fetching SIRI. ctrl-c to quit.')
  while (true) {
    const response = await fetch('https://api.entur.io/realtime/v1/rest/vm?datasetId=RUT&requestorId=${requestorId}', {
      headers: {
        'Accept': 'application/json'
      }
    })
    const ts = getUnixTimestamp()
    console.log(`Writing result to data/${ts}.json, and sleeping 15sec before fetching again.`)
    const file = fs.createWriteStream(`data/${ts}.json`)

    await new Promise((resolve, reject) => {
        const dest = fs.createWriteStream(`data/${ts}.json`)
        response.body.pipe(dest)
        response.body.on('end', () => resolve("written"))
        dest.on("error", reject)
      })

    await sleep(15010)
  }
}

run()

