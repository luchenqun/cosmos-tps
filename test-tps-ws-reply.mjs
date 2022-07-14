import WebSocket from 'ws';

const rpc = "ws://127.0.0.1:26657"
const startTime = parseInt(new Date().getTime() / 1000)

const sleep = (time) => {
  return new Promise((resolve) => setTimeout(resolve, time))
}

(async () => {
  let ws = new WebSocket(`${rpc}/websocket`);

  const txpool = {
    "method": "num_unconfirmed_txs",
    "jsonrpc": "2.0",
    "id": 0,
    "params": []
  }
  const txpoolStr = JSON.stringify(txpool)
  const maxSend = 300000
  let totalSend = 0;
  let reply = 0;

  ws.on('open', async function open() {
    console.log('connected');
    while (true) {
      ws.send(txpoolStr);
      totalSend++
      if (totalSend % 10000 == 0) {
        const endTime = parseInt(new Date().getTime() / 1000)
        console.log("totalSend", totalSend, "totalSend tps", parseInt(totalSend / (endTime - startTime)))
        await sleep(500)
      }
      if (totalSend >= maxSend) {
        break
      }
    }
  });
  ws.on('message', async function message() {
    reply++;
    if (reply % 1000 == 0) {
      const endTime = parseInt(new Date().getTime() / 1000) + 0.1
      console.log("reply", reply, "reply tps", parseInt(reply / (endTime - startTime)))
    }
    if (reply >= maxSend) {
      console.log("reply all, ws close")
      ws.close()
    }
  })

  ws.on('close', function close(data) {
    console.log('disconnected', data);
  });

  ws.on('error', function error(data) {
    console.log('error', data);
  });

})()