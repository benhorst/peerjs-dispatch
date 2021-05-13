import React, {
  Reducer,
  useState,
  useEffect,
  createContext,
  ProviderProps,
  useContext,
} from "react";
import { usePeers } from "./usePeers";

/*
GOALS:
while usePeers allows for managing connections and broadcasting/listening
this file aims to synchronize a particular reducer state between said connections
with the aim that the connections and synchronicity are no longer the dispatcher/listener's problem
USAGE
// i am benhorst and i'm looking to synchronize lobbycode:123-etc
<PeerHostProvider stateIdentifier="lobbycode:123-31254-151" myPeerId="benhorst">
 <MyComponent>
   // is able to dispatch actions and render the lobby state
  </MyComponent>
</MyComponent>

const MyComponent = () => {

  const [state, dispatch] = useSyncGameState() // this uses the provider for state id and
}
*/

// const getStateFromId = fetch()

const GameStateSyncContext = createContext({});
const GameStateSyncDispatchContext = createContext({});
const GameConnectionContext = createContext({});

interface IdObject {
  id: string;
}
type GameStateObject = {
  host: string;
  players: IdObject[];
};
type GameStateActionPayload = {};
type GameStateReducerAction<
  P extends GameStateActionPayload = GameStateActionPayload
> = {
  type: string;
  hostDispatch?: boolean;
  payload: P;
};

type PeerMessage = {
  type: "gamestate.update" | "hello" | "info";
  action: {
    type: string;
    payload: any;
  };
};

type GameStateSyncProviderProps<T extends GameStateObject> = {
  stateId: string; // the state we want to track/register for (getState retrieves this)
  peerId: string; // my id in the world, can be used visibly to id me in peers
  initialState: T; // state to start with
  // getState: (id: string) => Promise<T>; // async function to get state from scratch
  stateReducers: {
    client: Reducer<T, GameStateReducerAction>;
    host: Reducer<T, GameStateReducerAction>;
  };
} & ProviderProps<T>;

export const GameStateSyncProvider = <T extends GameStateObject, A>({
  stateId,
  peerId,
  value,
  // getState,
  stateReducers,
  ...props
}: GameStateSyncProviderProps<T>) => {
  // critically, there needs to be an initial value provided here.
  const [gameState, setGameState] = useState<T>(value);
  const { host } = gameState;
  const { connected, broadcast, addListener, removeListener, connections } =
    usePeers(peerId, host);

  // a dispatch to give to consumers
  const { client: clientReducer, host: hostReducer } = stateReducers;
  const externalDispatch = (action: GameStateReducerAction) => {
    // if this is the host, we want to act as server
    const theReducer = host === peerId ? hostReducer : clientReducer;
    const newState = theReducer(gameState, action);
    // update optimistically locally by changing the system of record
    setGameState(newState);

    // if server dispatch is anything but explicitly false,
    // (aka setting action.serverDispatch=false forces regular lobby actions, otherwise it is a host update)
    if (action.hostDispatch !== false) {
      // tell everyone what the new (full!) state is
      if (host === peerId) {
        broadcast({
          type: "lobby-action",
          action: {
            type: "server.update",
            payload: newState,
          },
        });
        // TODO: writeback to a canonical state if required.
      } else {
        // send the host the action you done did.
        broadcast({
          type: "lobby-action",
          action,
        });
      }
    }
  };

  const peerListener = (message: PeerMessage) => {
    if (message.type === "gamestate.update") {
      console.log("received game state update from peer ", message);
      externalDispatch(message.action);
    } else if (message.type === "hello") {
      externalDispatch({
        type: "server.update",
        payload: gameState,
      });
    } else {
      console.log("received debug message from peer ", message);
    }
  };
  useEffect(() => {
    addListener(peerListener);
    return () => removeListener(peerListener);
  }, []);

  return (
    <GameStateSyncContext.Provider value={gameState}>
      <GameStateSyncDispatchContext.Provider value={externalDispatch}>
        <GameConnectionContext.Provider
          value={{ connected, connections, host }}
        >
          {props.children}
        </GameConnectionContext.Provider>
      </GameStateSyncDispatchContext.Provider>
    </GameStateSyncContext.Provider>
  );
};

export const useGameState = () => useContext(GameStateSyncContext);
export const useGameStateDispatch = () =>
  useContext(GameStateSyncDispatchContext);
export const useGameConnectionInfo = () => useContext(GameConnectionContext);

export const PlayerConnectionReadout = () => {
  const state = useGameConnectionInfo();

  return (
    <pre style={{ maxHeight: "500px", overflowY: "auto", overflowX: "auto" }}>
      {JSON.stringify(state, null, 2)}
    </pre>
  );
};
export const GameStateReadout = () => {
  const state = useGameState();

  return (
    <pre style={{ maxHeight: "500px", overflowY: "auto", overflowX: "auto" }}>
      {JSON.stringify(state, null, 2)}
    </pre>
  );
};
