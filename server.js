
const express = require('express');
const fs = require('fs');
const find = require('find-process');
const { Blockchain, BlockchainAddress, Transaction, BlockbaseRecord } = require('./backend/blockchain');
const bodyParser = require('body-parser');
const app = express();
const router = express.Router();
const axios = require('axios');
const JSONdb = require('simple-json-db');
//const { initP2PServer, pingAllPeers } = require('./p2p-server');
const WebSocket = require('ws');
const { getIPAddress } = require('./backend/ipFinder.js');
const http = require('http');

let nodeAddresses = [getIPAddress(), '192.168.0.153', '169.254.105.109', '169.254.139.53', '192.168.0.112', '192.168.1.75', '192.168.1.68'];
let connectedNodes = [];

let peers = {};
let peersid = ['raspiOne', 'raspiTwo'];
let peerAddr = ['ws://169.254.139.53:8080', 'ws://169.254.139.53:8081'];
let nodeBlockchainList = [];
const PORT = 5000;

var allowCrossDomain = function(req, res, next) {
    res.header('Access-Control-Allow-Origin', "*");
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
}


app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
app.use(allowCrossDomain);

//Request blockchain from peers


//fetch blockchain from file
let blockchain;
let blockchainFetched;

const initBlockchain = () => {
  //const db = new JSONdb('./blockchain.json');

  console.log('Initiating blockchain');
  blockchainFetched = loadBlockchainFromServer()

  setTimeout(() => {

    if(!blockchainFetched){
      console.log('No blockchain is available');
      blockchain = new Blockchain();
      blockchain.addNodeAddress()

    }else{
      blockchain = new Blockchain(blockchainFetched.chain, blockchainFetched.pendingTransactions, blockchainFetched.nodeAddresses);
      blockchainFetched = null;
    }

  }, 4000);

};

const startServer = () => {
  console.log('Listening on port 5000');
  const server = app.listen(PORT);
  app.use(express.static(__dirname+'/views'));

  app.get('/', function(req, res, next) {

      res.render('index', { data: JSON.stringify(blockchain) });
  });

  app.get('/blockchain', function(req, res, next){
    res.json(JSON.stringify(blockchain));
  });

  app.post('/blockchain', function(req, res){

    if(typeof req.body.blockchain !== 'undefined'){
      let rawBlockchain = JSON.parse(req.body.blockchain);
      var receivedBlockchain = new Blockchain(rawBlockchain.chain, rawBlockchain.pendingTransactions);
      rawBlockchain = null;
      blockchain = compareBlockchains(blockchain, receivedBlockchain);
      console.log('A node sent a copy of the blockchain');
      saveBlockchain(blockchain);

    }else{
      console.log('Blockchain received from node is undefined');
    }

  });

  app.post('/transaction', function(req, res){
    if(typeof blockchain !== 'undefined'){
      let transReceived = JSON.parse(req.body.transaction);
      blockchain.createTransaction( new Transaction(transReceived.fromAddress, transReceived.toAddress, transReceived.amount, transReceived.data))
      transReceived = null;
      saveBlockchain(blockchain);
    }else{
      res.status(400);
      res.send('Transaction not loaded or loading...');
    }

  })

  app.post('/mine', function(req, res){
    if(connectedNodes.length > 0){
      let rawMiningAddr = JSON.parse(req.body.address);

      miningAddr = new BlockchainAddress(rawMiningAddr.address, rawMiningAddr.blocksMined, rawMiningAddr.balance);
      console.log(miningAddr);
      var miningSuccess;
      var waitingOutputOnce = true;

      if(typeof blockchain != 'undefined'){
        console.log('Block:', blockchain);
        miningSuccess = blockchain.minePendingTransactions(miningAddr);
        if(miningSuccess){
          res.send(JSON.stringify(blockchain));
          console.log('Block mined: ' + blockchain.getLatestBlock().hash);
          console.log(miningAddr.address + ' mined ' + miningAddr.getBlocksMined() + ' blocks');
          console.log('\nBalance of '+miningAddr.address+' is '+ miningAddr.getBalance());
          saveBlockchain(blockchain);
          return true;
        }else{
          if(waitingOutputOnce){
            console.log('Waiting for other transactions to occur');
            waitingOutputOnce = false;
            res.status(400);
            res.send('Waiting for other transactions to occur');
          }

        }
    }

  }else{
    console.log('ERROR: Need at least one other node to mine');
    res.status(400);
    res.send('ERROR: Need at least one other node to mine');
  }



  })

  app.on('uncaughtException', function (exception) {
    console.log(exception); // to see your exception details in the console
    // if you are on production, maybe you can send the exception details to your
    // email as well ?
  });

}

let initP2PServer = (blockchain) => {


  app.use(express.static(__dirname+'/views'));

  app.get('/', function(req, res, next) {

      res.render('index', { data: JSON.stringify(blockchain) });
  });

  app.get('/blockchain', function(req, res, next){
    res.json(JSON.stringify(blockchain));
  });

  const server = http.createServer(app);
  const wss = new WebSocket.Server({ server });

  wss.on('connection', function connection(ws, req) {
    const location = url.parse(req.url, true);
    const ip = req.connection.remoteAddress;
    // You might use location.query.access_token to authenticate or share sessions
    // or req.headers.cookie (see http://stackoverflow.com/a/16395220/151312)

    wss.broadcast = function broadcast(data) {
        wss.clients.forEach(function each(client) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(blockchain.chain.length,ip);
          }
        });
      };
    wss.broadcast(JSON.stringify(blockchain));
    ws.on('message', function incoming(message) {
      console.log('received: %s', message);
    });



  });

  server.listen(8080, function listening() {
    console.log('Listening on %d', server.address().port);
  });

  wss.on('error', function(err){
    console.log('ERROR:', err);
  });
}

process.on('uncaughtException', (error) => {
  if (error.code === 'EADDRINUSE') {
    find('port', PORT)
      .then((list) => {
        const blockingApplication = list[0]
        if (blockingApplication) {
          console.log(`Port "${PORT}" is blocked by "${blockingApplication.name}".`)
          console.log('Shutting down blocking application PID...', blockingApplication.pid)
          process.kill(blockingApplication.pid)
        }
      })
  }
})

loadBlockchainFromServer = () => {
  fs.exists('blockchain.json', function(exists){

        if(exists){
            console.log("Loading Blockchain Data from file");
            fs.readFile('blockchain.json', function readFileCallback(err, data){
              console.log('Reading from blockchain.json file...');
              blockchainFetched = JSON.parse(data);
            if (err){
                console.log(err);
            }


            });
        } else {
          console.log('Generating new blockchain')
            let newBlockchain = new Blockchain();
            seedNodeList(newBlockchain);
            blockchain = newBlockchain;
            saveBlockchain(newBlockchain);
            console.log("file does not exist")
            return false;
        }
      });
}

seedNodeList = (blockchain) => {
  for(var i=0; i < nodeAddresses.length; i++){
    blockchain.addNodeAddress(nodeAddresses[i]);
  }
}

saveBlockchain = (blockchainReceived) => {
  fs.exists('blockchain.json', function(exists){
      if(exists){
          console.log("Saving Blockchain data to existing File");
          fs.readFile('blockchain.json', function readFileCallback(err, data){
            console.log('Reading blockchain.json file...');
            if (err){
                console.log(err);
            }

            let blockchainFromFile = JSON.parse(data);
            blockchainFromFile = new Blockchain(blockchainFromFile.chain, blockchainFromFile.pendingTransactions, blockchainFromFile.blockbase);
            blockchain = compareBlockchains(blockchainFromFile, blockchainReceived);
            sendBlockchainToAllNodes(blockchain);
            let json = JSON.stringify(blockchain);

            if(json != undefined){
              console.log('Writing to file...');
              fs.writeFile('blockchain.json', json);
            }

            });
      } else {
          console.log("Creating new Blockchain file and saving to it")
          let json = JSON.stringify(blockchainReceived);
          if(json != undefined){
            fs.writeFile('blockchain.json', json);
          }

      }


      });
}


function peerConnect(i){
    return function(){
        peers[peersid[i]] = new WebSocket(peerAddr[i]);
        peers[peersid[i]].on('open', function(){
            console.log('Sending: ', peerAddr);
            peers[peersid[i]].send(JSON.stringify(blockchainFromNode)); //
        });

		peers[peersid[i]].on('message', function(data){
			console.log('Received', data.value);
		});
    }
}

function pingAllPeers(){
  for(var i in peersid){
      peers[peersid[i]] = peerConnect(i);
  }

  for(var j in peersid){
      peers[peersid[j]]();
  }
}


let fetchFromDistantNode = (address) => {

  let rawReceivedBlockchain = false;
  var body = '';
  http.get({
      host: address,
      path: '/blockchain',
      port: 5000
  }, function(resp){


     resp.on('data', function(chunk){
         body += chunk;
     });

     resp.on('end', function(){

       rawReceivedBlockchain = JSON.parse(body);
       if(typeof rawReceivedBlockchain !== 'undefined'){
         rawReceivedBlockchain = JSON.parse(rawReceivedBlockchain);
         let receivedBlockchain = new Blockchain(rawReceivedBlockchain.chain, rawReceivedBlockchain.pendingTransactions, rawReceivedBlockchain.blockbase);
         nodeBlockchainList.push(receivedBlockchain);
         console.log('Received a blockchain from ', address);
       }else{
         console.log('Received an undefined blockchain');
       }

     });
  }).on('error', function(err){
      console.log('error ' + err)
  })


}

let queryAllNodesForBlockchain = (blockchainFromFile) => {
  let longestBlockchain = blockchainFromFile;
  console.log('Querying all nodes for blockchain...', nodeAddresses);
  for(let i=0; i < nodeAddresses.length; i++){

    if(nodeAddresses[i] !== getIPAddress()){
      console.log('Fetching from:', nodeAddresses[i])
      fetchFromDistantNode(nodeAddresses[i], longestBlockchain);

      setTimeout(function(){
        if(nodeBlockchainList[i].isChainValid()){
          longestBlockchain = compareBlockchains(longestBlockchain, nodeBlockchainList[i]);
          connectedNodes.push(nodeAddresses[i]);
        }else{
          //invalid blockchain
          console.log('Address: ' + nodeAddresses[i] + ' has an invalid blockchain');
        }
      },4000)

    }

  }
  blockchain = longestBlockchain;
}

let sendBlockchainToAllNodes = (blockchainToSend) => {
  for(let i=0; i < nodeAddresses.length; i++){

    if(blockchain.isChainValid()){
      sendDataToNode(nodeAddresses[i]+':5000/blockchain', blockchainToSend);
    }else{
      //invalid blockchain
      console.log('Address: ' + nodeAddresses[i] + ' has an invalid blockchain');
    }

  }
}

let broadcastNewBlock = (block) => {

}
//Modify it whether it's a block or the whole blockchain
let sendDataToNode = (address, path, data) => {

  var options = {
    hostname: address,
    port: 5000,
    path: path,
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    }
  };
  var req = http.request(options, function(res) {
    console.log('Status: ' + res.statusCode);
    console.log('Headers: ' + JSON.stringify(res.headers));
    res.setEncoding('utf8');
    res.on('data', function (body) {
      // console.log('Body: ' + body);
    });
  });
  req.on('error', function(e) {
    //console.log('problem with request: ' + e.message);
  });
  // write data to request body
  req.write(JSON.stringify(data));
  req.end();

}

const compareBlockchains = (storedBlockchain, receivedBlockchain=false) => {
  let longestBlockchain;

  if(receivedBlockchain){
    if(storedBlockchain.chain.length > receivedBlockchain.chain.length){
        if(storedBlockchain.pendingTransactions.length > receivedBlockchain.pendingTransactions.length){

            longestBlockchain = storedBlockchain;
        }
        else{
          longestBlockchain = receivedBlockchain;
        }
    }
    else if(storedBlockchain.chain.length == receivedBlockchain.chain.length){ //Same nb of blocks
        let lastStoredBlock = storedBlockchain.getLatestBlock();
        let lastReceivedBlock = receivedBlockchain.getLatestBlock();
        if(lastStoredBlock.hash === lastReceivedBlock.hash){ //Same blocks - it's fine
          longestBlockchain = storedBlockchain;
        }else{                                              //Different blocks - Find the lastest and modify it
          if(lastStoredBlock.timestamp > lastReceivedBlock.timestamp){
            longestChain = receivedBlockchain;
            lastStoredBlock.previousHash = lastReceivedBlock.hash;
            receivedBlockchain.addBlock(lastStoredBlock);

          }else{
            longestChain = storedBlockchain;
            lastReceivedBlock.previousHash = lastStoredBlock.hash;
            receivedBlockchain.addBlock(lastReceivedBlock);
          }
        }
    }
    else{
      longestBlockchain = receivedBlockchain;
    }

    return longestBlockchain;

  }else{
    return storedBlockchain;
  }

}

initBlockchain();
startServer();
setTimeout(
  function(){
    queryAllNodesForBlockchain(blockchain);
    console.log('Inititating p2p connections');
    initP2PServer(blockchain);
    pingAllPeers();
  }
, 6000);
