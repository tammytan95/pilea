import { call, put, takeLatest } from 'redux-saga/effects'
import moment from 'moment'
import {
  setTransactions,
  resetTransactions,
  setLoggedIn,
  setUserInfo,
  setCards,
  setItems,
} from '../actions'
import {
  TRANSACTIONS,
  FETCH_LOG_IN,
  FETCH_LOG_OUT,
  FETCH_CREATE_USER,
  FETCH_REFRESH_TRANSACTIONS,
  API_ITEMS_ADD,
  API_USER_LOGIN,
  API_TRANSACTIONS_RETRIEVE,
  API_USER_LOGOUT,
  API_USER_CREATE,
  FETCH_ADD_ITEM,
  CARDS,
  API_ITEMS_GET,
} from '../konstants'
import { parseSSEFields } from '../utilities/utils'
import { services } from '../utilities/services'
import { Account as PlaidCard, Transaction as PlaidTransaction } from 'plaid'
import { startLoading, stopLoading } from '../actions/loading'

export interface DBItem {
  id?: number
  userId: number
  accessToken: string
  lastUpdated?: string
  alias?: string
}

export interface PileaCard extends PlaidCard {
  userId: number
  itemId: number
}
export interface APIResponse {
  success: boolean
  status: string
  error: any
}

export interface AddItemResponse extends APIResponse {
  items: Array<{
    id?: number
    userId: number
    accessToken: string
    lastUpdated?: string
    alias?: string
  }>
}

export interface GetItemsResponse extends AddItemResponse {}

export interface CreateUserResponse extends APIResponse {
  username: string
  userId: number
}

export interface UserLogInResponse extends APIResponse {
  username: string
  id: number
}

export interface TransactionsRetrieveResponse extends APIResponse {
  cards: PileaCard[]
  transactions: PlaidTransaction[]
  items: DBItem[]
}

function* addItem({ payload: { accessToken, alias } }) {
  try {
    const { status, items }: AddItemResponse = yield call(
      services[API_ITEMS_ADD],
      {
        body: JSON.stringify({
          publicToken: accessToken,
          alias,
        }),
      }
    )

    yield put(setItems(items))
  } catch ({ error, status }) {
    console.error(status, error)
  }
}

function* fetchLogIn({ payload: { user, password } }) {
  try {
    // 1. Attempt log in
    const { username, id }: UserLogInResponse = yield call(
      services[API_USER_LOGIN],
      {
        body: JSON.stringify({
          username: user,
          password,
        }),
      }
    )

    yield put(setLoggedIn({ status: true }))
    yield put(
      setUserInfo({
        userName: username,
        userId: id,
      })
    )

    // 2. Immediately request accounts + tx stored in DB
    const {
      cards,
      transactions,
      items,
    }: TransactionsRetrieveResponse = yield call(
      services[API_TRANSACTIONS_RETRIEVE]
    )

    yield put(setCards(cards))
    yield put(setTransactions(transactions))
    yield put(setItems(items))
  } catch (e) {
    console.error(e)
  }
}

function* fetchLogOut() {
  try {
    yield call(services[API_USER_LOGOUT])

    yield put(setLoggedIn({ status: false }))
    yield put(
      setUserInfo({
        userName: '',
        userId: 0,
      })
    )
  } catch ({ error, status }) {
    console.error(status, error)
  }
}

function* fetchCreateUser({ payload: { user, password } }) {
  try {
    const { userId, username }: CreateUserResponse = yield call(
      services[API_USER_CREATE],
      {
        body: JSON.stringify({
          username: user,
          password,
        }),
      }
    )

    yield put(setLoggedIn({ status: true }))
    yield put(
      setUserInfo({
        userName: username,
        userId,
      })
    )
  } catch ({ status, error }) {
    console.error(status, error)
  }
}

function* refreshTransactions() {
  yield put(startLoading(TRANSACTIONS))
  yield put(resetTransactions({}))
  try {
    const start = moment()
      .subtract(2, 'year')
      .format('YYYY-MM-DD')
    const end = moment().format('YYYY-MM-DD')

    const SSEResponse = yield call(
      fetch,
      'http://localhost:8000/transactions/refresh',
      ({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          start,
          end,
        }),
      } as unknown) as RequestInit
    )

    const reader = yield SSEResponse.body.getReader()
    const decoder = yield new TextDecoder('utf-8')

    let complete = false
    let dataString = ''

    while (!complete) {
      const chunk = yield reader.read()
      dataString += yield decoder.decode(chunk.value)

      const possibleEventArr = dataString.split(/\n\n/g)

      let eventsFound = 0

      for (const [i, message] of possibleEventArr.entries()) {
        if (i === possibleEventArr.length - 1) {
          continue
        }

        eventsFound++
        const { id, data, event } = parseSSEFields(message)

        if (id === 'CLOSE') {
          complete = true
        }

        switch (event) {
          case CARDS: {
            yield put(setCards(JSON.parse(data) as PileaCard[]))
            break
          }
          case TRANSACTIONS: {
            yield put(setTransactions(JSON.parse(data) as PlaidTransaction[]))
            break
          }
          default:
            break
        }
      }
      possibleEventArr.splice(0, eventsFound)
      dataString = possibleEventArr.join('\n\n')
    }

    // Immediately after successful refresh, get items.
    const { items }: AddItemResponse = yield call(services[API_ITEMS_GET])

    yield put(setItems(items))
  } catch (e) {
    console.error('Error in fetchTransactions:', e)
  }

  yield put(stopLoading(TRANSACTIONS))
}

function* saga() {
  //@ts-ignore
  yield takeLatest(FETCH_CREATE_USER, fetchCreateUser)
  //@ts-ignore
  yield takeLatest(FETCH_REFRESH_TRANSACTIONS, refreshTransactions)
  //@ts-ignore
  yield takeLatest(FETCH_ADD_ITEM, addItem)
  //@ts-ignore
  yield takeLatest(FETCH_LOG_IN, fetchLogIn)
  //@ts-ignore
  yield takeLatest(FETCH_LOG_OUT, fetchLogOut)
}

export default saga
