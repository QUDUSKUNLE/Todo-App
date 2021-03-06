import bcrypt from 'bcrypt';
import capitalize from 'capitalize';
import crypto from 'crypto';
import dotenv from 'dotenv';
import createToken from '../utils/createToken';
import sendMail from '../utils/sendEmail';
import User from '../models/User';

dotenv.config();

/**
 * @class UserController
 */
class UserController {
  /**
   * signup a new user
   * Routes: POST: /api/v1/signup
   * @param {any} req user request object
   * @param {any} res server response
   * @return {void} json server response
   */
  static signUp(req, res) {
    if ((!req.body.email) || (!req.body.password)) {
      res.status(400).json({
        error: 'Either email, password must not be empty',
        success: false
      });
    } else {
      User.findOne({
        email: req.body.email
      })
        .exec()
        .then((email) => {
          if (email) {
            res.status(409).json({
              error: 'Email is already registered',
              success: false
            });
          } else {
            const user = new User({
              password: req.body.password,
              email: req.body.email
            });
            user.save((err, newUser) => {
              if (err) {
                return res.status(500).json({
                  success: false,
                  message: err
                });
              }
              const userDetails = {
                email: newUser.email
              };
              const userEncode = {
                email: newUser.email,
                userId: newUser._id
              };
              return res.status(201).json({
                message: 'Sign up successful',
                success: true,
                token: createToken(userEncode),
                userDetails
              });
            });
          }
        });
    }
  }

  /**
  * * Routes: POST: /api/v1/signin
  * @param {any} req user request object
  * @param {any} res server response
  * @return {void} json server response
  */
  static signIn(req, res) {
    if ((!req.body.email) || (!req.body.password)) {
      res.status(400).json({
        error: 'Email or password must not be empty',
        success: false
      });
    } else {
      User.findOne({
        email: req.body.email
      })
        .exec((err, response) => {
          if (err) {
            return res.status(500).json({
              success: false,
              error: 'internal server error'
            });
          }
          if (!response) {
            return res.status(404).json({
              success: false,
              error: 'User does not exist'
            });
          }
          // compare passwords
          if (!bcrypt.compareSync(req.body.password, response.password)) {
            return res.status(401).json({
              success: false,
              error: 'Email or password is invalid'
            });
          }
          const userDetails = {
            username: response.username,
            email: response.email
          };
          const userEncode = {
            username: response.username,
            email: response.email,
            userId: response._id
          };
          return res.status(200).json({
            message: 'Sign in successful',
            success: true,
            token: createToken(userEncode),
            userDetails
          });
        });
    }
  }

  /**
  * Send Reset password email
  * Routes: POST: /api/v1/resetpasswords
  * @param {any} req user request object
  * @param {any} res server response
  * @returns {response} response object
  */
  static resetPassword(req, res) {
    if (!req.body.email) {
      return res.status(400).json({
        success: false,
        error: 'Email must not be empty'
      });
    }
    const hash = crypto.randomBytes(20).toString('hex');
    const date = Date.now() + 3600000;
    User.findOne({
      email: req.body.email
    })
      .exec((err, response) => {
        if (err) {
          return res.status(500).json({
            success: false,
            error: 'internal server error'
          });
        }
        if (!response) {
          return res.status(404).json({
            success: false,
            error: 'User does not exist'
          });
        }
        response.hash = hash;
        response.expiryTime = date;
        response.save((error, updatedUser) => {
          if (error) {
            return res.status(400).json({
              success: false,
              message: error
            });
          }
          // send mail to the user
          sendMail(
            updatedUser.email,
            updatedUser.username,
            hash, req.headers.host
          );
          return res.status(200).json({
            success: true,
            message: 'Reset password email sent successfully'
          });
        });
      }).catch(error => res.status(500).json({ message: error.message }));
  }

  /**
   * Update Password
   * Route: PUT: /api/v1/updatepasswords/:hash
   * @param {any} req user request object
   * @param {any} res server response
   * @return {void}
   */
  static updatePassword(req, res) {
    if ((!req.body.newPassword) || (!req.body.confirmPassword)) {
      return res.status(400).json({
        error: 'New password or confirm password must not be empty',
        success: false
      });
    }
    User.findOne({ hash: req.params.hash })
      .then((user) => {
        if (!user) {
          return res.status(404).json({
            success: false,
            error: 'User does not exist'
          });
        }
        if (req.body.newPassword === req.body.confirmPassword) {
          const currentTime = Date.now();
          if (currentTime > user.expiryTime) {
            return res.status(410).json({
              success: false,
              error: 'Expired link'
            });
          }
          user.password = req.body.newPassword;
          user.save((err, updatedUser) => {
            if (err) {
              return res.status(503).json({
                success: false,
                error: err.message
              });
            }
            User.findByIdAndUpdate(
              { _id: updatedUser._id },
              {
                $set: { hash: '' },
              },
              { new: true }
            ).exec((error, hashUpdate) => {
              if (hashUpdate) {
                return res.status(200).json({
                  success: true,
                  message: 'Password has been updated',
                  hashUpdate
                });
              }
              return res.status(503).json({
                success: false,
                error: error.message
              });
            });
          });
        } else {
          return res.status(400).json({
            success: false,
            error: 'Please confirm password'
          });
        }
      })
      .catch(error => res.status(500).json({
        success: false,
        error: error.message
      }));
  }
}

export default UserController;
