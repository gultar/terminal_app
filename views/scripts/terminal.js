var cryptos = [{}];

//////////////////////////////////////////////////////////////
/////////////////////BLOCKCHAIN CONTAINER/////////////////////
//////////////////////////////////////////////////////////////
var blockchain;
//////////////////////////////////////////////////////////////

 const nodeAddresses = ['http://169.254.139.53:8080', 'http://169.254.139.53:8081', 'http://169.254.139.53:8082', 'http://192.168.0.153:8080', 'http://192.168.0.153:8081', 'http://192.168.0.153:8082',
  'http://192.168.0.112:8080', 'http://192.168.0.112:8080', 'http://192.168.1.68:8080', 'http://192.168.0.154:8080', 'http://192.168.1.75:8080']

//List of IP addresses for fallback connections if current connectionfails
var ipList;

//speaks for itself. Used to output which connection we're using
var url = document.URL;

//port of client connection
var port = 8080;

var localAddress = document.URL;//"http://192.168.0.154:"+port;   //Crashes when there is no value. Need to reissue token //'192.168.0.154';// = new BlockchainAddress((ip?ip:"127.0.0.1"), 0, 0);

var currentTime = Date.now();
//This is a counter to limit the number of attempts to try to fetch blockchain from file if unreadable or else
var fetchTrials = 0;
var sendingTrials = 0;
var fallbackCounter = -1;
var outputBuffer;

//Initiating the client token for connecting to network
var clientConnectionToken;

//Container for hexagrams to be sent to screen
var hexagrams = [{}];

//container for background image
var backgroundUrl = $('body').css("background-image");

//container for DOM element that represents the seccond right hand side console on application
var debugOutput_ = document.getElementById('second-container');

//Server connection
var socket;

function fireKey(el,key)
{
    if(document.createEventObject)
    {

        var eventObj = document.createEventObject();
        eventObj.keyCode = key;
        el.fireEvent("onkeydown", eventObj);
        eventObj.keyCode = key;
    }else if(document.createEvent)
    {

        var eventObj = document.createEvent("Events");
        eventObj.initEvent("keydown", true, true);
        eventObj.which = key;
        eventObj.keyCode = key;

        el.dispatchEvent(eventObj);
    }
}

var Terminal = Terminal || function(cmdLineContainer, outputContainer) {
  window.URL = window.URL || window.webkitURL;
  window.requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;

  var cmdLine_ = document.querySelector(cmdLineContainer);
  var output_ = document.querySelector(outputContainer);

  var mobileButton = document.getElementById('mobile-enter');
  var ulContainer = document.getElementById("myULContainer")

  var fs_ = null;
  var cwd_ = null;
  var history_ = [];
  var histpos_ = 0;
  var histtemp_ = 0;


  const CMDS_ = [
    "<span class'help-line'><b class='help-cmd'>cat</b> ------------ Outputs the content of a file or website. Usage: cat URL. Ex: cat https://gultar.github.io/weather</span>",
    "<span class'help-line'><b class='help-cmd'>goto</b> ----------- Opens a new tab with specified URL. Usage: goto URL or shortcut. Ex: goto google.com OR goto g.</span>",
    "<span class'help-line'><b class='help-cmd'>clear</b> ---------- Clears the console</span>",
    "<span class'help-line'><b class='help-cmd'>date</b> ----------- Displays the current date</span>",
    "<span class'help-line'><b class='help-cmd'>echo</b> ----------- Outputs a string into the console. Usage: echo string. Ex: echo Hello World</span>",
    "<span class'help-line'><b class='help-cmd'>help</b> ----------- Displays this message</span>",
    "<span class'help-line'><b class='help-cmd'>uname</b> ---------- Displays information about the browser</span>",
    "<span class'help-line'><b class='help-cmd'>iching</b> --------- Casts a random hexagram and text. Usage: iching HxNb. Ex: iching 40</span>",
    "<span class'help-line'><b class='help-cmd'>crypto</b> --------- Outputs selected crypto currencies compared to major real-world currencies.Is updated every five seconds. Usage: crypto SYM1 SYM2 SYM3... SYM10. EX: crypto ETH DASH BTC</span>",
    "<span class'help-line'><b class='help-cmd'>list-cryptos</b> ---- Displays a list of all known cryptocurrencies</span>",
    "<span class'help-line'><b class='help-cmd'>describe</b> ------- Outputs all related information about a cryptocurrency compared to a real-world currency.Usage: describe SYM CUR <b>-d Data</b>.Ex: describe BTC USD -d Data</span>",
    "<span class'help-line'><b class='help-cmd'>background</b> ----- Changes the background image. Usage: background URL. Ex: background http://www.nafpaktia.com/data/wallpapers/40/860159.jpg</span>",
    "<span class'help-line'><b class='help-cmd'>weather</b> -------- Outputs current weather data from a specific location. Usage: weather City Country. Ex: weather Quebec Canada.</span>",
    "<span class'help-line'><b class='help-cmd'>show-blocks</b> ---- Displays all current blocks on the blockchain. Options: <b>-e or expand</b></span>",
    "<span class'help-line'><b class='help-cmd'>mine</b> ----------- Mines the current transactions</span>"

  ];



  //Refocuses on input line
  window.addEventListener('click', function(e) {
    cmdLine_.focus();
  }, false);

  //Keyboard handler
  cmdLine_.addEventListener('click', inputTextClick_, false);
  cmdLine_.addEventListener('keydown', historyHandler_, false);
  cmdLine_.addEventListener('keydown', processNewCommand_, false);
  mobileButton.addEventListener('click',
    function(){
      var keyboardEvent = document.createEvent("KeyboardEvent");

      fireKey(cmdLine_, 13);
    }
  , false);
  //
  function inputTextClick_(e) {
    this.value = this.value;
  }


  function historyHandler_(e) {
    if (history_.length) {
      if (e.keyCode == 38 || e.keyCode == 40) { //event keycode up or down on keyboard
        if (history_[histpos_]) {
          history_[histpos_] = this.value;
        } else {
          histtemp_ = this.value;
        }
      }

      if (e.keyCode == 38) { // up
        histpos_--;
        if (histpos_ < 0) {
          histpos_ = 0;
        }
      } else if (e.keyCode == 40) { // down
        histpos_++;
        if (histpos_ > history_.length) {
          histpos_ = history_.length;
        }
      }

      if (e.keyCode == 38 || e.keyCode == 40) {
        this.value = history_[histpos_] ? history_[histpos_] : histtemp_;
        this.value = this.value; // Sets cursor to end of input.
      }
    }
  }

  //Outputs the manual line drawing made in the Hexagram class
  function drawIchingLines(myHex){
    for(var i=myHex.sixlines.length; i>=0; i--){
      output(myHex.drawLine(myHex.sixlines[i]));
    }
  }


  function doCORSRequest(options, printResult, noJSON=false) {
    var cors_api_url = 'https://cors-anywhere.herokuapp.com/';
    var x = new XMLHttpRequest();
    x.open(options.method, cors_api_url + options.url);
    x.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    x.onload = x.onerror = function() {
      printResult((noJSON? x.responseText: JSON.parse(x.responseText)));
    }
    if (/^POST/i.test(options.method)) {
      x.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    }
    x.send(options.data);
  }




  function validateArgs(cmd){
    if (cmd && cmd.trim()) {
      var args = cmd.split(' ').filter(function(val, i) {
        return val;
      });
      var cmd = args[0].toLowerCase();
      args = args.splice(1); // Remove cmd from arg list.
      console.log(args);

      return args;
    }
  }

  //Core of commands processing
  function processNewCommand_(e) {

    if (e.keyCode == 9) { // tab
      e.preventDefault();
      // Implement tab suggest.
    } else if (e.keyCode == 13) { // enter
      // Save shell history.
      if (this.value) {
        history_[history_.length] = this.value;
        histpos_ = history_.length;
      }

      // Duplicate current input and append to output section.
      var line = this.parentNode.parentNode.cloneNode(true);

      line.removeAttribute('id')
      line.classList.add('line');
      var input = line.querySelector('input.cmdline');
      input.autofocus = false;
      input.readOnly = true;
      output_.appendChild(line);

      if (this.value && this.value.trim()) {
        var args = this.value.split(' ').filter(function(val, i) {
          return val;
        });
        var cmd = args[0].toLowerCase();
        args = args.splice(1); // Remove cmd from arg list.
      }

      switch (cmd) {
        case 'cat':
          runCat(args, cmd);
          break;

        case 'goto':
          openInNewTab(args[0]);
          break;

        case 'clear':
          runClear(args, cmd);
          break;

        case 'date':
          output( new Date() );
          break;

        case 'echo':
          output( args.join(' ') );
          break;

        case 'debug':
          ConsoleLogHTML.connect(ulContainer); // Redirect log messages
          if(args[0] == 's' || args[0] == 'stop')
            ConsoleLogHTML.disconnect(); // Stop redirecting
          break;
        case 'ls':
        case 'help':
          output('<div class="ls-files">' + '<p>' +CMDS_.join('<br>')+ '</p>'+ '</div>');
          break;

        case 'uname':
          output(navigator.appVersion);
          // connection.send(JSON.stringify(new Transaction(localAddress, 'ws://192.168.0.154:8080', 10, clientConnectionToken)));
          // socket.emit('seedBlockchain', 'Hello world');
          socket.emit('syncBlockchain', blockchain);
          break;


        case 'iching':
          runIching(args, cmd);
          break;

        case 'crypto':
          runCrypto(args, cmd, this.value);
          break;

        case 'list-cryptos':
          getListOfCryptos();
          break;

        case 'describe':
          runDescribe(args, cmd);
          break;

        case 'background':
          backgroundUrl = args[0];
          $('body').css("background-image", "url("+backgroundUrl+")")
          break;
        case 'w':
        case 'weather':
          if(args.length == 0){
            args = ['Quebec', 'Canada'];
          }
          runWeather(args, cmd);
          break;

        case 'f':
        case 'forecast':
          if(args.length == 0){
            args = ['Quebec', 'Canada'];
          }
          runForecast(args, cmd);
          break;
        case 'mine':
          startMining(localAddress);

          break;

        case 'show-blocks':
          runShowBlocks(args, cmd);
          break;

        case 'show-chain':
          $('#element').jsonView(blockchain);
          break;
        case 'valid-blocks':
          if(blockchain.isChainValid()){
            output('Blockchain still valid');
          }
          else{
            output('Blockchain not valid - Check console for info');
          }
          break;

        case 'show-transact':
          runShowTransact();
          break;

        default:
          if (cmd) {
            output(cmd + ': command not found');
          }
      };

      window.scrollTo(0, getDocHeight_());
      this.value = ''; // Clear/setup line for next input.

      function runCat(args, cmd){
        var url = args.join(' ');
        if (!url) {
          output('Usage: ' + cmd + ' https://s.codepen.io/...');
          output('Example: ' + cmd + ' https://s.codepen.io/AndrewBarfield/pen/LEbPJx.js');
          return;
        }
          console.log(url);
          doCORSRequest({
            method:'GET',
            url: url,
            data:'',
          }, function(data){

             output(data);
           }, true);
      }

      function runClear(args, cmd){
        if(args[0] == '-h' || args[0] == 'hard'){
          window.location.reload(true);
        }
        if(args[0] == 'debug' || args[0] =='-d'){
          $('#myULContainer').html('');
        }
          $('output').html('');
          clearAll();
          $('#myCanvas').css('visibility', 'hidden');
          initTerminalMsg();

      }


      function runIching(args, cmd){
        if(args[0]){
          if(args[0] == '-c' || args[0] == 'chart'){
            output('<img src="./images/trigramchart-clear.gif" alt="chart">');
          }else{
            var myHex = new Hexagram();
            fetchHexFromFireBase(args[0]);
            myHex.setTextAndTitle();
            //blockchain.createTransaction(new Transaction('blockchain', '192.168.1.69', 0, myHex));
            drawIchingLines(myHex);
          }

          return;
        }
        var myHex = new Hexagram();
        myHex.castSixLines();
        fetchHexFromFireBase(myHex.getHexagramNumber());
        myHex.setTextAndTitle();
        drawIchingLines(myHex);
      }


      function runCrypto(args, cmd, rawArgs){
        var currenciesPassed = args.join(' ');
        if (!currenciesPassed) {
          output('Usage: ' + cmd + ' Currency Currency Currency Cur... Max 10');
          output('Example: ' + cmd + ' ETH DASH LTC BTC');
          return;
        }

        var cryptoOption = validateArgs(rawArgs);
        getSelectedCryptos(
          cryptoOption[0],
          (cryptoOption[1]? cryptoOption[1]:false),
          (cryptoOption[2]? cryptoOption[2]:false),
          (cryptoOption[3]? cryptoOption[3]:false),
          (cryptoOption[4]? cryptoOption[4]:false),
          (cryptoOption[5]? cryptoOption[5]:false),
          (cryptoOption[6]? cryptoOption[6]:false),
          (cryptoOption[7]? cryptoOption[7]:false),
          (cryptoOption[8]? cryptoOption[8]:false),
          (cryptoOption[9]? cryptoOption[9]:false)
        );
      }

      function runDescribe(args, cmd){
        var describeOptions = args.join(' ');
        if (!describeOptions) {
          output('Usage: ' + cmd + ' Crypto-Symbol Currency-to-Compare -d Data');
          output('Example: ' + cmd + ' ETH USD -d');
          return;
        }
        var exchange = (args[2] == '-d' ? true : (args[2] == 'data' ? true : false));
        describeCrypto(args[0], args[1], exchange);
      }

      function runWeather(args, cmd){

        var weatherOptions= args.join(' ');
        if (!weatherOptions) {
          output('Usage: ' + cmd + ' city country');
          output('Example: ' + cmd + ' Quebec Canada');
          return;
        }
        if(args[2] == 'forecast' || args[2] == '-f'){
          fetchWeatherData(args[0], args[1], true);
          return;
        }
        fetchWeatherData(args[0], args[1]);
      }

      function runForecast(args, cmd){
        var weatherOptions= args.join(' ');
        if (!weatherOptions) {
          output('Usage: ' + cmd + ' city country');
          output('Example: ' + cmd + ' Quebec Canada');
          return;
        }
        fetchWeatherData(args[0], args[1], true);
      }

    function runShowBlocks(args=false, cmd=false){
      output("<span class='output-header'>BLOCKCHAIN</span>"); //<br><hr>
      console.log(blockchain);
      for(var i=0; i<blockchain.chain.length; i++){
        var keys = Object.keys(blockchain.chain[i]);
        var data = blockchain.chain[i];
        if(args[0] == 'expand' || args[0] == '-e'){
          loopThroughBlockchain(keys, data, true);
        }else{
          loopThroughBlockchain(keys, data);
        }

      }
    }

    function runShowTransact(){
      var transIndex = 0;


      output('----------Pending Transactions----------')
      for(transactionKey of Object.keys(blockchain.pendingTransactions)){
        var transaction = blockchain.pendingTransactions[transactionKey];
        var keys = Object.keys(transaction);
        // var transactionOutput = loopThroughBlockTransactions(transactionKeys, transaction);
        var transactionOutput = loopThroughBlockTransactions(keys,transaction);
        output('<div class="block-data">' + transactionOutput + '</div>');
        transIndex++;
      }


    }

    }
  }


  function output(html) {
    output_.insertAdjacentHTML('beforeEnd', '<p>' + html + '</p>');
    cmdLine_.focus();
  }



  function outputTd(html) {
    output_.insertAdjacentHTML('beforeEnd', '<td>' + html + '</td>');
  }

  function openInNewTab(url) {
    if(url.substring(0,4) != 'http' || url.substring(0,5) != 'https') {
      url = checkForShortcut(url);
      url = 'https://'+url;
      console.log(url);
    }
    var win = window.open(url);
    win.focus();
  }

  function checkForShortcut(url){
    switch(url){
      case 'f':
        return 'facebook.com';
      case 'g':
        return 'google.com';
      case 'h':
        return 'hotmail.com';
      case 'y':
        return 'youtube.com';
      case 'r':
        return 'remix.ethereum.org';
      default:
        return url;
    }
  }

  function initTerminalMsg(){

    output('<div id="date">' + new Date() + '</div><p>Enter "help" for more information.</p>');
    setInterval(function(){
      $('#date').html(new Date());
    }, 1000)
  }

  // Cross-browser impl to get document's height.
  function getDocHeight_() {
    var d = document;

    return Math.max(
        Math.max(d.body.scrollHeight, d.documentElement.scrollHeight),
        Math.max(d.body.offsetHeight, d.documentElement.offsetHeight),
        Math.max(d.body.clientHeight, d.documentElement.clientHeight)
    );
  }

  //
  return {
    init: function() {
      initTerminalMsg();

      getProperOutput(output_, ulContainer);
    },
    output: output,
    outputDebug: outputDebug
  }
};

function outputDebug(html) {

  debugOutput_.insertAdjacentHTML('beforeEnd', '<p>' + html + '</p>');


}


function startMining(mining=false){

  if(!mining){
    output('Starting the miner...');
    socket.emit('miningRequest');
  }else{
    output('Stopping the miner...');
    socket.emit('miningRequest');
  }


}

function displayAddressStats(addresses){

  for(address in addresses){
      output(address.address + ' mined ' + address.blocksMined + ' blocks');
      output('\nBalance of '+address.address+' is '+ address.balance);
  }

}

function sendTransaction(fromAddress, toAddress, amount, data=''){


    issueClientToken();
    // console.log('Client token issued', clientConnectionToken);


  var transactToSend = {
    fromAddress : fromAddress,
    toAddress : toAddress,
    amount : amount,
    data : data
  }

  socket.emit('transaction', transactToSend, clientConnectionToken)



}


function initSocketConnection(nodeAddress=localAddress){
setTimeout(function(){

  if(nodeAddress != undefined){
    nodeAddress = localAddress;
  }

  issueClientToken(nodeAddress);

    socket  = io(nodeAddress);

    // if(socket.connected){

      socket.on('disconnect', function(){
        console.log('You have disconnected from node server');
        clearAll();
        socket.emit('close', clientConnectionToken);

        fallbackCounter++;
        socket.removeAllListeners('message');
        socket.removeAllListeners('disconnect');

        //


        // fallBackOntoOtherNode(fallbackCounter);
      })

      socket.on('connect', function(){
        console.log('Connected to node ', nodeAddress);
        socket.emit('client-connect', clientConnectionToken);
        socket.emit('getBlockchain', clientConnectionToken);
        fallbackCounter = 1;
      })

      socket.on('message', function(message){
        console.log('Server:', message);
        outputDebug('Server: '+message)
      })

      socket.on('serverMessage', function(message){
        console.log('Server', message);
        outputDebug('Server: '+message);
      })

      // socket.on('seedingNodes', function(node){
      //   blockchain.nodeAddresses.push(node);
      //   console.log('Seeding the blockchain with this address:', node);
      // })

      socket.on('miningApproved', function(updatedBlockchain){
        var latestBlock = getLatestBlock(updatedBlockchain);
        console.log('Latest Block Hash:', latestBlock.hash);
        blockchain = updatedBlockchain;
        console.log("Blockchain:", updatedBlockchain);
        output('Block mined: ' + latestBlock.hash + " by " + latestBlock.minedBy);
      });

      socket.on('needMoreTransact', function(message){
        output(message);
        console.log(message);
      });

      fetchBlockchainFromServer();

    // }

}, 2000)


}

//Have to work on this one to avoid infinite loop
function fallBackOntoOtherNode(fallbackCounter){
  if(fallbackCounter < ipList.length){
    socket = null;
    if(ipList[fallbackCounter] == localAddress){
      fallbackCounter++;
    }
    console.log('Falling back onto node ', ipList[fallbackCounter])
    initSocketConnection(ipList[fallbackCounter]);
    fallbackCounter++;
  }
}


function fetchBlockchainFromServer(){

      socket.emit('getBlockchain', clientConnectionToken);
      console.log('Fetching blockchain from server node...');
      socket.on('blockchain', function(data){
        if(fetchTrials <= 5){
          if(data == undefined){
            setTimeout(function(){
              console.log('blockchain not loaded correctly. Fetching again...');
              fetchTrials++;
              return fetchBlockchainFromServer();
            },2000)
          }
            blockchain = data;
            console.log('Fetched blockchain:',blockchain);
          fetchTrials = 0;

        }else{
          console.log('Tried to fetch from server 5 times. Server unavailable...');
            fetchTrials = 0;
        }


      });

}

function clearAll() {
  for (var i = setTimeout(function() {}, 0); i > 0; i--) {
    window.clearInterval(i);
    window.clearTimeout(i);
    if (window.cancelAnimationFrame) window.cancelAnimationFrame(i);
  }
}


window.onbeforeunload = function() {
    clearAll();
    localStorage.setItem('savedBackground', $('body').css("background-image"));
    //saving the blockchain to server, then to file

    // saveBlockchainToServer();

}

window.onload = function() {


    initSocketConnection();



    $('#myCanvas').css('visibility', 'hidden');
    $('body').css("background-image", localStorage.getItem('savedBackground'));
}

function longestChain(localBlockchain=false, distantBlockchain=false){
  var longestBlockchain;

  if(distantBlockchain){
    if(localBlockchain){
      if(localBlockchain.chain.length >= distantBlockchain.chain.length){
        longestBlockchain = localBlockchain;
      }
      else{
        longestBlockchain = distantBlockchain;
      }
      return longestBlockchain;
    }else{
      //no localblockchain, revert to distant node's version
      return distantBlockchain
    }
  }else{
    //no distant blockchain, revert to local version
    return localBlockchain;
  }
}

function getLatestBlock(blockchain){
  var lengthChain = blockchain.chain.length;
  return blockchain.chain[lengthChain - 1];
}

function issueClientToken(address=localAddress){
  clientConnectionToken = {
    'type' : 'endpoint',
    'address' : address,
    'hashSignature' : sha256(address, currentTime)
  }


}
