import { v4 as uuidv4 } from 'uuid'
import {
  RabbitMqConnectionFactory,
  ConsumerFactory,
  PublisherFactory,
  Publisher,
  Consumer,
} from 'nabbitmq'
import type { RabbitMqConnection } from 'nabbitmq'

/**
 *
 * @param {string} uri
 * @returns {Promise}
 */
export const initializeConnection = (
  uri: string = 'amqp://localhost:5672',
  username: string = 'guest',
  password: string = 'guest'
) : Promise<RabbitMqConnection> => {
  const connectionFactory = new RabbitMqConnectionFactory()
  const rabbitAddress = new URL(uri)
  rabbitAddress.username = username
  rabbitAddress.password = password
  connectionFactory.setUri(rabbitAddress.toString())
  return connectionFactory.newConnection()
}

/**
 *
 * @param {string} queueName
 * @param {Connection} connection
 * @returns {Promise}
 */
export const initializeConsumer = async (
  queueName: string,
  connection?: RabbitMqConnection
) : Promise<Consumer> => {
  connection = connection ?? (await initializeConnection())
  const consumerFactory = new ConsumerFactory(connection)
  consumerFactory.setConfigs({ queue: { name: queueName } })
  return await consumerFactory.newConsumer()
}

/**
 *
 * @param {string} exchangeName
 * @param {Connection} connection
 * @returns {Promise}
 */
export const initializePublisher = async (exchangeName: string, connection?: RabbitMqConnection) : Promise<Publisher> => {
  connection = connection ?? (await initializeConnection())
  const publisherFactory = new PublisherFactory(connection)
  publisherFactory.setConfigs({
    exchange: { name: exchangeName },
  })
  return await publisherFactory.newPublisher()
}

/**
 *
 * @param {number} ms
 */
export const sleep = (ms:number): Promise<any> => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * @returns {string}
 */
export const generateRequestorId = () : string => uuidv4()

/**
 * @returns {number}
 */
export const getUnixTimestamp = () : number => {
  return Math.floor(Date.now() / 1000)
}

// export const promisify = (fn) => {
//   return (...args) => {
//     return new Promise((resolve, reject) => {
//       fn(...args, (err, res) => {
//         if (err) {
//           return reject(err)
//         }
//         return resolve(res)
//       })
//     })
//   }
// }
