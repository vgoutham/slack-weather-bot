'use strict';

const AWS = require('aws-sdk');
const qs = require('querystring');
const request = require('superagent');
const config = require('./config');

const kmsEncryptedToken = config.kmsEncryptedToken;
const weatherAPIKey = config.weatherAPIKey;
let token;

function processEvent(event, callback) {
    const params = qs.parse(event.body);
    const requestToken = params.token;
    if (requestToken !== token) {
        console.error(`Request token (${requestToken}) does not match expected`);
        return callback('Invalid request token');
    }

    const user = params.user_name;
    const command = params.command;
    const channel = params.channel_name;
    const commandText = params.text.replace(/ /g,"%20");

    request
      .get(`http://api.openweathermap.org/data/2.5/forecast/daily?q=${commandText}&mode=json&units=imperial&cnt=7&appid=${weatherAPIKey}`)
      .end(function(err, res){
          // Do something
          callback(null, res);
      });

    //callback(null, `${user} invoked ${command} in ${channel} with the following text: ${commandText}`);
}


exports.handler = (event, context, callback) => {
    const done = (err, res) => callback(null, {
        statusCode: err ? '400' : '200',
        body: err ? (err.message || err) : JSON.stringify(res),
        headers: {
            'Content-Type': 'application/json',
        },
    });

    if (token) {
        // Container reuse, simply process the event with the key in memory
        processEvent(event, done);
    } else if (kmsEncryptedToken && kmsEncryptedToken !== '<kmsEncryptedToken>') {
        const cipherText = { CiphertextBlob: new Buffer(kmsEncryptedToken, 'base64') };
        const kms = new AWS.KMS();
        kms.decrypt(cipherText, (err, data) => {
            if (err) {
                console.log('Decrypt error:', err);
                return done(err);
            }
            token = data.Plaintext.toString('ascii');
            processEvent(event, done);
        });
    } else {
        done('Token has not been set.');
    }
};
