const nodeMenu = () =>{
	let stdin = process.stdin;
	let stdout = process.stdout;
	console.log('*********************************************');
	console.log('*...........BLOCKCHAIN SIMULATOR............*');
	console.log('*********************************************');
	console.log('1. node: Start Blockchain Node');
	console.log('2. mine: Mine blocks on blockchain');
	console.log('3. sync: Sync blockchain to longest chain');
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
			case 'mine':
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
