"use strict";

var Lcd = require('lcd'),
  https = require('https'),
  Gpio = require('onoff').Gpio,
  /*raspi = require('raspi'),
  RotaryEncoder = require('raspi-rotary-encoder').RotaryEncoder*/
  rotaryEncoder = require('onoff-rotary'),
  myEncoder = rotaryEncoder(20,21),
  /*rpigpio = require('rpi-gpio'),
  raspi = require('raspi-io'),
  five = require('johnny-five'),
  board = new five.Board({
    io: new raspi()
  }),*/
  server = new(require('bluetooth-serial-port')).BluetoothSerialPortServer();

var CHANNEL = 10;
var UUID = '00001101-0000-1000-8000-00805f9b34fb';

/*server.listen(function(clientAddress) {
  console.log('Client :'+clientAddress+ 'connected');
  server.on('data', function(buffer) {
    console.log('received data from client '+buffer);

    console.log('sending data to client');
    server.write(new Buffer('...'), function(err, bytesWritten){
      if(err) {
        console.log(err);
      } else {
        console.log('send '+bytesWritten+' to the client');
      }
    });
  });
}, function(error){
  console.error('something went wrong', error);
}, {uuid: UUID, channel: CHANNEL});*/

//board.on('ready', function(){
//  console.log('ble ready');
//});

var httpOptions = {
  hostname: 'smartjekhome.herokuapp.com',
  port: 443,
  path: '/',
  method: ''
};

var lcd = new Lcd({rs: 14, e: 15, data: [18, 17, 23, 24], cols: 16, rows: 2});
lcd.on('ready', function () {
  lcd.setCursor(0, 0);
  lcd.print('SmartJekHome', function (err) {
    if (err) {
      throw err;
    }
  });
});

var COUNTER = 9;
var button = new Gpio(26, 'in', 'both');
button.watch(function(err, value){
  //console.log(value);
  if(value==1){
    console.log('make order');
  }
});
myEncoder.on('rotation', direction => {
  if(direction >0) {
    //console.log('encoder rotated right');
    COUNTER++;
  } else {
    //console.log('encoder rotated left');
    COUNTER--;
  }
  if(COUNTER<0){
    COUNTER=9;
  }
  if(COUNTER>9){
    COUNTER=0;
  }
  printCount();
});

var printCount=function(){
   lcd.clear();
   lcd.setCursor(0,0);
   lcd.print(COUNTER, function(err){
     if(err){
       console.log('error in printing ', err);
     }
   });
};

var showData = function(){
    lcd.setCursor(10, 1);
    lcd.noAutoscroll();
    lcd.print('1', function (err) {
        if(err) {
            throw err;
        }
    });
};

function exit() {
  process.exit();
}

process.on('SIGINT', function () {
  lcd.close();
  button.unexport();
  process.exit();
});

/*raspi.init(function(){
  var encoder = new RotaryEncoder({
    pins: {a:'GPIO20', b:'GPIO21'},
    pullResistors: {a:"up",b:"up"}

  });

  encoder.addListener('change', function(evt) {
    console.log('Count', evt.value);
  })

});*/