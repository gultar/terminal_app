const express = require('express');
const http = require('http');
const app = express();
const port = 8080
const server = http.createServer(app).listen(port);

const { Blockchain, BlockchainAddress, Transaction, BlockbaseRecord } = require('./backend/blockchain');
var expressWs = require('express-ws')(app);
const io = require('socket.io-client');
const ioServer = require('socket.io')(server, {'pingInterval': 2000, 'pingTimeout': 5000});
// const P2P = require('socket.io-p2p');
// const p2p = require('socket.io-p2p-server').Server;
const fs = require('fs');
const { getIPAddress } = require('./backend/ipFinder.js');
const sha256 = require('./backend/sha256');

// const ipList = ['ws://'+getIPAddress()+':8080', 'ws://192.168.0.153:8080']
const ipList = ['http://'+getIPAddress()+':'+port, 'http://192.168.0.153:8080', 'http://192.168.0.154:8080', 'http://192.168.0.153:8081']

let thisNode = {
  'type' : 'endpoint',
  'address' : ipList[0],
  'hashSignature' : sha256(getIPAddress(), Date.now())
}


let clients = [];

let peers = [];

let minersOnHold = [];

let blockchain;
let blockchainFetched;


let blockchainBusy = false;


app.use(express.static(__dirname+'/views'));

app.on('/', () => {
  res.send(getIPAddress());
})



ioServer.on('connection', (socket) => {

  // socket.broadcast.emit('message', 'this is node address ' + getIPAddress());

  socket.on('message', (msg) => {

    console.log('Client:', msg);
  });

  socket.on('client-connect', (token) => {
    //Create validation for connecting nodes

    clients[token.hashSignature] = token;
    socket.emit('message', 'You are now connected to ' + getIPAddress());
    console.log('Connected clients: ', token.hashSignature);

  });

  socket.on('transaction', (transaction) => {
    //Need to validate transaction before adding to blockchain
    // if(!transactationAlreadyReceived){
    //   sendEventToAllPeers('transaction', transaction);
    //
    //   transactationAlreadyReceived = true;
    // }
    if(blockchain != undefined){
      if(!blockchainBusy){
        let transactionObj = new Transaction(transaction.fromAddress, transaction.toAddress, transaction.amount, transaction.data);
        sendEventToAllPeers('transaction',transactionObj)
        blockchain.createTransaction(transactionObj);
        transactationAlreadyReceived = false;
        console.log('Received new transaction:', transaction);
      }else{
        socket.emit('nodeBusy', true);
      }
    }


  });

  socket.on('miningRequest', (miningAddrToken) =>{
    //need to validate miningAddr before allowing mining action;
    if(!blockchainBusy && blockchain != undefined){

      startMining(miningAddrToken);

    }

  });

  socket.on('miningApproved', function(updatedBlockchain){
    var latestBlock = getLatestBlock(updatedBlockchain);

    sendEventToAllPeers('Latest Block Hash:', latestBlock.hash);
    blockchain = updatedBlockchain;
    sendEventToAllPeers('Block mined: ' + latestBlock.hash + " by " + miningAddr.address);
  });

  socket.on('seedBlockchain', (clientToken) => {
    //fetch most up to date blockchain from network
    socket.emit('seedingNodes',seedNodeList(blockchain, clientToken));
  });

  socket.on('seedingNodes', (node) =>{
    blockchain.nodeAddresses.push(node);
    console.log('Seeding the blockchain with this address:', node);
  })

  socket.on('peerConnect', (miningAddrToken) => {
    // connectToPeerNetwork();

    ioServer.emit('message', miningAddrToken.address + " has sent a mining request");
    sendEventToAllPeers('seedingNodes', thisNode);
    sendEventToAllPeers('transaction', new Transaction(thisNode.address, peers[0].io.opts.hostname, 0, thisNode));
  });



  socket.on('getBlockchain', (msg) =>{
    //Query all nodes for blockchain
    socket.emit('blockchain', blockchain);
    console.log('Sending client the blockchain');

  });

  socket.on('blockchain', (blockchainReceived) => {
    blockchain = compareBlockchains(blockchain, blockchainReceived);
    console.log('Received blockchain from node. Comparing it!');
  })

  socket.on('close', (token) => {

    clients[token.hashSignature] = null;
    console.log('Disconnected clients: ',token.hashSignature);

  });


});

const sendEventToAllPeers = (eventType, data) => {
  if(peers.length > 0){
    for(var i=0; i<peers.length; i++){
      peers[i].emit(eventType, data);
    }
  }

}


//Init blockchain starting from local file
const initBlockchain = (tryOnceAgain=true) => {
  //flag to avoid crashes if a transaction is sent while loading
  blockchainBusy = true;

  console.log('Initiating blockchain');
  blockchainFetched = loadBlockchainFromServer()


  setTimeout(() => {

    if(!blockchainFetched){
      console.log('No blockchain is available');
      setTimeout(() => {

        if(tryOnceAgain){
          console.log('Trying to load blockchain again');
          return initBlockchain(false);
        }

      })
      blockchain = new Blockchain();
      seedNodeList(blockchain, thisNode);


    }else{
      blockchain = new Blockchain(blockchainFetched.chain, blockchainFetched.pendingTransactions, blockchainFetched.nodeAddresses);
      seedNodeList(blockchain, thisNode);

      blockchainFetched = null;
    }


    // console.log('Current blockchain:', blockchain);


    // console.log('This node:',blockchain.nodeAddresses[thisNode.hashSignature]);
    blockchainBusy = false;
  }, 4000);


};

const connectToPeerNetwork = () => {
  let peerConnections = [];

  for(var i=0; i < ipList.length; i++){

    if(ipList[i] != "http://"+thisNode.address+":8080"){
      var peerSocket = io(ipList[i]);

      peerConnections.push(peerSocket);

      peerSocket.on('disconnect', () =>{
        console.log('connection with peer dropped');
        peerSocket.emit('close', thisNode);

      })

      peerSocket.on('connect', () =>{
        console.log('connection to node established');

        peerSocket.emit('client-connect', thisNode);
        peerSocket.emit('blockchain', blockchain);


      });

      // peerSocket.on('seedingNodes', (node) =>{
      //   blockchain.nodeAddresses.push(node);
      //   console.log('Seeding the blockchain with this address:', node);
      // })

    }
  }

  return peerConnections;
};

const getBlockchainAddress = (addressToken) => {
  if(blockchain !== undefined){
    let hash = addressToken.hashSignature;

    // console.log('Address token:', addressToken);
    // console.log('Node addresses:', blockchain.nodeAddresses);
    if(blockchain.nodeAddresses[hash] === undefined){
      blockchain.nodeAddresses[hash] = new BlockchainAddress(addressToken.address, addressToken.hashSignature);

    }

    return blockchain.nodeAddresses[hash];


  }

}

const loadBlockchainFromServer = () => {

  //flag to avoid crashes if a transaction is sent while loading
  blockchainBusy = true;

  fs.exists('blockchain.json', function(exists){

        if(exists){
            console.log("Loading Blockchain Data from file");
            fs.readFile('blockchain.json', function readFileCallback(err, data){
              console.log('Reading from blockchain.json file...');
              let rawBlockchainFetched = JSON.parse(data);
              blockchainFetched = new Blockchain(rawBlockchainFetched.chain, rawBlockchainFetched.pendingTransactions, rawBlockchainFetched.nodeAddresses);
              blockchainFetched = seedNodeList(blockchainFetched, thisNode);

            if (err){
                console.log(err);
            }

            blockchainBusy = false
            });
        } else {
          console.log('Generating new blockchain')
            let newBlockchain = new Blockchain();
            newBlockchain = seedNodeList(newBlockchain, thisNode);
            // seedNodeList(newBlockchain); //------------------------Have to find a better way to create nodes
            blockchain = newBlockchain;
            saveBlockchain(newBlockchain);
            console.log("file does not exist")

            blockchainBusy = false;
            return false;
        }


      });
}

const saveBlockchain = (blockchainReceived) => {
  //flag to avoid crashes if a transaction is sent while loading
  blockchainBusy = true;

  fs.exists('blockchain.json', function(exists){
      if(exists){
          console.log("Saving Blockchain data to existing File");
          fs.readFile('blockchain.json', function readFileCallback(err, data){
            console.log('Reading blockchain.json file...');
            if (err){
                console.log(err);
            }

            let blockchainFromFile = JSON.parse(data);
            blockchainFromFile = new Blockchain(blockchainFromFile.chain, blockchainFromFile.pendingTransactions, blockchainFromFile.nodeAddresses);
            blockchain = compareBlockchains(blockchainFromFile, blockchainReceived);

            let json = JSON.stringify(blockchain);

            if(json != undefined){
              console.log('Writing to file...');
              fs.writeFile('blockchain.json', json);
            }
            blockchainBusy = false
            });

      } else {
          console.log("Creating new Blockchain file and saving to it")
          let json = JSON.stringify(blockchainReceived);
          if(json != undefined){
            fs.writeFile('blockchain.json', json);
          }
          blockchainBusy = false;
      }


      });
}

const startMining = (miningAddrToken) => {

  blockchainBusy = true;

  miningAddr = getBlockchainAddress(miningAddrToken);
  let waitingOutputOnce = true;

    miningSuccess = blockchain.minePendingTransactions(miningAddr);

    if(miningSuccess){

      console.log('Block mined: ' + blockchain.getLatestBlock().hash);
      console.log(miningAddr.address + ' mined ' + miningAddr.getBlocksMined() + ' blocks');
      console.log('\nBalance of '+miningAddr.address+' is '+ miningAddr.getBalance());

      var message =  'A new block has been mined by ' + miningAddr.hashSignature + '. Sending new blockchain version';
      ioServer.emit('miningApproved', blockchain);
      ioServer.emit('message', message);
      sendEventToAllPeers('message', message);
      sendEventToAllPeers('blockchain', blockchain);
      saveBlockchain(blockchain);
      blockchainBusy = false;


    }else{
      // if(waitingOutputOnce){
      //   console.log('Waiting for other transactions to occur');
      //   // ioServer.emit('needMoreTransact', 'Insufficient transactions to mine. Listening for incoming transactions');
      //   sendEventToAllPeers('message', miningAddr.address+' has Insufficient transactions to mine. Listening for incoming transactions');
      // }

    }



}

const seedNodeList = (blockchain, token) =>  {
  //Seed the list of connected nodes
  var returnValue;
  // blockchain.addNodeAddress(thisNode);
  if(blockchain){
    if(blockchain.nodeAddresses[token.hashSignature] == undefined){
      blockchain.nodeAddresses[token.hashSignature] = new BlockchainAddress(token.address, token.hashSignature, 0, 0);


    }else{
      console.log('This node address already exists:', token.hashSignature);

    }
    // console.log('This node:', blockchain.nodeAddresses[thisNode.hashSignature]);
    return blockchain.nodeAddresses[token.hashSignature];
  }

}

const compareBlockchains = (storedBlockchain, receivedBlockchain=false) => {
  let longestBlockchain;

  if(receivedBlockchain && receivedBlockchain instanceof Blockchain){ //Does it exist and is it an instance of Blockchain or an object?
    if(receivedBlockchain.isChainValid()){ //Is the chain valid?
      if(storedBlockchain.chain.length > receivedBlockchain.chain.length){ //Which chain is the longest?

              longestBlockchain = storedBlockchain;


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
    }
    else{
      return storedBlockchain;
    }


  }else{
    return storedBlockchain;
  }

}

setTimeout(() =>{ //A little delay to let websocket open
  initBlockchain();
  console.log('Node address:',thisNode.address);
  peers = connectToPeerNetwork();

}, 1500)


console.log('Starting server on 8080... at http://localhost:8080/');
