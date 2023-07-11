import { $query, $update, Record, StableBTreeMap, blob, Principal, match, Result, nat64, ic, Opt, int8, int32, $init, Vec } from 'azle';
import { v4 as uuidv4 } from 'uuid';
import {
    Address,
    binaryAddressFromPrincipal,
    hexAddressFromPrincipal,
    binaryAddressFromAddress,
    Ledger,
} from 'azle/canisters/ledger';

// define player record
type Player = Record<{
    id: int32;
    lotteryId: int32;
    player: Principal;
    tickets: Vec<int32>;
}>

// define lottery record
type Lottery = Record<{
    id: int32;
    startTime: nat64;
    endTime: nat64;
    noOfTickets: int32;
    winner: Principal;
    winningTicket: int32;
    players: Vec<Player>;
    lotteryCompleted: int32;
}>

// define lottery payload record
type lotteryPayload = Record<{
    ticketPrice: nat64;
    lotteryDuration: nat64;
}>

// player index mapping to show which lottery they participated in which they hold in tickets
let playerIndexMap = new StableBTreeMap<Principal, Vec<string>>(0, 100, 1_000_000);

// follow up mapping that connects the player unique id, to player position in lotteries
let indexToPosnMap = new StableBTreeMap<string, int32>(1, 50, 8)

// custom configuration settings
let currlotteryId : Opt<int32> = Opt.None;

let lotteryState : Opt<int8> = Opt.None;

let ticketPrice : Opt<nat64> = Opt.None;

let lotteryDuration: Opt<nat64> = Opt.None;

let prizePool: Opt<nat64> = Opt.None;

// address of the icp caninster -- update when running yours
const icpCanister = new Ledger(
    Principal.fromText("be2us-64aaa-aaaaa-qaabq-cai"
    )
);

// mapping to hold storage information 
const lotteryStorage = new StableBTreeMap<int32, Lottery>(2, 8, 5_000_000);


// init function to set the lottery state, ticket price and lottery duration
$init
export function constructor(payload: lotteryPayload): void{
    lotteryState = Opt.Some(0);
    ticketPrice = Opt.Some(payload.ticketPrice);
    lotteryDuration = Opt.Some(payload.lotteryDuration);
}

// query to return lottery information 
$query;
export function getLottery(id: int32): Result<Lottery, string> {
    return match(lotteryStorage.get(id), {
        Some: (lottery) => Result.Ok<Lottery, string>(lottery),
        None: () => Result.Err<Lottery, string>(`Lottery with id=${id} not found`)
    });
}

// start lottery function
$update;
export function startLottery(): Result<string, string> {

    // check lottery state, and fail if state is not initialized
    const state = match(lotteryState, {
        Some: (state) => state,
        None: () =>  ic.trap("Lottery not yet initialized"),
    })

    // only start lottery if state has been set to 0 i.e ended
    if(state !== 0){
        ic.trap("cannot start new lottery")
    }
    
    // get current lottery id
    const id = match(currlotteryId, {
        Some: (id) => id + 1,
        None: () => 0,
    })

    // get lottery duration 
    let duration = match(lotteryDuration, {
        Some: (duration) => duration,
        None: () => ic.trap("cannot start lottery duration not set")
    })

    // update lottery id
    currlotteryId = Opt.Some(id)
    
    // create new lottery record
    const lottery: Lottery = { 
        id: id, 
        startTime: ic.time(), 
        endTime: ic.time() + duration, 
        noOfTickets: 0,
        winner: Principal.fromText("be2us-64aaa-aaaaa-qaabq-cai"),
        winningTicket: 0,
        players: [],
        lotteryCompleted: 0
    };

    // update mapping
    lotteryStorage.insert(lottery.id, lottery);

    // update lottery state to 1 i.e. started
    lotteryState = Opt.Some(1);

    return Result.Ok("Lottery Started");
}

$update;
export async function buyTicket(id: int32, noOfTickets: int32): Promise<Result<string, string>> {

    // check lottery state and fail if not yet initialized
    const state = match(lotteryState, {
        Some: (state) => state,
        None: () =>  ic.trap("Lottery not yet initialized"),
    })

    // check if lottery state is set to started
    if(state !== 1){
        ic.trap("cannot buy ticket now")
    }

    // set caller 
    let caller = ic.caller()
    
    // get ticketprice and estimate amount to be transfered then update the prizepool 
    let price = match(ticketPrice, {
        Some: (price) => price,
        None: () => ic.trap("cannot buy tickets price not set"),
    })
    const amountToPay = BigInt(noOfTickets) * price;
    match(prizePool, {
        Some: (pool) => {
            prizePool = Opt.Some(pool + amountToPay)
        },
        None: () => {
            prizePool = Opt.Some(BigInt(0) + amountToPay)
        } ,
    })

    // get lottery
    return match(lotteryStorage.get(id), {
        Some: async (lottery) => {

            // check if lottery has not ended
            if(lottery.endTime < ic.time()){
                ic.trap("lottery over can't buy tickets")
            }

            // send ticket payment to icp contract
            await makePayment(id, amountToPay)
            
            // generate ticket numbers and assign tickets to their ticketIds
            const ticketNumbers: Vec<int32> = []
            let oldTicketsCount = lottery.noOfTickets;
            let newTicketId = oldTicketsCount;
            while (newTicketId < (noOfTickets + oldTicketsCount)) {
                ticketNumbers.push(newTicketId);
                newTicketId += 1;
            }

            let empty : Vec<string> = [];

            // generate lottery track identifier
            const idTrack = `"${id}"`;

            // check mapping to get player lottery participation unique id arrays
            let playerIdMap = match(playerIndexMap.get(caller),{
                    Some: (list) => list,
                    None: () => empty
            })
            
            let playerInfos: Player[] = lottery.players;

            // check if player's participation array is empty
            if(playerIdMap.length == 0){
                // if empty create new information for player
                let newId = `${uuidv4() + idTrack}`;
                let newPlayerPosn =  playerInfos.length + 1;

                // update player information with new unique id
                playerIdMap.push(newId)
                playerIndexMap.insert(caller, playerIdMap);
                indexToPosnMap.insert(newId, newPlayerPosn)
                
                // get player info and add to lottery player array
                let playerInfo = generatePlayerInformation(id, newPlayerPosn, ticketNumbers)
                playerInfos.push(playerInfo)
            }else{
                let playerPosn: int32;
                let uniqueId: string = "";

                // check if player already has uniqueId 
                for (let i of playerIdMap){
                    if(i.includes(`${idTrack}`)){
                        uniqueId = i;
                        break;
                    }
                }

                // then get the player position
                playerPosn = match(indexToPosnMap.get(uniqueId), {
                    Some: (posn) => posn,
                    None: () => 0
                })

                // check if unique id not present or playerPosn is 0
                if(uniqueId == "" && playerPosn == 0){
                    // generate new id and update the player mapping informations
                    let newId = `${uuidv4() + idTrack}`;
                    let newPlayerPosn = playerInfos.length + 1;
                    playerIdMap.push(newId);
                    playerIndexMap.insert(caller, playerIdMap);
                    indexToPosnMap.insert(newId, newPlayerPosn)
                    let playerInfo = generatePlayerInformation(id, newPlayerPosn, ticketNumbers)
                    playerInfos.push(playerInfo)
                }else{
                    // else just add ticketNumbers to player tickets array
                    playerInfos[playerPosn].tickets = [...playerInfos[playerPosn].tickets, ...ticketNumbers];
                }
            }

            // update record in storage
            const updatedLottery: Lottery = { 
                ...lottery,
                noOfTickets: lottery.noOfTickets + noOfTickets,
                players: playerInfos
            };
            lotteryStorage.insert(lottery.id, updatedLottery);
            return Result.Ok<string, string>("Ticket bought successfully");
        },
        None: () => Result.Err<string, string>(`Ticket purchase failed`)
    });
}

function generatePlayerInformation(lotteryId: int32, newPlayerId: int32, ticketNumbers: Vec<int32>): Player {
    const newPlayer: Player = {
            id: newPlayerId,
            lotteryId: lotteryId,
            player: ic.caller(),
            tickets: ticketNumbers
    }
    return newPlayer
}

$update;
export async function endLottery(id: int32): Promise<Result<string, string>> {

    // check lottery state and fail if not yet initialized
    const state = match(lotteryState, {
        Some: (state) => state,
        None: () =>  ic.trap("Lottery not yet initialized"),
    })

    // check that lottery state is still open
    if(state !== 0){
        ic.trap("wrong lottery state")
    }

    // search for lottery id
    return match(lotteryStorage.get(id), {
        Some: async (lottery) => {

            // check if lottery has ended
            if(lottery.endTime < ic.time()){
                ic.trap("lottery not yet over")
            }
            
            // get random number as winning tickets
            let ticketsSold = lottery.noOfTickets;
            const randomValue = Math.random() * (ticketsSold - 0) + 0;
            let winningTicket = Math.floor(randomValue)

            // update record in storage and set lottery completed status to 1 i.e. waiting for payouts
            const updatedLottery: Lottery = { 
                ...lottery,
                winningTicket: winningTicket,
                lotteryCompleted: 1
            };

            lotteryStorage.insert(lottery.id, updatedLottery);
            return Result.Ok<string, string>("lottery ended, winner can claim now.")
        },
        None: () => Result.Err<string, string>(`couldn't end lottery with id=${id}`)
    });
}

$update;
export async function checkIfWinner(id: int32): Promise<Result<string, string>> {

    // check lottery state and fail if not yet initialized
    if(lotteryState == Opt.None){
        ic.trap("lottery not yet intialized")
    }

    const pool =  match(prizePool, {
        Some: (pool) => pool,
        None: () => ic.trap("Lottery pool is empty"),
    })
    // calculate winners reward
    const winnersReward = pool / BigInt(2);

    // update prize pool
    prizePool = Opt.Some(pool - winnersReward);

    return match(lotteryStorage.get(id), {
        Some: async (lottery) => {

            // check if lottery has been ended
            if(lottery.lotteryCompleted !== 1){
                ic.trap("lottery not yet ended")
            }

            const caller = ic.caller()
            let uniqueId: string = "";

            // generate lottery track identifier
            const idTrack = `"${id}"`;

            // check mapping to get player lottery participation unique id arrays
            let playerIdMap = match(playerIndexMap.get(caller),{
                    Some: (list) => list,
                    None: () => ic.trap("No lottery information")
            })

            // check player unique id mapping for lottery id tracker
            for (let i of playerIdMap){
                if(i.includes(`${idTrack}`)){
                    uniqueId = i;
                    break;
                }
            }

            // get player position
            let playerPosn = match(indexToPosnMap.get(uniqueId), {
                Some: (posn) => posn,
                None: () => 0
            })

            // if no unique id is not present and playerPosn is 0, exit application with error,
            // shows that player did not participate in the lottery.
            if(uniqueId == "" && playerPosn == 0){
                ic.trap("No lottery information")
            }

            // else continue and get player info
            const playerInfo = lottery.players[playerPosn];

            // check if player tickets for that lottery contains the winning ticket
            if(playerInfo.tickets.includes(lottery.winningTicket)){
                // initiate payout to winner
                const winnerAddress = getAddressToDeposit(playerInfo.player)
                await payWinner(id, winnersReward, winnerAddress)
            }else{
                ic.trap("Sorry you're not winner")
            }

            // update record in storage and set lottery completed status to payout completed
            const updatedLottery: Lottery = { 
                ...lottery,
                winner: playerInfo.player,
                lotteryCompleted: 2,
            };

            lotteryStorage.insert(lottery.id, updatedLottery);
            return Result.Ok<string, string>("Winner paid out")
        },
        None: () => Result.Err<string, string>(`Error check for payour in lottery with id=${id}.`)
    });
}

$update;
export function deleteLottery(id: int32): Result<string, string> {
    return match(lotteryStorage.remove(id), {
        Some: (_deletedLottery) => {

            if(_deletedLottery.lotteryCompleted !== 1){
                ic.trap("Lottery not yet completed")
            }
            
            return Result.Ok<string, string>("Lottery Deleted")
        },
        None: () => Result.Err<string, string>(`couldn't delete a lottery with id=${id}`)
    });
}

// Helper functions
function getAddressToDeposit(account: Principal):Address {
    const uniqueNumber = generateUniqueNumber(account)
    const address: Address = hexAddressFromPrincipal(account, uniqueNumber)
    return(address)
}


// payment function to deposit icp to cannister
async function makePayment(id: int32, amount: nat64) {
    const toSubAccount: blob = binaryAddressFromPrincipal(ic.id(), Number(id))

    const uniqueNumber = generateUniqueNumber(ic.caller())

    const fromSubAccount: blob = binaryAddressFromPrincipal(ic.caller(), uniqueNumber)

    const balance  = (await icpCanister.account_balance({account:fromSubAccount}).call()).Ok?.e8s
    
    if(balance !== undefined && balance > amount){
        const transfer = await icpCanister.transfer(
            {
                memo: 0n,
                amount: {
                    e8s: amount
                },
                fee:{
                    e8s: 10000n
                },
                from_subaccount: Opt.Some(fromSubAccount),
                to: toSubAccount,
                created_at_time: Opt.None
            }
        ).call()
        if(transfer.Err){
            ic.trap(transfer.Err.toString())
        }
    } else{
        ic.trap("Fund the subAccount first")
    }
}

// payment function to transfer rewards to winner
async function payWinner(id: int32, amount: nat64, winner: string) {
    let subAccount: blob = binaryAddressFromPrincipal(ic.id(), Number(id))
    const transferResult = await icpCanister.transfer(
        {
            memo: 0n,
            amount: {
                e8s: amount
            },
            fee:{
                e8s: 10000n
            },
            from_subaccount: Opt.Some(subAccount),
            to: binaryAddressFromAddress(winner),
            created_at_time: Opt.None
        }
    ).call()

    if(transferResult.Err){
        ic.trap(transferResult.Err.toString())
    }
}

function generateUniqueNumber(principal: Principal): number {
    const uint8Array = principal.toUint8Array();
    const bigIntValue = BigInt("0x" + Array.from(uint8Array).map(byte => byte.toString(16).padStart(2, "0")).join(""));
    const uniqueNumber = Number(bigIntValue);
    return uniqueNumber;
}

// a workaround to make uuid package work with Azle
globalThis.crypto = {
    //@ts-ignore
    getRandomValues: () => {
        let array = new Uint8Array(32);

        for (let i = 0; i < array.length; i++) {
            array[i] = Math.floor(Math.random() * 256);
        }

        return array;
    }
};