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
const Log = require('../lib/logger')('kith')

const dbUrl = 'mongodb://localhost:27017/runoob'
const KITH_MEN_URL = 'https://kith.com/collections/mens-footwear'
const KITH_WOMEN_URL = 'https://kith.com/collections/womens-footwear'
const WEBHOOK_URL =
  'https://hook.bearychat.com/=bwHsk/incoming/0b3971fbc85ebed610d565afba2421b6'
const query = {}
const headers = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3865.90 Safari/537.36'
}
const type = 'text'

class kith {
  async index() {
    let menData = await this.fetchData(KITH_MEN_URL)
    this.filterData(menData)

    let womenData = await this.fetchData(KITH_WOMEN_URL)
    this.filterData(womenData)
  }

  async fetchData(url) {
    let data = {}
    try {
      data = await Request.get(url, query, headers, type)
    } catch (err) {
      Log.info('爬取数据错误')
      return null
    }

    return data
  }

  filterData(data) {
    if (!data) {
      return
    }

    let shoesData = []
    let $ = cheerio.load(data)
    $('.collection-product').each((idx, ele) => {
      let $1 = cheerio.load(ele)
      const stock = []
      const image = $1('.product-card__image-slide')
        .attr('style')
        .match(/\(([^)]*)\)/)
      $1('.product-card__variants li')
        .children()
        .each((idx, item) => stock.push($1(item).text()))
      shoesData.push({
        stock: stock.join(', '),
        id: `https:${image[1]}`,
        title: $1('.product-card__title').text(),
        subtitle: $1('.product-card__color').text(),
        image: `https:${image[1]}`,
        price: $1('.product-card__price')
          .text()
          .replace(/[ \t\n]/g, '')
      })
    })

    this.saveData(shoesData, this)
  }

  saveData(shoesData, that) {
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
          .collection('kith')
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
                  .collection('kith')
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
                    .collection('kith')
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
          images: [{ url: item.image }]
        })
        .pushTo(WEBHOOK_URL)
    }
  }
}

module.exports = new kith()

setInterval(() => {
  new kith().index()
}, 4000)
