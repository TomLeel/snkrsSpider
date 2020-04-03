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
const Log = require('../lib/logger')('YEEZY')

const dbUrl = 'mongodb://localhost:27017/runoob'
const YEEZY_URL = 'https://yeezysupply.com'
const WEBHOOK_URL =
  'https://hook.bearychat.com/=bwHsk/incoming/981df263b8b35cc90929c1d27c4a9744'
const query = {}
const headers = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3865.90 Safari/537.36'
}
const type = 'text'

class yeezysupply {
  async index() {
    let requestData = await this.fetchData()

    this.saveData(requestData, this)
  }

  async fetchData() {
    let data = {}
    try {
      data = await Request.get(YEEZY_URL, query, headers, type)
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
    $('.MC__inner_for_side_by_side .js-product-json').each((idx, ele) => {
      const dataSource = JSON.parse($(ele).html())
      const price = dataSource.price.toString()
      const stock = []
      let saleDate = ''
      dataSource.variants.forEach(item => {
        if (item.available) stock.push(item.option1)
      })
      if (!stock.length && dataSource.type === 'PLACEHOLDER') {
        $('.MC__inner_for_side_by_side .PI__desc').each((index, ele) => {
          if (index === idx) {
            const description = $(ele).html()
            const i = description.lastIndexOf('>')
            saleDate = description.substring(i + 1, description.length)
          }
        })
      }
      shoesData.push({
        saleDate,
        id: dataSource.id,
        title: dataSource.title,
        subtitle: dataSource.handle,
        image: dataSource.featured_image,
        price: price.substring(0, price.length - 2),
        stock: stock.join(', ')
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
          .collection('yeezysupply')
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
                  .collection('yeezysupply')
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
                    .collection('yeezysupply')
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
      const content = item.stock
        ? `\n价格：$${item.price}\n${
            item.stockUpdate ? '补货：' : '在售尺码：'
          }${item.stock}`
        : `\n价格：$${item.price}\n发售日期：${item.saleDate}`
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

module.exports = new yeezysupply()

setInterval(() => {
  new yeezysupply().index()
}, 5000)
