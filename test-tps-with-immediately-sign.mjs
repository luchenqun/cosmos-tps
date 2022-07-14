import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing"
import { SigningStargateClient, StargateClient } from "@cosmjs/stargate"
import { TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx.js";
import { toBase64 } from "@cosmjs/encoding";
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
  return parseInt(data.balances[0].amount)
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
  const signingClient = await SigningStargateClient.offline(aliceSigner)
  const initBalance = await balanceOf(faucet)
  const data = await account(alice)
  let sequence = data.sequence
  const accountNumber = data.accountNumber
  console.log(alice, sequence, accountNumber)

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
  const maxPending = 30000; // 当交易池待上链交易最大数值
  let totalSend = 0;

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
    data = JSON.parse(data.toString());
    let curSend = 0;
    if (data.id == TxPoolId) {
      let pending = parseInt(data.result.total)
      // 塞满交易池
      while (maxPending - pending > 0) {
        let signerData = {
          accountNumber,
          sequence,
          chainId: "my-test-chain",
        }

        const sendMsg = {
          typeUrl: "/cosmos.bank.v1beta1.MsgSend",
          value: {
            fromAddress: alice,
            toAddress: faucet,
            amount: [{ denom: "stake", amount: "1" }],
          },
        }
        const txRaw = await signingClient.sign(
          alice,
          [sendMsg],
          {
            amount: [{ denom: "stake", amount: "0" }],
            gas: "200000",
          },
          "",
          signerData
        )
        const txHex = toBase64(TxRaw.encode(txRaw).finish());
        tx.params[0] = txHex
        const txStr = JSON.stringify(tx);
        ws.send(txStr);

        sequence++
        pending++
        curSend++

        // 反正ws被挂掉
        if (curSend >= 3000) {
          console.log(txHex.length)
          break
        }
      }
      const endTime = parseInt(new Date().getTime() / 1000)
      const curBalance = await balanceOf(faucet)
      totalSend += curSend
      console.log("totalSend", totalSend, "pending", pending, "sign tps", parseInt(totalSend / (endTime - startTime)), "cosmos tps", parseInt((curBalance - initBalance) / (endTime - startTime)))

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
    }
  });
})()