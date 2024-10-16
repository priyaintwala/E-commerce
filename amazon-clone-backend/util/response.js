module.exports.successResponse = (msg, data) => {
  return {
    status: true,
    msg,
    data
  }
}

module.exports.errorResponse = (msg, err) => {
  return {
    status: false,
    msg,
    err
  }
}
