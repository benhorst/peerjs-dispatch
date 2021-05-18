import {
  useSyncDispatch,
  useSyncState,
  useSyncConnectionInfo,
} from "./useSyncReducer";

test("useGameState", () => {
  expect(useSyncState).not.toBeUndefined;
});

test("useGameConnectionInfo", () => {
  expect(useSyncConnectionInfo).not.toBeUndefined;
});

test("useGameStateDispatch", () => {
  expect(useSyncDispatch).not.toBeUndefined;
});
