const express = require('express');
const http = require('http');
const app = express();
const server = http.createServer(app).listen(8080);
const { Blockchain, BlockchainAddress, Transaction, BlockbaseRecord } = require('./backend/blockchain');
var expressWs = require('express-ws')(app);
const io = require('socket.io')(server);
const ioClient = require('socket.io-client');
const fs = require('fs');
const { getIPAddress } = require('./backend/ipFinder.js');
const sha256 = require('./backend/sha256');

const ipList = ['ws://'+getIPAddress()+':8080', 'ws://192.168.0.153:8080']

let thisNode = {
  'type' : 'endpoint',
  'address' : getIPAddress(),
  'hashSignature' : sha256('192.168.0.154', Date.now())
}


let clients = [];

let nodes = [];

let blockchain;
let blockchainFetched;
let transactationAlreadyReceived = false;

app.use(express.static(__dirname+'/views'));

io.on('connection', (socket) => {

  socket.on('message', (msg) => {

    console.log('Client:', msg);
  });

  socket.on('client-connect', (token) => {
    //Create validation for connecting nodes

    clients[token.hashSignature] = token;

    console.log('Connected clients: ', token.hashSignature);

  });

  socket.on('transaction', (transaction) => {
    //Need to validate transaction before adding to blockchain
    if(!transactationAlreadyReceived){
      socket.broadcast.emit('transaction', transaction);
      transactationAlreadyReceived = true;
    }

    if(transactationAlreadyReceived){
      blockchain.createTransaction(new Transaction(transaction.fromAddress, transaction.toAddress, transaction.amount, transaction.data));
      transactationAlreadyReceived = false;
      console.log('Received new transaction:', transaction);
    }

  });

  socket.on('miningRequest', (miningAddrToken) =>{
    //need to validate miningAddr before allowing mining action;
    startMining(miningAddrToken)

    // if(clients.length > 1){

          // }
  });

  socket.on('seedBlockchain', (clientNode) => {
    //fetch most up to date blockchain from network


    socket.emit('blockchain',seedNodeList(blockchain));
  });



  socket.on('getBlockchain', (msg) =>{
    //Query all nodes for blockchain

    socket.emit('blockchain', blockchain);
    console.log('Sending client the blockchain');
  });

  socket.on('close', (token) => {

    clients[token.hashSignature] = null;
    console.log('Disconnected clients: ',token.hashSignature);

  });

});

//Init blockchain starting from local file
const initBlockchain = (tryOnceAgain=true) => {

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
      seedNodeList(blockchain);


    }else{
      blockchain = new Blockchain(blockchainFetched.chain, blockchainFetched.pendingTransactions, blockchainFetched.nodeAddresses);
      seedNodeList(blockchain);

      blockchainFetched = null;
    }


    console.log('Current blockchain:', blockchain);


    // console.log('This node:',blockchain.nodeAddresses[thisNode.hashSignature]);
  }, 4000);

};

const connectToPeerNetwork = () => {
  for(var i=0; i < ipList.length; i++){
    if(ipList[i] != thisNode.address){
      var peerConnection = ioClient(ipList);
    }
  }
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
  fs.exists('blockchain.json', function(exists){

        if(exists){
            console.log("Loading Blockchain Data from file");
            fs.readFile('blockchain.json', function readFileCallback(err, data){
              console.log('Reading from blockchain.json file...');
              let rawBlockchainFetched = JSON.parse(data);
              blockchainFetched = new Blockchain(rawBlockchainFetched.chain, rawBlockchainFetched.pendingTransactions, rawBlockchainFetched.nodeAddresses);
              blockchainFetched = seedNodeList(blockchainFetched);
            if (err){
                console.log(err);
            }


            });
        } else {
          console.log('Generating new blockchain')
            let newBlockchain = new Blockchain();
            newBlockchain = seedNodeList(newBlockchain);
            // seedNodeList(newBlockchain); //------------------------Have to find a better way to create nodes
            blockchain = newBlockchain;
            saveBlockchain(newBlockchain);
            console.log("file does not exist")
            return false;
        }


      });
}

const saveBlockchain = (blockchainReceived) => {
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

const startMining = (miningAddrToken) => {
  miningAddr = getBlockchainAddress(miningAddrToken);
  let waitingOutputOnce = true;


    miningSuccess = blockchain.minePendingTransactions(miningAddr);
    if(miningSuccess){
      console.log('Block mined: ' + blockchain.getLatestBlock().hash);
      console.log(miningAddr.address + ' mined ' + miningAddr.getBlocksMined() + ' blocks');
      console.log('\nBalance of '+miningAddr.address+' is '+ miningAddr.getBalance());

      var message =  'A new block has been mined by ' + miningAddr.hashSignature + '. Sending new blockchain version';
      socket.emit('miningApproved', blockchain)
      socket.broadcast.emit('message', message)
      socket.broadcast.emit('blockchain', blockchain);
      saveBlockchain(blockchain);
    }else{
      if(waitingOutputOnce){
        console.log('Waiting for other transactions to occur');
        socket.emit('needMoreTransact', 'Insufficient transactions to mine. Listening for incoming transactions');
      }

    }

}

const seedNodeList = (blockchain) =>  {
  //Seed the list of connected nodes

  // blockchain.addNodeAddress(thisNode);
  if(blockchain.nodeAddresses[thisNode.hashSignature] == undefined){
    blockchain.nodeAddresses[thisNode.hashSignature] = new BlockchainAddress(thisNode.address, thisNode.hashSignature, 0, 0);
  }else{
    console.log('This node address already exists:', thisNode.hashSignature);
  }
  console.log('This node:', blockchain.nodeAddresses[thisNode.hashSignature]);
  return blockchain;
}

const compareBlockchains = (storedBlockchain, receivedBlockchain=false) => {
  let longestBlockchain;

  if(receivedBlockchain){
    if(receivedBlockchain.isChainValid()){
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
  // connectToPeerNetwork();
}, 1500)


console.log('Starting server on 8080... at http://localhost:8080/');
