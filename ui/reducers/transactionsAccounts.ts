import { createSelector } from 'reselect'
import {
  SET_TRANSACTIONS,
  TRANSACTIONS,
  RESET_TRANSACTIONS,
  AMOUNT,
  CATEGORY,
  NAME,
  CARDS,
  ITEMS,
  SET_CARDS,
  SET_ITEMS,
  LAST_UPDATED,
} from '../konstants'
import { shouldKeepTransaction } from '../utilities/utils'
import { updateIn, set, update } from 'timm'
import { Transaction as PlaidTransaction, Account as PlaidCard } from 'plaid'
import { DBItem, PileaCard } from '../sagas/sagas'
import { TransactionsActionTypes, AccountsActionTypes } from '../actions'

const initialState = {
  [TRANSACTIONS]: [] as PlaidTransaction[],
  [CARDS]: [] as PileaCard[],
  [ITEMS]: [] as DBItem[],
  [LAST_UPDATED]: '',
}

const transactions: (
  state: typeof initialState,
  {
    type,
    payload,
  }: { type: TransactionsActionTypes | AccountsActionTypes; payload }
) => typeof initialState = (state = initialState, { type, payload }) => {
  let newState: typeof initialState

  switch (type) {
    case SET_TRANSACTIONS: {
      newState = updateIn(state, [TRANSACTIONS], list => [...list, ...payload])
      break
    }
    case SET_CARDS: {
      newState = updateIn(state, [CARDS], existingCards => {
        return (payload as PlaidCard[]).reduce(
          (acc, newCard) => {
            if (
              !acc.find(
                existCard => existCard.account_id === newCard.account_id
              )
            ) {
              acc.push(newCard)
            }
            return acc
          },
          existingCards as PlaidCard[]
        )
      })
      break
    }
    case SET_ITEMS: {
      newState = updateIn(state, [ITEMS], _ => [...payload])
      break
    }

    case RESET_TRANSACTIONS: {
      newState = set(state, TRANSACTIONS, [])
      break
    }
    default: {
      newState = state
    }
  }

  return newState
}
export default transactions

export const getTypeOfCard: ({
  cards,
  id,
}: {
  cards: PileaCard[]
  id: string
}) => string | null = ({ cards, id }) => {
  const card = cards.find(card => card.account_id === id)

  return card ? card.type : null
}

export const getCardName: ({
  cards,
  id,
}: {
  cards: PileaCard[]
  id: string
}) => string | null = ({ cards, id }) => {
  const card = cards.find(account => account.account_id === id)

  return card ? (card.official_name ? card.official_name : card.name) : null
}

export const transactionsSelector: (
  state: typeof initialState
) => PlaidTransaction[] = state => state[TRANSACTIONS]

export const cardsSelector: (
  state: typeof initialState
) => PileaCard[] = state => state[CARDS]

export const itemsSelector: (state: typeof initialState) => DBItem[] = state =>
  state[ITEMS]

export interface TxWithCardType extends PlaidTransaction {
  cardType: string
}
export const transactionsNoIntraAccountSelector: (
  state: typeof initialState
) => TxWithCardType[] = createSelector(
  transactionsSelector,
  cardsSelector,
  (transactions, cards) => {
    return transactions
      .map(tx => ({
        ...tx,
        cardType: getTypeOfCard({
          id: tx.account_id,
          cards,
        }),
      }))
      .filter(({ cardType, ...tx }) => {
        return shouldKeepTransaction(tx, cardType)
      })
  }
)

export interface DailyTransactions {
  [uniqueDate: string]: TxWithCardType[]
}
export const dailyTransactionsSelector: (
  state: typeof initialState
) => DailyTransactions = createSelector(
  transactionsNoIntraAccountSelector,
  transactions => {
    const uniqueDates = [...new Set(transactions.map(tx => tx.date))].reduce(
      (acc, cur) => {
        acc[cur] = []
        return acc
      },
      {}
    )
    const txByDates = transactions.reduce(
      (acc, cur) => {
        const { date } = cur

        acc[date].push(cur)
        return acc
      },
      uniqueDates as DailyTransactions
    )

    return txByDates
  }
)

export interface TimeConsolidatedTransactionGroup {
  input: number
  output: number
  transactions: TxWithCardType[]
}

export interface TimeConsolidatedTransactionGroups {
  [key: string]: TimeConsolidatedTransactionGroup
}

export const transactionsByDateInputOutputSelector: (
  state: typeof initialState
) => TimeConsolidatedTransactionGroups = createSelector(
  dailyTransactionsSelector,
  transactions => {
    return Object.keys(transactions).reduce((finalResult, date) => {
      finalResult[date] = transactions[date].reduce(
        (dailyInfo, tx) => {
          const { cardType, amount } = tx

          if (cardType === 'credit' && amount >= 0) {
            dailyInfo.output += amount
          }
          if (cardType === 'credit' && amount <= 0) {
            dailyInfo.input += -amount
          }
          if (cardType === 'depository' && amount >= 0) {
            dailyInfo.output += amount
          }
          if (cardType === 'depository' && amount <= 0) {
            dailyInfo.input += -amount
          }

          dailyInfo.transactions.push(tx)

          return dailyInfo
        },
        {
          input: 0,
          output: 0,
          transactions: [],
        } as TimeConsolidatedTransactionGroup
      )
      return finalResult
    }, {})
  }
)

export const transactionsByCategorySelector = createSelector(
  transactionsNoIntraAccountSelector,
  transactions =>
    transactions.reduce((acc, cur) => {
      if (!cur[CATEGORY]) {
        return acc
      }

      const category = cur[CATEGORY][0]

      if (acc[category]) {
        acc[category][AMOUNT] += cur[AMOUNT]
        acc[category][TRANSACTIONS].push(cur)
      } else {
        acc[category] = {
          [AMOUNT]: cur[AMOUNT],
          [TRANSACTIONS]: [cur],
        }
      }

      return acc
    }, {})
)

export const transactionsByNameSelector = createSelector(
  transactionsNoIntraAccountSelector,
  transactions =>
    transactions.reduce((acc, cur) => {
      if (!cur[NAME]) {
        return acc
      }

      const name = cur[NAME]

      if (acc[name]) {
        acc[name][AMOUNT] += cur[AMOUNT]
        acc[name][TRANSACTIONS].push(cur)
      } else {
        acc[name] = {
          [AMOUNT]: cur[AMOUNT],
          [TRANSACTIONS]: [cur],
        }
      }

      return acc
    }, {})
)

export interface TxGroupedByDateAndCards {
  [date: string]: {
    [card: string]: TxWithCardType[]
  }
}

export const transactionsBycardsSelector: (
  state: typeof initialState
) => TxGroupedByDateAndCards = createSelector(
  dailyTransactionsSelector,
  transactions => {
    return Object.keys(transactions).reduce((result, date) => {
      result[date] = transactions[date].reduce((acc, cur) => {
        acc[cur.account_id]
          ? acc[cur.account_id].push(cur)
          : (acc[cur.account_id] = [cur])
        return acc
      }, {})

      return result
    }, {})
  }
)

export interface ItemWithCards extends DBItem {
  cards: PileaCard[]
}

export const cardsByItemsSelector: (
  state: typeof initialState
) => ItemWithCards[] = createSelector(
  cardsSelector,
  itemsSelector,
  (cards, items) => {
    return items.map(item => ({
      ...item,
      cards: cards.filter(card => card.itemId === item.id),
    }))
  }
)
