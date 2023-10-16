import type { DwnMessage, DwnRequest, DwnResponse } from './dwn-types.js'

export type JsonRpcId = string | number | null
export type JsonRpcParams = DwnRequest // todo
export type JsonRpcVersion = '2.0'

export interface JsonRpcRequest {
    jsonrpc: JsonRpcVersion
    id?: JsonRpcId
    method: string
    params?: JsonRpcParams
}

export interface JsonRpcResponse {
    jsonrpc: JsonRpcVersion
    id: JsonRpcId
    result: any
    error?: undefined
}

export const parseRequest = (req: JsonRpcRequest): DwnRequest => {
    if (!req.params) throw new Error('JSON-RPC must include the DwnRequest in the params property')
    return req.params
}

export const createRequest = (target: string, message: DwnMessage): JsonRpcRequest => {
    return {
        jsonrpc: '2.0',
        id: '', // TODO
        method: 'dwn.processMessage',
        params: {
            target,
            message
        }
    }
}

export const parseResponse = (res: JsonRpcResponse): DwnResponse => {
    return res.result
}

export const createResponse = (res: DwnResponse): JsonRpcResponse => {
    return {
        jsonrpc: '2.0',
        id: '',
        result: {
            reply: res.reply
        }
    }
}