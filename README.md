# peerjs-dispatch

A method of sharing state with peers a la `useReducer`. Peerjs allows for WebRTC-based peer-to-peer communication that lowers latency and has high reliability. If you're looking for a library to help you write React code that syncs state to multiple peers without incurring server costs or latency, this is for you!

This is a good fit for turn-based games and any shared state that has an interaction rate under 10 actions per second shared amongst all connected peers.

## Prerequisites

This implementation relies on the peerjs free server, as defined by the `peerjs` lib. https://peerjs.com/peerserver.html

At this time, the options to configure a different peer server are not tested nor supported. If you are interested in this, please open a PR or see Issue #1.

## Usage

### Add the Package

To use our registry, you'll need to set the @benhorst registry default and [add a Personal Access Token](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry#authenticating-with-a-personal-access-token):

`echo "@benhorst:registry=https://npm.pkg.github.com" >> .npmrc`

`echo "//npm.pkg.github.com/:_authToken=TOKEN" >> .npmrc` (replacing the TOKEN part)

Note that the PAT *MUST* have 'read:packages' scope.

---
Then install the package:
`npm install @benhorst/peerjs-dispatch` or `yarn add @benhorst/peerjs-dispatch`

### Implement in your Code

You'll need to create a Reducer that drives your state. You'll want to add that to a Provider so the rest of your code can get at the state and allow it to dispatch actions. When you do this, we set up and manage a connection to the host for you!

```jsx
// if you have a complex reducer, consider using `immer` to `produce` your new state.
const reducers = {
  host: (state, action) => {
    if (action.type === "add") {
      state.text = "current value: ";
      state.value = state.value + action.payload;
    }
    return { ...state };
  },
  client: (state, action) => {
    if (action.type === "add") {
      // you can update optimistically here or wait for host to resolve the action
      state.text = "computing...";
    }
    return { ...state };
  },
};

// You may want to load this from a server. E.g. a game lobby with an identified host.
// or you can find another way to initialize state.
// MUST have a `host` property to identify the host peer.
const initialState = {
  host: "guid-guid-123",
  text: "current value: ",
  value: 0,
};

// assuming you have some sort of session
// or a unique identifier for this user
const { userId } = session;

<SyncReducerProvider
  value={initialState}
  peerId={userId}
  stateReducers={reducers}
>
  <div className="info-panel">
    <ConnectionReadout />
    <SyncStateReadout />
  </div>
  {/* within SyncReducerProvider, you may use components that implement `useSyncState` and `useSyncDispatch` */}
  <ASimpleComponent />
</SyncReducerProvider>;
```

Once you have a Provider at the top level that manages your connection, state changes, etc, you can go implement components that use state and dispatch actions.

```jsx
// this component must be inside a <SyncStateProvider /> node
const ASimpleComponent = () => {
  const syncState = useSyncState();
  const syncDispatch = useSyncDispatch();
  // this can be used like `const [syncState, syncDispatch] = useReducer(theReducer);

  const addTenHandler = () => ({
    type: "add",
    payload: 10,
  });
  const addOneHandler = () => ({
    type: "add",
    payload: 1,
  });

  return (
    <>
      <div>
        {syncState.text} {syncState.value}
      </div>
      <button onClick={addTenHandler}>Add 10</button>
      <button onClick={addOneHandler}>Add 1</button>
    </>
  );
};
```

# Host/Client Architecture

Standard Reducer logic applies. Perhaps read up on Redux docs if this concept is unfamiliar: https://redux.js.org/tutorials/fundamentals/part-3-state-actions-reducers.

Generally,

`syncDispatch(action)` -> `clientReducer(action, syncState)` -> `broadcast *action* to host` -> `hostReducer(action, hostState)` -> `broadcast *new host state* to peers` -> `overwrite client state with new host state`

This means your `client` reducer can actually be `(state, action) => state` and it will.... work fine. UI updates will simply be delayed by 2xlatency to the host. The client and host reducers are split to allow you to make separate state updates on each (if required!).

The host peer will execute _every single action that is dispatched_ in the order that it receives them (including its own local actions). Client peers will execute any locally dispatched actions, and will get forced state updates from the host when the host's state changes. This includes self-sent updates -> e.g. if peerA and peerB are connected to peerH (host) and peerA sends an action A1, both peerA and peerH will execute the action as they receive them then peerH will force peerA to update its own state with whatever peerH calculated (overwriting peerA's optimistic update).

# FAQ

## Are disconnects and closed tabs handled?

Yes. I hope so. There is a 2.5s reconnect timer with no backoff at the time of writing.

## Can you use more than one reducer?

No, at this time you should do something like Redux's `combineReducers` if you really want to.

## Why separate host and client reducers?

In some cases, you may want the host to be the one that reconciles certain actions.

Examples:

When randomness is involved, the client may be unable to keep state consistent with other peers. You may want to do something like `type="roll-initiative"` and while a client could report its own initiative to the host, the host may need to roll for non-player entities.

## How are conflicts resolved? (related: timing issues)

If there's a conflict between peers, the host's decision rules all. It's a fairly naive method, which can make optimistic updates on the local client look incorrect or like they "undid" certain actions. You must be careful how you code your reducers around this.

For example:

If you are writing a game that is not turn-based, but reflex-based, you may run into situations where two players "hit" the same enemy at nearly the same time. If your client reducer registers the hit and attributes a point to each player, your host may receive those actions out of order. The second one to arrive may hit nothing (as there is no enemy there to hit/it has already been hit). At that point, whatever state the host calculates "should be" will be sent to all clients and overwrite their local state. Thus, one player may see a hit that gets reversed.
