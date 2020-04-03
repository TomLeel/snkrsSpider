const Request = require('../lib/request')
const MongoClient = require('mongodb').MongoClient
const bearychat = require('bearyincoming')
const cheerio = require('cheerio')
const {
  subSetWithStock,
  subSetByArray,
  subSet,
  distinct
} = require('../lib/utils')
const Log = require('../lib/logger')('renarts')

const dbUrl = 'mongodb://localhost:27017/runoob'
const _URL = 'https://renarts.com/collections/new-arrivals-footwear'
const WEBHOOK_URL =
  ''
const query = {}
const headers = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3865.90 Safari/537.36'
}
const type = 'text'

class renarts {
  async index() {
    let requestData = await this.fetchData()
    Log.info(requestData)
    // this.saveData(requestData, this)
  }

  async fetchData() {
    let data = {}
    try {
      data = await Request.get(_URL, query, headers, type)
    } catch (err) {
      Log.info('爬取数据错误')
      return null
    }

    return data
  }

  saveData(data, that) {
    if (!data) {
      return
    }

    let shoesData = []
    let $ = cheerio.load(data)
    $('.product-grid-item').each((idx, ele) => {
      let $1 = cheerio.load(ele)
      shoesData.push({
        id: $(ele).attr('data-product-id'),
        title: $1('h3').text(),
        subtitle: $1('h4').text(),
        image: $1('.featured-img').attr('data-src'),
        price: $1('.prod-price')
          .text()
          .replace(/[ \n]/g, '')
        // stock: ,
      })
    })

    let whereId = shoesData.map(item => item.id)
    let insertData = []
    let updateData = []
    MongoClient.connect(
      dbUrl,
      { useNewUrlParser: true, useUnifiedTopology: true },
      function(err, db) {
        if (err) {
          Log.error('打开数据库错误', err)
        }
        var dbo = db.db('runoob')
        dbo
          .collection('renarts')
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
                  .collection('renarts')
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
      const content = `\n价格：$${item.price}`
      bearychat
        .withText(`${item.title}`)
        .withAttachment({
          title: item.subtitle,
          text: content,
          color: '#ffa500',
          images: [{ url: `https:${item.image}` }]
        })
        .pushTo(WEBHOOK_URL)
    }
  }
}

module.exports = new renarts()

setInterval(() => {
  new renarts().index()
}, 4000)
