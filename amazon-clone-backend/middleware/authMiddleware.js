const JWT = require('jsonwebtoken')
const { JWT_SECRET } = process.env
const userModel = require('../models/user')
const db = require('../models/index')
const { errorResponse } = require('../util/response')

// Protected  routes
exports.requireSignIn = async (req, res, next) => {
  console.log(req.headers.authorization)
  try {
    const decode = JWT.verify(
      req.headers.authorization,
      JWT_SECRET
    )
    req.user = decode
    next()
  } catch (error) {
    return res.status(401).send(errorResponse('You need to be logged in to add products to your cart.', ''))
  }
}

// admin access
exports.isAdmin = async (req, res, next) => {
  try {
    const user = await userModel(db.sequelize, db.Sequelize.DataTypes).findByPk(req.user.id)

    if (user.role !== 'ADMIN') {
      return res.status(401).send({
        success: false,
        message: 'Unauthorized Access'
      })
    } else {
      next()
    }
  } catch (error) {
    console.log(error)
    res.status(401).send({
      success: false,
      error,
      message: 'Error in Admin middleware '
    })
  }
}
