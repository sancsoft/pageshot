const CDP = require('chrome-remote-interface')
const delay = require('delay')
const resizeImg = require('resize-img')

async function capture ({ client, viewportHeight, viewportWidth, full, delayTime }) {
  const { Page, Network, Emulation } = client

  await Emulation.setVisibleSize({width: viewportWidth, height: viewportHeight})
  await Network.enable()
  await Page.enable()
  await Page.loadEventFired()
  await delay(delayTime)

  // full page shot
  if (full) {
    const { contentSize } = await Page.getLayoutMetrics()
    const { width, height } = contentSize
    await Emulation.setVisibleSize({width, height})
  }

  const { data } = await Page.captureScreenshot();

  var buf = await resizeImg(Buffer.from(data, 'base64'), { width:640, height: 400 }).then( buf => {
    return buf;
  });

  return buf;
  
}

module.exports = function ({ chromePort = 9222, path = '/shot' }) {
  return async function middleware (ctx, next) {
    if (ctx.path !== path || !ctx.query.url) return await next()

    const { response } = ctx

    try {
      const { url, height, width, full, delay } = ctx.query
      const viewportWidth = parseInt(width, 10) || 1280
      const viewportHeight = parseInt(height, 10) || 800
      const delayTime = parseInt(delay,10) || 0

      // https://github.com/cyrus-and/chrome-remote-interface/issues/127#issuecomment-301421924
      const tab = await CDP.New({port: chromePort, url})
      const client = await CDP({tab})

      await capture({client, viewportHeight, viewportWidth, full, delayTime}).then( image => {
        response.type = 'image/png'
        response.body = image
      }).catch(e => {
        response.code = 400
        response.body = { error: e }
        console.error('ERR CAPTURE:', response.body.error)
      })
      await CDP.Close({id: tab.id})
    } catch (e) {
      response.code = 500
      response.body = { error: e.stack || e }
      console.error('ERR MIDDLEWARE:', response.body.error)
    }
  }
}
