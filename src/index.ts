import { AnyAction, Draft, PayloadAction, Reducer } from "@reduxjs/toolkit";
import produce from "immer";

// redux-toolkit's createSlice:
// 1. forces you to use immer
// 2. its use of immer and wack type system causes type errors on more complicated elements needed in the viewerSlice (by default)
// 3. has poor syntax for creating reducers with unneded boilerplate, particularly deconstructing the action item to get the payload
// an example of a redux-toolkit reducer:
// setAuth(state: AuthState, { payload: authenticationResult }: PayloadAction<AuthenticationResult>) {
//   state.result = authenticationResult;
// },

// alternatives to redux-toolkit are pretty good but have some weaknesses causing you to repeat yourself
// (eg. specifying the 'type' string on an action in addition to the function name - why can't that be inferred?)

// so, I've made some helpers for creating reducers and actions.
// the same reducer as shown would become:
// setAuth: immer((state, authenticationResult: AuthenticationResult) {
//   state.result = authenticationResult;
// }),
// immer is opt-in, and the syntax is smaller. beautiful. 👌

// without immer we can do something like this:
// setAuth: _((state, authenticationResult: AuthenticationResult): State => ({ ...state, authenticationResult }))

// you are not required to understand this code, although I have documented the shit out of it.
// likely to end up being an npm package. 

/////////////// SIMPLE TYPES /////////////////////////////////////////////////////////////////////////////////////////////////////////

/** a reducer which uses its payload directly instead of getting pushed through an action wrapper. */
type BasicReducer<State, PayloadType> = (state: State, payload: PayloadType) => State;
type Keys<T> = keyof T;
type Values<T> = T[Keys<T>];
type AnyFunction = (...args: any) => any;

/////////////// ACTION CREATION /////////////////////////////////////////////////////////////////////////////////////////////////////////

/** @summary the type of a function that generates an action from a payload
 * @description
 * eg. the typing of the below would be `ActionCreator<"add",number>`:   
 * `const add = (payload:number) => ({type:"add",payload})`  
 */
type ActionCreator<ActionName, PayloadType> = (payload: PayloadType) => { type: ActionName, payload: PayloadType };

/** @summary the type of a set of action creators generated from a set of reducers.  
 * @description 
 * For a reducer map that looks like:   
 * `{add:BasicReducer<S, number>,log:BasicReducer<S, string>}`  
 * The action creator map would look like:  
 * `{add:ActionCreator<"add",number>,log:ActionCreator<"log",string>}`  
 * @see {@link https://www.typescriptlang.org/docs/handbook/2/mapped-types.html}
 */
type ActionCreatorMap<ReducerMap extends Record<string, AnyFunction>> = { 
  // the keys of the new object shall be the same as the supplied ReducerMap
  [K in Keys<ReducerMap>]:
  // the values of the new object shall be that of an action creator,
  // using the key name as the action type string and the second argument (Parameter) of the supplied function as payload type
  ActionCreator<K, Parameters<ReducerMap[K]>[1]>; 
};

/** we only need to supply the second arg for type inference purposes.*/
const getActionCreatorFromBasicReducer = 
<State, PayloadType, ActionName>(name: ActionName, _: BasicReducer<State, PayloadType>): ActionCreator<ActionName, PayloadType> => {
  return (payload: PayloadType) => ({ type: name, payload });
};

/** @summary Get a set of action creators from a set of basic reducers.  
 * @description Uses Object.entries, Array.map, Object.fromEntries internally. */
const getActionCreators = <ReducerMap extends Record<string, AnyFunction>>(
  reducerMap: ReducerMap,
  actionNamePrefix: string,
): ActionCreatorMap<ReducerMap> => {
  const entries = Object.entries(reducerMap);
  const mapped = entries.map(e => [e[0], getActionCreatorFromBasicReducer(`${actionNamePrefix}/${e[0]}`, e[1])]);
  return Object.fromEntries(mapped) as ActionCreatorMap<ReducerMap>;
};

/////////////// REDUCER CREATION ////////////////////////////////////////////////////////////////////////////////////////////////////////

/* eslint-disable */
/** @summary Create one reducer from a collection of basicReducers, an initial state and a prefix for action names.  
 *  Executes case reducers based on action type. */
const getMasterReducer = 
<State, ReducerMap>(basicReducers: ReducerMap, initialState: State, actionPrefix: string) => {
  return ((state: State = initialState, action: PayloadAction<any>): State => {
    const reducer = (basicReducers as any)[action.type.replace(`${actionPrefix}/`, '')]; // remove the prefix as not used by ActionCreator type
    if (!reducer) return state; // cannot throw an exception here as the app will throw whenever a different slice attempts to trigger an action
    return reducer(state, action.payload);
  }) as Reducer<State, AnyAction>;
};
/* eslint-enable */

/////////////// REDUCER DECORATORS //////////////////////////////////////////////////////////////////////////////////////////////////////

/** @summary wraps an action (using mutation instead of FP, return type void) in immer's 'produce' function. */
const withProduce = <S, T>(action: (state: Draft<S>, payload: T) => void) => {
  return (state: S, payload: T) => {
    return produce(state, draft => {
      action(draft, payload);
    });
  };
};

/** @summary same as withProduce but with pre-inferred State type.
 * @description useful for not needing to declare 'state: State' everywhere in your reducers.
  */
const withProduceAndStateType = <S>() => <T>(action: (state: Draft<S>, payload: T) => void) => {
  return withProduce<S, T>(action);
};

/** @description type-inference helper. useful for not needing to declare 'state: State' everywhere in your reducers.*/
const withStateType = <S>() => <T>(reducer: (state: S, payload: T) => S) => {
  return (state: S, payload: T) => reducer(state, payload);
};

/** @summary OPTIONAL functions to wrap your reducers in.    
 * @description
 * 1. _: empty wrapper that does nothing except pre-infer the state type so you don't need to specify state: State in your reducer. Syntax sugar.  
 * 2. immer: wraps your reducer in immer's 'produce' function  
 */
export const decorators = <S>() => ({
  _: withStateType<S>(),
  immer: withProduceAndStateType<S>(),
});

/////////////// AUTODUX-STYLE FUNCTIONALITY //////////////////////////////////////////////////////////////////////////////////////////////////////

function lowerCaseFirstLetter(string:string) {
  return string.charAt(0).toLowerCase() + string.slice(1);
}
function upperCaseFirstLetter(string:string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

const getVariableNameFromSetFunctionName = <T extends string>(setFunctionName:T) => lowerCaseFirstLetter(setFunctionName!.replace("set", ""))
/** function name eg. "setRenderNodes" */
const setter = <PropertyName extends string, PayloadType, S>(functionName: PropertyName) => (state: S, payload:PayloadType) => {
  const newState = {...state};
  (newState as any)[getVariableNameFromSetFunctionName(functionName)] = payload;
  return newState as S;
}

type setterType<S, PayloadType> = (state: S, payload:PayloadType) => S;

type Replace<T extends string, S extends string, D extends string,
  A extends string = ""> = T extends `${infer L}${S}${infer R}` ?
  Replace<R, S, D, `${A}${L}${D}`> : `${A}${T}`

type ReducerFunction = "setter" | AnyFunction;

type ReconciledReducerMap<State, ReducersMap extends Record<string,ReducerFunction>> = { 
  [K in Keys<ReducersMap>] :
  ReducersMap[K] extends "setter" ?
    (K extends string ?
      Uncapitalize<Replace<K,"set","">> extends Keys<State> ? 
        setterType<State, State[Uncapitalize<Replace<K,"set","">>]> : 
      never :  
    never) :
  ReducersMap[K] }

const getAutoDuxedReducers = <State, ReducerMap extends Record<string, ReducerFunction>>(
  reducerMap: ReducerMap,
  _ : State,
): ReconciledReducerMap<State, ReducerMap>  => {
  const entries = Object.entries(reducerMap);
  const mapped = entries.map(e => {
    const isSetter = e[1] == "setter";
    if (isSetter) {
      return [e[0], setter(e[0])];
    }
    return [e[0], e[1]];
  });
  return Object.fromEntries(mapped) as ReconciledReducerMap<State, ReducerMap>;
};

/////////////// SLICE CREATION //////////////////////////////////////////////////////////////////////////////////////////////////////////

/** Helper function used as quasi-replacement of createSlice from redux-toolkit */
export const getSlice = <S, ReducerMap extends Record<string, AnyFunction>>(actionPrefix: string, initialState: S, basicReducers: ReducerMap) => {
  const autoDuxedReducers = getAutoDuxedReducers(basicReducers, initialState);
  const reducer = getMasterReducer(autoDuxedReducers, initialState, actionPrefix);
  const actions = getActionCreators(autoDuxedReducers, actionPrefix);
  return { reducer, actions };
};
