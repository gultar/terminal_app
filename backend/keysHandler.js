const fs = require('fs');
const sha256 = require('./sha256');
const crypto = require('crypto'),
    algorithm = 'aes-256-ctr'
const cryptico = require('cryptico');
const base58 = require('base58');
const base64 = require('base-64');
var utf8 = require('utf8');
var childProcess = require('child_process');
const { exec } = require('child_process');

 		 //Need to implement a keywords topassword method, a bit like metamaskpassword = ;
//privateKey would be within local files. A key phrase like the one above
let password = '';

const loadPrivateKey = (cb) =>{
  var callback = cb;
  fs.exists('private.pem', (exists)=>{
    if(exists){
      var data = '';
      var rstream = fs.createReadStream('private.pem');

      rstream.on('error', (err) =>{
				console.log(err);
				return false;
      })

			rstream.on('data', (chunk) => {
				data += chunk;
			});


			rstream.on('close', () =>{  // done

				if(data != undefined){

          if(typeof callback == 'function'){

            cb(data)
          }else{
            return false;
          }


				}else{
					return false;
				}

			});
    }else{
      createPrivateKey();
      return 'again';
    }

  })
}

const loadPublicKey = (cb) =>{
  var callback = cb;

  fs.exists('public.pem', (exists)=>{
    if(exists){
      var data = '';
      var rstream = fs.createReadStream('public.pem');

      rstream.on('error', (err) =>{
        console.log(err);
        return false;
      })

      rstream.on('data', (chunk) => {
        data += chunk;
      });


      rstream.on('close', () =>{  // done

        if(data != undefined){

          if(typeof callback == 'function'){

            cb(data)
          }else{
            return false;
          }


        }else{
          return false;
        }

      });
    }else{
      createPublicKey();
      return 'again';
    }

  })
}

const createPrivateKey = ()=>{
  exec('openssl genrsa -out private.pem 1024', (err, stdout, stderr) => {
    if (err) {
      // node couldn't execute the command
      console.log(err);
      return;
    }

    // the *entire* stdout and stderr (buffered)
    console.log(`stdout: ${stdout}`);
    console.log(`stderr: ${stderr}`);

  });
}

const createPublicKey = () =>{
  fs.exists('private.pem', (exists)=>{
    if(exists){
      exec('openssl rsa -in private.pem -pubout > public.pem', (err, stdout, stderr) => {
        if (err) {
          // node couldn't execute the command
          console.log(err);
          return;
        }

        // the *entire* stdout and stderr (buffered)
        console.log(`stdout: ${stdout}`);
        console.log(`stderr: ${stderr}`);
      });
    }else{
      console.log('mykey.pub does not exist')
    }

  })
}

const getKeyPair = (cb)=>{
  let keychain = {
    privateKey:'',
    publicKey:''
  }
  console.log('Fetching keychain...')
  try{
    loadPrivateKey((privateKey)=>{

      if(privateKey && privateKey != 'again'){
        keychain.privateKey = privateKey

      }

      loadPublicKey((publicKey)=>{

        if(publicKey && publicKey != 'again'){
          keychain.publicKey = publicKey;
          cb(keychain);
        }

      })
    })




  }catch(err){
    console.log(err);
  }
}




const encrypt = (text) =>{
  var password = 'One ring to rule them all, one ring to find them, one ring to bring them and in the darkness bind them!';
  var cipher = crypto.createCipher(algorithm,password)
  var crypted = cipher.update(text,'utf8','hex')
  crypted += cipher.final('hex');
  return crypted;
}

const decrypt = (text) =>{
  var password = 'One ring to rule them all, one ring to find them, one ring to bring them and in the darkness bind them!';
  var decipher = crypto.createDecipher(algorithm,password)
  var dec = decipher.update(text,'hex','utf8')
  dec += decipher.final('utf8');
  return dec;
}





module.exports = { encrypt, decrypt, getKeyPair }
