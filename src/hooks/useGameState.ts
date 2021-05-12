import useSWR from "swr";
import { useState, useEffect } from "react";
import Pusher from "pusher-js";
import { swrBasicFetch } from "utils/fetch";
import { PartyLobby } from "definitions/Lobby";
import { clientReducer, LobbyAction, serverReducer } from "gameLogic/Lobby";
import { usePeers } from "components/usePeers";

// this is how we dispatch actions to the server, literally to an /actions url
const serverDispatch = async (lobbyCode: string, action: LobbyAction) => {
  const r = await fetch(`/api/lobbies/${lobbyCode}/action`, {
    body: JSON.stringify({ action, p2p: true }),
    method: "POST",
  });
  const json = await r.json();
  return json;
};

const defaultSwrOptions = {};

// this is set up similar to useReducer, with the additional idea that
// we will sync the data to/from the server
// including subscribing to RTC updates
export const useLobby = (
  lobbyCode: string,
  swrOptions = defaultSwrOptions,
  myId: string
) => {
  //const [isLoading, setLoading] = useState(false);
  const {
    data: syncLobby,
    error,
    mutate: mutateLobby,
  } = useSWR("/api/lobbies/" + lobbyCode, swrBasicFetch, swrOptions);

  // the first player is always host.
  let hostId = syncLobby?.players?.[0]?.id || undefined;
  const { connected, addListener, removeListener, broadcast } = usePeers(
    myId,
    hostId
  );

  // a dispatch to give to consumers
  const externalDispatch = (action) => {
    // if this is the host, we want to act as server
    const theReducer = hostId === myId ? serverReducer : clientReducer;
    const newState = theReducer(syncLobby, action);
    // update optimistically locally by changing the system of record
    mutateLobby(newState, false);

    if (action.serverDispatch !== false) {
      // tell everyone what the new state is
      if (hostId === myId) {
        broadcast({
          type: "lobby-action",
          action: {
            type: "server.update",
            payload: newState,
          },
        });
        serverDispatch(lobbyCode, {
          type: "host.update",
          payload: newState,
        });
      } else {
        // send the host the action you done did.
        broadcast({
          type: "lobby-action",
          action,
        });
      }
    }
  };

  const peerDispatch = (message) => {
    if (message.type === "lobby-action") {
      console.log("received lobby action message from peer ", message);
      externalDispatch(message.action);
    } else if (message.type === "hello") {
      externalDispatch({
        type: "server.update",
        payload: syncLobby,
      });
    } else {
      console.log("received debug message from peer ", message);
    }
  };

  useEffect(() => {
    addListener(peerDispatch);
    return () => removeListener(peerDispatch);
  }, []);

  // ultimately, the syncLobby from swr is king
  return [{ data: syncLobby, error, isLoading: !connected }, externalDispatch];
};
