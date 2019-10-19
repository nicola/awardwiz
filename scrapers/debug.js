/* eslint-disable no-process-env */

const index = require('./index')
const process = require('process')

const main = async () => {
  console.log('Starting')
  const result = await index.debugEntry({
    scraper: 'avios',
    params: {
      origin: 'DUB',
      destination: 'LCY',
      date: '2019-08-19',
      username: process.env.AVIOS_USERNAME || "",
      password: process.env.AVIOS_PASSWORD || "",
      originNearby: 'true',
      destinationNearby: 'true'
    }
  })
  console.log('Done')

  // @ts-ignore
  if (result.screenshot)
  // @ts-ignore
  {
    result.screenshot = '[...filtered...]'
  }
  console.log(JSON.stringify(result, null, 2))
  await index.shutdown()
}

main()
