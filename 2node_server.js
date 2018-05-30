//////////////////////////////////////////////////////////////
/////////////////////////NODE SCRIPT /////////////////////////
//////////////////////////////////////////////////////////////


//Server and p2p network stuff
const express = require('express');
const http = require('http');
const app = express();
const port = 8081
const server = http.createServer(app).listen(port);
const expressWs = require('express-ws')(app);
const io = require('socket.io-client');
const ioServer = require('socket.io')(server, {'pingInterval': 2000, 'pingTimeout': 5000, 'forceNew':false });
const { compareBlockchains } = require('./backend/validation.js');
const fs = require('fs');
const readline = require('readline');

const { Blockchain, Block, BlockchainAddress, Transaction, BlockbaseRecord } = require('./backend/blockchain');
const merkle = require('merkle');
const sha256 = require('./backend/sha256');
const { encrypt, decrypt } = require('./backend/encryption.js')

//Seed list of ip addresses of the p2p network
const { getIPAddress } = require('./backend/ipFinder.js');
const ipList = ['http://'+getIPAddress()+':'+port, 'http://192.168.0.153:8080', 'http://192.168.0.154:8080',
				'http://192.168.0.153:8081', 'http://192.168.0.154:8081', 'http://192.168.0.154:8082', 'http://192.168.0.153:8082',
			'http://192.168.1.72:8080','http://192.168.1.72:8081','http://192.168.1.72:8082', 'http://192.168.1.74:8080', 'http://192.168.1.74:8081',
			 'http://192.168.1.74:8082', 'http://10.112.106.71:8080', 'http://10.112.106.71:8081', 'http://10.112.106.71:8082'];


let blockchain;
let blockchainFetched;

let thisNode = {
  'type' : 'node',
  'address' : ipList[0],
  'hashSignature' : sha256(ipList[0], Date.now())
}


//Container for all connected client tokens
let clients = [];


//Container for all peer socket connections
let peers = [];

//Maybe implement a turned based mining system. It might be too cumbersome...
let currentMiners = [];
let sendTrials = 0;

const startServer = () =>{
	console.log('Starting server at '+thisNode.address+'/');
	console.log('Node address:',thisNode.address);
	console.log('Node Hash:', thisNode.hashSignature);
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


		socket.on('test', (hash)=>{
			// if(typeof index === 'number' && index < blockchain.chain.length){
			// 	var rootM = createMerkleRoot(blockchain.chain[index].transactions)
			// 	console.log('Root:', rootM.root());
			// 	console.log('Levels:', rootM.levels());
			// 	console.log('Depth:', rootM.depth());
			// 	console.log('Nodes:', rootM.nodes());
			//
			// 	for(var i=0; i<rootM.levels(); i++){
			// 		console.log('Level '+i+': ' + rootM.level(i));
			// 	}
			// }
			blockchain.chain.splice(200, 632);
			ioServer.emit('blockchain', blockchain);

		})

		socket.on('syncFromHash', (hash, token)=>{
			var blocksSent = sendBlocksFromHash(hash, token);
			if(blocksSent){
				console.log('Sent blocks following hash: '+hash);
				console.log('To node address:', token.address);
			}else{
				console.log('Received hash is invalid');
			}
		})

		socket.on('validateChain', (token) =>{
			if(blockchain != undefined){
				console.log('Blockchain valid?',blockchain.isChainValid());

			}

		})

		socket.on('getWholeCopy', (token)=>{
			sendEventToAllPeers('getBlockchain', thisNode);
		})

		socket.on('triggerTokenExchange', (token)=>{
			var hasNodeToken = (blockchain.nodeTokens[token.address] != token);

			if(!hasNodeToken){
				console.log('Triggered token exchange')
				sendEventToAllPeers('storeToken', thisNode);
				sendEventToAllPeers('triggerTokenExchange', thisNode);
			}

		})

		socket.on('storeToken', (token) =>{
			if(token != undefined && blockchain != undefined && blockchain instanceof Blockchain){
				console.log('Received a node token from ', token.address);
				blockchain.nodeTokens[token.address] = token;
				blockchain.addMiningAddress(token);
			}

		})

		socket.on('sync', () =>{
			if(blockchain != undefined){
				var hashes = buildChainHashes();
				ioServer.emit('message', hashes);
				syncBlockchain();
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

	    var latestBlock = getLatestBlock(updatedBlockchain);

			sendEventToAllPeers('message','Block mined: ' + latestBlock.hash + " by " + miningAddr.address);
			// syncBlockchain();
	    // blockchain = compareBlockchains(blockchain, updatedBlockchain);

	  });


		socket.on('newBlock', (newBlock) =>{

			if(newBlock != undefined && blockchain != undefined){
				if(newBlock.length > 1){
					for(oneBlock of newBlock){
						handleNewBlock(oneBlock);
					}
				}else if(newBlock.length == 1){
					handleNewBlock(newBlock)
				}

			}else{
				console.log('New block received or blockchain is undefined');
			}

			saveBlockchain(blockchain);

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
					sendToTargetPeer('message','Chain is up to date', token.address);
					//Is up to date
				}else{
					// for(var i=0; i<missingBlocks.length; i++){
					// 	var index =
					// 		setTimeout((index)=>{
					// 			sendToTargetPeer('newBlock', missingBlocks[index], token.address);
					// 		}, 2000, i)
					//
					//
					// }
					sendToTargetPeer('newBlock', missingBlocks, token.address);

				}
			}else{
				console.log('Block signatures received are undefined');
			}
		})



	  socket.on('getBlockchain', (token) =>{
			var validityStatus;

	    //Query all nodes for blockchain
			if(blockchain != undefined){

				if(!(blockchain instanceof Blockchain)){
					blockchain = instanciateBlockchain(blockchain);
				}
					validityStatus = blockchain.isChainValid();
					if(validityStatus === true){
						var msg = token.address + ' has requested a copy of the blockchain!';
				    // console.log(msg);
						sendEventToAllPeers('message', msg);
						sendToTargetPeer('blockchain', blockchain, token.address);
				    ioServer.emit('blockchain', blockchain);
					}else{
						console.log('Current blockchain is invalid. Flushing local chain and requesting a valid one');
						blockchain = new Blockchain(); //Need to find a way to truncate invalid part of chain and sync valid blocks
						sendEventToAllPeers('getBlockchain', thisNode);
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
}


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
	var hashesOfBlocks = buildChainHashes();

	sendEventToAllPeers('updateChain', hashesOfBlocks, thisNode);
}

const sync = () =>{
	var latestBlock = blockchain.getLatestBlock();
	sendEventToAllPeers('syncFromHash', latestBlock.hash, thisNode);
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
			blockchain.addMiningAddress(thisNode);
			blockchain.nodeTokens[thisNode.address] = thisNode;
    }


  }, 4000);


};

const initClientSocket = (address) =>{

	var peerSocket = io(address, {'forceNew': true});

	peerSocket.emit('client-connect', thisNode);
	peerSocket.emit('storeToken', thisNode);

	peerSocket.emit('message', 'You are connected to '+thisNode.address);


	peerSocket.on('connect', () =>{

		// peerSocket.emit('getBlockchain', thisNode);
		// peerSocket.emit('blockchain', blockchain);
		console.log('Connected to ', address);
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

//Used to revalidate block hashes
const calculateBlockHash = (block) =>{
	return sha256(block.previousHash + block.timestamp + JSON.stringify(block.transactions) + block.nonce).toString();
}

//Used when a node needs to their chain with the longest copy
const findMissingBlocks = (signatures) =>{
	var missingBlocks = []; //Array of blocks that are missing from querying node
	var blockGap; //Gap of blocks between longest accepted chain and querying node's copy of it
	var localLength;
	var lastBlockSignature = signatures[signatures.length -1];
	if(blockchain != undefined){
		if(signatures != undefined){
			if(blockchain.chain.length > signatures.length){
				blockGap = blockchain.chain.length - signatures.length;
				localLength = blockchain.chain.length;
			}else if(signatures.length > blockchain.chain.length){
				syncBlockchain(); //If the signature is longer than the local chain, the local chain has to be synced
				return false;

			}else{
				blockGap = 0;
			}

			console.log('Blockgap:', blockGap);

			if(signatures.length >1){
				console.log('Last signature:', lastBlockSignature);
				if(blockchain.checkIfChainHasHash(lastBlockSignature.hash)){

				}
				for(var i=signatures.length; i < localLength; i++){
					 //Check if last signature if part of the blockchain
					missingBlocks.push(blockchain.chain[i]);
				}



			}else{

				console.log('Sending the whole chain');
				missingBlocks = blockchain.chain;
				// missingBlocks.splice(0,1);
			}


			if(missingBlocks.length == 0){
				return false;
			}

			return missingBlocks;
		}else{
			console.log('ERROR: Received undefined signatures');
		}


	}else{
		console.log('ERROR: Undefined blockchain');
	}

}


//Creates an chain of block signatures, that is, the hash of the block and the previous hash only.
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



const getNumPeers = () =>{
	if(peers != undefined){
		if(peers.length > 0){
			console.log('Number of other available peers on network:',peers.length);
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

function recalculateMerkleRoot(transactions){

  if(transactions != undefined){
    var transactionHashes = Object.keys(transactions);


    let merkleRoot = merkle('sha256').sync(transactionHashes);
    return merkleRoot.root();
  }

}

const handleNewBlock = (newBlock) =>{
	if(newBlock != undefined && newBlock != null && typeof newBlock == 'object'){
		console.log('Received block:', newBlock.hash);

		var isBlockSynced = blockchain.syncBlock(newBlock);
		if(isBlockSynced){
			ioServer.emit('blockchain', blockchain);
		}else if(typeof isBlockSynced === 'number'){
			//Start syncing from the index returned by syncBlock;
			// sendEventToAllPeers('getBlockchain', thisNode); //Use this meanwhile
			console.log('Block is already present')
		}else{
			// sendEventToAllPeers('getBlockchain', thisNode);
			console.log('Block refused');
		}
	}else{
		console.log('Block handler error: New block is undefined');
	}

}

const sendBlocksFromHash = (hash, token) =>{
	if(blockchain != undefined && hash != undefined && token != undefined){
		var blocks = blockchain.getBlocksFromHash(hash);
		if(blocks){
			sendToTargetPeer('newBlock', blocks, token.address);
			return true;
		}else{
			sendEventToAllPeers('message', 'No block found with received hash', token.address);
			return false;
		}
	}
}

const chainUpdater = () =>{
	// sendEventToAllPeers('getBlockchain', thisNode);
	setInterval(() =>{
		if(blockchain != undefined){
			// syncBlockchain();
			sync();
			// sendEventToAllPeers('getBlockchain', thisNode);
		}else{
			console.log('blockchain is not loaded yet. Trying again');
			return chainUpdater();
		}
	}, 30000)

}

const mine = (token) =>{
	setInterval(()=>{
		if(blockchain != undefined){

			var hasMinedABlock = startMining(token);

			if(hasMinedABlock){
				saveBlockchain(blockchain);
			}


		}
	}, 10000)

}



startServer()
initBlockchain();
setTimeout(()=>{
	connectToPeerNetwork();
	chainUpdater();
}, 2500)
