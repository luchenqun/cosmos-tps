import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing"
import WebSocket from 'ws';
import fs from "fs-extra"
import axios from 'axios'

const rpc = "ws://127.0.0.1:26657"
const swagger = "http://127.0.0.1:1317"
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
  const startTime = parseInt(new Date().getTime() / 1000)
  console.log(alice, "sequence", sequence, "accountNumber", accountNumber)
  console.log("initBalance", initBalance, "txsLength", txs.length)

  let ws = new WebSocket(`${rpc}/websocket`);

  let tx = {
    "method": "broadcast_tx_sync",
    "jsonrpc": "2.0",
    "id": TxId,
    "params": []
  }
  let totalSend = 0;
  let reply = 0;

  ws.on('open', async function open() {
    console.log('connected');
    while (true) {
      const [_, txBase64] = txs[sequence].split("|")
      tx.params[0] = txBase64
      const txStr = JSON.stringify(tx);
      ws.send(txStr);
      totalSend++
      sequence++
      if (totalSend % 10000 == 0) {
        const endTime = parseInt(new Date().getTime() / 1000)
        console.log("totalSend", totalSend, "totalSend tps", parseInt(totalSend / (endTime - startTime)))
        await sleep(1000)
      }
      if (sequence >= txs.length) {
        console.log("所有交易都发送完了")
        return
      }
    }
  });
  ws.on('message', async function message() {
    reply++;
    if(reply % 1000 == 0) {
      const endTime = parseInt(new Date().getTime() / 1000)
      console.log("reply", reply, "reply tps", parseInt(reply / (endTime - startTime)))
    }
  })

  ws.on('close', function close(data) {
    console.log('disconnected', data);
  });

  ws.on('error', function error(data) {
    console.log('error', data);
  });

})()