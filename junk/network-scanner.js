var net = require('net'); // Required to create socket connections

var ip = 254; //IP address to start with on a C class network

function checkConnect () {
  ip--;
  var thisIP = '192.168.0.' + ip; //concatenate to a real IP address

  var S = new net.Socket();
  S.connect(80, thisIP);

  if(ip > 0) { checkConnect(); }

  S.on('connect', function () { console.log('port 80 found on ' + thisIP); });
  S.on('error', function () { console.log('no such port on ' + thisIP); });
  S.end();
}

checkConnect();