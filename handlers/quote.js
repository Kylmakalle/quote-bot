const {
  loadCanvasImage,
  generateQuote
} = require('../utils')
const {
  tdlib
} = require('../helpers')
const { createCanvas } = require('canvas')
const sharp = require('sharp')

module.exports = async (ctx) => {
  const maxQuoteMessage = 10
  let messageCount = 1
  if (ctx.match && ctx.match[1] === '/qd') {
    messageCount = 2
    if (ctx.match[2] > 0) messageCount = ctx.match[2]
    if (ctx.match[4] > 0) messageCount = ctx.match[4]
  }

  let quoteMessage = ctx.message.reply_to_message
  if (!quoteMessage && ctx.chat.type === 'private') {
    quoteMessage = ctx.message
    messageCount = maxQuoteMessage
  }

  if (messageCount > maxQuoteMessage) messageCount = maxQuoteMessage

  if (quoteMessage) {
    const quoteMessages = []
    const quoteImages = []

    const startMessage = quoteMessage.message_id

    for (let index = 0; index < messageCount; index++) {
      if (index > 0) {
        try {
          const getMessages = await tdlib.getMessages(ctx.message.chat.id, [startMessage + index]).catch(() => {})
          if (getMessages.length > 0) {
            quoteMessages[index] = getMessages[0]
          } else {
            let chatForward = ctx.message.chat.id
            if (process.env.GROUP_ID) chatForward = process.env.GROUP_ID
            quoteMessages[index] = await ctx.telegram.forwardMessage(chatForward, ctx.message.chat.id, startMessage + index)
            if (!process.env.GROUP_ID) ctx.telegram.deleteMessage(ctx.message.chat.id, quoteMessages[index].message_id)
          }
          if (quoteMessages[index]) quoteMessage = quoteMessages[index]
        } catch (error) {
          quoteMessage = null
        }
      } else {
        quoteMessages[index] = quoteMessage
      }

      if (quoteMessage && (quoteMessage.text || quoteMessage.caption)) {
        let text, entities

        if (quoteMessage.caption) {
          text = quoteMessage.caption
          entities = quoteMessage.caption_entities
        } else {
          text = quoteMessage.text
          entities = quoteMessage.entities
        }

        let messageFrom = quoteMessage.from

        if (quoteMessage.forward_from) messageFrom = quoteMessage.forward_from

        if (quoteMessage.forward_sender_name) {
          messageFrom = {
            id: 0,
            name: quoteMessage.forward_sender_name,
            username: 'HiddenSender'
          }
        } else if (quoteMessage.forward_from_chat) {
          messageFrom = {
            id: quoteMessage.forward_from_chat.id,
            name: quoteMessage.forward_from_chat.title,
            username: quoteMessage.forward_from_chat.username || null
          }
        }

        if (messageFrom.first_name) messageFrom.name = messageFrom.first_name
        if (messageFrom.last_name) messageFrom.name += ' ' + messageFrom.last_name

        quoteMessages[index].from = messageFrom

        // ser background color
        let backgroundColor = '#130f1c'

        if (ctx.session.userInfo.settings.quote.backgroundColor) backgroundColor = ctx.session.userInfo.settings.quote.backgroundColor
        if (ctx.group && ctx.group.info.settings.quote.backgroundColor) backgroundColor = ctx.group.info.settings.quote.backgroundColor

        let colorName
        if (ctx.match && (ctx.match[1] !== '/qd' || ctx.match[2])) colorName = ctx.match[4]

        if ((ctx.match && colorName === 'random') || backgroundColor === 'random') backgroundColor = `#${(Math.floor(Math.random() * 16777216)).toString(16)}`
        else if (ctx.match && ctx.match[3] === '#' && colorName) backgroundColor = `#${colorName}`
        else if (ctx.match && colorName) backgroundColor = `${colorName}`

        let diffUser = true
        if (quoteMessages[index - 1] && (quoteMessages[index].from.name === quoteMessages[index - 1].from.name)) diffUser = false

        let name
        let avatarImage
        if (diffUser) {
          name = quoteMessages[index].from.name
          try {
            let userPhotoUrl = './assets/404.png'

            const getChat = await ctx.telegram.getChat(messageFrom.id)
            const userPhoto = getChat.photo.small_file_id

            if (userPhoto) userPhotoUrl = await ctx.telegram.getFileLink(userPhoto)
            else if (messageFrom.username) userPhotoUrl = `https://telega.one/i/userpic/320/${messageFrom.username}.jpg`

            avatarImage = await loadCanvasImage(userPhotoUrl)
          } catch (error) {
            avatarImage = await loadCanvasImage('./assets/404.png')
          }
        }

        const canvasQuote = await generateQuote(avatarImage, backgroundColor, messageFrom.id, name, text, entities)

        quoteImages.push(canvasQuote)
      }
    }

    if (quoteImages.length > 0) {
      let canvasQuote

      if (quoteImages.length > 1) {
        let width = 0
        let height = 0

        for (let index = 0; index < quoteImages.length; index++) {
          if (quoteImages[index].width > width) width = quoteImages[index].width
          height += quoteImages[index].height
        }

        const quoteMargin = 5

        const canvas = createCanvas(width, height + (quoteMargin * quoteImages.length))
        const canvasCtx = canvas.getContext('2d')

        let imageY = 0

        for (let index = 0; index < quoteImages.length; index++) {
          canvasCtx.drawImage(quoteImages[index], 0, imageY)
          imageY += quoteImages[index].height + quoteMargin
        }
        canvasQuote = canvas
      } else {
        canvasQuote = quoteImages[0]
      }

      const downPadding = 75
      const maxWidth = 512
      const maxHeight = 512

      const imageQuoteSharp = sharp(canvasQuote.toBuffer())

      if (canvasQuote.height > canvasQuote.width) imageQuoteSharp.resize({ height: maxHeight })
      else imageQuoteSharp.resize({ width: maxWidth })

      const canvasImage = await loadCanvasImage(await imageQuoteSharp.toBuffer())

      const canvasPadding = createCanvas(canvasImage.width, canvasImage.height + downPadding)
      const canvasPaddingCtx = canvasPadding.getContext('2d')

      canvasPaddingCtx.drawImage(canvasImage, 0, 0)

      const quoteImage = await sharp(canvasPadding.toBuffer()).webp({ lossless: true, force: true }).toBuffer()

      ctx.replyWithDocument({
        source: quoteImage,
        filename: 'sticker.webp'
      }, {
        reply_to_message_id: ctx.message.message_id
      })
    } else {
      ctx.replyWithHTML(ctx.i18n.t('quote.empty_forward'), {
        reply_to_message_id: ctx.message.message_id
      })
    }
  } else {
    ctx.replyWithHTML(ctx.i18n.t('quote.empty_forward'), {
      reply_to_message_id: ctx.message.message_id
    })
  }
}
