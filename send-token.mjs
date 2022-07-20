import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing"
import { SigningStargateClient } from "@cosmjs/stargate"
const rpc = "http://127.0.0.1:26657"

const getAliceSignerFromMnemonic = (mnemonic) => {
  return DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: "evmos" })
}

(async () => {
  try {
    const aliceSigner = await getAliceSignerFromMnemonic("wait connect merit attack art whisper room cheap pool find post perfect orphan primary draft provide monkey this uncover wonder drive hire buddy crazy")
    const alice = (await aliceSigner.getAccounts())[0].address
    const faucet = "evmos12f6qvv4t2rx46yzrgnalhvazcas7pmt9gtxf4s"
    const signingClient = await SigningStargateClient.connectWithSigner(rpc, aliceSigner)

    const result = await signingClient.sendTokens(alice, faucet, [{ denom: "gov", amount: "100000" }], {
      amount: [{ denom: "gov", amount: "80" }],
      gas: "200000",
    })
    console.log(result)
  } catch (error) {
    console.log("error", error)
  }
})()