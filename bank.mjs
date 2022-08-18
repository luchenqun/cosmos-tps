import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { SigningStargateClient } from "@cosmjs/stargate";
import fs from "fs-extra";
import axios from "axios";
const rpc = "http://127.0.0.1:26657";
const swagger = "http://127.0.0.1:1317";

const getData = async (url) => {
  let data = await axios.get(swagger + url);
  return data.data;
};

const balanceOf = async (address, denom) => {
  let data = await getData(`/cosmos/bank/v1beta1/balances/${address}`);
  for (const balance of data.balances) {
    if (balance.denom == denom) return parseInt(balance.amount);
  }
  return 0;
};

const getAliceSignerFromPriKey = (filePath) => {
  const mnemonic = fs.readJSONSync(filePath).secret;
  return DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: "cosmos" });
};

(async () => {
  try {
    const aliceSigner = await getAliceSignerFromPriKey(process.argv[2] || "./key_seed.json");
    const alice = (await aliceSigner.getAccounts())[0].address;
    const faucet = "cosmos1qqqqhe5pnaq5qq39wqkn957aydnrm45s0jk6ae";
    const signingClient = await SigningStargateClient.connectWithSigner(rpc, aliceSigner);

    // 转账测试
    const transferTest = async (denomSend, amount, denonFee, fee) => {
      console.log(denomSend, amount, denonFee, fee);
      console.log("before", alice, denomSend, await balanceOf(alice, denomSend), denonFee, await balanceOf(alice, denonFee));
      console.log("before", faucet, denomSend, await balanceOf(faucet, denomSend), denonFee, await balanceOf(faucet, denonFee));

      const result = await signingClient.sendTokens(alice, faucet, [{ denom: denomSend, amount: String(amount) }], {
        amount: [{ denom: denonFee, amount: String(fee) }],
        gas: "200000",
      });
      console.log(result);

      console.log("after", alice, denomSend, await balanceOf(alice, denomSend), denonFee, await balanceOf(alice, denonFee));
      console.log("after", faucet, denomSend, await balanceOf(faucet, denomSend), denonFee, await balanceOf(faucet, denonFee));
      console.log("============================================================================================");
    };

    await transferTest("govern", 1, "stake", 1); // 测试转账与手续费
    await transferTest("govern", 1, "testtoken", 1); // 测试用另外一个币种作为手续费
    await transferTest("govern", 1, "xxx", 1); // 测试不可转账的用于转账
  } catch (error) {
    console.log("error", error);
  }
})();

const bank = {
  params: {
    send_enabled: [
      {
        denom: "xxx",
        enabled: false,
      },
    ],
    default_send_enabled: true,
  },
  balances: [
    {
      address: "cosmos1ckgzvzdevakjxvy5mnn5an45ntr6rmayrclyn7",
      coins: [
        {
          denom: "govern",
          amount: "3000000000",
        },
        {
          denom: "stake",
          amount: "500000000",
        },
        {
          denom: "testtoken",
          amount: "4000000000",
        },
        {
          denom: "xxx",
          amount: "102400000",
        },
      ],
    },
  ],
  supply: [
    {
      denom: "govern",
      amount: "3000000000",
    },
    {
      denom: "stake",
      amount: "500000000",
    },
    {
      denom: "testtoken",
      amount: "4000000000",
    },
    {
      denom: "xxx",
      amount: "102400000",
    },
  ],
  denom_metadata: [
    {
      description: "govern token description",
      denom_units: [
        {
          denom: "agovern",
          exponent: 18,
          aliases: ["weigovern"],
        },
        {
          denom: "govern",
          exponent: 0,
          aliases: ["GOV"],
        },
      ],
      base: "govern",
      display: "GovernDisplay",
      name: "Govern Name",
      symbol: "GOV",
    },
  ],
};
