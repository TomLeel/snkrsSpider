// 数组差集
function subSetWithStock(arr1, arr2) {
  let newArr = []
  for (let i = 0; i < arr1.length; i++) {
    let num = 0
    let item = {}
    for (let j = 0; j < arr2.length; j++) {
      if (arr1[i].id === arr2[j].id && arr1[i].stock !== arr2[j].stock) {
        num++
        item = arr1[i]
        item['stock2'] = arr2[j].stock
        item['stockUpdate'] = true
        break
      }
    }
    if (num !== 0) {
      newArr.push(item)
    }
  }

  return newArr
}

function subSetByArray(arr1, arr2) {
  let newArr = []
  if (arr1.length) {
    for (let i = 0; i < arr1.length; i++) {
      var num = 0
      if (arr2.length) {
        for (let j = 0; j < arr2.length; j++) {
          if (arr1[i] === arr2[j]) {
            num++
            break
          }
        }
      }

      if (num == 0) {
        newArr.push(arr1[i])
      }
    }
  }

  return newArr
}

function subSet(arr1, arr2) {
  let newArr = []
  for (let i = 0; i < arr1.length; i++) {
    var num = 0
    for (let j = 0; j < arr2.length; j++) {
      if (arr1[i].id === arr2[j].id) {
        num++
        break
      }
    }
    if (num == 0) {
      newArr.push(arr1[i])
    }
  }

  return newArr
}

// 去重
function distinct(arr) {
  let result = []
  let obj = {}

  for (let i of arr) {
    if (!obj[i.id]) {
      result.push(i)
      obj[i.id] = 1
    }
  }

  return result
}

module.exports = {
  subSet,
  subSetWithStock,
  subSetByArray,
  distinct
}
