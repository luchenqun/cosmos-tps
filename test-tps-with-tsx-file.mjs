import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing"
import WebSocket from 'ws';
import fs from "fs-extra"
import axios from 'axios'

const rpc = "ws://127.0.0.1:26657"
const swagger = "http://127.0.0.1:1317"
const TxPoolId = 0;
const TxId = 1;

const getAliceSignerFromPriKey = (filePath) => {
  const mnemonic = fs.readFileSync(filePath).toString()
  return DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: "cosmos" })
}

const sleep = (time) => {
  return new Promise((resolve) => setTimeout(resolve, time))
}

const getData = async (url) => {
  let data = await axios.get(swagger + url)
  return data.data;
}

const balanceOf = async (address) => {
  let data = await getData(`/cosmos/bank/v1beta1/balances/${address}`);
  return data.balances.length > 0 ? parseInt(data.balances[0].amount) : 0;
}

const account = async (address) => {
  let data = await getData(`/cosmos/auth/v1beta1/accounts/${address}`);
  let accountNumber = parseInt(data.account.account_number)
  let sequence = parseInt(data.account.sequence)
  return { accountNumber, sequence }
}

(async () => {
  const aliceSigner = await getAliceSignerFromPriKey(process.argv[2] || "./alice.key")
  const alice = (await aliceSigner.getAccounts())[0].address
  const faucet = "cosmos1x0lcf2zaq5802xgmzrlf2a8u5jglxdf9whx4n4"
  const initBalance = await balanceOf(faucet)
  const txs = await fs.readJson("./txs.json");
  const data = await account(alice)
  let sequence = data.sequence
  const accountNumber = data.accountNumber
  console.log(alice, "sequence", sequence, "accountNumber", accountNumber)

  console.log("initBalance", initBalance, "txsLength", txs.length)

  let ws = new WebSocket(`${rpc}/websocket`);
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
    "params": []
  }

  const txpoolStr = JSON.stringify(txpool)
  const startTime = parseInt(new Date().getTime() / 1000)
  const maxGap = 60 * 60; // 压测时间单位为秒
  const maxPending = 45000; // 当交易池待上链交易最大数值
  let sending = false
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
    if (reply % 1000 == 0) {
      const endTime = parseInt(new Date().getTime() / 1000)
      console.log("reply", reply, "reply tps", parseInt(reply / (endTime - startTime)))
    }
    data = JSON.parse(data.toString());
    let curSend = 0;
    if (data.id == TxPoolId) {
      if(sending) {
        console.log("sending, wait.....")
        return;
      }
      sending = true;
      let pending = parseInt(data.result.total)
      console.log("pending", pending)
      // 塞满交易池
      while (maxPending - pending > 0) {
        const [curSequence, txBase64] = txs[sequence].split("|")
        if (curSequence != sequence) {
          ws.close()
          console.log("文件里面的交易不对了哦")
          return
        }
        tx.params[0] = txBase64
        const txStr = JSON.stringify(tx);
        ws.send(txStr);
        pending++
        curSend++
        totalSend++
        sequence++
        if (totalSend % 10000 == 0) {
          ws.send(txpoolStr)
          console.log("totalSend", totalSend)
        }
        // 防止ws被挂掉
        if (curSend >= 500000) {
          break
        }
        if(sequence >= txs.length) {
          ws.close()
          console.log("所有交易都发送完了")
          return
        }
      }
      const endTime = parseInt(new Date().getTime() / 1000)
      const curBalance = await balanceOf(faucet)
      sending = false;
      console.log("send tps", parseInt(totalSend / (endTime - startTime)), "cosmos tps", parseInt((curBalance - initBalance) / (endTime - startTime)))

      if (endTime - startTime >= maxGap) {
        ws.close()
      } else {
        if (curSend < 1000) {
          // 说明交易池快满了，休息休息吧
          await sleep(100)
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