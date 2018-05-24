//////////////////////////////////////////////////////////////
/////////////////////////NODE SCRIPT /////////////////////////
//////////////////////////////////////////////////////////////



//Express app and http server to run websockets on
const express = require('express');
const http = require('http');
const app = express();
const port = 8080
const server = http.createServer(app).listen(port);
var expressWs = require('express-ws')(app);
const io = require('socket.io-client');
const ioServer = require('socket.io')(server, {'pingInterval': 2000, 'pingTimeout': 5000, 'forceNew':false });

const fs = require('fs');

//For hashing the transactions and block signatures
const sha256 = require('./backend/sha256');

//All the necessary blockchain classes
const { Blockchain, Block, BlockchainAddress, Transaction, BlockbaseRecord } = require('./backend/blockchain');

const { getIPAddress } = require('./backend/ipFinder.js');

//Seed list of ip addresses of the p2p network
const ipList = ['http://'+getIPAddress()+':'+port, 'http://192.168.0.153:8080', 'http://192.168.0.154:8080',
				'http://192.168.0.153:8081', 'http://192.168.0.154:8081', 'http://192.168.0.154:8082', 'http://192.168.0.153:8082'];

let blockchain;
//////////////////////////////////////////////////////////////
//This is a container for the blockchain copy taken from local file
let blockchainFetched;


let thisNode = {
  'type' : 'node',
  'address' : ipList[0],
  'hashSignature' : sha256(ipList[0], Date.now())
}

const { encrypt, decrypt } = require('./backend/encryption.js')


const room = 'sync';

//Container for all connected client tokens
let clients = [];


//Container for all peer socket connections
let peers = [];

//Maybe implement a turned based mining system. It might be too cumbersome...
let currentMiners = [];
let sendTrials = 0;


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
			clients[token.address] = token;

			socket.id = token.address;

	    console.log('Connected client hash: '+ token.hashSignature.substr(0, 10) + '...');
	    console.log('At address:', token.address);

	    socket.emit('message', 'You are now connected to ' + thisNode.address);

			getNumPeers();

		}



  });

	socket.on('room', function(room) {
			socket.join(room);
	});

	socket.on('checkBalance', (token) =>{
		// console.log(blockchain.getIndexOfBlockHash(token))
		// console.log(blockchain.validateTransaction())
		// console.log(buildChainHashes());
		var hashesOfBlocks = buildChainHashes();

		// console.log(peers);

		sendEventToAllPeers('updateChain', hashesOfBlocks, thisNode);
		// syncBlockchain();

	})

	socket.on('storeToken', (token) =>{
		if(token != undefined && blockchain != undefined && blockchain instanceof Blockchain){
			blockchain.nodeTokens[token.address] = token;
		}

	})



	socket.on('distributedTransaction', (transaction, fromNodeToken) => {
		///////////////////////////////////////////////////////////
		//Need to validate transaction everytime it is received
		///////////////////////////////////////////////////////////
		if(blockchain != undefined){
			if(transaction != undefined && fromNodeToken != undefined){
				console.log('Peer '+fromNodeToken.address+' has sent a new transaction.');
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

					var transactIsValid = validateTransaction(transactionObj, fromNodeToken);

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
		//This event is when a node is notified that a mining operation has been successfull
		//Therefore, it receives a new blockchain. Will switch to receiving a newBlock
    var latestBlock = getLatestBlock(updatedBlockchain);

		sendEventToAllPeers('message','Block mined: ' + latestBlock.hash + " by " + miningAddr.address);

    blockchain = compareBlockchains(blockchain, updatedBlockchain);
		// console.log('BLOCKCHAIN:', blockchain);


  });

	socket.on('chainSignatures', (fromIndex=false)=>{
		var hashesOfBlocks;
		var pieceOfChain = [];
		if(fromIndex && typeof fromIndex == 'number'){
			for(var i=fromIndex; i<blockchain.chain.length; i++){
				pieceOfChain.push(blockchain.chain[i]);
			}

			hashesOfBlocks = buildChainHashes(pieceOfChain);
		}else{
			hashesOfBlocks = buildChainHashes()
		}

		 console.log('Hashes',hashesOfBlocks);
		 socket.emit('receiveChainSignatures', hashesOfBlocks);
	})

	socket.on('receiveChainSignatures', (signatures) =>{
		console.log(signatures);
		if(signatures != undefined){
			var missingBlocks = findMissingBlocks(signatures);
			console.log('missing:',missingBlocks)
			if(!missingBlocks){
				console.log('Chain is up to date');
				//Is up to date
			}else{
				for(var block of missingBlocks){
					var blockSignature = buildChainHashes(block);
					socket.emit('sendBlock', blockSignature);
				}
			}
		}else{
			console.log('Block signatures received are undefined');
		}
	})

	socket.on('sendBlock', (blockSignature) =>{
		if(blockchain != undefined && blockSignature != undefined){
			var index = blockchain.getIndexOfBlockHash(blockSignature.hash);
			if(index){
				socket.emit('newBlock', blockchain.chain[index]);
			}else{
				socket.emit('message', 'ERROR: Could not find block '+blockSignature.hash);
			}
		}
	})

	socket.on('syncBlockchain', (blockchainToSync=false)=>{
		blockchain = compareBlockchains(blockchain, blockchainToSync);
		console.log('Blockchain from peer:', blockchain);
		ioServer.emit('blockchain', blockchain);
	})


	socket.on('newBlock', (newBlock) =>{

		if(newBlock != undefined && blockchain != undefined){
			console.log('Received new block');

			var isBlockValid = blockchain.validateBlock(newBlock);
			console.log('Valid?', isBlockValid);
			if(newBlock != undefined){ //isBlockValid

				blockchain.chain.push(newBlock);
				// blockchain.syncBlock(newBlock);
			}
			sendEventToAllPeers('updateChain', )
			ioServer.emit('blockchain', blockchain);

		}else{
			console.log('New block received or blockchain is undefined');
		}

	});



  socket.on('queryForBlockchain', (queryingNodeToken) =>{

		if(queryingNodeToken != undefined){
			syncBlockchain();
		}else{
			socket.emit('message', 'ERROR: Invalid token sent');
		}

  })

	socket.on('updateChain', (signatures, token) =>{
		if(signatures != undefined && token != undefined){
			var missingBlocks = findMissingBlocks(signatures);

			if(!missingBlocks){
				console.log('Chain is up to date');
				//Is up to date
			}else{
				// for(var block of missingBlocks){
				// 	console.log('Missing Block!', block);
				// 	// socket.emit('newBlock', block);
				//
				//
				// }

				setTimeout(()=>{
					sendToTargetPeer('newBlock', missingBlocks[0], token.address);
				},3000)
			}
		}else{
			console.log('Block signatures received are undefined');
		}
	})



  socket.on('getBlockchain', (token) =>{
    //Query all nodes for blockchain
		if(blockchain != undefined){

			if(!(blockchain instanceof Blockchain)){
				blockchain = instanciateBlockchain(blockchain);
			}

				if(blockchain.isChainValid()){
					var msg = token.address + ' has requested a copy of the blockchain!';
			    // console.log(msg);
					sendEventToAllPeers('message', msg);
					sendEventToAllPeers('blockchain', blockchain);
			    ioServer.emit('blockchain', blockchain);
				}else{
					console.log('Current blockchain is invalid. Requesting a valid chain');
					syncBlockchain();
				}



		}else{
			socket.emit('message', 'Blockchain is unavailable on node. It might be loading or saving.');
		}


  });

  socket.on('blockchain', (blockchainReceived) => {
    blockchain = compareBlockchains(blockchain, blockchainReceived);

  })

	socket.on('minerStarted', (miningAddress) =>{
		if(miningAddress != undefined){
			currentMiners[miningAddress.hash] = miningAddress;
		}
	})

	socket.on('disconnect', () =>{

	})

	socket.on('broadcastMessage', (msg) =>{
		sendEventToAllPeers('message', msg);
	})


  socket.on('close', (token) => {

    clients[token.address] = null;

    console.log('Disconnected clients: '+ token.hashSignature.substr(0, 10) + '...');
		getNumPeers();

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

// const sendBlocks = (lengthOfChain) =>{
//
//
// }

const syncBlockchain = () => {
	// sendEventToAllPeers('message', thisNode.address+' is syncing blockchain');
	// // sendEventToAllPeers('getBlockchain', thisNode);
	// for(var i=0; i<peers.length; i++){
	//
	// 	peers[i].emit('getBlockchain', thisNode);
	// }

	sendEventToAllPeers('chainSignatures');
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

    }else{
      blockchain = instanciateBlockchain(blockchainFetched);

    }


  }, 4000);


};

const initClientSocket = (address) =>{

	var peerSocket = io(address, {'forceNew': true});

	peerSocket.emit('client-connect', thisNode);
	peerSocket.emit('storeToken', thisNode);
	peerSocket.emit('message', 'You are connected to '+thisNode.address);

	peerSocket.on('connect', () =>{
		console.log('connection to node established');
		// peerSocket.emit('getBlockchain', thisNode);
		peers.push(peerSocket);
	});

	peerSocket.on('disconnect', () =>{
		console.log('connection with peer dropped');
		peers.splice(peers.indexOf(peerSocket), 1);
		peerSocket.emit('close', thisNode);
	})

}


const connectToPeerNetwork = () => {
  let peerConnections = [];

  for(var i=0; i < ipList.length; i++){

    if(ipList[i] != thisNode.address){

			var address = ipList[i];
			initClientSocket(address);

    }
  }

};




const getMiningAddress = (addressToken) => {
  if(blockchain !== undefined){
		if(blockchain.miningAddresses[addressToken.hashSignature] && blockchain.miningAddresses[addressToken.hashSignature] instanceof BlockchainAddress){
			return blockchain.miningAddresses[addressToken.hashSignature];
		}else{
			blockchain.addMiningAddress(addressToken);
		}

  }

}

const loadBlockchainFromServer = () => {

  //flag to avoid crashes if a transaction is sent while loading
	fs.exists('blockchain.json', function(exists){
		if(exists){
			var data = '';
			let blockchainDataFromFile;
			var rstream = fs.createReadStream('blockchain.json');
			console.log('Reading blockchain.json file...');

			rstream.on('error', (err) =>{
				console.log(err);
				return err;
			})

			rstream.on('data', (chunk) => {
				data += chunk;
			});



			rstream.on('close', () =>{  // done

				if(data != undefined){
						blockchainDataFromFile = JSON.parse(data);
						blockchainFetched = instanciateBlockchain(blockchainDataFromFile);

						//validateBlockchain(blockchainFetched); --- To be created
						console.log('Blockchain successfully loaded from file and validated')
						// blockchain = compareBlockchains(blockchain, blockchainFetched);

						return blockchainFetched;

				}else{
					return false;
				}


			});

		}else {
			console.log('Generating new blockchain')
				let newBlockchain = new Blockchain();
				// newBlockchain = seedNodeList(newBlockchain, thisNode);
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
				var longestBlockchain;

				if(blockchainReceived != undefined){

					if(!(blockchainReceived instanceof Blockchain)){
						blockchainReceived = new Blockchain(
							blockchainReceived.chain,
							blockchainReceived.pendingTransactions,
							blockchainReceived.nodeAddresses,
							blockchainReceived.ipAddress,
							blockchainReceived.orphanedBlocks
						)
					}

					if(blockchain != undefined){
						longestBlockchain = compareBlockchains(blockchain, blockchainReceived);
					}else{
						longestBlockchain = blockchainReceived;
					}

					let json = JSON.stringify(longestBlockchain);

					if(json != undefined){
						console.log('Writing to blockchain file...');

						var wstream = fs.createWriteStream('blockchain.json');

						wstream.write(json);

						console.log('BLOCKCHAIN', blockchain);
					}

					// });
				}

      	} else {
          console.log("Creating new Blockchain file and saving to it")
          let json = JSON.stringify(blockchainReceived);
          if(json != undefined){

						var wstream = fs.createWriteStream('blockchain.json');

						wstream.write(json);
          }

			}
      });
}

const startMining = (miningAddrToken) => {



  miningAddr = getMiningAddress(miningAddrToken);

	if(miningAddr){
		sendEventToAllPeers('message', miningAddrToken.address+ ' has started mining.');
		sendEventToAllPeers('minerStarted', miningAddr);

		miningSuccess = blockchain.minePendingTransactions(miningAddr);

		if(miningSuccess){

			console.log('\nBalance of '+miningAddr.address+' is '+ miningAddr.getBalance());

			var message =  'A new block has been mined by ' + miningAddr.hashSignature + '. Sending new block';
			var newBlock = blockchain.getLatestBlock();
			ioServer.emit('miningApproved', blockchain);
			ioServer.emit('message', message);
			sendEventToAllPeers('message', message);
			sendEventToAllPeers('newBlock', newBlock);
			// sendEventToAllPeers('blockchain', blockchain);

			return true;

		}

		return false;

	}else{
		console.log('Invalid mining address');
	}



}

const calculateBlockHash = (block) =>{
	return sha256(block.previousHash + block.timestamp + JSON.stringify(block.transactions) + block.nonce).toString();
}

const findMissingBlocks = (signatures) =>{
	var missingBlocks = [];
	var blockGap;
	if(blockchain != undefined && signatures != undefined){

		if(blockchain.chain.length > signatures.length){
			blockGap = blockchain.chain.length - signatures.length
		}else if(signatures.length > blockchain.chain.length){
			return false;
		}else{
			blockGap = 0;
		}

		console.log('Blockgap:', blockGap);
		if(signatures.length >1){
			for(var i=0; i< signatures.length; i++){
				if(signatures[i].previousHash != '0'){
					var index = blockchain.getIndexOfBlockHash(signatures[i].hash);
					console.log('Signature:', signatures[i]);
					console.log('Index:', index);
					if( !index){ //if the block signature hasn't been found

						console.log(i)
						missingBlocks.push(blockchain.chain[index]);
					}
				}

			}
		}else{
			console.log('Sending the whole chain');
			missingBlocks = blockchain.chain;
			missingBlocks.splice(0,1);
		}


		if(missingBlocks.length == 0){
			return false;
		}

		return missingBlocks;

	}else{
		console.log('ERROR: Undefined blockchain or signatures');
	}

}

const findIndexesOfBlocks = (signatures) =>{
	var indexes = [];
	var index;
	for(var blockSign of signatures){
		index = blockchain.getIndexOfBlockHash(blockSign.hash);
		if(index){
			indexes.push(index)
		}else{
			console.log('ERROR: Index of block '+blockSign.hash+' not found');
		}

	}

	return indexes;
}



const buildChainHashes = () =>{
	var hashSignaturesOnChain = []

	var chain = blockchain.chain;


	for(var i=0; i<chain.length; i++){
		hashSignaturesOnChain.push({
			hash:chain[i].hash,
			previousHash:chain[i].previousHash,
			index:i
		})
	}

	return hashSignaturesOnChain;
}



const compareBlockchains = (storedBlockchain, receivedBlockchain=false) => {
  let longestBlockchain;


  if(receivedBlockchain != undefined && storedBlockchain != undefined){

		if(!(receivedBlockchain instanceof Blockchain)){
			receivedBlockchain = instanciateBlockchain(receivedBlockchain);
		}

		if(!(storedBlockchain instanceof Blockchain)){
			storedBlockchain = instanciateBlockchain(storedBlockchain);
		}
		 //Does it exist and is it an instance of Blockchain or an object?
    if(receivedBlockchain.isChainValid()){ //Is the chain valid?
			//Try sending a notice or command to node with invalid blockchain
			console.log('Validated chain');
      if(storedBlockchain.chain.length > receivedBlockchain.chain.length){ //Which chain is the longest?
					console.log('Local chain is the longest. Choosing this one');
          longestBlockchain = storedBlockchain;
      }
      else if(storedBlockchain.chain.length == receivedBlockchain.chain.length){ //Same nb of blocks

          let lastStoredBlock = storedBlockchain.getLatestBlock();
          let lastReceivedBlock = receivedBlockchain.getLatestBlock();

					if(lastReceivedBlock.timestamp < lastStoredBlock.timestamp){
						console.log('The last block on received chain is older');
						longestBlockchain = receivedBlockchain;
					}else if(lastStoredBlock.timestamp < lastReceivedBlock.timestamp){
						console.log('The last block on local chain is older');
						longestBlockchain = storedBlockchain;
					}else{
						console.log('The two chains and last two blocks are the same.')
						longestBlockchain = storedBlockchain;
					}

        	//validated block
      }
      else{
				console.log('Received chain is the longest. Choosing this one');
        longestBlockchain = receivedBlockchain;
      }

      return longestBlockchain;
    }
    else if(storedBlockchain.isChainValid()){
			console.log('Received blockchain not valid. Reverting to local chain');
      return storedBlockchain;
    }else{
			return new Blockchain();
		}


  }else if(storedBlockchain == undefined && receivedBlockchain != undefined){

		console.log('Local chain is undefined. Using received chain');
		return instanciateBlockchain(receivedBlockchain);

	}else if(storedBlockchain != undefined && receivedBlockchain == undefined){
		console.log('Received chain is undefined. Using received chain');
    return instanciateBlockchain(storedBlockchain);

  }else{
		console.log('Both copies of the blockchain were undefined. Returning new blockchain copy instead')
		return new Blockchain();
	}

}


const getNumPeers = () =>{
	if(peers != undefined){
		if(peers.length > 0){
			console.log('Number of peers on network:',peers.length);
			return peers.length;
		}

	}
}

const sendToTargetPeer = (eventType, data, address) =>{
	for(peer of peers){
		var peerAddress = 'http://'+peer.io.opts.hostname +':'+ peer.io.opts.port

		if(peerAddress === address){
			peer.emit(eventType, data);
		}
	}
}

const instanciateBlockchain = (blockchain) =>{
	return new Blockchain(blockchain.chain, blockchain.pendingTransactions, blockchain.nodeTokens, blockchain.ipAddresses, blockchain.orphanedBlocks);
}

const validateTransaction = (transaction, token) =>{
	if(transaction != undefined && token != undefined){

		if(blockchain != undefined && blockchain instanceof Blockchain){

			var balanceOfSendingAddr = blockchain.getBalanceOfAddress(token) + blockchain.checkFundsThroughPendingTransactions(token);
			if(!balanceOfSendingAddr){
					console.log('Cannot verify balance of undefined address token');
			}else{
				if(balanceOfSendingAddr >= transaction.amount){
					console.log('Transaction validated successfully');
				}else if(transaction.type === 'query'){
					//handle blockbase queries
				}else{
					console.log('Address '+token.address+' does not have sufficient funds to complete transaction');
				}
			}


		}else{
			console.log("ERROR: Can't validate. Blockchain is undefined or not instanciated. Resync your chain");
		}

	}else{
		console.log('ERROR: Either the transaction or the token sent is undefined');
		return false;
	}

}

setTimeout(() =>{ //A little delay to let websocket open
  initBlockchain();
  connectToPeerNetwork();
	// setTimeout(() =>{
	// 	syncBlockchain();
	// }, 3000)

}, 1500)





console.log('Starting server at '+thisNode.address+'/');
console.log('Node address:',thisNode.address);
console.log('Node Hash:', thisNode.hashSignature);
