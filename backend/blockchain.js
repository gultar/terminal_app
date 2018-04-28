//Modules
const sha256 = require('./sha256');
const JSONdb = require('simple-json-db');
/******************************************/
/***********Blockchain classes*************/
/******************************************/

///////////////Transaction//////////////////
//A transaction is done if there is a
//change of data on the blockchain
class Transaction{
  constructor(fromAddress, toAddress, amount, data=''){
    this.fromAddress = fromAddress;
    this.toAddress = toAddress;
    this.amount = amount;
    this.data = data;
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
  }

  calculateHash(){
    return sha256(this.previousHash + this.timestamp + JSON.stringify(this.transactions) + this.nonce).toString();
  }

  /*Proof of Work*/
  mineBlock(difficulty){
    while(this.hash.substring(0, difficulty) !== Array(difficulty+1).join("0")){
      this.nonce++;
      this.hash = this.calculateHash();
    }

    console.log("Block mined: " + this.hash);

  }
}


/////////////////////Blockchain///////////////////////
module.exports = class Blockchain{
  constructor(chain=false, pendingTransactions=false){
    this.chain = (chain? chain: [this.createGenesisBlock()]);
    this.difficulty = 3;
    this.pendingTransactions = (pendingTransactions? pendingTransactions: []);
    this.miningReward = 50;
    this.nodeAddresses = [{}]; //Stores all the node addresses of the P2P network
  }

  createGenesisBlock(){
    return new Block("01/01/2018", "Genesis block", "0");
  }

  getLatestBlock(){
    return this.chain[this.chain.length - 1];
  }

  addBlock(newBlock){
    newBlock.previousHash = this.getLatestBlock().hash;
    newBlock.mineBlock(this.difficulty); //Proof of work in action
    this.chain.push(newBlock);
  }

  minePendingTransactions(miningRewardAddress){
    let block = new Block(Date.now(), this.pendingTransactions);
    block.previousHash = this.getLatestBlock().hash;
    block.mineBlock(this.difficulty);

    miningRewardAddress.minedOneBlock();
    miningRewardAddress.setBalance(this.miningReward);

    console.log("Block successfully mined!");
    this.chain.push(block);
    this.pendingTransactions = [
      new Transaction(null, miningRewardAddress.address, this.miningReward, "")
    ];
  }

  createTransaction(transaction){
    this.pendingTransactions.push(transaction);
  }

  getBalanceOfAddress(address){
    let balance = 0;

    for(const block of this.chain){
      console.log(block);
      for(const trans of block.transactions){
        console.log('Trans: ' + trans.data);
        if(trans.fromAddress === address){
          console.log("sending "+trans.amount);
          balance -= trans.amount;
        }

        if(trans.toAddress === address){
          console.log("receiving "+ balance);
          balance += trans.amount;
        }
      }
    }
    return balance;
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
        return false;
      }
    }
    return true;
  }
}

class BlockchainAddress{
  constructor(address, blocksMined,  balance){
    this.address = address;
    this.blocksMined = blocksMined;
    this.balance = balance;
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
  constructor(address, data=[{}]){
    this.address = address;
    this.data = data;
    this.createdAt = Date.now();
    this.modifiedAt = 0;
    this.nbTimesModified = 0;
  }

  getFullData(){
    return data;
  }

  getDataValue(keyToLookup){
    var valueFound = [];
    valueFound = recursiveLookup(keyToLookup, data, true);
    console.log('Value:', valueFound);
  }

}





function RecalculateHash(block){
  console.log(sha256(block.previousHash + block.timestamp + JSON.stringify(block.transactions) + block.nonce).toString())
  return sha256(block.previousHash + block.timestamp + JSON.stringify(block.transactions) + block.nonce).toString();
}
