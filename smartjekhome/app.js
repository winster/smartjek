"use strict";

var Lcd = require('lcd'),
  https = require('https'),
  Gpio = require('onoff').Gpio,
  /*raspi = require('raspi'),
  RotaryEncoder = require('raspi-rotary-encoder').RotaryEncoder*/
  rotaryEncoder = require('onoff-rotary'),
  myEncoder = rotaryEncoder(20,21),
  rpigpio = require('rpi-gpio');
    
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
