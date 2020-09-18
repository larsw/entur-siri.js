import fetch, { Response } from 'node-fetch'
import fs from 'fs'
import { program } from 'commander'
import {
  sleep,
  generateRequestorId,
  getUnixTimestamp,
  initializePublisher,
  initializeConnection } from '../../common'
import { Publisher } from 'nabbitmq'

const programVersion = require('../../../package.json').version
program.version(programVersion)
program
  .option(
    '-i, --interval <interval>',
    'interval in seconds between poll against entur\'s SIRI VM endpoint',
    (value:string, _: number):number => parseInt(value),
    15
  )
  .option(
    '-u, --user-agent <userAgent>', 
    'User-Agent header value',
    `entur-siri.js/${programVersion}`
    )
  .option(
    '-r, --requestorId <requestorId>',
    'requestorId to use - if not supplied, one will be generated.'
  )

type PersistToFileOpts = {
  directory: string
}

const persistToFile = (opts: PersistToFileOpts) => async (response:Response) : Promise<void> => {
  const ts = getUnixTimestamp()
  console.log(
    `Writing result to ${opts.directory}/${ts}.json`
  )
  await new Promise((resolve, reject) => {
    const dest = fs.createWriteStream(`${opts.directory}/${ts}.json`)
    response.body.pipe(dest)
    response.body.on('end', () => resolve('written'))
    dest.on('error', reject)
  })
}

const persistToRabbitMQ = (publisher:Publisher) => async (response:Response): Promise<void> => {
  const ts = getUnixTimestamp()
  const buffer = Buffer.from(await response.arrayBuffer())
  await publisher.publishMessage(buffer)
  console.log(`[${new Date(ts * 1000).toLocaleString()}] SIRI VM message sent to exchange.`)
}

interface PersistFunction {
  (response: Response): Promise<void>
} 

const fetchSiriVM = async (persistResponseFn:PersistFunction) => {
  console.log('fetching SIRI. ctrl-c to quit.')
  const requestorId = program.requestorId ?? generateRequestorId()
  const datasetId = program.datasetId ?? 'RUT'
  while (true) {
    try {
      const response = await fetch(
        `https://api.entur.io/realtime/v1/rest/vm?datasetId=${datasetId}&requestorId=${requestorId}`,
        {
          headers: {
            Accept: 'application/json',
            'User-Agent': program.useragent
          },
        }
      )
      await persistResponseFn(response)
      await sleep(program.interval * 1000)
    } catch (err) {
      console.error(err)
    }
  }
}

type FilePersisterOpts = {

}

type RabbitMQPersisterOpts = {
  uri: string,
  user: string,
  password: string
}

program
  .command('file <directory>')
  .description('stores SIRI VM responses to JSON files')
  .action((directory:string, opts:FilePersisterOpts) => fetchSiriVM(persistToFile({...opts, directory})))

program
  .command('rabbitmq <exchange>')
  .description('forwards SIRI VM responses to a RabbitMQ exchange')
  .option('-a, --address', 'RabbitMQ address (URI style)', 'amqp://localhost:5672/')
  .option('-u, --user', 'RabbitMQ user', 'guest')
  .option('-p, --password', 'RabbitMQ password', 'guest')
  .action(async (exchange: string, opts: RabbitMQPersisterOpts) => 
    fetchSiriVM(
      persistToRabbitMQ(
        await initializePublisher(exchange,
          await initializeConnection(opts.uri, opts.user, opts.password)))))

program.parseAsync(process.argv)
