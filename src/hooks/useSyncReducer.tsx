import React, {
  Reducer,
  useReducer,
  useEffect,
  ProviderProps,
  createContext,
  useContext,
} from "react";
import { usePeers, PeerConnectionOptions } from "./usePeers";
const sanitizeId = (idString: string) => idString.replace(/[^A-Za-z0-9]/g, "");

export const SyncStateContext = createContext({});
export const SyncDispatchContext = createContext({});
export const SyncConnectionContext = createContext({});

export const useSyncState = () => useContext(SyncStateContext);
export const useSyncDispatch = () => useContext(SyncDispatchContext);
export const useSyncConnectionInfo = () => useContext(SyncConnectionContext);

export const ConnectionReadout = () => {
  const state = useSyncConnectionInfo() as {
    connected: boolean;
    connections: Record<string, any>;
    host: string;
  };

  return (
    <pre style={{ maxHeight: "500px", overflowY: "auto", overflowX: "auto" }}>
      connected: {state.connected} / host: {state.host}
      <br />
      connections:{" "}
      {Object.entries(state.connections).map(([id, conn]) => (
        <span key={id}>
          {id} <button onClick={() => conn.close()}>close</button>
        </span>
      ))}
    </pre>
  );
};
export const SyncStateReadout = () => {
  const state = useSyncState();

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
// i am benhorst and i'm looking to synchronize lobbycode:123-etc. I must provide an initial State value with a host key.
<PeerHostProvider value={ { host: 'host-id' } } myPeerId="benhorst" stateReducers={ { client: cReducer, host: hReducer } }>
 <MyComponent>
   // is able to dispatch actions and render the lobby state
  </MyComponent>
</MyComponent>

const MyComponent = () => {

  const state = useSyncState(); // this uses the provider
  const dispatch = useSyncDispatch();

  // together, these are the same as `const [state, dispatch] = useReducer(reducer);`
  // but we allow you to specify host/client reducers in the provider.
}
*/

interface IdObject {
  id: string;
}
type SyncStateObject = {
  host: string;
  players: IdObject[];
};
type SyncStateActionPayload = {};
type SyncStateReducerAction<
  P extends SyncStateActionPayload = SyncStateActionPayload
> = {
  type: string;
  hostDispatch?: boolean;
  payload: P;
  timestamp: string;
};

type PeerMessage = {
  type: "syncstate.update" | "hello" | "info";
  clientId?: string;
  timestamp: string;
  action: {
    type: string;
    payload: any;
  };
};

type SyncReducerProviderProps<T extends SyncStateObject> = {
  stateId: string; // the state we want to track/register for (getState retrieves this)
  peerId: string; // my id in the world, can be used visibly to id me in peers
  // getState: (id: string) => Promise<T>; // async function to get state from scratch
  connectionOptions?: PeerConnectionOptions; // the PeerJS options for connecting to a Stun/Turn server
  stateReducers: {
    client: Reducer<T, SyncStateReducerAction>;
    host: Reducer<T, SyncStateReducerAction>;
  };
} & ProviderProps<T>;

export const SyncReducerProvider = <T extends SyncStateObject, A>({
  stateId,
  peerId: peerIdIn,
  value,
  connectionOptions,
  // getState,
  stateReducers,
  ...props
}: SyncReducerProviderProps<T>) => {
  // critically, there needs to be an initial value provided here.
  // any case in which we accept values from external, we should sanitize the IDs.
  // peerjs can only handle certain characters in identifiers.
  const { host: hostIn } = value;
  const host = sanitizeId(hostIn);

  const { client: clientReducer, host: hostReducer } = stateReducers;

  const peerId = sanitizeId(peerIdIn);
  const theReducer = host === peerId ? hostReducer : clientReducer;

  const [syncState, dispatchSyncState] = useReducer(theReducer, value);
  const { connected, broadcast, addListener, removeListener, connections } =
    usePeers(peerId, host, connectionOptions || {});

  // a dispatch to give to consumers
  const externalDispatch = (action: SyncStateReducerAction) => {
    console.log("external dispatch", action);
    dispatchSyncState(action);
    // send the host the action you done did.
    if (host !== peerId) {
      broadcast({
        type: "syncstate.update",
        action,
        timestamp: action.timestamp,
      });
    }
  };

  // whenever syncState or the connection list changes,
  // send a fresh update to all peers (only if host!)
  useEffect(() => {
    // TODO: this is all well and good but it would be nice to know which
    // peer was the one to cause the state change.
    // one reason is that we'd like to know pingback times to measure latency
    if (host === peerId) {
      console.debug(
        "SyncState or Connection change. Sending host syncstate update to all peers"
      );
      broadcast({
        type: "syncstate.update",
        action: {
          type: "host.update",
          payload: syncState,
        },
      });
    }
  }, [syncState, connections]);

  const peerListener = (message: PeerMessage) => {
    if (message.type === "syncstate.update") {
      console.log("received sync state update from peer ", message);
      dispatchSyncState({ ...message.action, timestamp: message.timestamp });
    } else if (message.type === "hello") {
      console.log("just saying hello from: ", message.clientId);
      broadcast({
        type: "syncstate.update",
        timestamp: message.timestamp,
        action: {
          type: "host.update",
          payload: syncState,
        },
      });
    } else {
      console.log("received debug message from peer ", message);
    }
  };
  useEffect(() => {
    addListener(peerListener);
    return () => removeListener(peerListener);
  }, [syncState]);

  return (
    <SyncStateContext.Provider value={syncState}>
      <SyncDispatchContext.Provider value={externalDispatch}>
        <SyncConnectionContext.Provider
          value={{ connected, connections, host }}
        >
          {props.children}
        </SyncConnectionContext.Provider>
      </SyncDispatchContext.Provider>
    </SyncStateContext.Provider>
  );
};
