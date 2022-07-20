import WebSocket from 'ws';

const sleep = (time) => {
  return new Promise((resolve) => setTimeout(resolve, time))
}

const randomString = (length) => {
  var str = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  length = length || 16
  var result = '';
  for (var i = length; i > 0; --i)
    result += str[Math.floor(Math.random() * str.length)];
  return result;
}

(async () => {

  const rpc = "ws://127.0.0.1:26657"
  const TxPoolId = 0;
  const TxId = 1;
  const BlockchainId = 2;
  const StatusId = 4;

  const ws = new WebSocket(`${rpc}/websocket`);
  let txpool = {
    "method": "num_unconfirmed_txs",
    "jsonrpc": "2.0",
    "id": TxPoolId,
    "params": []
  }

  let tx = {
    "method": "broadcast_tx_async",
    "jsonrpc": "2.0",
    "id": TxId,
    "params": [1]
  }

  let blockchain = {
    "method": "blockchain",
    "jsonrpc": "2.0",
    "id": BlockchainId,
    "params": [1, 20]
  }

  let status = {
    "method": "status",
    "jsonrpc": "2.0",
    "id": StatusId,
    "params": []
  }

  const txpoolStr = JSON.stringify(txpool)
  const statusStr = JSON.stringify(status)
  const startTime = parseInt(new Date().getTime() / 1000)
  const maxGap = 60 * 60; // 压测时间单位为秒
  const maxPending = 100000; // 当交易池待上链交易最大数值
  let totalSend = 0;
  let reply = 0;

  ws.on('open', function open() {
    console.log('connected');
    ws.send(txpoolStr); // 查询交易池数量
  });

  ws.on('close', function close(data) {
    console.log('disconnected', data);
  });

  ws.on('error', function error(data) {
    console.log('error', data);
  });

  ws.on('message', async function message(data) {
    reply++;
    if (reply % 10000 == 0) {
      const endTime = parseInt(new Date().getTime() / 1000) + 0.1
      console.log("reply", reply, "reply tps", parseInt(reply / (endTime - startTime)))
    }

    data = JSON.parse(data.toString());
    let curSend = 0;
    if (data.id == TxPoolId) {
      let pending = parseInt(data.result.total)
      // 塞满交易池
      while (maxPending - pending > 0) {
        const str = randomString(16);
        tx.params[0] = str;
        const txStr = JSON.stringify(tx);
        ws.send(txStr);
        pending++
        curSend++

        // 防止ws被挂掉
        if (curSend >= 30000) {
          break
        }
      }
      const endTime = parseInt(new Date().getTime() / 1000)
      totalSend += curSend
      console.log("totalSend", totalSend, "pending", pending, "sign tps", parseInt(totalSend / (endTime - startTime)))

      if (endTime - startTime >= maxGap) {
        ws.close()
      } else {
        if (curSend < 1000) {
          // 说明交易池快满了，休息休息吧
          await sleep(1000)
        }
        ws.send(txpoolStr)
        ws.send(statusStr)
      }
    } else if (data.id == StatusId) {
      let lastHeight = parseInt(data.result.sync_info.latest_block_height)
      blockchain.params[0] = lastHeight - 20 >= 1 ? lastHeight - 20 : lastHeight;
      blockchain.params[1] = lastHeight
      const blockchainStr = JSON.stringify(blockchain)
      ws.send(blockchainStr)
    } else if (data.id == BlockchainId) {
      let blockMetas = data.result.block_metas
      let len = blockMetas.length
      let startTime = parseInt(new Date(blockMetas[len - 1].header.time).getTime() / 1000)
      let endTime = parseInt(new Date(blockMetas[0].header.time).getTime() / 1000)
      let startHeight = blockMetas[len - 1].header.height
      let endHeight = blockMetas[0].header.height
      let txs = 0;
      for (const block of blockMetas) {
        txs += parseInt(block.num_txs)
      }
      console.log(`block number ${startHeight} to ${endHeight} total txs`, txs, "tendermint tps", parseInt(txs / (endTime - startTime)))
    } else {
      // 交易回来的回执不处理
    }
  });
})()