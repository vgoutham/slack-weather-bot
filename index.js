'use strict';

const AWS = require('aws-sdk');
const qs = require('querystring');
const request = require('request-promise');
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
    let formattedLocation;
    let geolocation;

    request(`http://maps.googleapis.com/maps/api/geocode/json?address=${commandText}`)
      .then(function(res){
        formattedLocation = JSON.parse(res).results[0].formatted_address;
        geolocation = JSON.parse(res).results[0].geometry.location;
        return request(`https://api.darksky.net/forecast/${weatherAPIKey}/${geolocation.lat},${geolocation.lng}`);
      })
      .then(function(res){
        const currentWeather = JSON.parse(res).currently;
        let responseText = `*${currentWeather.summary} in ${formattedLocation}*\n\n`;
        responseText += ":thermometer:*Temperature:* " + parseInt(currentWeather.temperature) + " F\n";
        responseText += ":umbrella_with_rain_drops:*Precipitation:* " + parseInt(currentWeather.precipProbability * 100) + "%\n";
        responseText += ":sweat_drops:*Humidity:* " + parseInt(currentWeather.humidity * 100) + "%\n";
        responseText += ":wind_blowing_face:*Wind:* " + currentWeather.windSpeed.toFixed(1) + " mph\n";
        responseText += ":compression:*Pressure:* " + parseInt(currentWeather.pressure) + " mb\n";
        callback(null, {"response_type": "in_channel", "text": responseText});
      });

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
