const Request = require('../lib/request')
const bearychat = require('bearyincoming')
const moment = require('moment')
const MongoClient = require('mongodb').MongoClient
const { subSet, distinct } = require('../lib/utils')
const Log = require('../lib/logger')('snkrsJp')

const dbUrl = 'mongodb://localhost:27017/runoob'
const WEBHOOK_URL =
  'https://hook.bearychat.com/=bwHsk/incoming/7d14237c44091fa1ba6fb0cc65272a47'
const SNKRS_URL =
  'https://api.nike.com/product_feed/threads/v2/?anchor=0&count=10&filter=marketplace%28JP%29&filter=language%28ja%29&filter=channelId%28010794e5-35fe-4e32-aaff-cd2c74f89d61%29&filter=exclusiveAccess%28true%2Cfalse%29&fields=active&fields=id&fields=lastFetchTime&fields=productInfo&fields=publishedContent.nodes&fields=publishedContent.properties.coverCard&fields=publishedContent.properties.productCard&fields=publishedContent.properties.products&fields=publishedContent.properties.publish.collections&fields=publishedContent.properties.relatedThreads&fields=publishedContent.properties.seo&fields=publishedContent.properties.threadType&fields=publishedContent.properties.custom&fields=publishedContent.properties.title'
const headers = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3865.90 Safari/537.36'
}

class snkrsJp {
  async index() {
    let requestData = await this.fetchData()

    this.saveData(requestData, this)
  }

  async fetchData() {
    let data = {}
    try {
      data = await Request.get(SNKRS_URL, {}, headers)
    } catch (err) {
      Log.info('爬取数据错误')
      return {}
    }

    return data
  }

  saveData(data, that) {
    if (!data.objects) {
      return
    }
    let shoesData = []
    data.objects.length &&
      data.objects.forEach(item => {
        let title = item.publishedContent.properties.seo.title
        title.search('【NIKE公式】') !== -1 ? (title = title.substr(8)) : null
        item.publishedContent.properties.custom.restricted
          ? (title = `【专属】 ${title}`)
          : null

        if (item.productInfo && item.productInfo.length) {
          item.productInfo.forEach(ele => {
            let stock = ''
            ele.skus.length &&
              ele.skus.forEach(cont => {
                stock =
                  stock === '' ? cont.nikeSize : `${stock}, ${cont.nikeSize}`
              })

            const method = ele.launchView
              ? ele.launchView.method
              : ele.merchProduct.publishType

            const time = ele.launchView
              ? moment(ele.launchView.startEntryDate).format(
                  'YYYY-MM-DD HH:mm:ss'
                )
              : moment(ele.merchProduct.commerceStartDate).format(
                  'YYYY-MM-DD HH:mm:ss'
                )

            shoesData.push({
              title:
                ele.merchProduct.productType === 'APPAREL'
                  ? `【服装】 ${title}`
                  : title,
              method,
              time,
              stock,
              activity: false,
              id: ele.availability.productId,
              subtitle: ele.productContent.subtitle,
              price: ele.merchPrice.currentPrice,
              styleColor: ele.merchProduct.styleColor,
              image: ele.imageUrls.productImageUrl
            })
          })
        } else {
          shoesData.push({
            activity: true,
            id: item.publishedContent.properties.coverCard.id,
            title: `【新活动】 ${item.publishedContent.properties.coverCard
              .properties.title ||
              title ||
              '-'}`,
            subtitle:
              item.publishedContent.properties.coverCard.properties.subtitle ||
              item.publishedContent.properties.seo.description ||
              '-',
            image:
              item.publishedContent.properties.coverCard.properties.portraitURL
          })
        }
      })

    // 查询是否有该鞋款
    let whereId = shoesData.map(item => item.id)
    let insertData = []
    MongoClient.connect(
      dbUrl,
      { useNewUrlParser: true, useUnifiedTopology: true },
      function(err, db) {
        if (err) {
          Log.error('打开数据库错误', err)
        }
        var dbo = db.db('runoob')
        dbo
          .collection('snkrsJp')
          .find({ id: { $in: whereId } })
          .toArray(function(err, result) {
            if (err) {
              Log.error('查询数据库错误', err)
            }
            if (!result.length) {
              insertData = shoesData
            } else if (
              result.length &&
              whereId.length &&
              result.length !== whereId.length
            ) {
              // 取差集
              insertData = subSet(shoesData, result)
            }

            if (insertData.length) {
              // 去重
              insertData = distinct(insertData)
              insertData.length && that.sendMessage(insertData)

              insertData.length &&
                dbo
                  .collection('snkrsJp')
                  .insertMany(insertData, function(err, res) {
                    if (err) {
                      Log.error('插入数据库错误', err)
                    }
                    Log.info(`上新 | ${res.insertedCount}`, insertData)
                    db.close()
                  })
            }

            db.close()
          })
      }
    )
  }

  async sendMessage(array) {
    for await (let item of array) {
      if (item.activity) {
        bearychat
          .withText(`${item.title}`)
          .withAttachment({
            title: item.subtitle,
            text: '-',
            color: '#ffa500',
            images: [{ url: item.image }]
          })
          .pushTo(WEBHOOK_URL)
      } else {
        const content = `\n发售时间：${item.time}\n发售方式：${item.method === 'FLOW' ? 'FLOW 先到先得' : item.method === 'LEO' ? 'LEO 2分钟抽70%' : 'DAN 15分钟随机抽取'}\n价格：${item.price}\n货号：${item.styleColor}\nsize：${item.stock}`
        bearychat
          .withText(`${item.title}`)
          .withAttachment({
            title: item.subtitle,
            text: content,
            color: '#ffa500',
            images: [{ url: item.image }]
          })
          .pushTo(WEBHOOK_URL)
      }
    }
  }
}

module.exports = new snkrsJp()

setInterval(() => {
  new snkrsJp().index()
}, 4000)
