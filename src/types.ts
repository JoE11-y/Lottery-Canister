import {
    CallResult,
    nat64,
    Service,
    Record,
    int32,
    Principal,
    Vec,
    serviceQuery,
    serviceUpdate,
    Opt,
    int8
} from 'azle';

export type Player = Record<{
    id: int32;
    lotteryId: int32;
    player: Principal;
    tickets: Vec<int32>;
}>

export type Lottery = Record<{
    id: int32;
    startTime: nat64;
    endTime: nat64;
    noOfTickets: int32;
    winner: Principal;
    winningTicket: int32;
    players: Vec<Player>;
    lotteryCompleted: int32;
}>

export type LotteryConfiguration = Record<{
    currlotteryId : Opt<int32>;
    lotteryState : Opt<int8>;
    ticketPrice : Opt<nat64>;
    lotteryDuration: Opt<nat64>;
    prizePool: Opt<nat64>;
}>

export type lotteryPayload = Record<{
    ticketPrice: nat64;
    lotteryDuration: nat64;
}>

export type buyTicketPayload = Record<{
    lotteryId: int32;
    noOfTickets: int32;
}>

export type queryPayload =Record<{
    lotteryId: int32;
}>

export type addressPayload = Record<{
    address: string
}>

export type Account = {
    address: string;
    balance: nat64;
};

export type State = {
    accounts: {
        [key: string]: Account;
    };
    name: string;
    ticker: string;
    totalSupply: nat64;
};


export class Token extends Service {
    @serviceUpdate
    initializeSupply: ( name: string, originalAddress: string, ticker: string,totalSupply: nat64) => CallResult<boolean>;

    @serviceUpdate
    transfer: (from: string, to: string, amount: nat64) => CallResult<boolean>;

    @serviceQuery
    balance: (id: string) => CallResult<nat64>;

    @serviceQuery
    ticker: () => CallResult<string>;

    @serviceQuery
    name: () => CallResult<string>;

    @serviceQuery
    totalSupply: () => CallResult<nat64>;
}
