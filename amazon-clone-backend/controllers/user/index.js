require('dotenv').config()
const JWT = require('jsonwebtoken')
const path = require('path')
const { validationResult } = require('express-validator')
const User = require('../../models/user.js')
const db = require('../../models/index.js')
const {
  comparePwd,
  hashPassword,
  sendVerificationEmail
} = require('../../helpers/authHelper.js')
const { TOKEN_EXPIRY_DURATION, JWT_SECRET } = process.env
const Adminlog = require('../../models/adminAuditLog.js')
const { errorResponse, successResponse } = require('../../util/response.js')
const {sendEmailNotification} = require('../../util/email.js')

// RegisterController

exports.registerController = async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body
    // Check for validation errors
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      // return res.status(400).send({ errors: errors.array() })
      return res.status(400).send(errorResponse(errors.array()[0].msg, ''))
    }
    const verificationToken = JWT.sign({ email }, JWT_SECRET, {
      expiresIn: TOKEN_EXPIRY_DURATION
    })

    // Check if a file was uploaded
    // const profilePicture = req.file
    //   ? path.join(__dirname, '../public/uploads/', req.file.filename)
    //   : null

    const existingUser = await User(
      db.sequelize,
      db.Sequelize.DataTypes
    ).findOne({ where: { email } })

    if (existingUser) {
      return res.status(400).send(errorResponse('User already exists', ''))
    }

    const hashedPassword = await hashPassword(password)
    const user = await User(db.sequelize, db.Sequelize.DataTypes).create({
      first_name: firstName,
      last_name: lastName,
      email,
      password: hashedPassword,
      verificationToken
    })

    if (user) {
      await Adminlog(db.sequelize, db.Sequelize.DataTypes).create({
        admin_id: user.id,
        action_description: 'New user with Added'
      })
    }

    res.status(201).send(successResponse('User Registration successful. Please verify your email.', {}))

    await sendVerificationEmail(email, verificationToken)
  } catch (error) {
    res.status(500).send(errorResponse(error.message, ''))
  }
}

// LoginController

exports.loginController = async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(401).send(errorResponse('Both Email and password are required.', ''))
    }
    const user = await User(db.sequelize, db.Sequelize.DataTypes).findOne({
      where: { email }
    })

    if (!user) {
      return res.status(401).send(errorResponse('Invalid credential.', ''))
    }

    const matchPwd = await comparePwd(password, user.password)
    if (!matchPwd) {
      return res.status(401).send(errorResponse('Invalid credential.', ''))
    }

    if (!user.isVerified) {
      return res.status(403).send(errorResponse('Your account is not verified yet.', ''))
    }

    //  create token here
    const token = JWT.sign({ id: user.id }, JWT_SECRET, {
      expiresIn: TOKEN_EXPIRY_DURATION
    })

    return res.status(200).send(successResponse('Login is successful', { token }))
  } catch (error) {
    return res.status(500).send(errorResponse('Internal server error', ''))
  }
}

// GET USER
exports.getUserController = async (req, res) => {
  try {
    // const user = await User(db.sequelize, db.Sequelize.DataTypes).findAll()
    const user = req.user
    const userData = await User(db.sequelize, db.Sequelize.DataTypes).findOne({
      where: { id: user.id },
      attributes: ['first_name', 'last_name', 'email']
    })

    if (!userData) {
      return res.status(404).send({
        success: false,
        message: 'User not found'
      })
    }
    return res.status(200).send(successResponse('success', userData))
  } catch (error) {
    res.status(500).send({
      success: false,
      message: 'Internal server error'
    })
  }
}

// UPDATE USER
exports.updateUserController = async (req, res) => {
  try {
    const userId = req.params.id
    const { firstName, lastName } = req.body
    const profilePicture = req.file
      ? path.join(__dirname, '../public/uploads/', req.file.filename)
      : null
    const updatedRowCount = await User(
      db.sequelize,
      db.Sequelize.DataTypes
    ).update(
      {
        first_name: firstName,
        last_name: lastName,
        profile_picture: profilePicture
      },
      {
        where: { id: userId }
      }
    )

    if (updatedRowCount === 0) {
      return res.status(404).send({
        success: false,
        message: 'User not found'
      })
    }

    if (userId !== req.user.id) {
      await Adminlog(db.sequelize, db.Sequelize.DataTypes).create({
        admin_id: req.user.id,
        action_description: `User Details with id-${userId} Updated`
      })
    }

    res.status(200).send({
      success: true,
      message: 'User Update successfully',
      user: updatedRowCount
    })
  } catch (error) {
    res.status(500).send({
      success: false,
      message: 'Internal server error',
      error: error.message
    })
  }
} // DELETE USER
exports.deleteUserController = async (req, res) => {
  try {
    const { userId } = req.params

    const deletedRowCount = await User(
      db.sequelize,
      db.Sequelize.DataTypes
    ).destroy({
      where: { id: userId } // id is the primary key field
    })

    if (deletedRowCount === 0) {
      return res.status(404).send({
        success: false,
        message: 'User not found'
      })
    }

    res.status(200).send({
      success: true,
      message: 'User delete successfully'
    })
  } catch (error) {
    res.status(500).send({
      success: false,
      message: 'Internal server error'
    })
  }
}
exports.verifyTokenController = async (req, res) => {
  try {
    const verificationToken = req.params.verificationToken

    // Find the user by verification token
    const user = await User(db.sequelize, db.Sequelize.DataTypes).findOne({
      where: { verificationToken }
    })

    if (!user) {
      return res.status(400).send({
        success: false,
        message: 'Email verification failed'
      })
    }
    user.isVerified = true
    await user.save()
    res.status(200).send({
      success: true,
      message: 'Email verified successfully'
    })
  } catch (error) {
    res.status(500).send({
      success: false,
      message: 'Internal server error'
    })
  }
}

exports.forgotPasswordController = async (req, res) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(401).send(errorResponse('Email is required.', ''))
    }
    const user = await User(db.sequelize, db.Sequelize.DataTypes).findOne({
      where: { email }
    })

    if (!user) {
      return res.status(401).send(errorResponse('Please double-check your email address and try again', ''))
    }

    if (!user.isVerified) {
      const verificationToken = JWT.sign({ email }, JWT_SECRET, {
        expiresIn: TOKEN_EXPIRY_DURATION
      })
      await sendVerificationEmail(email, verificationToken)
      return res.status(403).send(errorResponse('Your account is not verified yet.', ''))
    }

    //  create token here
    const token = JWT.sign({ id: user.id }, JWT_SECRET, {
      expiresIn: '10m'
    })

    const body4 = {
      type: 'RESET_PASSWORD',
      data: {
        to: user.email,
        userName: user.first_name + ' ' + user.last_name,
        link: `http://localhost:5173/reset-password?token=${token}`,
        expLimit: '10min'
      }
    }
    // send reset password link to users mail
    sendEmailNotification(body4)

    return res.status(200).send(successResponse('Please check your email, including the spam folder if needed.', { }))
  } catch (error) {
    return res.status(500).send(errorResponse('Internal server error', ''))
  }
}

exports.resetPasswordController = async (req, res) => {
  try {
    const { id, password } = req.body

    const existingUser = await User(
      db.sequelize,
      db.Sequelize.DataTypes
    ).findOne({ where: { id } })

    if (!existingUser) {
      return res.status(400).send(errorResponse('User not found', ''))
    }


    const hashedPassword = await hashPassword(password)

    // Update the user's password with the new hashed password
    await User(db.sequelize,
      db.Sequelize.DataTypes).update(
      { password: hashedPassword },
      { where: { id } }
    )

    res.status(201).send(successResponse('Your password has been successfully reset. You can now log in using your new password.', {}))
  } catch (error) {
    return res.status(500).send(errorResponse('Internal server error', ''))
  }
}

exports.verifyToken = async (req, res) => {
  try {
    const { token } = req.body

    try {
      const decode = JWT.verify(
        token,
        JWT_SECRET
      )
      res.status(201).send(successResponse('Your token has been verified successfully.', decode))
    } catch (error) {
      return res.status(401).send(errorResponse('Invalid Token', ''))
    }
  } catch (error) {
    return res.status(500).send(errorResponse('Internal server error', ''))
  }
}

