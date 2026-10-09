'use sanity'

import { syntaxTree } from '@codemirror/language'
import type { Transaction } from '@codemirror/state'

import { holderOf } from './holder.ts'

function treeGrew(transaction: Transaction): boolean {
  return syntaxTree(transaction.startState).length !== syntaxTree(transaction.state).length
}

function holderChanged(transaction: Transaction): boolean {
  return holderOf(transaction.startState) !== holderOf(transaction.state)
}

export function inputsChanged(transaction: Transaction): boolean {
  return transaction.docChanged || holderChanged(transaction) || treeGrew(transaction)
}
