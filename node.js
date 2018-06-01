//////////////////////////////////////////////////////////////
/////////////////////////NODE SCRIPT /////////////////////////
//////////////////////////////////////////////////////////////


//Server and p2p network stuff
const express = require('express');
const http = require('http');
const app = express();
const port = 8080
const server = http.createServer(app).listen(port);
const expressWs = require('express-ws')(app);
const io = require('socket.io-client');
const ioServer = require('socket.io')(server, {'pingInterval': 2000, 'pingTimeout': 10000, 'forceNew':false });
const fs = require('fs');
const { compareBlockchains } = require('./backend/validation.js');
/*
  List of peer ips and self ip finder
*/
const { getIPAddress } = require('./backend/ipFinder.js');
const { ipList } = require('./backend/iplist.js')
/*
  Blockchain classes and tools
*/
const { Blockchain, Block, BlockchainAddress, Transaction, BlockbaseRecord } = require('./backend/blockchain');
const merkle = require('merkle');
const sha256 = require('./backend/sha256');
const { encrypt, decrypt } = require('./backend/encryption.js')

let blockchain;
let dataBuffer;

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
class Node{
	constructor(blockchain=new Blockchain()){
    this.blockchain = blockchain;
    this.token = {
      'type' : 'node',
      'address' : ipList[0],
      'hashSignature' : sha256(ipList[0], Date.now()) };
    this.peers;

	}

  startServer(){
    	console.log('Starting server at '+thisNode.address+'/');
    	console.log('Node address:',thisNode.address);
    	console.log('Node Hash:', thisNode.hashSignature);
    	app.use(express.static(__dirname+'/views'));

    	app.on('/', () => {
    	  res.send(getIPAddress());
    	})



    	ioServer.on('connection', (socket) => {

    	  socket.on('message', (msg) => {
    	    console.log('Client:', msg);
    	  });

    		socket.on('error', (exception)=>{
    			console.log('Error:',exception);
    			socket.destroy();
    		})

         //Create validation for connecting nodes
    	  socket.on('client-connect', (token) => {
          clientConnect(socket, token);
        });


    		socket.on('test', (hash)=>{

    		})

    		socket.on('sync', (hash, token)=>{
          sync(token, token)
        })

    		socket.on('validateChain', (token) =>{
    			if(blockchain != undefined){
    				console.log('Blockchain valid?',blockchain.isChainValid());
    			}
    		})

    		socket.on('getWholeCopy', (token)=>{
    			sendEventToAllPeers('getBlockchain', thisNode);
    		})

    		socket.on('storeToken', (token) =>{ storeToken(token)	})

    		socket.on('distributedTransaction', (transaction, fromNodeToken) => {
          distributeTransaction(socket, transaction, fromNodeToken);
    		})

    	  socket.on('transaction', (transaction, fromNodeToken) => {
          receiveTransactionFromClient(socket, transaction, fromNodeToken);
    	  });

    	  socket.on('miningRequest', (miningAddrToken) =>{
          attemptMining(miningAddrToken);
    	  });


    		socket.on('newBlock', (newBlock) =>{
          receiveNewBlock(newBlock);
    		});

    	  socket.on('getBlockchain', (token) =>{
          getBlockchain(socket, token);
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
    	    console.log('Disconnected clients: ', token.address);
    			getNumPeers();
    	  });


    	});

  }

	createBlockchainInstance(blockchain){
    if(blockchain !== undefined){
      return new Blockchain(blockchain.chain, blockchain.pendingTransactions, blockchain.nodeTokens, blockchain.ipAddresses, blockchain.orphanedBlocks);
    }else{
      console.log(blockchain);
    }
	}

	initChain(tryOnceAgain=true){
		console.log('Initiating blockchain');
	  dataBuffer = this.loadBlockchain()


	  setTimeout(() => {

	    if(!dataBuffer){
	      console.log('No blockchain is available');
	      setTimeout(() => {

	        if(tryOnceAgain){
	          console.log('Trying to load blockchain again');
	          return this.initChain(false);
	        }

	      })

	    }else{
	      this.blockchain = this.createBlockchainInstance(dataBuffer);
				this.blockchain.addMiningAddress(this.token);
				this.blockchain.nodeTokens[thisNode.address] = this.token;
	    }


	  }, 4000);
	}

	loadBlockchain(){
      var that = this;
		  //flag to avoid crashes if a transaction is sent while loading
			fs.exists('./blockchain.json', function(exists){
				if(exists){
					var data = '';
					let blockchainDataFromFile;
					var rstream = fs.createReadStream('./blockchain.json');
					console.log('Reading blockchain.json file...');

					rstream.on('error', (err) =>{
						console.log(err);
						return err;
					})

					rstream.on('data', (chunk) => {
						data += chunk;
					});

					rstream.on('close', () =>{  // done

						if(data !== undefined && data != null){
								blockchainDataFromFile = JSON.parse(data, function(err, err2){
                  console.log(data);
                  console.log(err2)
                });

								dataBuffer = that.createBlockchainInstance(blockchainDataFromFile);

								//validateBlockchain(dataBuffer); --- To be created
								console.log('Blockchain successfully loaded from file and validated')
								// blockchain = compareBlockchains(blockchain, dataBuffer);

								return dataBuffer;

						}else{
							return false;
						}


					});

				}else {
					console.log('Generating new blockchain')
						let newBlockchain = new Blockchain();
						that.blockchain = newBlockchain;
						that.save(newBlockchain);
						console.log("file does not exist")

						return false;
				}

			});


	}

  save(blockchainReceived){
    var that = this;
    fs.exists('./blockchain.json', function(exists){
        if(exists){
          var longestBlockchain;

          if(blockchainReceived != undefined){

            if(!(blockchainReceived instanceof Blockchain)){
              blockchainReceived = that.createBlockchainInstance(blockchainReceived);
            }

            longestBlockchain = compareBlockchains(that.blockchain, blockchainReceived);

            let json = JSON.stringify(longestBlockchain);

            if(json != undefined){
              console.log('Writing to blockchain file...');

              var wstream = fs.createWriteStream('./blockchain.json');

              wstream.write(json);

              wstream.end();

            }

            // });
          }

          } else {
            console.log("Creating new Blockchain file and saving to it")
            let json = JSON.stringify(blockchainReceived);
            if(json != undefined){

              var wstream = fs.createWriteStream('blockchain.json');

              wstream.write(json);
              wstream.end();
            }

        }
        });
  }



}

var myNode = new Node();

myNode.initChain();
