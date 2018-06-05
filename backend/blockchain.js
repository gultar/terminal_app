//Modules
const sha256 = require('./sha256');
const JSONdb = require('simple-json-db');
const merkle = require('merkle');
// const merkle = require('merkle');
/******************************************/
/***********Blockchain classes*************/
/******************************************/

///////////////Transaction//////////////////
//A transaction is done if there is a
//change of data on the blockchain
class Transaction{
  constructor(fromAddress, toAddress, amount, data='', timestamp, hash){
    this.fromAddress = fromAddress;
    this.toAddress = toAddress;
    this.amount = amount;
    this.data = data;
    this.timestamp = timestamp;
    this.hash = (hash != undefined ? hash : sha256(this.fromAddress+ this.toAddress+ this.amount+ this.data+ this.timestamp));
  }
}

//////////////////Block/////////////////////
class Block{
  constructor(timestamp, transactions, previousHash=''){
    this.timestamp = timestamp;
    this.transactions = transactions;
    this.previousHash = previousHash;
    this.hash = this.calculateHash();
    this.nonce = 0;
    this.valid = true;
    this.minedBy = '';
  }

  calculateHash(){
    return sha256(this.previousHash + this.timestamp + this.createMerkleRoot(this.transactions) + this.nonce).toString();
  }

  /*Proof of Work*/
  mineBlock(difficulty){
    while(this.hash.substring(0, difficulty) !== Array(difficulty+1).join("0")){
      this.nonce++;
      this.hash = this.calculateHash();
    }

    console.log("Block mined: " + this.hash);

  }

  createMerkleRoot(transactions){

  	if(transactions != undefined){
  		var transactionHashes = Object.keys(transactions);


  		let merkleRoot = merkle('sha256').sync(transactionHashes);
      return merkleRoot.root();
  	}

  }

}


/////////////////////Blockchain///////////////////////
class Blockchain{

  constructor(chain=false, pendingTransactions=false, nodeTokens={}, ipAddresses=[], orphanedBlocks=[]){
    this.chain = (chain? chain: [this.createGenesisBlock()]);
    this.difficulty = 3;
    this.pendingTransactions = (pendingTransactions? pendingTransactions: {});
    this.miningReward = 50;
    this.nodeTokens = nodeTokens; //Stores all the node addresses of the P2P network
    this.ipAddresses = ipAddresses;
    this.miningAddresses = {};
    this.blockSize = 10; //Minimum Number of transactions per block
    this.orphanedBlocks = orphanedBlocks;
  }

  createGenesisBlock(){
    return new Block("01/01/2018", "Genesis block", "0");
    this.createTransaction(new Transaction('Genesis','http://192.168.0.154:8080',100, {}, Date.now()));
    this.createTransaction(new Transaction('Genesis','http://192.168.0.154:8081',100, {}, Date.now()));
    this.createTransaction(new Transaction('Genesis','http://192.168.0.153:8080',100, {}, Date.now()))
  }

  getLatestBlock(){
    return this.chain[this.chain.length - 1];
  }

  addMiningAddress(token){
    if(!this.miningAddresses[token.hashSignature]){
      this.miningAddresses[token.hashSignature] = new BlockchainAddress(token.address, token.hashSignature);
    }
  }

  getMiningAddress(addressToken){
    if(addressToken != undefined){
      if(this.miningAddresses[addressToken.hashSignature] && this.miningAddresses[addressToken.hashSignature] instanceof BlockchainAddress){
  			return this.miningAddresses[addressToken.hashSignature];
  		}else{
  			this.addMiningAddress(addressToken);
  		}
    }
  }

  addBlock(newBlock){
    newBlock.previousHash = this.getLatestBlock().hash;
    newBlock.mineBlock(this.difficulty); //Proof of work in action
    this.chain.push(newBlock);
  }

  syncBlock(newBlock){

      var blockStatus;
      var pending = this.pendingTransactions;
      if(newBlock.transactions != undefined){
        var newTransactHashes = Object.keys(newBlock.transactions);
      }else{
        return false
      }

      //Will return true if the block is valid, false if not or the index of the block to which it is linked if valid but out of sync
      blockStatus = this.validateBlock(newBlock);

      if(blockStatus === true){
        console.log('New Block validated successfully');
        for(var hash of newTransactHashes){
          delete pending[hash];
        }
        this.chain.push(newBlock);
        this.pendingTransactions = pending;
        return true;
      }else if(blockStatus > 0){
        /*Handle chain forking between two peers*/
        // return blockStatus;
        return false;
      }else if(blockStatus === false){
        // console.log('New Block is invalid');
        return false;
      }else{
        return false;
      }





  }

  hasEnoughTransactionsToMine(){
    if(Object.keys(this.pendingTransactions).length >= this.blockSize){
      return true
    }else{
      return false;
    }
  }

  minePendingTransactions(miningRewardAddress){
    if(this.hasEnoughTransactionsToMine()){
      let block = new Block(Date.now(), this.pendingTransactions);
      this.pendingTransactions = {};
      block.previousHash = this.getLatestBlock().hash;
      block.mineBlock(this.difficulty);
      block.minedBy = miningRewardAddress.hashSignature;

      miningRewardAddress.minedOneBlock();
      miningRewardAddress.setBalance(this.miningReward);

      console.log("Block successfully mined!");

      if(this.validateBlock(block)){
        this.chain.push(block);
      }else{
        console.log('Block is not valid');
        this.orphanedBlocks.push(block);
      }




      console.log("The Blockchain is " + this.chain.length + " blocks long.");
      console.log(miningRewardAddress.address + ' has mined ' + miningRewardAddress.blocksMined + ' blocks.');
      this.createTransaction(new Transaction(null, miningRewardAddress.address, this.miningReward, "", Date.now()))
      return true;
    }else{
      console.log('Waiting for other transactions...');
      return false;
    }

  }

  createTransaction(transaction){
    // this.pendingTransactions.push(transaction);
    this.pendingTransactions[transaction.hash] = transaction;
  }

  checkFundsThroughPendingTransactions(token){
    var balance = 0;
    var trans;
    var address;
    if(token != undefined){
      /*****************************/
      if(!(typeof token == 'object')){  ///To be removed. For test purposes only
        console.log('Token not object');
        address = token;
      }else{
        address = token.address
      }
      /******************************/
      for(var transHash of Object.keys(this.pendingTransactions)){
        trans = this.pendingTransactions[transHash];

        if(trans.fromAddress == address){

          balance = balance - trans.amount;
        }

        if(trans.toAddress == address){

          balance = balance + trans.amount;
        }
      }

      return balance;
    }else{
      return false;
    }

  }

  checkIfChainHasHash(hash){
    for(var i=this.chain.length; i > 0; i--){
      if(this.chain[i-i].hash === hash){
        return true
      }
    }

    return false;
  }

  getIndexOfBlockHash(hash){
    for(var i=0; i < this.chain.length; i++){
      if(this.chain[i].hash === hash){
        return i;
      }
    }

    return false;
  }

  checkIfBlockIsLinked(previousHash){
    var lastBlock = this.getLatestBlock();
    if(lastBlock.hash === previousHash){
      return true;
    }
    return false;
  }



  getBalanceOfAddress(token){
    var address;

    let balance = 0;
    var trans;
    if(token != undefined){
      /**********************/
      if(!(typeof token == 'object')){  ///To be removed. For test purposes only
        console.log('Token not object');
        address = token;
      }else{
        address = token.address
      }
      /************************/
      for(var block of this.chain){
        // console.log(block);
        for(var transHash of Object.keys(block.transactions)){
          trans = block.transactions[transHash]
            if(trans.fromAddress == address){

              balance = balance - trans.amount;
            }

            if(trans.toAddress == address){

              balance = balance + trans.amount;
            }


        }
      }
    }else{

      return false;
    }

    return balance;
  }

  getBalanceFromBlockIndex(index){

    console.log('INDEX:', index);
    for(var i=0; i < index; i++){
      for(var transHash of Object.keys(this.chain[i].transactions)){
        trans = this.chain[i].transactions[transHash]
          if(trans.fromAddress == address){

            balance = balance - trans.amount;
          }

          if(trans.toAddress == address){

            balance = balance + trans.amount;
          }


      }
    }

  }



  addBlockbaseRecord(address){

  }

  isChainValid(){
    for(let i=1;i < this.chain.length; i++){

      const currentBlock = this.chain[i];
      const previousBlock = this.chain[i - 1];

      if(currentBlock.hash !== RecalculateHash(currentBlock)){

        console.log('currentblock hash does not match the recalculation');
        console.log('Invalid block is :' + i + ' with hash: ' + currentBlock.hash + ' and previous hash: ' + previousBlock.hash);
        return false;
      }else if(currentBlock.previousHash !== previousBlock.hash){

        console.log('currentblock hash does not match previousblock hash');
        console.log('Invalid block is :' + i + ' with hash: ' + currentBlock.hash + ' and previous hash: ' + previousBlock.hash);
        console.log('Truncating chain from invalid block');
        this.truncateChain(i);
      }
    }

    return true;
  }

  truncateChain(index){
    if(index >= this.chain.length){
      var blockDifference = this.chain.length - index;
      this.chain.splice(index, blockDifference);
    }else{
      console.log('Segment of chain to truncate has out of range index');
    }

  }


  validateBlock(block){

    var containsCurrentBlock = this.checkIfChainHasHash(block.hash);
    var isLinked = this.checkIfBlockIsLinked(block.previousHash);
    var latestBlock = this.getLatestBlock();
    //Validate transactions using merkle root
    if(!containsCurrentBlock){
      if(!isLinked){
        if(latestBlock.previousHash == block.previousHash){
          /*New block received has been orphaned since latest block has been mined before.*/
          return false;
        }

        console.log('Current mined block is not linked with previous block. Sending it to orphanedBlocks');
        return this.getIndexOfBlockHash(block.previousHash);

      }else{
        // if(block.difficulty = )
        /*
          validate difficulty level
        */
        console.log('New block successfully validated. Will be appended to current blockchain.')
        return true;
      }

    }else if(containsCurrentBlock){
      // console.log('Chain already contains that block')
      /*Chain already contains that block*/
      return false;
    }

  }

  getBlocksFromHash(hash){
  	var blocks = [];
  	var index = this.getIndexOfBlockHash(hash);
    var latestBlock = this.getLatestBlock();
    /*
       Only sends block(s) if the hash sent is not the same as the current
       latest block on the chain, thus avoiding too much useless exchange
    */
    // if(latestBlock.hash != hash){

      if(index > -1){

          for(var i=index+1; i < this.chain.length; i++){
            blocks.push(this.chain[i]);
          }
          return blocks;
      }else if(index == false){
    		console.log('ERROR: Hash not found');
        return false;
    	}
    // }else{
    //   return false;
    // }


  }

  validateTransaction(transaction, token){
    if(transaction != undefined && token != undefined){

      //To be worked on!

  			var balanceOfSendingAddr = this.getBalanceOfAddress(token) + this.checkFundsThroughPendingTransactions(token);
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
  		console.log('ERROR: Either the transaction or the token sent is undefined');
  		return false;
  	}


  }
}

class BlockchainAddress{
  constructor(address, hashSignature, blocksMined=0,   balance=0){
    this.address = address;
    this.blocksMined = blocksMined;
    this.balance = balance;
    this.hashSignature = hashSignature
  }

  getBalance(){
    return this.balance;
  }

  getBlocksMined(){
    return this.blocksMined;
  }

  getAddress(){
    return this.address;
  }

  setBalance(value){
    this.balance += value;
  }

  minedOneBlock(){
    this.blocksMined++;
  }
}


class BlockbaseRecord{
  constructor(name, tableName, address, data={}){ //, createTransaction
    this.name = name;
    this.tableName = tableName;
    this.address = address;
    this.data = data.toString();
    this.createdAt = (Date.now()).toString();
    this.modifiedAt = 0;
    this.nbTimesModified = 0;
    this.uniqueKey = sha256(name, tableName, data, address, this.createdAt);
    // createTransaction(this)
  }

  getData(){
    return this.data;
  }

}

// class BlockbaseTable{
//   constructor(records=[]){
//     this.name;
//     this.records = records;
//     this.fingerPrint = '';
//   }
//
//   getRecordByName(name){
//     /*Verify if has been tempered with*/
//     for(var record of this.records){
//       if(record.name === name){
//         return record;
//       }else{
//         console.log('Record name '+name+' not found.');
//         return false;
//       }
//     }
//   }
//
//   recalculateMerkleRoot(record){
//     if(record){
//
//     }
//     record.uniqueKey = this.createMerkleRoot(record)
//   }
//
//   addRecord(record){
//     if(record != undefined){
//       this.records[record.uniqueKey] = record;
//       recalculateMerkleRoot();
//     }
//   }
//
//   modifyRecord(name, value, createBlockchainTransaction){
//
//     if(name != undefined){
//       var record = this.getRecordByName(name);
//       if(record !== false){
//         var isValid = (record.uniqueKey === regenerateUniqueKey(record.data, record.address, record.createdAt))
//         if(value != undefined){
//           var oldUniqueKey = record.uniqueKey;
//           record.data = value;
//           record.nbTimesModified++;
//           record.modifiedAt = Date.now();
//           recalculateMerkleRoot();
//           this.records[oldUniqueKey] = record;
//
//           createBlockchainTransaction();
//
//         }else{
//           console.log('Value is undefined');
//           return false;
//         }
//       }else{
//         false
//       }
//
//     }else{
//       console.log('Record name is undefined');
//       return false;
//     }
//
//   }
//
//   deleteRecord(record){
//
//   }
//
//
// }

class Blockbase{
  constructor(ownerAddress){
    this.ownerAddress = ownerAddress
    this.tables = [];
  }

  buildTables(chain){
    var tables = [];
    var records;

    if(chain !== undefined){
      if(Array.isArray(chain)){ //
        for(var i=0; i<chain.length; i++){ //var block of chain
          var block = chain[i]

          if(block.transactions !== 'Genesis block'){
            records = this.findRecords(block.transactions);

            if(records){


                tables.push(records);


            }
          }

        }
        // console.log(tables)
        return tables;

      }
    }
  }

  findRecords(transactions){
    var recordsOfBlock = [];
    var record;
    var transactionHashes;
    if(transactions != undefined){
      if(typeof transactions === 'object'){
        transactionHashes = Object.keys(transactions);
        // console.log(transactionHashes);
        for(var hash of transactionHashes){
          console.log(hash);
          if(transactions[hash].toAddress === 'blockbase'){

            recordsOfBlock[hash] = transactions[hash].data;
            try{
              recordsOfBlock[hash] =  JSON.parse(transactions[hash].data)
            }catch(err){
              // console.log(err);
            }
            // console.log(transactions[hash].data);
            return recordsOfBlock;

          }else{

          }
        }


      }
    }
    return false;

  }

  encryptBlockbase(){

  }
}



function remove(array, element) {
    const index = array.indexOf(element);

    if (index !== -1) {
        array.splice(index, 1);
    }

    return array;
}

function RecalculateHash(block){
  //console.log(sha256(block.previousHash + block.timestamp + JSON.stringify(block.transactions) + block.nonce).toString())
  return sha256(block.previousHash + block.timestamp + merkleRoot(block.transactions) + block.nonce).toString();
}

const regenerateUniqueKey = (name, tableName, data, address, createdAt) =>{
    return sha256(name, tableName, data, address, createdAt)
}

function merkleRoot(dataSets){

  if(dataSets != undefined){
    var hashes = Object.keys(dataSets);


    let merkleRoot = merkle('sha256').sync(hashes);
    return merkleRoot.root();
  }

}



module.exports = { Blockchain, Block, BlockchainAddress, Transaction, BlockbaseRecord, Blockbase};
