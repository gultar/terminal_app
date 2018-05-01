let WebSocket = require('ws');
let peers = {};
let peersid = ['raspiOne', 'raspiTwo'];
let peerAddr = ['ws://169.254.139.53:8080', 'ws://169.254.139.53:8081'];



module.exports = function initP2PServer(){
  let WebSocketServer = require('ws').Server,
      wss = new WebSocketServer({ port: 8080 });

  wss.on('connection', function connection(ws) {
    console.log('WS:',ws.connection);
    ws.on('message', function incoming(message) {
      console.log('received: %s', message);
    });

  ws.send('something');
  });

}



function peerConnect(i){
    return function(){
        peers[peersid[i]] = new WebSocket(peerAddr[i]);
        peers[peersid[i]].on('open', function(){
            peers[peersid[i]].send(i);
        });

		peers[peersid[i]].on('message', function(data){
			console.log('Received', data);
		});
    }
}

module.exports = function pingAllPeers(){
  for(var i in peersid){
      peers[peersid[i]] = peerConnect(i);
  }

  for(var j in peersid){
      peers[peersid[j]]();
  }
}
