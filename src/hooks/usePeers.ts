import Peer from "peerjs";
import { useState, useEffect, useReducer } from "react";

const sanitizeId = (idString: string) => idString.replace(/[^A-Za-z0-9]/g, "");
const DEFAULT_HOST = sanitizeId("auth0|5f245f6c32cea302211421b0");

type Dictionary<T> = Record<string, T>;
interface ConnectionReducerAction {
  type: "add" | "remove";
  payload: {
    id: string;
    ref: Peer.DataConnection;
  };
}
type ConnectionMap = Dictionary<Peer.DataConnection>;
type ConnectionMapReducer = (
  state: ConnectionMap,
  action: ConnectionReducerAction
) => ConnectionMap;

type Listener = (data: any) => void;
interface ListenerReducerAction {
  type: "add" | "remove";
  payload: Listener;
}
type ListenerList = Listener[];
type ListenerReducer = (
  state: ListenerList,
  action: ListenerReducerAction
) => ListenerList;

const addRemoveListenerReducer: ListenerReducer = (state, action) => {
  if (action.type === "add") {
    return state.concat(action.payload);
  } else if (action.type === "remove") {
    return state.filter((x) => x !== action.payload);
  }
  return state;
};
const connectionReducer: ConnectionMapReducer = (state, action) => {
  const { ref, id } = action.payload;
  if (action.type === "add") {
    state = {
      ...state,
      [id]: ref,
    };
  } else if (action.type === "remove") {
    state = { ...state };
    delete state[id];
  }
  return state;
};

export const usePeers = (myPeerId: string, hostIn: string = DEFAULT_HOST) => {
  const id = sanitizeId(myPeerId);
  const [peer, setPeer] = useState<any>(null);
  useEffect(() => {
    const peerRef = new Peer(id);
    setPeer(peerRef);
  }, [id]);

  const host = sanitizeId(hostIn);
  const [connected, setConnected] = useState<boolean>(false);
  const [connections, dispatchConnections] = useReducer(connectionReducer, {});
  const [listeners, dispatchListeners] = useReducer(
    addRemoveListenerReducer,
    []
  );

  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const hasHostConnection = !!connections[host];

  useEffect(() => {
    if (!hasHostConnection) {
      setTimeout(() => {
        setReconnectAttempt(reconnectAttempt + 1);
      }, 2500);
    }
  }, [hasHostConnection]);

  const addListener = (func: Listener) =>
    dispatchListeners({
      type: "add",
      payload: func,
    });
  const removeListener = (func: Listener) =>
    dispatchListeners({
      type: "remove",
      payload: func,
    });

  const internalBroadcast = (fromId: string, payload: any) => {
    Object.entries(connections).forEach(([id, connection]) => {
      if (id === fromId) {
        console.log("not rebroadcasting message to sender: ", id);
      } else {
        console.log("sending message to: ", id, payload);
        connection.send(payload);
      }
    });
  };
  // this is what we typically surface in the hook.
  const broadcast = (payload: any) => internalBroadcast(id, payload);

  // whenever peer ref changes, attempt to open connection to main server
  useEffect(() => {
    console.log("open conn effect");
    if (!peer) return;
    peer.on("open", (pid: string) => {
      setConnected(true);
      console.log("opened connection with id: ", pid);
      // connect to host
    });

    return () => peer.disconnect();
  }, [peer]);

  // whenever connection state changes, connect or reconnect to host
  // if host, allow connections from peers
  useEffect(() => {
    console.log("set up peers effect");
    if (!connected) {
      // but maybe set up reconnecting?
      return; // probably nothing to do in this case? when we DC?
    }
    const onConnection = (conn: Peer.DataConnection) => {
      // conn.peer -> the PeerJS id
      // conn.metadata -> set by connector (can be our definition)
      // conn.label -> set by connector (can be our regular def)
      // conn.connectionId -> unique id provided by server
      // conn.dataChannel -> potentially useful?
      console.log("new connection from ", conn.peer);

      // when it opens up, save it.
      conn.on("open", () => {
        dispatchConnections({
          type: "add",
          payload: {
            ref: conn,
            id: conn.peer,
          },
        });
      });
      // then listen for new data from those peers.
      conn.on("data", (data) => {
        console.log("got data over connection ", conn.peer, data);
        listeners.forEach((f) => f(data));
        internalBroadcast(conn.peer, data);
      });
    };

    if (id === host) {
      console.log("I am the host.");
      // first, listen for new connections from other peers
      peer.on("connection", onConnection);
    } else {
      const hc = peer.connect(host, {
        reliable: true,
        metadata: { clientId: peer.id, host },
      });
      console.log("sending hello to ", host);
      hc.on("open", () => {
        dispatchConnections({
          type: "add",
          payload: {
            ref: hc,
            id: host,
          },
        });
        // say hello from me.
        internalBroadcast(id, {
          clientId: id,
          type: "hello",
          message: "hello!",
        });
      });
      hc.on("data", (data: any) => {
        listeners.forEach((f) => f(data));
      });
      // there needs to be some sort of reconnect logic where it
      // tries to always have a host connection open.
      hc.on("close", () => {
        dispatchConnections({
          type: "remove",
          payload: {
            ref: hc,
            id: host,
          },
        });
      });
    }
    // TODO: add this logic to window.onunload as well
    return () => {
      console.log("cleaning up all connections and handlers");
      peer.off("connection", onConnection);

      // do we need to disconnect other peers?
      Object.entries(connections).forEach(([id, connection]) => {
        connection.close();
      });
    };
  }, [connected, reconnectAttempt, host]);

  return {
    connected,
    broadcast,
    addListener,
    removeListener,
    connections: Object.keys(connections),
  };
};
