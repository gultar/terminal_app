module.exports = class BlockchainAddress{
  constructor(address, blocksMined=0,  balance=0){
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
