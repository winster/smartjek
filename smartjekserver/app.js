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
    Q = require("q");


var app = express();
app.set('port', process.env.PORT || 5000);
app.set('view engine', 'ejs');
app.use(express.static('public'));

//var gcm = GCM('363651967593', 'AIzaSyCfYqVxRG0oz7Xo_jgRcXJk54t-XXhATGs');
var sender = new gcm.Sender('AIzaSyCfYqVxRG0oz7Xo_jgRcXJk54t-XXhATGs');
 
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


var serviceAccount = require("./smartjekserver/serviceAccountKey.json");

firebase.initializeApp({
  credential: firebase.credential.cert(serviceAccount),
  databaseURL: 'https://indiatour-805b8.firebaseio.com'
});

var profilesRef = firebase.database().ref("/profiles");
var queueRef = firebase.database().ref("/queue/");
var passRef = firebase.database().ref("/queue/passCount");
var regRef = firebase.database().ref("/queue/regCount");
var promoRef = firebase.database().ref("/promo/");

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


/*
 * Use your own validation token. Check that the token used in the Webhook 
 * setup is the same token used here.
 *
 */
app.get('/webhook', function(req, res) {
  if (req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === VALIDATION_TOKEN) {
    console.log("Validating webhook");
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);          
  }  
});


/*
 * All callbacks for Messenger are POST-ed. They will be sent to the same
 * webhook. Be sure to subscribe your app to your page to receive callbacks
 * for your page. 
 * https://developers.facebook.com/docs/messenger-platform/product-overview/setup#subscribe_app
 *
 */
app.post('/webhook', bodyParser.json({verify:verifyRequestSignature}), function (req, res) {
  console.log('inside webhook', req.body);
  var data = req.body;

  // Make sure this is a page subscription
  if (data.object == 'page') {
    // Iterate over each entry
    // There may be multiple if batched
    data.entry.forEach(function(pageEntry) {
      var pageID = pageEntry.id;
      var timeOfEvent = pageEntry.time;

      // Iterate over each messaging event
      pageEntry.messaging.forEach(function(messagingEvent) {
        if (messagingEvent.optin) {
          receivedAuthentication(messagingEvent);
        } else if (messagingEvent.message) {
          receivedMessage(messagingEvent);
        } else if (messagingEvent.delivery) {
          receivedDeliveryConfirmation(messagingEvent);
        } else if (messagingEvent.postback) {
          receivedPostback(messagingEvent);
        } else if (messagingEvent.read) {
          receivedMessageRead(messagingEvent);
        } else if (messagingEvent.account_linking) {
          receivedAccountLink(messagingEvent);
        } else {
          console.log("Webhook received unknown messagingEvent: ", messagingEvent);
        }
      });
    });

    // Assume all went well.
    //
    // You must send back a 200, within 20 seconds, to let us know you've 
    // successfully received the callback. Otherwise, the request will time out.
    res.sendStatus(200);
  }
});

/*
 * This path is used for account linking. The account linking call-to-action
 * (sendAccountLinking) is pointed to this URL. 
 * 
 */
app.get('/authorize', bodyParser.json({verify:verifyRequestSignature}), function(req, res) {
  var accountLinkingToken = req.query['account_linking_token'];
  var redirectURI = req.query['redirect_uri'];

  // Authorization Code should be generated per user by the developer. This will 
  // be passed to the Account Linking callback.
  var authCode = "1234567890";

  // Redirect users to this URI on successful login
  var redirectURISuccess = redirectURI + "&authorization_code=" + authCode;

  res.render('authorize', {
    accountLinkingToken: accountLinkingToken,
    redirectURI: redirectURI,
    redirectURISuccess: redirectURISuccess
  });
});

/*
 * Verify that the callback came from Facebook. Using the App Secret from 
 * the App Dashboard, we can verify the signature that is sent with each 
 * callback in the x-hub-signature field, located in the header.
 *
 * https://developers.facebook.com/docs/graph-api/webhooks#setup
 *
 */
function verifyRequestSignature(req, res, buf) {
  var signature = req.headers["x-hub-signature"];

  if (!signature) {
    // For testing, let's log an error. In production, you should throw an 
    // error.
    console.error("Couldn't validate the signature.");
  } else {
    var elements = signature.split('=');
    var method = elements[0];
    var signatureHash = elements[1];

    var expectedHash = crypto.createHmac('sha1', APP_SECRET)
                        .update(buf)
                        .digest('hex');

    if (signatureHash != expectedHash) {
      throw new Error("Couldn't validate the request signature.");
    }
  }
}

/*
 * Authorization Event
 *
 * The value for 'optin.ref' is defined in the entry point. For the "Send to 
 * Messenger" plugin, it is the 'data-ref' field. Read more at 
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/authentication
 *
 */
function receivedAuthentication(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfAuth = event.timestamp;

  // The 'ref' field is set in the 'Send to Messenger' plugin, in the 'data-ref'
  // The developer can set this to an arbitrary value to associate the 
  // authentication callback with the 'Send to Messenger' click event. This is
  // a way to do account linking when the user clicks the 'Send to Messenger' 
  // plugin.
  var passThroughParam = event.optin.ref;

  console.log("Received authentication for user %d and page %d with pass " +
    "through param '%s' at %d", senderID, recipientID, passThroughParam, 
    timeOfAuth);

  // When an authentication is received, we'll send a message back to the sender
  // to let them know it was successful.
  sendFBTextMessage(senderID, "Authentication successful");
}

/*
 * Message Event
 *
 * This event is called when a message is sent to your page. The 'message' 
 * object format can vary depending on the kind of message that was received.
 * Read more at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-received
 *
 * For this example, we're going to echo any text that we get. If we get some 
 * special keywords ('button', 'generic', 'receipt'), then we'll send back
 * examples of those bubbles to illustrate the special message bubbles we've 
 * created. If we receive a message with an attachment (image, video, audio), 
 * then we'll simply confirm that we've received the attachment.
 * 
 */
function receivedMessage(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfMessage = event.timestamp;
  var message = event.message;

  console.log("Received message for user %d and page %d at %d with message:", 
    senderID, recipientID, timeOfMessage);
  console.log(JSON.stringify(message));

  var isEcho = message.is_echo;
  var messageId = message.mid;
  var appId = message.app_id;
  var metadata = message.metadata;

  // You may get a text or attachment but not both
  var messageText = message.text;
  var messageAttachments = message.attachments;
  var quickReply = message.quick_reply;

  if (isEcho) {
    // Just logging message echoes to console
    console.log("Received echo for message %s and app %d with metadata %s", 
      messageId, appId, metadata);
    return;
  } else if (quickReply) {
    var quickReplyPayload = quickReply.payload;
    console.log("Quick reply for message %s with payload %s",
      messageId, quickReplyPayload);

    sendFBTextMessage(senderID, "Quick reply tapped");
    return;
  }

  if (messageText) {

    // If we receive a text message, check to see if it matches any special
    // keywords and send back the corresponding example. Otherwise, just echo
    // the text we received.
    /*switch (messageText) {
      case 'image':
        sendImageMessage(senderID);
        break;

      case 'gif':
        sendGifMessage(senderID);
        break;

      case 'audio':
        sendAudioMessage(senderID);
        break;

      case 'video':
        sendVideoMessage(senderID);
        break;

      case 'file':
        sendFileMessage(senderID);
        break;

      case 'button':
        sendButtonMessage(senderID);
        break;

      case 'generic':
        sendGenericMessage(senderID);
        break;

      case 'receipt':
        sendReceiptMessage(senderID);
        break;

      case 'quick reply':
        sendQuickReply(senderID);
        break;        

      case 'read receipt':
        sendReadReceipt(senderID);
        break;        

      case 'typing on':
        sendTypingOn(senderID);
        break;        

      case 'typing off':
        sendTypingOff(senderID);
        break;        

      case 'account linking':
        sendAccountLinking(senderID);
        break;

      default:
        forwardTextMessage(senderID, messageText);
    }*/
    if(messageText.indexOf('Hampi pics')>-1 || messageText.indexOf('Pictures of Hampi')>-1) {
        sendGenericMessage(senderID);
    } else if(messageText.indexOf('audio guide')>-1){
        sendAudioMessage(senderID);
    } else {
        forwardTextMessage(senderID, messageText);
    }
  } else if (messageAttachments) {
    sendFBTextMessage(senderID, "Sorry. I can process only TEXT messages now. :(");
  }
}


/*
 * Delivery Confirmation Event
 *
 * This event is sent to confirm the delivery of a message. Read more about 
 * these fields at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-delivered
 *
 */
function receivedDeliveryConfirmation(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var delivery = event.delivery;
  var messageIDs = delivery.mids;
  var watermark = delivery.watermark;
  var sequenceNumber = delivery.seq;

  if (messageIDs) {
    messageIDs.forEach(function(messageID) {
      console.log("Received delivery confirmation for message ID: %s", 
        messageID);
    });
  }

  console.log("All message before %d were delivered.", watermark);
}


/*
 * Postback Event
 *
 * This event is called when a postback is tapped on a Structured Message. 
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/postback-received
 * 
 */
function receivedPostback(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfPostback = event.timestamp;

  // The 'payload' param is a developer-defined field which is set in a postback 
  // button for Structured Messages. 
  var payload = event.postback.payload;

  console.log("Received postback for user %d and page %d with payload '%s' " + 
    "at %d", senderID, recipientID, payload, timeOfPostback);

  // When a postback is called, we'll send a message back to the sender to 
  // let them know it was successful
  sendFBTextMessage(senderID, "Postback called");
}

/*
 * Message Read Event
 *
 * This event is called when a previously-sent message has been read.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-read
 * 
 */
function receivedMessageRead(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;

  // All messages before watermark (a timestamp) or sequence have been seen.
  var watermark = event.read.watermark;
  var sequenceNumber = event.read.seq;

  console.log("Received message read event for watermark %d and sequence " +
    "number %d", watermark, sequenceNumber);
}

/*
 * Account Link Event
 *
 * This event is called when the Link Account or UnLink Account action has been
 * tapped.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/account-linking
 * 
 */
function receivedAccountLink(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;

  var status = event.account_linking.status;
  var authCode = event.account_linking.authorization_code;

  console.log("Received account link event with for user %d with status %s " +
    "and auth code %s ", senderID, status, authCode);
}

/*
 * Send an image using the Send API.
 *
 */
function sendImageMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "image",
        payload: {
          url: SERVER_URL + "/assets/rift.png"
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
 * Send a Gif using the Send API.
 *
 */
function sendGifMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "image",
        payload: {
          url: SERVER_URL + "/assets/instagram_logo.gif"
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
 * Send audio using the Send API.
 *
 */
function sendAudioMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "audio",
        payload: {
          url: SERVER_URL + "/assets/sample.mp3"
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
 * Send a video using the Send API.
 *
 */
function sendVideoMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "video",
        payload: {
          url: SERVER_URL + "/assets/allofus480.mov"
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
 * Send a video using the Send API.
 *
 */
function sendFileMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "file",
        payload: {
          url: SERVER_URL + "/assets/test.txt"
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
 * Send a text message using the Send API.
 *
 */
function sendFBTextMessage(recipientId, messageText) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: messageText,
      metadata: "DEVELOPER_DEFINED_METADATA"
    }
  };

  callSendAPI(messageData);
}

/*
 * Send a button message using the Send API.
 *
 */
function sendButtonMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "This is test text",
          buttons:[{
            type: "web_url",
            url: "https://www.oculus.com/en-us/rift/",
            title: "Open Web URL"
          }, {
            type: "postback",
            title: "Trigger Postback",
            payload: "DEVELOPED_DEFINED_PAYLOAD"
          }, {
            type: "phone_number",
            title: "Call Phone Number",
            payload: "+16505551234"
          }]
        }
      }
    }
  };  

  callSendAPI(messageData);
}

/*
 * Send a Structured Message (Generic Message type) using the Send API.
 *
 */
function sendGenericMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [{
            title: "Virupaksha",
            subtitle: "Virupaksha Temple",
            item_url: "https://indiatour.herokuapp.com/hampi/virupaksha",               
            image_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Virupaksha_Temple_from_the_top.JPG/480px-Virupaksha_Temple_from_the_top.JPG",
            buttons: [{
              type: "web_url",
              url: "https://indiatour.herokuapp.com/hampi/virupaksha/visitinghours",
              title: "Visiting Hours"
            }, {
              type: "postback",
              title: "Book a Hotel",
              payload: "Payload for first bubble",
            }],
          }, {
            title: "Vittala",
            subtitle: "Stone Chariot in Vittala",
            item_url: "https://indiatour.herokuapp.com/hampi/vittala",
            image_url: "https://media-cdn.tripadvisor.com/media/photo-s/05/b5/1d/b6/explore-hampi-day-tours.jpg",
            buttons: [{
              type: "web_url",
              url: "https://indiatour.herokuapp.com/hampi/vittala/visitinghours",
              title: "Visiting hours"
            }, {
              type: "postback",
              title: "Book a guide",
              payload: "Payload for second bubble",
            }]
          }]
        }
      }
    }
  };  

  callSendAPI(messageData);
}

function sendRestaurants(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [{
            title: "A2B",
            subtitle: "Adyar-ananda-bhavan",
            item_url: "https://indiatour.herokuapp.com/restaurant/a2b",               
            image_url: "https://media-cdn.tripadvisor.com/media/photo-s/09/5e/88/04/a2b-adyar-ananda-bhavan.jpg",
            buttons: [{
              type: "web_url",
              url: "https://indiatour.herokuapp.com/restaurant/a2b",
              title: "More Images"
            }, {
              type: "postback",
              title: "Reviews",
              payload: "Payload for first bubble",
            }],
          }]
        }
      }
    }
  };  

  callSendAPI(messageData);
}


function sendGuide(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [{
            title: "Mr. Mohan",
            subtitle: "10 year experienced",
            item_url: "https://indiatour.herokuapp.com/restaurant/a2b",               
            image_url: "http://www.hit4hit.org/img/login/user-icon-6.png",
            buttons: [{
              type: "web_url",
              url: "https://indiatour.herokuapp.com/restaurant/a2b",
              title: "Call and book"
            }, {
              type: "postback",
              title: "Reviews",
              payload: "Payload for first bubble",
            }],
          }]
        }
      }
    }
  };  

  callSendAPI(messageData);
}

/*
 * Send a receipt message using the Send API.
 *
 */
function sendReceiptMessage(recipientId) {
  // Generate a random receipt ID as the API requires a unique ID
  var receiptId = "order" + Math.floor(Math.random()*1000);

  var messageData = {
    recipient: {
      id: recipientId
    },
    message:{
      attachment: {
        type: "template",
        payload: {
          template_type: "receipt",
          recipient_name: "Peter Chang",
          order_number: receiptId,
          currency: "USD",
          payment_method: "Visa 1234",        
          timestamp: "1428444852", 
          elements: [{
            title: "Oculus Rift",
            subtitle: "Includes: headset, sensor, remote",
            quantity: 1,
            price: 599.00,
            currency: "USD",
            image_url: SERVER_URL + "/assets/riftsq.png"
          }, {
            title: "Samsung Gear VR",
            subtitle: "Frost White",
            quantity: 1,
            price: 99.99,
            currency: "USD",
            image_url: SERVER_URL + "/assets/gearvrsq.png"
          }],
          address: {
            street_1: "1 Hacker Way",
            street_2: "",
            city: "Menlo Park",
            postal_code: "94025",
            state: "CA",
            country: "US"
          },
          summary: {
            subtotal: 698.99,
            shipping_cost: 20.00,
            total_tax: 57.67,
            total_cost: 626.66
          },
          adjustments: [{
            name: "New Customer Discount",
            amount: -50
          }, {
            name: "$100 Off Coupon",
            amount: -100
          }]
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
 * Send a message with Quick Reply buttons.
 *
 */
function sendQuickReply(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "What's your favorite movie genre?",
      metadata: "DEVELOPER_DEFINED_METADATA",
      quick_replies: [
        {
          "content_type":"text",
          "title":"Action",
          "payload":"DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_ACTION"
        },
        {
          "content_type":"text",
          "title":"Comedy",
          "payload":"DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_COMEDY"
        },
        {
          "content_type":"text",
          "title":"Drama",
          "payload":"DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_DRAMA"
        }
      ]
    }
  };

  callSendAPI(messageData);
}

/*
 * Send a read receipt to indicate the message has been read
 *
 */
function sendReadReceipt(recipientId) {
  console.log("Sending a read receipt to mark message as seen");

  var messageData = {
    recipient: {
      id: recipientId
    },
    sender_action: "mark_seen"
  };

  callSendAPI(messageData);
}

/*
 * Turn typing indicator on
 *
 */
function sendTypingOn(recipientId) {
  console.log("Turning typing indicator on");

  var messageData = {
    recipient: {
      id: recipientId
    },
    sender_action: "typing_on"
  };

  callSendAPI(messageData);
}

/*
 * Turn typing indicator off
 *
 */
function sendTypingOff(recipientId) {
  console.log("Turning typing indicator off");

  var messageData = {
    recipient: {
      id: recipientId
    },
    sender_action: "typing_off"
  };

  callSendAPI(messageData);
}

/*
 * Send a message with the account linking call-to-action
 *
 */
function sendAccountLinking(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "Welcome. Link your account.",
          buttons:[{
            type: "account_link",
            url: SERVER_URL + "/authorize"
          }]
        }
      }
    }
  };  

  callSendAPI(messageData);
}

/*
 * Call the Send API. The message data goes in the body. If successful, we'll 
 * get the message id in a response 
 *
 */
function callSendAPI(messageData) {
  request({
    uri: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: PAGE_ACCESS_TOKEN },
    method: 'POST',
    json: messageData

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var recipientId = body.recipient_id;
      var messageId = body.message_id;

      if (messageId) {
        console.log("Successfully sent message with id %s to recipient %s", 
          messageId, recipientId);
      } else {
      console.log("Successfully called Send API for recipient %s", 
        recipientId);
      }
    } else {
      console.error(response.error);
    }
  });  
}

function sendAppMessage(message) {

    var payload = {'user':message.user, 'data': message.data, 
                'type':message.type, 'id':message.id, 'time': new Date().getTime()}
        
    User
      .findOne({where: {email: message.to}})
      .then(function(user) {
        
        console.log(user.get({
            plain: true
        }))

        var useGCM = true;
        if(user.online && user.connection_id) {
            var to_ws = clients[user.connection_id]
            if(to_ws) {
                to_ws.send(JSON.stringify(payload), function() {  })
                useGCM = false;
            } else {
                console.error('no ws connection found')
            }
        } 
        var messagePayload = new gcm.Message({
          data: payload
        });
        var registrationTokens = [user.token];
        if(useGCM) {
            sender.send(messagePayload,{ registrationTokens: regTokens }, (err, response) => {
                if (!err) {
                    console.log('sent message ',response);
                } else {
                    console.log('failed to send message');
                }
            })
        }
    })
}

function forwardTextMessage(senderID, messageText) {

    console.log('inside forwardTextMessage');

    const sessionId = findOrCreateSession(senderID);

    // Let's forward the message to the Wit.ai Bot Engine
    // This will run all actions until our bot has nothing left to do
    wit.runActions(
      sessionId, // the user's current session
      messageText, // the user's message
      sessions[sessionId].context // the user's current session state
    ).then((context) => {
      // Our bot did everything it has to do.
      // Now it's waiting for further messages to proceed.
      console.log('Waiting for next user messages');

      // Based on the session state, you might want to reset the session.
      // This depends heavily on the business logic of your bot.
      // Example:
      // if (context['done']) {
      //   delete sessions[sessionId];
      // }

      // Updating the user's current session state
      sessions[sessionId].context = context;
    })
    .catch((err) => {
        console.error('Oops! Got an error from Wit: ', err.stack || err);
        var message = {'user':senderID, 'data':messageText,
         'type':'TEXT','id':shortid.generate(), 'time': new Date().getTime()}
        message.to = 'H101'
        sendAppMessage(message);
    })

}

// ----------------------------------------------------------------------------
// Wit.ai bot specific code

// This will contain all user sessions.
// Each session has an entry:
// sessionId -> {fbid: facebookUserId, context: sessionState}
const sessions = {};

const findOrCreateSession = (fbid) => {
  let sessionId;
  // Let's see if we already have a session for the user fbid
  Object.keys(sessions).forEach(k => {
    if (sessions[k].fbid === fbid) {
      // Yep, got it!
      sessionId = k;
    }
  });
  if (!sessionId) {
    // No session found for user fbid, let's create a new one
    sessionId = new Date().toISOString();
    sessions[sessionId] = {fbid: fbid, context: {}};
  }
  return sessionId;
};

const firstEntityValue = (entities, entity) => {
  const val = entities && entities[entity] &&
    Array.isArray(entities[entity]) &&
    entities[entity].length > 0 &&
    entities[entity][0].value
  ;
  if (!val) {
    return null;
  }
  return typeof val === 'object' ? val.value : val;
};

// Our bot actions
const actions = {
  send({sessionId}, {text}) {
    console.log('inside send action', sessionId, text);
    // Our bot has something to say!
    // Let's retrieve the Facebook user whose session belongs to
    const recipientId = sessions[sessionId].fbid;
    if (recipientId) {
      // Yay, we found our recipient!
      // Let's forward our bot response to her.
      // We return a promise to let our bot know when we're done sending
      if(text.indexOf('restaurant')>-1) {
          sendRestaurants(recipientId);
      } else if(text.indexOf('guide')>-1) {
          sendGuide(recipientId);
      } else {
          sendFBTextMessage(recipientId, text);
      } 
      return new Promise(function(resolve, reject) {
        console.log('inside send callback promise::', text);
        return resolve();
      });
    } else {
      console.error('Oops! Couldn\'t find user for session:', sessionId);
      // Giving the wheel back to our bot
      return Promise.resolve()
    }
  },
  getForecast({context, entities}) {
    console.log('inside getForecast action');
    return new Promise(function(resolve, reject) {
      var location = firstEntityValue(entities, 'location')
      if (location) {
        context.forecast = 'sunny in ' + location; // we should call a weather API here
        delete context.missingLocation;
      } else {
        context.missingLocation = true;
        delete context.forecast;
      }
      return resolve(context);
    });
  },
  getRestaurants({context, entities}) {
    console.log('inside getRestaurants action');
    return new Promise(function(resolve, reject) {
      var location = firstEntityValue(entities, 'location')
      if (location) {
        context.restaurants = 'A2B restaurant'; // we should call a Google places API here
        delete context.missingLocation;
      } else {
        context.missingLocation = true;
        delete context.restaurants;
      }
      return resolve(context);
    });
  },
  getGuides({context, entities}) {
    console.log('inside getGuides action');
    return new Promise(function(resolve, reject) {
      var location = firstEntityValue(entities, 'location')
      if (location) {
        context.guidelist = 'Sasi guide '; // we should call a Google places API here
        delete context.missingLocation;
      } else {
        context.missingLocation = true;
        delete context.guidelist;
      }
      return resolve(context);
    });
  }
  // You should implement your custom actions here
  // See https://wit.ai/docs/quickstart
};

// Setting up our bot
const wit = new Wit({
  accessToken: WIT_TOKEN,
  actions,
  logger: new log.Logger(log.INFO)
});

app.use(bodyParser.json());
app.post('/v1.0/token', function(req, res) {
    console.log("inside token")
    var header=req.headers['authorization']||'',        // get the header
      token=header.split(/\s+/).pop()||'',            // and the encoded auth token
      auth=new Buffer(token, 'base64').toString(),    // convert from base64
      parts=auth.split(/:/),                          // split on colon
      username=parts[0],
      password=parts[1];

    User
      .findOrCreate({where: {email: username}, defaults: {}})
      .spread(function(user, created) {
        console.log(user.get({
          plain: true
        }))
        console.log(created)
        console.log('token::', req.body)
        user.token = req.body['token'];
        user.online = true;

        user.save().then(function(){
            console.log('user updated with token')

            var msg = {'result':'success'}
            res.setHeader('Content-Type', 'application/json');
            res.status(200).json(msg);
        })

      })
});


app.post('/v1.0/socket', function(req, res) {
    console.log("inside socket")
    var header=req.headers['authorization']||'',        // get the header
      token=header.split(/\s+/).pop()||'',            // and the encoded auth token
      auth=new Buffer(token, 'base64').toString(),    // convert from base64
      parts=auth.split(/:/),                          // split on colon
      username=parts[0],
      password=parts[1];
    User
      .findOrCreate({where: {email: username}, defaults: {}})
      .spread(function(user, created) {
        console.log(user.get({
          plain: true
        }))
        console.log(created)
        console.log('connection_id::', req.body)
        
        user.connection_id = req.body['connection_id'];
        user.online = true;

        user.save().then(function(){
            console.log('user updated with connection_id')

            var msg = {'result':'success'}
            res.setHeader('Content-Type', 'application/json');
            res.status(200).json(msg);
        })

      })
});

app.post('/v1.0/offline', function(req, res) {
    console.log("inside offline")
    var header=req.headers['authorization']||'',        // get the header
      token=header.split(/\s+/).pop()||'',            // and the encoded auth token
      auth=new Buffer(token, 'base64').toString(),    // convert from base64
      parts=auth.split(/:/),                          // split on colon
      username=parts[0],
      password=parts[1];

    User
      .findOne({where: {email: username}})
      .then(function(user) {
        console.log(user.get({
          plain: true
        }))

        user.online = false;

        user.save().then(function(){
            console.log('user updated with offline')

            var msg = {'result':'success'}
            res.setHeader('Content-Type', 'application/json');
            res.status(200).json(msg);
        })

      })
});



//---------------------------------------------------------------------------------------------------------------


passRef.on('value', function(snapshot){
  var passCount = snapshot.val();
  profilesRef.orderByChild("token").startAt(passCount).endAt(passCount+3).on("value", function(snapshot) {
    var regids = [];
    snapshot.forEach(function(data) {
      console.log("value from firebase:: " + data.val());
      var profile = data.val();
      regids.push(profile.regId);  
    });
    var message = new gcm.Message();
    message.addData('data', passCount);
    sendnotifs(message, regids); 
  });
});
regRef.on('value', function(snapshot){
  console.log('reg count listener');
});

app.post('/register', function(request, response) {
  var result={};
  var req = request.body;
  console.log(req);
  if(!req.name) {
    response.send({'result':'invalid input'});
    return;
  }
  var endpointParts=req.endpoint.split('/');
  var registrationId = endpointParts[endpointParts.length - 1];  
  req.regId = registrationId;
  var profileRef = profilesRef.child(req.name);

  broadcastAds();

  queueRef.once('value', function(snapshot){
    var queue = snapshot.val();
    profileRef.once('value', function(snapshot){
      var profile = snapshot.val();
      if(!profile) {
        queue.regCount += 1;
        req.token = queue.regCount;
        profileRef.set(req);
        queueRef.set(queue);
        result.token = queue.regCount;
        result.pass = queue.passCount;
        result.time = queue.avgTime;
        response.send({'result':result});
      } else{
        result.token = profile.token; 
        result.pass = queue.passCount;
        result.time = queue.avgTime;
        response.send({'result':result});
      }
    });
  });
});

app.post('/unregister', function(request, response) {
  var req = request.body;
  console.log(req);
  var endpointParts=req.endpoint.split('/');
  var registrationId = endpointParts[endpointParts.length - 1];  
  req.regId = registrationId;  
  queueRef.once('value', function(snapshot){
    var queue = snapshot.val();
    queue.passCount += 1;
    queueRef.set(queue);        
  });
  profilesRef.once('value', function(snapshot){
    var profiles = snapshot.val();
    delete profiles[req.name];
    profilesRef.set(profiles);
  });  
  response.send({'result':'success'});
});

app.post('/notify', function(request, response) {
  var message = new gcm.Message();
  message.addData('key1', 'msg1');
  sendnotifs(message);
});

app.post('/initqueue', function(request, response) {
  console.log('inside initqueue');
  var req = request.body;
  queueRef.once('value', function(snapshot){
    var queue = snapshot.val();
    queue.passCount = req.passCount;
    queue.regCount = req.regCount;
    queue.avgTime = req.avgTime;
    queueRef.set(queue);        
    response.send('updated');
    broadcast(queue);
  });
});

app.post('/exit', function(request, response) {
  queueRef.once('value', function(snapshot){
    var queue = snapshot.val();
    queue.passCount += 1;
    queueRef.set(queue);     
    broadcast(queue);
  });  
  response.send('updated');
  console.log('queue updated');
});

app.get('/token', function(request, response) {
  getQueueData()
  .then(function(count){
    response.send(''+count);
  });
});

var getQueueData = function(){
  var q = Q.defer();
  queueRef.once('value', function(snapshot){
    var queue = snapshot.val();
    q.resolve(queue.passCount);  
  });
  return q.promise;
};

var sendnotifs = function(message, regids){
  sender.send(message, { registrationTokens: regids }, function (err, res) {
    if(err) 
      console.error(err);
    else    
      console.log(res);
    console.log('notifications sent to '+regids);
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
