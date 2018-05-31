var childProcess = require('child_process');

function runScript(scriptPath, callback) {

    // keep track of whether callback has been invoked to prevent multiple invocations
    var invoked = false;

    var process = childProcess.fork(scriptPath);

    // listen for errors as they may prevent the exit event from firing
    process.on('error', function (err) {
        if (invoked) return;
        invoked = true;
        callback(err);
    });

    // execute the callback once the process has finished running
    process.on('exit', function (code) {
        if (invoked) return;
        invoked = true;
        var err = code === 0 ? null : new Error('exit code ' + code);
        callback(err);
    });

}


const nodeMenu = () =>{
	let stdin = process.stdin;
	let stdout = process.stdout;
	console.log('*********************************************');
	console.log('*...........BLOCKCHAIN SIMULATOR............*');
	console.log('*********************************************');
	console.log('1. node: Start Blockchain Node');
	console.log('2. light: Start a light node');
	console.log('3. miner: Start a miner node');
	console.log("4. broadcast: Broadcast Message\n");
	console.log("Type 0 or 'menu' to show this menu again\n");
	stdin.resume();
	stdin.setEncoding('utf8');

	stdin.on('data', function(data) {

		let choice = data.toString().trim()
		switch(choice){
			case '0':
			case 'menu':
				nodeMenu();
				break;
			case '1':
			case 'node':
				//node.js
				break;
			case '2':
			case 'light':
				mine(thisNode);
				break;
			case '3':
			case 'sync':
				// syncBlockchain();
				sendEventToAllPeers('getBlockchain', thisNode);
			case '4':
			case 'broadcast':
				sendEventToAllPeers('message', 'coucou');
				break;
			default:
				stdout.write(`Options selected: ${choice}`);
				break;
		}
	});


}


module.exports = { nodeMenu }
