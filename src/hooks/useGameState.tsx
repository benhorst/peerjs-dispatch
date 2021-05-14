import React, {
  Reducer,
  useReducer,
  useEffect,
  ProviderProps,
  createContext,
  useContext,
} from "react";
import { usePeers } from "./usePeers";

export const GameStateSyncContext = createContext({});
export const GameStateSyncDispatchContext = createContext({});
export const GameConnectionContext = createContext({});

export const useGameState = () => useContext(GameStateSyncContext);
export const useGameStateDispatch = () =>
  useContext(GameStateSyncDispatchContext);
export const useGameConnectionInfo = () => useContext(GameConnectionContext);

export const PlayerConnectionReadout = () => {
  const state = useGameConnectionInfo() as {
    connected: boolean;
    connections: Record<string, any>;
    host: string;
  };

  return (
    <pre style={{ maxHeight: "500px", overflowY: "auto", overflowX: "auto" }}>
      connected: {state.connected} / host: {state.host}
      <br />
      connections: {Object.keys(state.connections).join(", ")}
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
  clientId?: string;
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
  const { host } = value;
  const { client: clientReducer, host: hostReducer } = stateReducers;
  const theReducer = host === peerId ? hostReducer : clientReducer;

  const [gameState, dispatchGameState] = useReducer(theReducer, value);
  const { connected, broadcast, addListener, removeListener, connections } =
    usePeers(peerId, host);

  // a dispatch to give to consumers
  const externalDispatch = (action: GameStateReducerAction) => {
    console.log("external dispatch", action);
    dispatchGameState(action);
    // send the host the action you done did.
    if (host !== peerId) {
      broadcast({
        type: "gamestate.update",
        action,
      });
    }
  };
  useEffect(() => {
    if (host === peerId) {
      broadcast({
        type: "gamestate.update",
        action: {
          type: "host.update",
          payload: gameState,
        },
      });
    }
  }, [gameState, connections]);

  const peerListener = (message: PeerMessage) => {
    if (message.type === "gamestate.update") {
      console.log("received game state update from peer ", message);
      externalDispatch(message.action);
    } else if (message.type === "hello") {
      console.log("just saying hello from: ", message.clientId);
      broadcast({
        type: "gamestate.update",
        action: {
          type: "host.update",
          payload: gameState,
        },
      });
    } else {
      console.log("received debug message from peer ", message);
    }
  };
  useEffect(() => {
    addListener(peerListener);
    return () => removeListener(peerListener);
  }, [gameState]);

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
