import express from 'express'
import type { Express, Request, Response } from 'express'
import cors from 'cors'
import { DwnRequest, DwnResponse } from './dwn-types.js'
import { Dwn } from '@tbd54566975/dwn-sdk-js'
import { parseRequest, createResponse } from './dwn-json-rpc.js'

export interface IHandler {
    (req: DwnRequest): Promise<DwnResponse | void>
}

type Options = {
    dwn: Dwn
    handler?: (req: DwnRequest) => Promise<DwnResponse | void>
    // [kw] can parameterize the json-rpc parsing
}

export const readReq = async <T = any>(req: Request): Promise<T | void> => {
    let chunks = ''
    for await (const chunk of req) chunks += chunk
    if (chunks) return JSON.parse(chunks)
}

export class DwnHttpServer {
    options: Options
    api: Express

    constructor(options: Options) {
        this.options = options
        this.api = express()

        this.api.use(cors({ exposedHeaders: 'dwn-response' }))
        this.api.get('/health', (_, res) => res.json({ ok: true }))

        this.api.use('/protocol', express.static('json-schemas'))

        this.api.get('/', (_req, res) => {
            // return a plain text string
            res.setHeader('content-type', 'text/plain')
            return res.send('please use a web5 client, for example: https://github.com/TBD54566975/web5-js ')
        })

        this.api.post('/', async (req: Request, res: Response) => {
            try {
                let dwnRequest: DwnRequest
                try {
                    dwnRequest = parseRequest(JSON.parse(req.headers['dwn-request'] as string))
                    if (!dwnRequest.payload) {
                        const contentLength = req.headers['content-length'] ?? '0'
                        const transferEncoding = req.headers['transfer-encoding']
                        const requestDataStream = (parseInt(contentLength) > 0 || transferEncoding !== undefined) ? req : undefined
                        if (requestDataStream)
                            dwnRequest.payload = await readReq(requestDataStream)
                    }
                } catch (err: any) {
                    // todo integrate w/ web5-js expected response
                    console.error('Failed to parse client request', err)
                    res.status(400).end(err.message)
                    return
                }

                const dwnResponse = this.options.handler ? await this.options.handler(dwnRequest) : undefined

                if (!dwnResponse) {
                    if (!dwnRequest.target) throw new Error('DwnRequest must have a target')
                    const reply = await this.options.dwn.processMessage(dwnRequest.target, dwnRequest.message, dwnRequest.payload as any)
                    res.json(reply)
                } else if (dwnResponse.payload) {
                    res.setHeader('content-type', 'application/octet-stream')
                    res.setHeader('dwn-response', JSON.stringify(createResponse(dwnResponse)))
                    dwnResponse.payload.pipe(res)
                } else {
                    res.json(createResponse(dwnResponse))
                }
            } catch (err: any) {
                // todo integrate w/ web5-js expected response
                console.error('Failed to process message', err)
                res.status(500).end(err.message)
                return
            }
        })
    }

    listen = (port: number, callback?: () => void) => this.api.listen(port, callback)
}