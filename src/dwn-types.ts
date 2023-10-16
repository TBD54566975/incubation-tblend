import type { Readable } from 'node:stream'
import type { UnionMessageReply, RecordsQueryMessage, RecordsWriteMessage } from '@tbd54566975/dwn-sdk-js'

export type DwnMessage = RecordsQueryMessage | RecordsWriteMessage

export type DwnRequest = {
  target?: string,
  message: DwnMessage,
  payload?: Readable | any
}

export type DwnResponse = {
  reply: UnionMessageReply
  payload?: Readable
}
