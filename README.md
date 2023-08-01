# Lottery

Simple lottery caninster built on the ICP network

## To Test

- Start the Local Internet Computer

    ```bash
    dfx start --background --clean
    ```

- Next you need to enter the tokenCanister and the lotteryCanister addresses
    ![image](./src/assets/canister.png)

    Link to [tokenCanister](https://github.com/JoE11-y/Lottery-Canister/blob/main/src/lotteryCanister/index.ts#L8C27-L8C27)

    Linkt to [lotteryCanister](https://github.com/JoE11-y/Lottery-Canister/blob/main/src/lotteryCanister/index.ts#L12)

- You generate this addresses by running the create canister command

    ```bash
    dfx canister create --all
    ```

    ![image](./src/assets/terminal.png)

- Update the token canister and the lottery canister with the addresses gotten from the terminal
  
- Then run the build command to check that everything is working.

    ```bash
    dfx build
    ```

    ![image](./src/assets/build.png)

- Next we deploy the canister

    ```bash
    dfx deploy
    ```

    ![image](./src/assets/deplos.png)

- We only need the Candid interface for the lottery canister.

    `http://127.0.0.1:4943/?canisterId=<userAddress>&id=<lotteryCanisterAddress>`

- Copy yours from the output on the terminal

- Open on your webpage
  
- Initialize lottery with the duration in nanoseconds and the ticket price you want

- First step is to start the lottery

- To buy tickets you'll need the dummy tokens from the faucet, you can only get 100 tokens at a time.

- Wait for lottery duration to run out, then end the lottery which selects the winning ticket

- Then check if you're winner, which pays out dummy token into your balance.


This deploy command builds, and installs the canister.
