import {
  useGameState,
  useGameConnectionInfo,
  useGameStateDispatch,
} from "./useGameState";

test("useGameState", () => {
  expect(useGameState).not.toBeUndefined;
});

test("useGameConnectionInfo", () => {
  expect(useGameConnectionInfo).not.toBeUndefined;
});

test("useGameStateDispatch", () => {
  expect(useGameStateDispatch).not.toBeUndefined;
});
