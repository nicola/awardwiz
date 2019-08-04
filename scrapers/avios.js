/**
 * @param {import("puppeteer").Page} page
 * @param {SearchQuery} input
 */
exports.scraperMain = async (page, input) => {
    // The strategy is to go to the search URL, force the log-in and go to the
    // search URL again.
    // The website is a bit tricky, for each flight listing it has two elements:
    // an .oculto and an .choose-flight-list, both contain different info,
    // so this algorithms scans the table 3 times, ones for flight info (.oculto),
    // onces for other infos (.choose-flight-list) and once for prices,
    // this is done by clicking on every possible radio button.

    console.log('Going to search page...')
    await page.goto(`https://www.avios.com/ie/en/signin`)

    console.log('Logging in first...')
    await page.waitForSelector("#username")
    await page.type('#username', input.username)
    await page.type('#password', input.password)

    console.log('Clicking login and waiting...')
    await page.click('button')

    console.log('Done logging in, search for flights now')
    await page.waitFor(1000)
    await page.goto(`https://www.avios.com/us/en/my-avios/flight-search`, { waitUntil: 'networkidle0' })
    await page.waitFor(100)
    console.log('Reload again original page')
    // await page.type('#fly-from', input.origin)
    // await page.type('#fly-to', input.destination)
    await page.$eval('#departureLocationRef', (el, input) => el.value = input.origin, input);
    await page.$eval('#destinationLocationRef', (el, input) => el.value = input.destination, input);
    const d = input.date
    const formattedDate = `${d.substr(5, 2)}/${d.substr(8, 2)}/${d.substr(0, 4)}`
    await page.click('#one-way')
    await page.$eval('#depart', el => el.value = '');
    await page.type('#depart', formattedDate)
    // await page.type('input[name="departureDateMonthYear"]', formattedDate)
    await page.click('input[type=submit]')

    /** @param {import("puppeteer").ElementHandle<Element> | import("puppeteer").Page} parentElement
     * @param {string} selector
     * @returns {Promise<string>} */
    const innerText = async (parentElement, selector) => {
        const stopsEl = await parentElement.$(selector)
        return page.evaluate(pageEl => pageEl.innerText, stopsEl)
    }

    await page.waitForSelector("#sectionOutbound")
    // Part 1: Getting flight number
    console.log('Parsing to get flight details...')
    const flights = []
    for (const row of await page.$$('tbody tr')) {
        const invalidRaw = await page.evaluate(el => el.className.includes('even'), await row)
        if (invalidRaw) {
            continue
        }

        // skip if it has connections:
        const hasConnections = await row.$('.flt-extra > span > strong > var')

        if (hasConnections) {
            continue
        }

        /** @type {SearchResult} */
        const airLogo = await row.$('.air-logo')
        const origin = await innerText(row, '.dep a[role="tooltip"]')
        const destination = await innerText(row, '.arr a[role="tooltip"]')
        const airline = await page.evaluate(el => el.alt, airLogo)
        const flightNo = (await innerText(row, '.air span a')).split('-')[0].trim()
        const flight = {
            departureDateTime: null,
            arrivalDateTime: null,
            origin: origin,
            destination: destination,
            airline: airline,
            flightNo: flightNo,
            duration: null,
            aircraft: null, // it's possible to get, but got lazy
            costs: {
                economy: { miles: null, cash: null, isSaverFare: null },
                business: { miles: null, cash: null, isSaverFare: null },
                first: { miles: null, cash: null, isSaverFare: null }
            }
        }

        let cabinId = 0
        for (const cabin of await row.$$(".cost")) {
            const priceNotAvailable = await page.evaluate(el => el.className.includes('no-avail'), await cabin)
            if (!priceNotAvailable) {
                await cabin.click()
                await page.waitFor(500)
                const pricePane = await page.$('#sub_total_pane')
                const milesRaw = (await innerText(pricePane, '.price'))
                const miles = parseInt(
                    milesRaw
                        .replace(',', '')
                        .replace('Avios', ''),
                    10
                )
                const priceRaw = (await innerText(pricePane, '.price'))
                const price = parseFloat(
                    priceRaw.split('+')[1].trim().split(' ')[0].substr(1)
                )

                // first two are economy
                let cabinCode;
                if (cabinId < 2) {
                    cabinCode = 'economy'
                } else if (cabinId == 2) {
                    cabinCode = 'business'
                } else {
                    cabinCode = 'first'
                }

                if (!flight.costs[cabinCode].miles || flight.costs[cabinCode].miles > miles) {
                    flight.costs[cabinCode].miles = miles
                    flight.costs[cabinCode].price = price
                }
            }
            cabinId++
        }

        flights.push(flight)
    }

    return { searchResults: flights.filter(f => !f.hasStops) }
}
