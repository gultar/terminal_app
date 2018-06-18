const fs = require('fs');
const sha256 = require('./sha256');
const crypto = require('crypto'),
    algorithm = 'aes-256-ctr'
const cryptico = require('cryptico');
const base58 = require('base58');
const base64 = require('base-64');
var utf8 = require('utf8');
 		 //Need to implement a keywords topassword method, a bit like metamaskpassword = ;
//privateKey would be within local files. A key phrase like the one above
let password = '';
const generatePrivateKey = (callback) =>{
  var rsaKey
  var publicKeyString
  var msgOnce = false;
  fs.exists('.key', (exists)=>{
    if(!exists){
      let stdin = process.stdin;
      stdin.resume();
      stdin.setEncoding('utf8');
      console.log("---Private Key Creation Tool---\n");
      console.log("THIS IS A TWO-PART PROCESS:\n");
      console.log("First, you create your passphrase. This is very important as it is the only way to recover the private key to your account\n");
      console.log("Second, you will create a reminder, or secret question that will be encrypted to help in case you forget the passphrase\n")
      console.log(" -- Please enter a passphrase from which the private key will be created : -- \n\n")
      stdin.on('data', (data) => {

        let wstreamKey = fs.createWriteStream('.key');

        password = (sha256(data)).toString()

        rsaKey = cryptico.generateRSAKey(password, 512);
        publicKeyString = cryptico.publicKeyString(rsaKey);
        if(!msgOnce){
          console.log('\n -- Now enter a secret reminder for your key: -- \n');
          msgOnce = true;
        }

        stdin.on('data', (reminder)=>{

          if(reminder){
            var keyChain = {
              'password':password,
              'reminder':reminder,
              'publicKey':publicKeyString
            }
            wstreamKey.write(JSON.stringify(keyChain));
            console.log("Private Key: "+sha256(encrypt(data))+"\nReminder (decrypted): "+reminder);

            wstreamKey.end();
            callback(keyChain);
          }

        })

      })
    }

  })

}



const loadprivateKey = (cb) =>{
  var callback = cb;
  fs.exists('.key', (exists)=>{
    if(exists){
      var data = '';
      var rstream = fs.createReadStream('.key');
      var keyObj = {};
      rstream.on('error', (err) =>{
				console.log(err);
				return false;
      })

			rstream.on('data', (chunk) => {
				data += chunk;
			});



			rstream.on('close', () =>{  // done

				if(data != undefined){
          try{
            keyObj = JSON.parse(data);

          }catch(err){
            console.error(err);
            return false
          }

          if(typeof callback == 'function'){
            callback(keyObj)
          }else{
            return false;
          }


				}else{
					return false;
				}

			});
    }
  })
}

const getPublicKeyAndRsaKey = (callback) =>{
  var rsakey;
  var publicKey;
  fs.exists('.key', (exists)=>{

    if(!exists){
      /*
      * Could be so much better. I should not have to repeat myself
      *
      */
      generatePrivateKey((keyObj)=>{
        if(keyObj){
          rsakey = cryptico.generateRSAKey(keyObj.password, 1024);
          publicKey = cryptico.publicKeyString(rsakey);
          publicID = cryptico.publicKeyID(publicKey);
          callback(publicKey, rsakey, publicID);
        }
      });

    }else{

      loadprivateKey((keyObj)=>{
        if(keyObj){
          rsakey = cryptico.generateRSAKey(keyObj.password, 1024);
          publicKey = cryptico.publicKeyString(rsakey);
          publicID = cryptico.publicKeyID(publicKey);
          callback(publicKey, rsakey, publicID);
        }
      });
    }

  })

}

const handleKeyChain = (keyObj, callback) =>{

}

const generateCheckAddress = (timestamp='',  message='') =>{
  if(password){

    let checkAddress = '';
    timestamp = (!timestamp? Date.now() : timestamp);

    try{
      timestamp = timestamp.toString();
      message = message.toString();
      checkAddress = sha256(password+ timestamp+ message);

    }catch(err){
      console.log(err);
    }


    return checkAddress;
  }

}


const encrypt = (text) =>{
  var cipher = crypto.createCipher(algorithm,password)
  var crypted = cipher.update(text,'utf8','hex')
  crypted += cipher.final('hex');
  return crypted;
}

const decrypt = (text) =>{
  var decipher = crypto.createDecipher(algorithm,password)
  var dec = decipher.update(text,'hex','utf8')
  dec += decipher.final('utf8');
  return dec;
}

const rsaEncrypt = (data, publicKey, rsaKeyToSign) =>{
  if(data != undefined && publicKey != undefined){
    if(rsaKeyToSign){
      return cryptico.encrypt(data, publicKey, rsaKeyToSign);
    }else{
      return cryptico.encrypt(data, publicKey);
    }

  }

}

const rsaDecrypt = (encryptedObject, rsaKey) =>{
  var decryptedObject = false;

  if(encryptedObject != undefined){
    if(encryptedObject.hasOwnProperty('status')){
      if(encryptedObject.status === 'success'){
        if(rsaKey != undefined){
          return cryptico.decrypt(encryptedObject.cipher, rsaKey);
        }
      }
    }
  }

}



module.exports = { encrypt, decrypt, generateCheckAddress, getPublicKeyAndRsaKey, rsaEncrypt, rsaDecrypt }
