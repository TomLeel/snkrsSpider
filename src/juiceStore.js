const Request = require('../lib/request')
const MongoClient = require('mongodb').MongoClient
const bearychat = require('bearyincoming')
const cheerio = require('cheerio')
const {
  subSet,
  subSetByArray,
  subSetWithStock,
  distinct
} = require('../lib/utils')
const Log = require('../lib/logger')('juiceStore')

const dbUrl = 'mongodb://localhost:27017/runoob'
const JUICE_URL = 'https://juicestore.com/collections/new-arrivals'
const WEBHOOK_URL =
  'https://hook.bearychat.com/=bwHsk/incoming/4126e386dd246432519899729e76cc36'
const query = {}
const headers = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3865.90 Safari/537.36'
}
const type = 'text'

class juiceStore {
  async index() {
    let requestData = await this.fetchData()

    this.saveData(requestData, this)
  }

  async fetchData() {
    let data = {}
    try {
      data = await Request.get(JUICE_URL, query, headers, type)
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
    $('div .grid__item--collection-template').each((idx, ele) => {
      let $1 = cheerio.load(ele)

      shoesData.push({
        id: $1('div .grid-view-item__title').text(),
        title: $1('div .grid-view-item__title').text(),
        image: $1('.grid-view-item__image-wrapper .grid-view-item__image')
          .first()
          .attr('src'),
        price: $1('.price-item--sale span').text(),
        subtitle: $1('div .price__vendor').text(),
        stock: $1('.hover')
          .contents()
          .filter(function() {
            return this.nodeType == 3
          })
          .text()
          .replace(/[ \t\n]/g, '')
          .replace(/[/]/g, ', ')
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
          .collection('juiceStore')
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

            updateData = subSetWithStock(shoesData, result)

            if (insertData.length) {
              // 去重
              insertData = distinct(insertData)

              insertData.length && that.sendMessage(insertData)

              insertData.length &&
                dbo
                  .collection('juiceStore')
                  .insertMany(insertData, function(err, res) {
                    if (err) {
                      Log.error('插入数据库错误', err)
                    }
                    Log.info(`上新 | ${res.insertedCount}`, insertData)
                  })
            }

            if (updateData.length) {
              updateData = distinct(updateData)

              updateData.length &&
                updateData.forEach(item => {
                  let whereStr = { id: item.id } // 查询条件
                  let updateStr = { $set: { stock: item.stock } }
                  dbo
                    .collection('juiceStore')
                    .updateOne(whereStr, updateStr, function(err, res) {
                      if (err) {
                        Log.error('更新数据库错误', err)
                      }
                      Log.info('库存更新', item)
                    })
                })

              updateData.forEach(item => {
                let stock = `${item['stock']}`
                let stock2 = `${item['stock2']}`
                let reStock = subSetByArray(
                  stock.split(', '),
                  stock2.split(', ')
                )
                if (reStock.length) {
                  item.stock = reStock.join(', ')
                  that.sendMessage([item])
                }
              })
            }

            db.close()
          })
      }
    )
  }

  async sendMessage(array) {
    for await (let item of array) {
      const content = `\n价格：${item.price}\n${
        item.stockUpdate ? '补货：' : '在售尺码：'
      }${item.stock}`
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

module.exports = new juiceStore()

setInterval(() => {
  new juiceStore().index()
}, 4000)
