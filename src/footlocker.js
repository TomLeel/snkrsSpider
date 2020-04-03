const superagent = require('superagent')
const Request = require('../lib/request')
const MongoClient = require('mongodb').MongoClient
const bearychat = require('bearyincoming')
const { subSetWithStock, distinct } = require('../lib/utils')
const Log = require('../lib/logger')('footlocker')

const dbUrl = 'mongodb://localhost:27017/runoob'
const MEN_URL =
  'https://www.footlocker.com/api/products/search?query=%3Arelevance%3Abrand%3AJordan%3Agender%3AMen%27s%3Aproducttype%3AShoes&currentPage=&pageSize=48&timestamp=4'
const WOMEN_URL =
  'https://www.footlocker.com/api/products/search?query=%3Arelevance%3Agender%3AWomen%27s%3Abrand%3AJordan%3Aproducttype%3AShoes&currentPage=&pageSize=48&timestamp=4'
const WEBHOOK_URL =
  'https://hook.bearychat.com/=bwHsk/incoming/0b3971fbc85ebed610d565afba2421b6'
const query = {}
const headers = {
  'User-Agent': 'PostmanRuntime/7.18.0'
}

class footlocker {
  async index() {
    const menData = await this.fetchData(MEN_URL)
    let men_products = this.filterData(menData)
    men_products = this.getStock(men_products)

    // const womenData = await this.fetchData(WOMEN_URL)
    // let women_products = this.filterData(womenData)
    // women_products.length &&
    //   women_products.forEach(item => {
    //     this.fetchStockData(item).then(res => (item['stock'] = res))
    //   })
    Log.info(men_products)
  }

  async fetchData(url) {
    let data = {}
    try {
      data = await Request.get(url, query, headers)
    } catch (err) {
      Log.info('爬取数据错误')
      return null
    }

    return data
  }

  getStock(dataSource) {
    if (!dataSource.length) {
      return dataSource
    }
    let currentIndex = 0
    let result = []

    function fetchStockData() {
      if (currentIndex >= dataSource.length) {
        return
      }
      let item = dataSource[currentIndex]
     
      superagent
        .get(`https://www.footlocker.com/api/products/pdp/${item.id}`)
        .query({
          timestamp: new Date().getTime()
        })
        .set(headers)
        .end((err, res) => {
          if (err) {
            Log.info(`爬取${item.subtitle}鞋码数据错误`)
            currentIndex++
            fetchStockData()
          } else {
            const { sellableUnits = [] } = res
            let sizeData = []
            sellableUnits.length &&
              sellableUnits.forEach(ele => {
                ele.stockLevelStatus === 'inStock' &&
                  ele.attributes[1].value === item.subtitle &&
                  sizeData.push(ele.attributes[0].value)
              })
            item['stock'] = sizeData.join(', ')
            result.push(item)
            currentIndex++
            fetchStockData()
          }
        })
    }
    fetchStockData()
    return result
  }

  filterData(data) {
    if (!data) {
      return []
    }

    let shoesData = []
    data.products.length &&
      data.products.forEach(item => {
        shoesData.push({
          id: item.url,
          title: item.name,
          subtitle: item.baseOptions[0].selected.style,
          image: item.images[0].url,
          price: item.price.formattedValue
        })
      })

    return shoesData
  }

  saveData(shoesData, that) {
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
          .collection('footlocker')
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

              // insertData.length && that.sendMessage(insertData)

              insertData.length &&
                dbo
                  .collection('footlocker')
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
      const content = `\n价格：${item.price}\n在售尺码：${item.stock}`
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

module.exports = new footlocker()
new footlocker().index()
// setInterval(() => {
//   new footlocker().index()
// }, 5000)
