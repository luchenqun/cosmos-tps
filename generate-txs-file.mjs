import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing"
import { SigningStargateClient } from "@cosmjs/stargate"
import { TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx.js";
import { toBase64 } from "@cosmjs/encoding";
import fs from "fs-extra"
import axios from 'axios'

const swagger = "http://127.0.0.1:1317"

const getAliceSignerFromPriKey = (filePath) => {
  const mnemonic = fs.readFileSync(filePath).toString()
  return DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: "cosmos" })
}

const getData = async (url) => {
  let data = await axios.get(swagger + url)
  return data.data;
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
  const data = await account(alice)
  let sequence = data.sequence
  const accountNumber = data.accountNumber
  console.log(alice, sequence, accountNumber)

  const maxPending = 1000000; // 当交易池待上链交易最大数值
  const file = "./txs.json"

  // 塞满交易池
  let pending = 0;
  let txs = [];
  try {
    txs = await fs.readJson(file);
    let lastTx = txs[txs.length - 1]
    sequence = parseInt(lastTx.split("|")[0]) + 1
  } catch (error) {
    txs = []
  }
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
    txs.push(sequence + "|" + txHex)
    sequence++
    pending++
    if (pending % 1000 == 0) {
      console.log("pending", pending, "sequence", sequence)
    }
    if (pending % 20000 == 0) {
      await fs.outputJson(file, txs)
    }
  }
  await fs.outputJson(file, txs)
})()