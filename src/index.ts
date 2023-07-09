import { $query, $update, Record, StableBTreeMap, Principal, match, Result, nat64, ic, Opt, int32, $init, Vec } from 'azle';
import { v4 as uuidv4 } from 'uuid';
import {
  Address,
  binaryAddressFromPrincipal,
  hexAddressFromPrincipal,
  binaryAddressFromAddress,
  Ledger,
} from 'azle/canisters/ledger';

// Define player record
type Player = Record<{
  id: int32;
  lotteryId: int32;
  player: Principal;
  tickets: Vec<int32>;
}>;

// Define lottery record
type Lottery = Record<{
  id: int32;
  startTime: nat64;
  endTime: nat64;
  noOfTickets: int32;
  winner: Principal;
  winningTicket: int32;
  players: Vec<Player>;
  lotteryCompleted: int32;
}>;

// Mapping to hold player index information
let playerIndexMap = new StableBTreeMap<Principal, Vec<string>>(0, 100, 1_000_000);

// Mapping to connect player unique IDs to their positions in lotteries
let indexToPosnMap = new StableBTreeMap<string, int32>(1, 50, 8);

// Custom configuration settings
let currlotteryId: Opt<int32> = Opt.None;
let lotteryState: Opt<int8> = Opt.None;
let ticketPrice: Opt<nat64> = Opt.None;
let lotteryDuration: Opt<nat64> = Opt.None;
let prizePool: Opt<nat64> = Opt.None;

// Address of the ICP canister (update with the correct address)
const icpCanister = new Ledger(
  Principal.fromText("be2us-64aaa-aaaaa-qaabq-cai")
);

// Mapping to hold lottery storage information
const lotteryStorage = new StableBTreeMap<int32, Lottery>(2, 8, 5_000_000);

/**
 * Initializes the lottery contract with the ticket price and duration.
 * @param payload The payload containing ticket price and lottery duration.
 */
$init
export function constructor(payload: lotteryPayload): void {
  lotteryState = Opt.Some(0);
  ticketPrice = Opt.Some(payload.ticketPrice);
  lotteryDuration = Opt.Some(payload.lotteryDuration);
}

/**
 * Retrieves the information of a specific lottery.
 * @param id The ID of the lottery.
 * @returns The lottery information.
 */
$query
export function getLottery(id: int32): Result<Lottery, string> {
  return match(lotteryStorage.get(id), {
    Some: (lottery) => Result.Ok<Lottery, string>(lottery),
    None: () => Result.Err<Lottery, string>(`Lottery with id=${id} not found`),
  });
}

/**
 * Starts a new lottery.
 * @returns A result indicating the success or failure of starting the lottery.
 */
$update
export function startLottery(): Result<string, string> {
  // Check lottery state and fail if not yet initialized
  const state = match(lotteryState, {
    Some: (state) => state,
    None: () => ic.trap("Lottery not yet initialized"),
  });

  // Only start the lottery if the state has been set to 0 (ended)
  if (state !== 0) {
    ic.trap("Cannot start a new lottery");
  }

  // Get the current lottery ID
  const id = match(currlotteryId, {
    Some: (id) => id + 1,
    None: () => 0,
  });

  // Get the lottery duration
  let duration = match(lotteryDuration, {
    Some: (duration) => duration,
    None: () => BigInt(0),
  });

  // Update the lottery ID
  currlotteryId = Opt.Some(id);

  // Create a new lottery record
  const lottery: Lottery = {
    id: id,
    startTime: ic.time(),
    endTime: ic.time() + duration,
    noOfTickets: 0,
    winner: Principal.fromText("be2us-64aaa-aaaaa-qaabq-cai"),
    winningTicket: 0,
    players: [],
    lotteryCompleted: 0,
  };

  // Update the mapping
  lotteryStorage.insert(lottery.id, lottery);

  // Update the lottery state to 1 (started)
  lotteryState = Opt.Some(1);

  return Result.Ok("Lottery Started");
}

/**
 * Buys tickets for the specified lottery.
 * @param id The ID of the lottery.
 * @param noOfTickets The number of tickets to buy.
 * @returns A result indicating the success or failure of buying the tickets.
 */
$update
export async function buyTicket(
  id: int32,
  noOfTickets: int32
): Promise<Result<string, string>> {
  // Check lottery state and fail if not yet initialized
  const state = match(lotteryState, {
    Some: (state) => state,
    None: () => ic.trap("Lottery not yet initialized"),
  });

  // Check if the lottery state is set to "started"
  if (state !== 1) {
    ic.trap("Cannot buy tickets at this time");
  }

  // Set the caller
  let caller = ic.caller();

  // Get the ticket price and estimate the amount to be transferred, then update the prize pool
  let price = match(ticketPrice, {
    Some: (price) => price,
    None: () => BigInt(0),
  });
  const amountToPay = BigInt(noOfTickets) * price;
  match(prizePool, {
    Some: (pool) => {
      prizePool = Opt.Some(pool + amountToPay);
    },
    None: () => {
      prizePool = Opt.Some(BigInt(0) + amountToPay);
    },
  });

  // Get the lottery
  return match(lotteryStorage.get(id), {
    Some: async (lottery) => {
      // Check if the lottery has ended
      if (lottery.endTime < ic.time()) {
        ic.trap("Lottery is over, cannot buy tickets");
      }

      // Send ticket payment to the ICP contract
      await makePayment(id, amountToPay);

      // Generate ticket numbers and assign tickets to their ticketIds
      const ticketNumbers: Vec<int32> = [];
      let oldTicketsCount = lottery.noOfTickets;
      let newTicketId = oldTicketsCount;
      while (newTicketId < noOfTickets + oldTicketsCount) {
        ticketNumbers.push(newTicketId);
        newTicketId += 1;
      }

      let empty: Vec<string> = [];

      // Generate lottery track identifier
      const idTrack = `"${id}"`;

      // Check mapping to get player lottery participation unique ID arrays
      let playerIdMap = match(playerIndexMap.get(caller), {
        Some: (list) => list,
        None: () => empty,
      });

      let playerInfos: Player[] = lottery.players;

      // Check if the player's participation array is empty
      if (playerIdMap.length == 0) {
        // If empty, create new information for the player
        let newId = `${uuidv4()}${idTrack}`;
        let newPlayerPosn = playerInfos.length + 1;

        // Update player information with the new unique ID
        playerIdMap.push(newId);
        playerIndexMap.insert(caller, playerIdMap);
        indexToPosnMap.insert(newId, newPlayerPosn);

        // Get player info and add it to the lottery player array
        let playerInfo = generatePlayerInformation(id, newPlayerPosn, ticketNumbers);
        playerInfos.push(playerInfo);
      } else {
        let playerPosn: int32;
        let uniqueId: string = "";

        // Check if the player already has a unique ID
        for (let i of playerIdMap) {
          if (i.includes(`${idTrack}`)) {
            uniqueId = i;
            break;
          }
        }

        // Then get the player position
        playerPosn = match(indexToPosnMap.get(uniqueId), {
          Some: (posn) => posn,
          None: () => 0,
        });

        // Check if the unique ID is not present or playerPosn is 0
        if (uniqueId == "" && playerPosn == 0) {
          // Generate a new ID and update the player mapping information
          let newId = `${uuidv4()}${idTrack}`;
          let newPlayerPosn = playerInfos.length + 1;
          playerIdMap.push(newId);
          playerIndexMap.insert(caller, playerIdMap);
          indexToPosnMap.insert(newId, newPlayerPosn);
          let playerInfo = generatePlayerInformation(id, newPlayerPosn, ticketNumbers);
          playerInfos.push(playerInfo);
        } else {
          // Otherwise, just add the ticket numbers to the player's tickets array
          playerInfos[playerPosn].tickets = [
            ...playerInfos[playerPosn].tickets,
            ...ticketNumbers,
          ];
        }
      }

      // Update the record in storage
      const updatedLottery: Lottery = {
        ...lottery,
        noOfTickets: lottery.noOfTickets + noOfTickets,
        players: playerInfos,
      };
      lotteryStorage.insert(lottery.id, updatedLottery);
      return Result.Ok<string, string>("Ticket bought successfully");
    },
    None: () => Result.Err<string, string>(`Ticket purchase failed`),
  });
}

/**
 * Ends the specified lottery and determines the winner.
 * @param id The ID of the lottery to end.
 * @returns A result indicating the success or failure of ending the lottery.
 */
$update
export async function endLottery(id: int32): Promise<Result<string, string>> {
  // Check the lottery state and fail if not yet initialized
  const state = match(lotteryState, {
    Some: (state) => state,
    None: () => ic.trap("Lottery not yet initialized"),
  });

  // Check that the lottery state is still open
  if (state !== 0) {
    ic.trap("Wrong lottery state");
  }

  // Search for the lottery ID
  return match(lotteryStorage.get(id), {
    Some: async (lottery) => {
      // Check if the lottery has ended
      if (lottery.endTime < ic.time()) {
        ic.trap("Lottery is not yet over");
      }

      // Get a random number as the winning ticket
      let ticketsSold = lottery.noOfTickets;
      const randomValue = Math.random() * (ticketsSold - 0) + 0;
      let winningTicket = Math.floor(randomValue);

      // Update the record in storage and set the lottery completed status to 1 (waiting for payouts)
      const updatedLottery: Lottery = {
        ...lottery,
        winningTicket: winningTicket,
        lotteryCompleted: 1,
      };

      lotteryStorage.insert(lottery.id, updatedLottery);
      return Result.Ok<string, string>("Lottery ended, winner can claim now.");
    },
    None: () => Result.Err<string, string>(`Couldn't end lottery with id=${id}`),
  });
}

/**
 * Checks if the caller is the winner of the specified lottery and initiates the payout if so.
 * @param id The ID of the lottery to check.
 * @returns A result indicating the success or failure of the payout.
 */
$update
export async function checkIfWinner(id: int32): Promise<Result<string, string>> {
  // Check the lottery state and fail if not yet initialized
  if (lotteryState == Opt.None) {
    ic.trap("Lottery not yet initialized");
  }

  const pool = match(prizePool, {
    Some: (pool) => pool,
    None: () => ic.trap("Lottery pool is empty"),
  });
  // Calculate the winner's reward
  const winnersReward = pool / BigInt(2);

  // Update the prize pool
  prizePool = Opt.Some(pool - winnersReward);

  return match(lotteryStorage.get(id), {
    Some: async (lottery) => {
      // Check if the lottery has been ended
      if (lottery.lotteryCompleted !== 1) {
        ic.trap("Lottery not yet ended");
      }

      const caller = ic.caller();
      let uniqueId: string = "";

      // Generate the lottery track identifier
      const idTrack = `"${id}"`;

      // Check the mapping to get the player's lottery participation unique ID arrays
      let playerIdMap = match(playerIndexMap.get(caller), {
        Some: (list) => list,
        None: () => ic.trap("No lottery information"),
      });

      // Check the player's unique ID mapping for the lottery ID tracker
      for (let i of playerIdMap) {
        if (i.includes(`${idTrack}`)) {
          uniqueId = i;
          break;
        }
      }

      // Get the player's position
      let playerPosn = match(indexToPosnMap.get(uniqueId), {
        Some: (posn) => posn,
        None: () => 0,
      });

      // If the unique ID is not present and playerPosn is 0, exit with an error,
      // indicating that the player did not participate in the lottery.
      if (uniqueId == "" && playerPosn == 0) {
        ic.trap("No lottery information");
      }

      // Otherwise, continue and get the player info
      const playerInfo = lottery.players[playerPosn];

      // Check if the player's tickets for that lottery contain the winning ticket
      if (playerInfo.tickets.includes(lottery.winningTicket)) {
        // Initiate the payout to the winner
        const winnerAddress = getAddressToDeposit(playerInfo.player);
        await payWinner(id, winnersReward, winnerAddress);
      } else {
        ic.trap("Sorry, you're not the winner");
      }

      // Update the record in storage and set the lottery completed status to payout completed
      const updatedLottery: Lottery = {
        ...lottery,
        winner: playerInfo.player,
        lotteryCompleted: 2,
      };

      lotteryStorage.insert(lottery.id, updatedLottery);
      return Result.Ok<string, string>("Winner paid out");
    },
    None: () =>}.`),
  });
}

/**
 * Deletes the specified lottery.
 * @param id The ID of the lottery to delete.
 * @returns A result indicating the success or failure of the deletion.
 */
$update
export function deleteLottery(id: int32): Result<string, string> {
  return match(lotteryStorage.remove(id), {
    Some: (_deletedLottery) => {
      if (_deletedLottery.lotteryCompleted !== 1) {
        ic.trap("Lottery not yet completed");
      }
      return Result.Ok<string, string>("Lottery Deleted");
    },
    None: () =>
      Result.Err<string, string>(`Couldn't delete a lottery with id=${id}`),
  });
}

/**
 * Gets the address to deposit the winnings for a given account.
 * @param account The account to generate the address for.
 * @returns The deposit address.
 */
function getAddressToDeposit(account: Principal): Address {
  const uniqueNumber = generateUniqueNumber(account);
  const address: Address = hexAddressFromPrincipal(account, uniqueNumber);
  return address;
}

/**
 * Makes a payment to the ICP canister for ticket purchases.
 * @param id The ID of the lottery.
 * @param amount The amount to pay.
 */
async function makePayment(id: int32, amount: nat64) {
  const toSubAccount: blob = binaryAddressFromPrincipal(ic.id(), Number(id));

  const uniqueNumber = generateUniqueNumber(ic.caller());

  const fromSubAccount: blob = binaryAddressFromPrincipal(ic.id(), uniqueNumber);

  const balance = (await icpCanister.account_balance({ account: fromSubAccount }).call()).Ok?.e8s;

  if (balance !== undefined && balance > amount) {
    const transfer = await icpCanister
      .transfer({
        memo: 0n,
        amount: {
          e8s: amount,
        },
        fee: {
          e8s: 10000n,
        },
        from_subaccount: Opt.Some(fromSubAccount),
        to: toSubAccount,
        created_at_time: Opt.None,
      })
      .call();
    if (transfer.Err) {
      ic.trap(transfer.Err.toString());
    }
  } else {
    ic.trap("Fund the subAccount first");
  }
}

/**
 * Makes a payout to the winner of a lottery.
 * @param id The ID of the lottery.
 * @param amount The amount to pay as the reward.
 * @param winner The address of the winner.
 */
async function payWinner(id: int32, amount: nat64, winner: string) {
  let subAccount: blob = binaryAddressFromPrincipal(ic.id(), Number(id));
  const transferResult = await icpCanister
    .transfer({
      memo: 0n,
      amount: {
        e8s: amount,
      },
      fee: {
        e8s: 10000n,
      },
      from_subaccount: Opt.Some(subAccount),
      to: binaryAddressFromAddress(winner),
      created_at_time: Opt.None,
    })
    .call();

  if (transferResult.Err) {
    ic.trap(transferResult.Err.toString());
  }
}

/**
 * Generates a unique number from the principal.
 * @param principal The principal to generate the unique number from.
 * @returns The unique number.
 */
function generateUniqueNumber(principal: Principal): number {
  const uint8Array = principal.toUint8Array();
  const bigIntValue = BigInt(
    "0x" +
      Array.from(uint8Array)
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")
  );
  const uniqueNumber = Number(bigIntValue);
  return uniqueNumber;
}

/**
 * Generates the player information for a lottery participation.
 * @param lotteryId The ID of the lottery.
 * @param newPlayerId The new player's ID.
 * @param ticketNumbers The ticket numbers.
 * @returns The player information record.
 */
function generatePlayerInformation(
  lotteryId: int32,
  newPlayerId: int32,
  ticketNumbers: Vec<int32>
): Player {
  const newPlayer: Player = {
    id: newPlayerId,
    lotteryId: lotteryId,
    player: ic.caller(),
    tickets: ticketNumbers,
  };
  return newPlayer;
}

// A workaround to make the uuid package work with Azle
globalThis.crypto = {
  //@ts-ignore
  getRandomValues: () => {
    let array = new Uint8Array(32);

    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }

    return array;
  },
};

      Result.Err<string, string>(`Error checking payout in lottery with id=${id
