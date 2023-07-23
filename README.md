# Lottery

Simple lottery caninster built on the ICP network

## To Test

- Initialize lottery with the duration in nanoseconds and the ticket price you want
- First step is to start the lottery
- To buy tickets you'll need the dummy tokens from the faucet, you can only get 100 tokens at a time.
- Wait for lottery duration to run out, then end the lottery which selects the winning ticket
- Then check if you're winner, which pays out dummy token into your balance.

## DEVELOPMENT

Install Node Version Manager (nvm): To install nvm, execute the following command in your terminal:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash
```

Switch to Node.js version 18: To switch to Node.js version 18 using nvm, use the following command:

```bash
nvm use 18
```

Install DFX: To install DFX, execute this command:

``` bash
DFX_VERSION=0.14.1 sh -ci "$(curl -fsSL https://sdk.dfinity.org/install.sh)"
```

Add DFX to your path: Now that DFX is installed; Run this command to add DFX to your PATH:

```bash
echo 'export PATH="$PATH:$HOME/bin"' >> "$HOME/.bashrc"
```

Next Reload terminal.

To install dependencies

```bash
npm install
```

To start the Local Internet Computer

```bash
dfx start --background
```

To create canister contract

```bash
dfx canister create --all
```

To build canister

```bash
dfx build
```

To install the canister

```bash
dfx canister install --all
```

To deploy canister

```bash
dfx deploy
```

This deploy command builds, and installs the canister.
