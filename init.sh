simd init cosmos --chain-id my-test-chain
simd keys add my_validator --keyring-backend test
MY_VALIDATOR_ADDRESS=$(simd keys show my_validator -a --keyring-backend test)
simd add-genesis-account $MY_VALIDATOR_ADDRESS 100000000000stake
simd gentx my_validator 100000000stake --chain-id my-test-chain --keyring-backend test
simd collect-gentxs
simd start --mode validator