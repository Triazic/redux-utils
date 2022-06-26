import { decorators, getSlice, ReconciledReducerMap } from './index';

/* eslint-disable */

// state
export type Log = {
	id: number;
	message: string;
	colour: string;
}

const initialState = {
  userCommandText: "",
  lastExecutedUserCommandText: "",
  logs: [] as Log[],
};

type State = typeof initialState;

const { immer } = decorators<State>();

const reducers = {
  setUserCommandText: "setter" as const,
//   setLastExecutedUserCommandText: "setter" as const,
  addToConsoleLogs: immer((state, logsToAdd: { message: string, colour?: string }[]) => {
    const getProperLog = (l: { message: string, colour?: string }): Log => ({ id: Math.random(), message: l.message, colour: l.colour ?? "black" });
    state.logs = [...state.logs, ...logsToAdd.map(getProperLog)];
  }),
  clearConsole: immer((state) => {
    state.logs = [];
  }),
};

const { reducer: consoleReducer, actions: consoleActions } = getSlice("console", initialState, reducers);

consoleActions.setUserCommandText("hey");
consoleActions.setUserCommandText("bro");