import { StargateClient } from "@cosmjs/stargate"

const rpc = "http://127.0.0.1:26657"
const sleep = (time) => {
  return new Promise((resolve) => setTimeout(resolve, time))
}

const runAll = async () => {
  const client = await StargateClient.connect(rpc)
  const faucet = "cosmos1d4dxxa8cj6np7hcwdpreh5rdsrr9ef09gzaq2x"
  const startTime = Math.floor(new Date().getTime() / 1000)
  let initBalance = parseInt((await client.getAllBalances(faucet))[0].amount)
  console.log("faucet balance", initBalance)

  while (true) {
    const endTime = Math.floor(new Date().getTime() / 1000)
    const gapTime = endTime - startTime
    const curBalance = parseInt((await client.getAllBalances(faucet))[0].amount)
    const count = curBalance - initBalance
    const tps = Math.floor(count / gapTime)
    console.log(`spendTime:${gapTime}, TPS:${tps}, curBalance:${curBalance}`)
    await sleep(2000)
    if (endTime - startTime >= 60 * 100) {
      process.exit()
    }
  }
}

runAll()
  .then(() => {
    console.log("end")
    process.exit()
  })
  .catch((error) => {
    console.log("error", error)
    process.exit()
  })
