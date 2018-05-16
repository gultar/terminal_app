const express = require('express');
const http = require('http');
const app = express();
const port = 8080
const server = http.createServer(app).listen(port);
const sha256 = require('./backend/sha256');
const { Blockchain, BlockchainAddress, Transaction, BlockbaseRecord } = require('./backend/blockchain');
var expressWs = require('express-ws')(app);
const io = require('socket.io-client');
const ioServer = require('socket.io')(server, {'pingInterval': 2000, 'pingTimeout': 5000, 'forceNew':false });
// const P2P = require('socket.io-p2p');
// const p2p = require('socket.io-p2p-server').Server;
const fs = require('fs');
const { getIPAddress } = require('./backend/ipFinder.js');

// const blockBase = require('json')
// const ipList = ['ws://'+getIPAddress()+':8080', 'ws://192.168.0.153:8080']
const ipList = ['http://'+getIPAddress()+':'+port, 'http://192.168.0.153:8080', 'http://192.168.0.154:8080',
				'http://192.168.0.153:8081', 'http://192.168.0.154:8081', 'http://192.168.0.154:8082', 'http://192.168.0.153:8082'];

let thisNode = {
  'type' : 'node',
  'address' : ipList[0],
  'hashSignature' : sha256(ipList[0], Date.now())
}

const { encrypt, decrypt } = require('./backend/encryption.js')



let clients = [];

let peers = [];

let minersOnHold = [];

let blockchain;
let blockchainFetched;

let sendTrials = 0;

// let blockchainBusy = false;


app.use(express.static(__dirname+'/views'));

app.on('/', () => {
  res.send(getIPAddress());
})


ioServer.on('connection', (socket) => {

  // socket.broadcast.emit('message', 'this is node address ' + getIPAddress());

  socket.on('message', (msg) => {
    console.log('Client:', msg);
  });

	socket.on('error', (exception)=>{
		console.log('Error:',exception);
		socket.destroy();
	})


  socket.on('client-connect', (token) => {
    //Create validation for connecting nodes
		if(token != undefined){
			clients[token.hashSignature] = token;
	    console.log('Connected client hash: ', token.hashSignature);
	    console.log('At address:', token.address);
	    socket.emit('message', 'You are now connected to ' + thisNode.address);
		}


		// if(token.type == 'endpointClient'){
		// 	setInterval(()=>{
		// 		socket.emit('message', 'ping');
		// 	}, 10000)
		// }


  });

  socket.on('triggerSave', ()=>{
		saveBlockchain(blockchain);
	})
	//
  // });
	//
  // socket.on('transactionApproved', (approved, transact) => {
	// 	if(approved && transact != undefined){
	// 		console.log('Sending approved transaction');
	//     socket.emit('message', 'transaction has been approved' + transact);
	//     socket.emit('transaction', transact);
	//     sendEventToAllPeers('transactionOffer',transactionObj, thisNode);
	// 	}else{
	// 		console.log('Transaction not approved. The node might be busy...')
	// 	}
	//
  // });
	socket.on('distributedTransaction', (transaction, fromNodeToken) => {
		///////////////////////////////////////////////////////////
		//Need to validate transaction everytime it is received
		///////////////////////////////////////////////////////////
		if(blockchain != undefined){
			if(transaction != undefined && fromNodeToken != undefined){
				console.log('Peer '+fromNodeToken.address+' has sent a new transction.');
				console.log(transaction);
				var transactionObj = new Transaction(transaction.fromAddress, transaction.toAddress, transaction.amount, transaction.data);

				blockchain.createTransaction(transactionObj);
			}
		}
	})


  socket.on('transaction', (transaction, fromNodeToken) => {
		///////////////////////////////////////////////////////////
		//Need to validate transaction before adding to blockchain
		///////////////////////////////////////////////////////////
		if(blockchain != undefined){
			if(transaction != undefined && fromNodeToken != undefined){
				if(fromNodeToken.address != thisNode.address){
					var transactionObj = new Transaction(transaction.fromAddress, transaction.toAddress, transaction.amount, transaction.data);

					blockchain.createTransaction(transactionObj);
					sendEventToAllPeers('distributedTransaction', transactionObj, fromNodeToken);
					console.log('Received new transaction:', transactionObj);
					transactionObj = null;
				}

			}else{
				socket.emit('message', 'ERROR: Either your transaction or your token is unreadable. Try again.')
			}
		}else{
			socket.emit('message', 'Node is unavailable for receiving the transaction');
		}


  });

  socket.on('miningRequest', (miningAddrToken) =>{
		///////////////////////////////////////////////////////////
    //need to validate miningAddr before allowing mining action;
		///////////////////////////////////////////////////////////
    if(blockchain != undefined){

      var hasMinedABlock = startMining(miningAddrToken);

			if(hasMinedABlock){
				saveBlockchain(blockchain);
			}


    }
  });

  socket.on('miningApproved', function(updatedBlockchain){

    var latestBlock = getLatestBlock(updatedBlockchain);
    sendEventToAllPeers('message','Latest Block Hash:'+latestBlock.hash);
    blockchain = compareBlockchains(blockchain, updatedBlockchain);
    sendEventToAllPeers('message','Block mined: ' + latestBlock.hash + " by " + miningAddr.address);
		console.log('BLOCKCHAIN:', blockchain);


  });

	socket.on('syncBlockchain', (blockchainToSync=false)=>{
		blockchain = compareBlockchains(blockchain, blockchainToSync);
		ioServer.emit('blockchain', blockchain);
	})

  socket.on('seedBlockchain', (clientToken) => {
    //fetch most up to date blockchain from network
    socket.emit('seedingNodes',seedNodeList(blockchain, clientToken));
  });

  socket.on('seedingNodes', (node) =>{
    blockchain.nodeAddresses.push(node);
    console.log('Seeding the blockchain with this address:', node);
  })

	//------------------TEST EVENT-------------------------//
  socket.on('peerConnect', (miningAddrToken) => {
    // connectToPeerNetwork();
    ioServer.emit('message', miningAddrToken.address + " has sent a blockchain");
    sendEventToAllPeers('blockchain', blockchain);
    sendEventToAllPeers('getBlockchain', miningAddrToken.address + ' has requested a copy of the current blockchain');
    // sendEventToAllPeers('seedingNodes', thisNode);
    // sendEventToAllPeers('transactionOffer', new Transaction(thisNode.address, peers[0].io.opts.hostname, 0, thisNode), miningAddrToken);
  });

  socket.on('queryForBlockchain', (queryingNodeToken) =>{

		if(queryingNodeToken != undefined){
			syncBlockchain();
		}else{
			socket.emit('message', 'ERROR: Invalid token sent');
		}

  })

  socket.on('getBlockchain', (token) =>{
    //Query all nodes for blockchain
		if(blockchain != undefined){
			if(token.type == 'endpointClient'){
				var msg = token.address + ' has requested a copy of the blockchain!';
		    console.log(msg);
				sendEventToAllPeers('message', msg);
		    ioServer.emit('blockchain', blockchain);
			}else if(token.type == 'node'){
				socket.emit('syncBlockchain', blockchain);
			}else{
				socket.emit('message', 'ERROR: Invalid token sent');
			}
		}else{
			socket.emit('message', 'Blockchain is unavailable on node. It might be loading or saving.');
		}


  });

  socket.on('blockchain', (blockchainReceived) => {
    blockchain = compareBlockchains(blockchain, blockchainReceived);
    console.log('Received blockchain from node. Comparing it!');
  })

	socket.on('disconnect', () =>{
		// socket.removeAllListeners('message');
		// socket.removeAllListeners('disconnect');
		// ioServer.removeAllListeners('connection');

	})


  socket.on('close', (token) => {

    clients[token.hashSignature] = null;

    console.log('Disconnected clients: ',token.hashSignature);

  });


});

ioServer.on('disconnection', (socket) =>{
	console.log('Lost connection with client');

	socket.destroy();
})

const sendEventToAllPeers = (eventType, data, moreData=false ) => {
  if(peers.length > 0){
    for(var i=0; i<peers.length; i++){
      if(!moreData){
        peers[i].emit(eventType, data);
      }else{
        peers[i].emit(eventType, data, moreData);
      }


    }
  }

}

const syncBlockchain = () => {
	sendEventToAllPeers('message', 'Syncing blockchain');
	for(var i=0; i<peers.length; i++){
		peers[i].emit('getBlockchain', thisNode);

	}
}


//Init blockchain starting from local file
const initBlockchain = (tryOnceAgain=true) => {
  //flag to avoid crashes if a transaction is sent while loading


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


    }


    // console.log('Current blockchain:', blockchain);


    // console.log('This node:',blockchain.nodeAddresses[thisNode.hashSignature]);

  }, 4000);


};

const connectToPeerNetwork = () => {
  let peerConnections = [];

  for(var i=0; i < ipList.length; i++){

    if(ipList[i] != thisNode.address){
      var peerSocket = io(ipList[i], { 'forceNew': true});

      peerConnections.push(peerSocket);
      peerSocket.emit('client-connect', thisNode);

      peerSocket.on('connect', () =>{
        console.log('connection to node established');

        // peerSocket.emit('queryForBlockchain', thisNode);


      });

      peerSocket.on('disconnect', () =>{
        console.log('connection with peer dropped');
        peerSocket.emit('close', thisNode);

      })

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


  fs.exists('blockchain.json', function(exists){

        if(exists){
            console.log("Loading Blockchain Data from file");
            fs.readFile('blockchain.json', function readFileCallback(err, data){
              console.log('Reading from blockchain.json file...');
              let rawBlockchainFetched = JSON.parse(data);
              blockchainFetched = new Blockchain(rawBlockchainFetched.chain, rawBlockchainFetched.pendingTransactions, rawBlockchainFetched.nodeAddresses);
              blockchainFetched.nodeAddresses = seedNodeList(blockchainFetched, thisNode);

            if (err){
                console.log(err);
            }


            });
        } else {
          console.log('Generating new blockchain')
            let newBlockchain = new Blockchain();
            newBlockchain = seedNodeList(newBlockchain, thisNode);
            // seedNodeList(newBlockchain); //------------------------Have to find a better way to create nodes
            blockchain = newBlockchain;
            saveBlockchain(newBlockchain);
            console.log("file does not exist")


            return false;
        }


      });
}

const saveBlockchain = (blockchainReceived) => {
  //flag to avoid crashes if a transaction is sent while loading


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

							fs.createWriteStream
							var wstream = fs.createWriteStream('blockchain.json');

              wstream.write(json);

							console.log('BLOCKCHAIN', blockchain);
            }

            });

      } else {
          console.log("Creating new Blockchain file and saving to it")
          let json = JSON.stringify(blockchainReceived);
          if(json != undefined){

						fs.createWriteStream
						var wstream = fs.createWriteStream('blockchain.json');

						wstream.write(json);
          }

      }


      });
}


const save = () =>{
	fs.open('myfile', 'wx', (err, fd) => {
  if (err) {
    if (err.code === 'EEXIST') {
      console.error('myfile already exists');
      return;
    }

    throw err;
  }

  writeMyData(fd);
});
}

const startMining = (miningAddrToken) => {



  miningAddr = getBlockchainAddress(miningAddrToken);
  let waitingOutputOnce = true;

    miningSuccess = blockchain.minePendingTransactions(miningAddr);

    if(miningSuccess){

      console.log('\nBalance of '+miningAddr.address+' is '+ miningAddr.getBalance());

      var message =  'A new block has been mined by ' + miningAddr.hashSignature + '. Sending new blockchain version';
      ioServer.emit('miningApproved', blockchain);
      ioServer.emit('message', message);
      sendEventToAllPeers('message', message);
      sendEventToAllPeers('blockchain', blockchain);


			return true;

    }else{
      // if(waitingOutputOnce){
      //   console.log('Waiting for other transactions to occur');
      //   // ioServer.emit('needMoreTransact', 'Insufficient transactions to mine. Listening for incoming transactions');
      //   sendEventToAllPeers('message', miningAddr.address+' has Insufficient transactions to mine. Listening for incoming transactions');
      // }

			return false;

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
    return blockchain.nodeAddresses;
  }

}

const compareBlockchains = (storedBlockchain, receivedBlockchain=false) => {
  let longestBlockchain;

	if(receivedBlockchain instanceof Blockchain){
		console.log('received Blockchain is a blockchain');
	}



  if(receivedBlockchain){ //Does it exist and is it an instance of Blockchain or an object?

		receivedBlockchain = new Blockchain(receivedBlockchain.chain, receivedBlockchain.pendingTransactions, receivedBlockchain.nodeAddresses);

    if(receivedBlockchain.isChainValid()){ //Is the chain valid?
			//Try sending a notice or command to node with invalid blockchain

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




console.log('Starting server at '+thisNode.address+'/');
