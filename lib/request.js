const superagent = require('superagent')

class Request {
  get(url, query = {}, headers = {}, type) {
    return new Promise((r, j) => {
      superagent
        .get(url)
        .query(query)
        .set(headers)
        .end((err, res) => {
          if (err) {
            j(err)
          } else {
            r((!!type ? res[type] : res.body) || null)
          }
        })
    })
  }

  post(url, query = {}, headers = {}) {
    return new Promise((r, j) => {
      superagent
        .post(url)
        .send(query)
        .set(headers)
        .end((err, res) => {
          if (err) {
            j(err)
          } else {
            r(res.body || null)
          }
        })
    })
  }
}

module.exports = new Request()
