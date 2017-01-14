'use strict';

const express = require('express'),
    https = require('https'),
    http = require('http'),    
    bodyParser = require('body-parser'),
    gcm = require('node-gcm'),
    WebSocketServer = require("ws").Server,
    shortid = require('shortid'),
    Sequelize = require('sequelize'),
    crypto = require('crypto'),
    config = require('config'),
    request = require('request'),
    Wit = require('node-wit').Wit,
    log = require('node-wit').log,
    firebase = require('firebase-admin'),
    Q = require("q"),
    geoip = require('geoip-lite');


var app = express();
app.set('port', process.env.PORT || 5000);
//app.set('view engine', 'ejs');
app.use(express.static('public'));

//var gcm = GCM('363651967593', 'AIzaSyCfYqVxRG0oz7Xo_jgRcXJk54t-XXhATGs');
var sender = new gcm.Sender('AAAA2x1z064:APA91bHc78HNke78cN_qVyQzxsqK_Dp1GIVgx1vPgZ39OEKsoQCAAf7SDNR2qsegtjoEMi_CUWf7ky1vswiE4LXCjpooMgLuIegpE0PSP2vH9LTdnc68inpDA5xOW4ELUnm6JQeukzPJ');
 
/*gcm.on('message', function(messageId, from, category, data) {
    console.log('message received::'+JSON.stringify(data))
    //Using Websocket instead of this event
});
 
gcm.on('receipt', function(messageId, from, category, data) {
    console.log('received receipt', arguments);
});

gcm.on('connected', function(){console.log('connected')});
gcm.on('disconnected', function(){console.log('disconnected')});
gcm.on('online', function(){console.log('online')});
gcm.on('error', function(){console.log('error')});
gcm.on('message-error', function(message){console.log('message-error::', message)});
*/


var serviceAccount = require("./serviceAccountKey.json");

firebase.initializeApp({
  credential: firebase.credential.cert(serviceAccount),
  databaseURL: 'https://smartjekvendor.firebaseio.com/'
});

/*
 * Be sure to setup your config values before running this code. You can 
 * set them using environment variables or modifying the config file in /config.
 *
 */

// App Secret can be retrieved from the App Dashboard
const APP_SECRET = (process.env.MESSENGER_APP_SECRET) ? 
  process.env.MESSENGER_APP_SECRET :
  config.get('appSecret');

// Arbitrary value used to validate a webhook
const VALIDATION_TOKEN = (process.env.MESSENGER_VALIDATION_TOKEN) ?
  (process.env.MESSENGER_VALIDATION_TOKEN) :
  config.get('validationToken');

// Generate a page access token for your page from the App Dashboard
const PAGE_ACCESS_TOKEN = (process.env.MESSENGER_PAGE_ACCESS_TOKEN) ?
  (process.env.MESSENGER_PAGE_ACCESS_TOKEN) :
  config.get('pageAccessToken');

// URL where the app is running (include protocol). Used to point to scripts and 
// assets located at this address. 
const SERVER_URL = (process.env.SERVER_URL) ?
  (process.env.SERVER_URL) :
  config.get('serverURL');

const DATABASE_URL = (process.env.DATABASE_URL) ? 
  process.env.DATABASE_URL :
  config.get('database');

const WIT_TOKEN = (process.env.WIT_TOKEN) ? 
  process.env.WIT_TOKEN :
  config.get('witToken');

if (!(APP_SECRET && VALIDATION_TOKEN && PAGE_ACCESS_TOKEN && SERVER_URL && DATABASE_URL && WIT_TOKEN)) {
  console.error("Missing config values");
  process.exit(1);
}
var sequelize = new Sequelize(DATABASE_URL);
sequelize
  .authenticate()
  .then(function(err) {
    console.log('Connection has been established successfully.');
  })
  .catch(function (err) {
    console.log('Unable to connect to the database:', err);
  });

var server = http.createServer();
var wss = new WebSocketServer({server: server})
server.on('request', app);
server.listen(process.env.PORT || 5000, function () { 
    console.log('Listening on ' + server.address().port) 
});

var clients = {}
var websocket;

wss.on("connection", function(ws) {
    var connection_id = shortid.generate();
    clients[connection_id] = ws;
    websocket = ws;
    ws.connection_id = connection_id;
    console.log("websocket connection open");
    var result = {'status':'connected','connection_id': connection_id}
    ws.send(JSON.stringify(result), function() {  })
    ws.on('message', function incoming(message) {
        console.log('received: %s', message);
        if(message=="ping")
            return;
        message = JSON.parse(message)
        sendAppMessage(message);      

    });
    ws.on("close", function() {
        delete clients[ws.connection_id];
        console.log("websocket connection closed ::", Object.keys(clients));            
    });
});

var User = sequelize.define('users', {
  email: {
    type: Sequelize.STRING
  },
  token: {
    type: Sequelize.STRING
  },
  connection_id: {
    type: Sequelize.STRING
  },
  online: {
    type: Sequelize.STRING
  }
});

// force: true will drop the table if it already exists
User.sync().then(function () {
  console.log('table created or updated');
});

app.use(bodyParser.json());

app.get('/init', function(request, response) {
  console.log('inside init')
  var ip;
  if (request.headers['x-forwarded-for']) {
    ip = request.headers['x-forwarded-for'].split(",")[0];
  } else if (request.connection && request.connection.remoteAddress) {
      ip = request.connection.remoteAddress;
  } else {
      ip = request.ip;
  }
  console.log('ip ', ip);
  var geo = geoip.lookup(ip);
  console.log(geo);
  getLocation(geo)
  .then(function(location){
    console.log('after getting location ', location);
    getInitData(location)
    .then(function(data){
      console.log('after getting response', data);
      response.json(data);
    });
  });
});

var vendorsRef = firebase.database().ref("/vendors");

app.post('/devicetoken', function(request, response) {
  console.log('inside devicetoken')
  var req = request.body;
  var deviceToken = req.deviceToken;
  vendorRef.once('value', function(snapshot){
      var profile = snapshot.val();
      if(!profile) {
        var obj = {deviceToken : deviceToken};
        vendorRef.set(obj);
      }
      response.send({'result':result});
  });
});

app.post('/order', function(request, response) {
  console.log('inside order')
  sendOrder()
  .then(function(result){
      console.log('after getting response', data);
      response.json(data);
  }).catch(function(err){
      console.log('after getting err', err);
      response.json(err);
  })
});

var getLocation = function(geo){
    console.log('inside getLocation');
    var ll = geo.ll[0]+':'+geo.ll[1];
    var q = Q.defer();
    var locationRef = firebase.database().ref("/location/"+ll+"/");
    locationRef.once('value', function(snapshot){
      console.log('on value');
      var data = snapshot.val();
      q.resolve(data);  
    });
    return q.promise;
};

var getInitData = function(location){
  console.log('inside getInitData');
  var q = Q.defer();
  var servicesRef = firebase.database().ref("/"+location);
  servicesRef.once('value', function(snapshot){
    console.log('on value');
    var data = snapshot.val();
    q.resolve(data);  
  });
  return q.promise;
};

var sendOrder = function(service){
  vendorsRef.once('value', function(snapshot){
      var vendors = snapshot.val();
      if(!vendors) {
        response.send({'result':'no vendor'});
      } else {
        var regids = [];
        regids.push(vendors[0].deviceToken);
        var message = new gcm.Message();
        message.addData('key1', 'msg1');
        sender.send(message, { registrationTokens: regids }, function (err, res) {
          if(err) 
            console.error(err);
          else    
            console.log(res);
          console.log('notifications sent to '+regids);
        }); 
        response.send({'result':result});
      }
  });    
}

var broadcast=function(queue){
  debugger;
  var data = {pass:queue.passCount, time:queue.avgTime};
  if(websocket)
  websocket.send(JSON.stringify(data), function() {});
}

var broadcastAds = function(){
  debugger;
  promoRef.once('value', function(snapshot){
    var promos = snapshot.val();
    var result = {promo: promos};
    if(websocket)
    websocket.send(JSON.stringify(result), function() {  });
  });  
}


exports = module.exports = app;
