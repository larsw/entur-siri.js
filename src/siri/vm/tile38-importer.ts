import fs from 'fs'
import path from 'path'
import jp from 'jsonpath'
import { GeoJSON, SetOptions, Tile38 } from 'tile38'
import { program } from 'commander'
const {
  sleep,
  promisify,
  initializeConsumer,
  initializeConnection,
} = require('../../common')
import {
  RabbitMqConnectionClosedError,
  RabbitMqChannelClosedError,
  RabbitMqChannelCancelledError,
} from 'nabbitmq'

program.version('0.1.0')

program.option(
  '-i, --interval <interval>',
  'Interval between processing files in MS',
  (value, _) => parseInt(value),
  5000
)

program.option('-D, --debug', 'Verbose debug information', false)
program.option('-H --host <host>', 'Tile 38 host', 'localhost')
program.option('-k, --key <key>', 'Tile 38 key', 'tracks')
program.option(
  '-v, --verbose',
  'Whether or not to include full Monitored Vehicle Journey structure in inserted GeoJSON object',
  false
)
program.option(
  '-p, --port <port>',
  'Tile 38 port',
  (value,_) => parseInt(value),
  9851
)

const activityToGeoJSON = (activity: VehicleActivity, verbose: boolean): [string, object] => {
  const journey = activity.MonitoredVehicleJourney
  const id = journey.FramedVehicleJourneyRef.DatedVehicleJourneyRef
  let obj:GeoJSON = {
    type: 'Point',
    coordinates: [
      journey.VehicleLocation.Longitude,
      journey.VehicleLocation.Latitude,
    ],
  }
  if (verbose) {
    obj.properties = journey
  }
  return [id, obj]
}

const importVehicleActivity = (tile38: Tile38) => (activity: VehicleActivity) => {
  return new Promise(async (resolve, reject) => {
    try {
      const [id, geojson] = activityToGeoJSON(activity, program.verbose)
      let opts:SetOptions = {}
      if (program.expire) {
        opts.expire = true
      }
      await tile38.set(program.key, id, geojson, opts)
      resolve()
    } catch (error) {
      reject(error)
    }
  })
}

const importVehicleActivities = (tile38: Tile38) => (activities: VehicleActivity[]) => {
  return new Promise(async (resolve, reject) => {
    try {
      for (const activity of activities) {
        await importVehicleActivity(tile38)(activity)
      }
      resolve()
    } catch (error) {
      reject(error)
    }
  })
}

const initializeTile38Client = () => {
  const opts = {
    host: program.host,
    port: program.port,
    debug: program.debug,
  }
  return new Tile38(opts)
}

const readdirP = promisify(fs.readdir)
const readFileP = promisify(fs.readFile)

type FileShovelOpts = {}

type DatedVehicleJourneyRef = string
type FramedVehicleJourneyRef = {
  DatedVehicleJourneyRef: DatedVehicleJourneyRef
}

type VehicleLocation = {
  Latitude: number,
  Longitude: number
}
type MonitoredVehicleJourney = {
  FramedVehicleJourneyRef: FramedVehicleJourneyRef
  VehicleLocation: VehicleLocation
}
type VehicleActivity = {
  MonitoredVehicleJourney: MonitoredVehicleJourney 
}

const shovelFromFile = async (directory: string, opts: FileShovelOpts) => {
  const tile38 = initializeTile38Client()
  const fileNames = await readdirP(directory)
  console.log(`Ready to import ${fileNames.length} files...`)
  const importer = importVehicleActivities(tile38)

  for (const fileName of fileNames) {
    const dateTime = fileNameToDateTime(fileName)
    const json = await readFileP(path.join(program.directory, fileName))
    const obj = JSON.parse(json)
    const vehicleActivities = jp.query(obj, '$..VehicleActivity[*]') as VehicleActivity[]
    console.log(`[${dateTime}] Processing ${vehicleActivities.length} entries`)
    await importer(vehicleActivities)
    await sleep(program.interval)
  }
}

type RabbitMQShovelOpts = {
  address: string
  username: string
  password: string
}

const shovelFromRabbitMQ = async (queue: string, opts: RabbitMQShovelOpts) => {
  const tile38 = initializeTile38Client()
  const connection = await initializeConnection(
    opts.address,
    opts.username,
    opts.password
  )
  const importer = importVehicleActivities(tile38)
  const consumer = await initializeConsumer(queue, connection)
  await consumer.startConsuming().subscribe({
    next: async (msg: string) => {
      const vehicleActivities = jp.query(msg, '$..VehicleActivity[*]') as VehicleActivity[]
      //console.log(`[${dateTime}] Processing ${vehicleActivities.length} entries`)
      await importer(vehicleActivities)
      consumer.commitMessage(msg)
      await sleep(program.interval)
    },
    error: (error: Error) => {
      if (error instanceof RabbitMqConnectionClosedError)
        return void console.error('Connection was closed')

      if (error instanceof RabbitMqChannelClosedError)
        return void console.error('Channel was closed by the server')

      if (error instanceof RabbitMqChannelCancelledError)
        return void console.error('Channel cancellation occurred')
    },
  })
}

program
  .command('file <directory>')
  .description('imports SIRI VM messages from JSON files')
  .action(async (directory, opts) => shovelFromFile(directory, opts))

program
  .command('rabbitmq <queue>')
  .description('imports SIRI VM messages from RabbitMQ')
  .option('-a, --address', '', 'amqp://localhost:9672/')
  .option('-u, --user', '', 'guest')
  .option('-p, --password', '', 'guest')
  .action((queue, opts) => shovelFromRabbitMQ(queue, opts))

program.parseAsync(process.argv)

const fileNameToDateTime = (fileName: string) => {
  const ts = parseInt(fileName.substring(0, fileName.length - 4))
  return new Date(ts * 1000).toLocaleString()
}

// ;(async (promisify) => {
//   const readdirP = promisify(fs.readdir)
//   const readFileP = promisify(fs.readFile)

//   const fileNames = await readdirP(program.directory)
//   console.log(`Ready to import ${fileNames.length} files...`)

//   for (const fileName of fileNames) {
//     const dateTime = fileNameToDateTime(fileName)
//     const json = await readFileP(path.join(program.directory, fileName))
//     const obj = JSON.parse(json)
//     const vehicleActivities = jp.query(obj, '$..VehicleActivity[*]') as VehicleActivity[]
//     console.log(`[${dateTime}] Processing ${vehicleActivities.length} entries`)
//     await importVehicleActivities(vehicleActivities)
//     await sleep(program.interval)
//   }
// })(promisify)
