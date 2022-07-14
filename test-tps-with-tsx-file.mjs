import WebSocket from 'ws';
import fs from "fs-extra"
import axios from 'axios'

const rpc = "ws://127.0.0.1:26657"
const swagger = "http://127.0.0.1:1317"
const TxPoolId = 0;
const TxId = 1;

const sleep = (time) => {
  return new Promise((resolve) => setTimeout(resolve, time))
}

const getData = async (url) => {
  let data = await axios.get(swagger + url)
  return data.data;
}

const balanceOf = async (address) => {
  let data = await getData(`/cosmos/bank/v1beta1/balances/${address}`);
  return parseInt(data.balances[0].amount)
}

(async () => {
  const faucet = "cosmos1x0lcf2zaq5802xgmzrlf2a8u5jglxdf9whx4n4"
  const initBalance = await balanceOf(faucet)
  const txs = await fs.readJson("./txs.json");
  console.log("initBalance", initBalance, txs.length)

  let ws = new WebSocket(`${rpc}/websocket`);
  let txpool = {
    "method": "num_unconfirmed_txs",
    "jsonrpc": "2.0",
    "id": TxPoolId,
    "params": []
  }

  let tx = {
    "method": "broadcast_tx_sync",
    "jsonrpc": "2.0",
    "id": TxId,
    "params": []
  }

  const txpoolStr = JSON.stringify(txpool)
  const startTime = parseInt(new Date().getTime() / 1000)
  const maxGap = 60 * 60; // 压测时间单位为秒
  const maxPending = 10000; // 当交易池待上链交易最大数值
  let totalSend = 0;
  let txIndex = 0;
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
    data = JSON.parse(data.toString());
    let curSend = 0;
    if (data.id == TxPoolId) {
      let pending = parseInt(data.result.total)
      console.log("pending", pending)
      // 塞满交易池
      while (maxPending - pending > 0) {
        tx.params[0] = txs[txIndex]
        tx.id = txIndex + 100
        const txStr = JSON.stringify(tx);
        ws.send(txStr);
        pending++
        curSend++
        txIndex++

        // 防止ws被挂掉
        if (curSend >= 3000) {
          await sleep(100)
          break
        }
      }
      const endTime = parseInt(new Date().getTime() / 1000)
      const curBalance = await balanceOf(faucet)
      totalSend += curSend
      console.log("totalSend", totalSend, "reply", reply, "send tps", parseInt(totalSend / (endTime - startTime)), "cosmos tps", parseInt((curBalance - initBalance) / (endTime - startTime)))

      if (endTime - startTime >= maxGap) {
        ws.close()
      } else {
        if (curSend < 1000) {
          // 说明交易池快满了，休息休息吧
          await sleep(1000)
        }
        ws.send(txpoolStr)
      }
    } else {
      // 交易回来的回执不处理
      if (data.error) {
        console.log("error", data.error)
      }
    }
  });
})()