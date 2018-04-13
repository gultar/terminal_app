var cryptos = [{}];

let blockchain = new Blockchain();
let sachaAddress = new BlockchainAddress('192.168.1.69', 0, 0);
var hexagrams = [{}];
let backgroundUrl = $('body').css("background-image");

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

/*var util = util || {};
util.toArray = function(list) {
  return Array.prototype.slice.call(list || [], 0);
};*/

var Terminal = Terminal || function(cmdLineContainer, outputContainer) {
  window.URL = window.URL || window.webkitURL;
  window.requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;

  var cmdLine_ = document.querySelector(cmdLineContainer);
  var output_ = document.querySelector(outputContainer);
  var mobileButton = document.getElementById('mobile-enter');



  const CMDS_ = [
    "<span class'help-line'><b class='help-cmd'>cat</b> ------------ Outputs the content of a file or website. Usage: cat URL. Ex: cat https://gultar.github.io/weather</span>",
    "<span class'help-line'><b class='help-cmd'>clear</b> ---------- Clears the console</span>",
    "<span class'help-line'><b class='help-cmd'>clock</b> ---------- Displays a fancy clock</span>",
    "<span class'help-line'><b class='help-cmd'>date</b> ----------- Displays the current date</span>",
    "<span class'help-line'><b class='help-cmd'>echo</b> ----------- Outputs a string into the console. Usage: echo string. Ex: echo Hello World</span>",
    "<span class'help-line'><b class='help-cmd'>help</b> ----------- Displays this message</span>",
    "<span class'help-line'><b class='help-cmd'>uname</b> ---------- Displays information about the browser</span>",
    "<span class'help-line'><b class='help-cmd'>whoami</b> --------- ?????</span>",
    "<span class'help-line'><b class='help-cmd'>iching</b> --------- Casts a random hexagram and text. Usage: iching HxNb. Ex: iching 40</span>",
    "<span class'help-line'><b class='help-cmd'>crypto</b> --------- Outputs selected crypto currencies compared to major real-world currencies.Is updated every five seconds. Usage: crypto SYM1 SYM2 SYM3... SM10. EX: crypto ETH DASH BTC</span>",
    "<span class'help-line'><b class='help-cmd'>list-cryptos</b> ---- Displays a list of all known cryptocurrencies</span>",
    "<span class'help-line'><b class='help-cmd'>describe</b> ------- Outputs all related information about a cryptocurrency compared to a real-world currency.Usage: describe SYM CUR -d Data.Ex: describe BTC USD -e Data</span>",
    "<span class'help-line'><b class='help-cmd'>background</b> ----- Changes the background image. Usage: background URL. Ex: background http://www.nafpaktia.com/data/wallpapers/40/860159.jpg</span>",
    "<span class'help-line'><b class='help-cmd'>weather</b> -------- Outputs current weather data from a specific location. Usage: weather City Country. Ex: weather Quebec Canada.</span>",
    "<span class'help-line'><b class='help-cmd'>show-blocks</b> ---- Displays all current blocks on the blockchain.</span>",
    "<span class'help-line'><b class='help-cmd'>flush-blocks</b> --- Flushes all the blocks on the blockchain</span>",
    "<span class'help-line'><b class='help-cmd'>mine</b> ----------- Mines the current transactions</span>",
    "<span class'help-line'><b class='help-cmd'>game-of-life</b> --- Displays a Conway's Game of Life</span>"

  ];

  var fs_ = null;
  var cwd_ = null;
  var history_ = [];
  var histpos_ = 0;
  var histtemp_ = 0;

  window.addEventListener('click', function(e) {
    cmdLine_.focus();
  }, false);

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

  function clearAll() {
    for (var i = setTimeout(function() {}, 0); i > 0; i--) {
      window.clearInterval(i);
      window.clearTimeout(i);
      if (window.cancelAnimationFrame) window.cancelAnimationFrame(i);
    }
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

        case 'clear':
          runClear(args, cmd);
          break;

        case 'clock':
          var appendDiv = jQuery($('.clock-container')[0].outerHTML);
          appendDiv.attr('style', 'display:inline-block');
          output_.appendChild(appendDiv[0]);
          break;

        case 'date':
          output( new Date() );
          break;

        case 'echo':

          output( args.join(' ') );
          break;

        case 'help':
          output('<div class="ls-files">' + '<p>' +CMDS_.join('<br>')+ '</p>'+ '</div>');
          break;

        case 'uname':
          output(navigator.appVersion);
          break;

        case 'whoami':
          var result = "<img src=\"" + codehelper_ip["Flag"]+ "\"><br><br>";
          for (var prop in codehelper_ip)
            result += prop + ": " + codehelper_ip[prop] + "<br>";
          output(result);
          break;
        case 'game-of-life':
          $('#myCanvas').css('visibility', 'visible');
          initGameOfLife();
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
        case 'weather':
          runWeather(args, cmd);

          break;
        case 'mine':
          runMine(args, cmd);
          break;
        case 'show-blocks':
          console.log(blockchain);
          for(let i=0; i<blockchain.chain.length; i++){
            let keys = Object.keys(blockchain.chain[i]);
            let data = blockchain.chain[i];
            loopThroughBlockchain(keys, data, true);
          }
          break;
        case 'flush-blocks':
          blockchain = new Blockchain();
          sachaAddress = new BlockchainAddress('192.168.1.69', 0, 0);
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
          break;
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
          $('output').html('');
          clearAll();
          $('#myCanvas').css('visibility', 'hidden');

          output('<div id="date">' + new Date() + '</div><p>Enter "help" for more information.</p>');
          setInterval(function(){
            $('#date').html(new Date());
          }, 1000)
      }

      function runIching(args, cmd){

        if(args[0]){
          var myHex = new Hexagram();
          fetchHexFromFireBase(args[0]);
          myHex.setTextAndTitle();
          //blockchain.createTransaction(new Transaction('blockchain', '192.168.1.69', 0, myHex));
          drawIchingLines(myHex);
          return;

        }

        var myHex = new Hexagram();
        myHex.castSixLines();
        fetchHexFromFireBase(myHex.getHexagramNumber());
        myHex.setTextAndTitle();
        drawIchingLines(myHex);
      }

      function runCrypto(args, cmd, rawArgs){
        let currenciesPassed = args.join(' ');
        if (!currenciesPassed) {
          output('Usage: ' + cmd + ' Currency Currency Currency Cur... Max 10');
          output('Example: ' + cmd + ' ETH DASH LTC BTC');
          return;
        }

        let cryptoOption = validateArgs(rawArgs);
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
        let describeOptions = args.join(' ');
        if (!describeOptions) {
          output('Usage: ' + cmd + ' Crypto-Symbol Currency-to-Compare -d Data');
          output('Example: ' + cmd + ' ETH USD -d');
          return;
        }
        let exchange = (args[2] == '-d' ? true : (args[2] == 'data' ? true : false));
        describeCrypto(args[0], args[1], exchange);
      }

      function runWeather(args, cmd){
        let weatherOptions= args.join(' ');
        if (!weatherOptions) {
          output('Usage: ' + cmd + ' City Country');
          output('Example: ' + cmd + ' Quebec Canada');
          return;
        }
        if(args[2] == 'forecast' || args[2] == '-f'){
          fetchWeatherData(args[0], args[1], true);
          return;
        }
        fetchWeatherData(args[0], args[1]);
      }

      function runMine(args=null, cmd=null){
        output('Starting the miner... ');
        setTimeout(function(){

          blockchain.minePendingTransactions(sachaAddress);
          output('Block mined: ' + blockchain.getLatestBlock().hash);
          output(sachaAddress.address + ' mined ' + sachaAddress.getBlocksMined() + ' blocks');
          output('\nBalance of '+sachaAddress.address+' is '+ sachaAddress.getBalance());
        }, 1000)

      }


    }
  }

  //
  function formatColumns_(entries) {
    var maxName = entries[0].name;
    util.toArray(entries).forEach(function(entry, i) {
      if (entry.name.length > maxName.length) {
        maxName = entry.name;
      }
    });

    var height = entries.length <= 3 ?
        'height: ' + (entries.length * 15) + 'px;' : '';

    // 12px monospace font yields ~7px screen width.
    var colWidth = maxName.length * 7;

    return ['<div class="ls-files" style="-webkit-column-width:',
            colWidth, 'px;', height, '">'];
  }

  //
  function output(html) {
    output_.insertAdjacentHTML('beforeEnd', '<p>' + html + '</p>');
  }

  function outputTd(html) {
    output_.insertAdjacentHTML('beforeEnd', '<td>' + html + '</td>');
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
      output('<div id="date">' + new Date() + '</div><p>Enter "help" for more information.</p>');
      getProperOutput(output_);
      setInterval(function(){
        $('#date').html(new Date());
      }, 1000)
    },
    output: output
  }
};

window.onbeforeunload = function() {

    $('.blockchain-output').html(JSON.stringify(blockchain));
    $('.address-buffer').html(JSON.stringify(sachaAddress));
    console.log(JSON.stringify(sachaAddress));
    localStorage.setItem('savedBlockchain', $('.blockchain-output').text());
    localStorage.setItem('savedSachaAddress', $('.address-buffer').text())
    localStorage.setItem('savedBackground', $('body').css("background-image"));
    // ...
}

window.onload = function() {
  console.log('Saved the blockchain');

    var savedBlockchain = localStorage.getItem('savedBlockchain');
    var savedSachaAddress = localStorage.getItem('savedSachaAddress');
    $('#myCanvas').css('visibility', 'hidden');
    if (savedBlockchain !== null) {
      rawBlockchainData = JSON.parse(savedBlockchain);
      blockchain = new Blockchain(rawBlockchainData.chain, rawBlockchainData.pendingTransactions);
      rawSachaAddress = JSON.parse(savedSachaAddress);
      sachaAddress = new BlockchainAddress(rawSachaAddress.address, rawSachaAddress.blocksMined,  rawSachaAddress.balance);
      console.log('Saved Blockchain Address ' + sachaAddress.address);

      if(blockchain.isChainValid()){
        console.log('Blockchain is valid');

      }
      else{
        console.log('Blockchain is not valid');
      }
    }


    $('body').css("background-image", localStorage.getItem('savedBackground'));
}
