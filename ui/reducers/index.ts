import { combineReducers } from 'redux'
import { createSelector } from 'reselect'
import { cloneDeep, isEmpty } from 'lodash'
import moment from 'moment'
import transactions, * as fromTransactions from './transactionsAccounts'
import login, * as fromLogin from './login'
import graph, * as fromGraph from './graph'
import grid, * as fromGrid from './grid'
import { TRANSACTIONS, LOGIN, GRAPH, GRID, INPUT, OUTPUT } from '../konstants'

const reducers = combineReducers({
  transactions,
  login,
  graph,
  grid,
})
export default reducers

//transactions
export const transactionsSelector = state =>
  fromTransactions.transactionsSelector(state[TRANSACTIONS])
export const cardsSelector = state =>
  fromTransactions.cardsSelector(state[TRANSACTIONS])
export const itemsSelector = state =>
  fromTransactions.itemsSelector(state[TRANSACTIONS])
export const dailyTransactionsSelector = state =>
  fromTransactions.dailyTransactionsSelector(state[TRANSACTIONS])
export const transactionsByDateInputOutputSelector = state =>
  fromTransactions.transactionsByDateInputOutputSelector(state[TRANSACTIONS])
export const transactionsBycardsSelector = state =>
  fromTransactions.transactionsBycardsSelector(state[TRANSACTIONS])
export const transactionsNoIntraAccountSelector = state =>
  fromTransactions.transactionsNoIntraAccountSelector(state[TRANSACTIONS])
export const transactionsByCategorySelector = state =>
  fromTransactions.transactionsByCategorySelector(state[TRANSACTIONS])
export const transactionsByNameSelector = state =>
  fromTransactions.transactionsByNameSelector(state[TRANSACTIONS])
export const cardsByItemsSelector = state =>
  fromTransactions.cardsByItemsSelector(state[TRANSACTIONS])

//log in
export const accessTokensSelector = state =>
  fromLogin.accessTokensSelector(state[LOGIN])
export const loggedInSelector = state =>
  fromLogin.loggedInSelector(state[LOGIN])
export const userSelector = state => fromLogin.userSelector(state[LOGIN])

//graph
export const graphFidelitySelector = state =>
  fromGraph.graphFidelitySelector(state[GRAPH])

//grid
export const selectedTransactionKeySelector = state => {
  return fromGrid.selectedTransactionKeySelector(state[GRID])
}

//combined
export const transactionsByDayCountCombinedSelector: (
  state
) => fromTransactions.TimeConsolidatedTransactionGroups = createSelector(
  transactionsByDateInputOutputSelector,
  graphFidelitySelector,
  (transactions, days) => {
    const orderedDates = Object.keys(transactions)
      .map(date => moment(date, 'YYYY-MM-DD', true))
      //@ts-ignore
      .sort((a, b) => b - a)
      .map(date => date.format('YYYY-MM-DD'))

    return orderedDates.reduce((acc, cur, i) => {
      const newIndex = Math.floor(i / days) //newIndex is 0
      const keyMap = orderedDates[newIndex * days]
      if (!acc[keyMap]) {
        //if keyMap in acc doesnt exist
        acc[keyMap] = cloneDeep(transactions[cur])
      } else {
        //if it does exist
        acc[keyMap][INPUT] = acc[keyMap][INPUT] + transactions[cur][INPUT]
        acc[keyMap][OUTPUT] = acc[keyMap][OUTPUT] + transactions[cur][OUTPUT]
        acc[keyMap][TRANSACTIONS] = acc[keyMap][TRANSACTIONS].concat(
          transactions[cur][TRANSACTIONS]
        )
      }
      return acc
    }, {})
  }
)

export const selectedTransactionsSelector: (
  state
) => fromTransactions.TimeConsolidatedTransactionGroup = createSelector(
  transactionsByDayCountCombinedSelector,
  selectedTransactionKeySelector,
  (transactions, selectedKey) => {
    return isEmpty(transactions) || selectedKey === ''
      ? {
          input: 0,
          output: 0,
          transactions: [],
        }
      : transactions[selectedKey]
  }
)
