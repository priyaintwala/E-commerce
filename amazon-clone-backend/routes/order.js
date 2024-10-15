const express = require('express')
const {
  placeOrder,
  getOrders,
  trackOrder
} = require('../controllers/order')
const router = express.Router()

router.post('/place', placeOrder)
router.get('/history/:userId', getOrders)
router.get('/track/:orderId', trackOrder)

module.exports = router
