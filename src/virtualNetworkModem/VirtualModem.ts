import { MessageBridge } from "../dependencyInjection/commonServices/MessageBridge"
import { DIContext } from "../dependencyInjection/DIContext"
import { DISPOSE } from "../eventLib/Disposable"
import { EventListener } from "../eventLib/EventListener"
import { AccessDeniedError, VirtualNetworkInternals } from "../virtualNetwork/types"
import { VirtualRouter } from "../virtualNetwork/VirtualRouter"

interface ClientMessages {
    "virtualNetwork:client:openConnection"(connection: VirtualNetworkInternals.Connection): boolean
    "virtualNetwork:client:receivePacket"(packet: VirtualNetworkInternals.Packet): void
    "virtualNetwork:client:closeConnection"(options: { targetID: string, connection: string, reason: string }): void
}

interface ServerMessages {
    "virtualNetwork:server:registerPeer"(options: { name: string }): string
    "virtualNetwork:server:removePeer"(id: string): void
    "virtualNetwork:server:openConnection"(options: { clientID: string, serverID: string }): VirtualNetworkInternals.Connection
    "virtualNetwork:server:closeConnection"(options: { sourceID: string, connectionID: string, reason: string }): void
    "virtualNetwork:server:getPeers"(): VirtualNetworkInternals.PeerInfo[]
    "virtualNetwork:server:findPeersByName"(name: string): string[]
    "virtualNetwork:server:sendPacket"(packet: VirtualNetworkInternals.Packet): void
    "virtualNetwork:server:disconnect"(peers: string[]): void
}

function invalidPayload(): never {
    throw new MessageBridge.ClientError("Invalid request payload")
}

class ModemChildFacade implements VirtualNetworkInternals.NetworkChildFacade {
    public async openConnection(connection: VirtualNetworkInternals.Connection): Promise<boolean> {
        return this.sendRequest("virtualNetwork:client:openConnection", connection)
    }

    public async receivePacket(packet: VirtualNetworkInternals.Packet): Promise<void> {
        return this.sendRequest("virtualNetwork:client:receivePacket", packet).catch(ignoreMessageBridgeDisposedError)
    }

    public async closeConnection(targetID: string, connection: string, reason: string): Promise<void> {
        return this.sendRequest("virtualNetwork:client:closeConnection", { targetID, connection, reason }).catch(ignoreMessageBridgeDisposedError)
    }

    protected sendRequest<T extends keyof ClientMessages>(request: T, data: Parameters<ClientMessages[T]>[0]) {
        return this.owner.messageBridge.sendRequest(request, data) as Promise<ReturnType<ClientMessages[T]>>
    }

    constructor(
        protected readonly owner: VirtualModemServer
    ) { }
}

export class VirtualModemServer extends EventListener {
    public context = DIContext.current
    public messageBridge = this.context.inject(MessageBridge)

    protected peers = new Set<string>()
    protected facade = new ModemChildFacade(this)

    public [DISPOSE]() {
        super[DISPOSE]()
        this.parent.disconnect(this.facade)
    }

    constructor(
        protected readonly parent: VirtualNetworkInternals.NetworkParentFacade
    ) {
        super()

        const handlers: {
            [P in keyof ServerMessages]: (...args: Parameters<ServerMessages[P]>) => Promise<ReturnType<ServerMessages[P]>>
        } = {
            "virtualNetwork:server:registerPeer": async ({ name }) => {
                if (!(typeof name == "string")) invalidPayload()

                const id = await this.parent.registerPeer(name, this.facade)
                this.peers.add(id)
                return id
            },
            "virtualNetwork:server:removePeer": async (id) => {
                if (!(typeof id == "string")) invalidPayload()

                if (!this.peers.has(id)) throw new AccessDeniedError(id)
                await this.parent.removePeer(id)
            },
            "virtualNetwork:server:openConnection": async ({ clientID, serverID }) => {
                if (!(typeof clientID == "string")) invalidPayload()
                if (!(typeof serverID == "string")) invalidPayload()

                if (!this.peers.has(clientID)) throw new AccessDeniedError(clientID)
                return await this.parent.openConnection(clientID, serverID)
            },
            "virtualNetwork:server:closeConnection": async ({ sourceID, connectionID, reason }) => {
                if (!(typeof sourceID == "string")) invalidPayload()
                if (!(typeof connectionID == "string")) invalidPayload()
                if (!(typeof reason == "string")) invalidPayload()

                if (!this.peers.has(sourceID)) throw new AccessDeniedError(sourceID)
                return await this.parent.closeConnection(sourceID, connectionID, reason)
            },
            "virtualNetwork:server:disconnect": async (peers) => {
                if (!(peers instanceof Array)) invalidPayload()

                for (const peer of peers) {
                    await handlers["virtualNetwork:server:removePeer"](peer)
                }
            },
            "virtualNetwork:server:getPeers": async () => {
                return await this.parent.getPeers()
            },
            "virtualNetwork:server:findPeersByName": async (name) => {
                return this.parent.findPeersByName(name)
            },
            "virtualNetwork:server:sendPacket": async (packet) => {
                if (!(typeof packet == "object" && packet != null)) invalidPayload()
                if (!(typeof packet.connection == "string")) invalidPayload()
                if (!(typeof packet.source == "string")) invalidPayload()
                if (!(typeof packet.target == "string")) invalidPayload()

                if (!this.peers.has(packet.source)) throw new AccessDeniedError(packet.source)
                await this.parent.sendPacket(packet)
            }
        }

        this.messageBridge.onRequest.add(this, (event) => {
            if (event.type in handlers) {
                event.handle((data) => {
                    return handlers[event.type as keyof ServerMessages](data)
                })
            }
        })
    }
}

function ignoreMessageBridgeDisposedError(err: any) {
    //if (err instanceof MessageBridgeDisposedError) {
    return
    //}

    //throw err
}

class ModemParentFacade implements VirtualNetworkInternals.NetworkParentFacade {
    public owner: VirtualModemClient = null!

    public registerPeer(name: string, facade: VirtualNetworkInternals.NetworkChildFacade): Promise<string> {
        return this.sendRequest("virtualNetwork:server:registerPeer", { name })
    }

    public removePeer(id: string): Promise<void> {
        return this.sendRequest("virtualNetwork:server:removePeer", id)
    }

    public openConnection(clientID: string, serverID: string): Promise<VirtualNetworkInternals.Connection> {
        return this.sendRequest("virtualNetwork:server:openConnection", { clientID, serverID })
    }

    public closeConnection(sourceID: string, connectionID: string, reason: string): Promise<void> {
        return this.sendRequest("virtualNetwork:server:closeConnection", { sourceID, connectionID, reason })
    }

    public getPeers(): Promise<VirtualNetworkInternals.PeerInfo[]> {
        return this.sendRequest("virtualNetwork:server:getPeers", undefined)
    }
    public findPeersByName(name: string): Promise<string[]> {
        return this.sendRequest("virtualNetwork:server:findPeersByName", name)
    }

    public sendPacket(packet: VirtualNetworkInternals.Packet): Promise<void> {
        return this.sendRequest("virtualNetwork:server:sendPacket", packet).catch(ignoreMessageBridgeDisposedError)
    }

    public disconnect(delegate: VirtualNetworkInternals.NetworkChildFacade): void {
        this.sendRequest("virtualNetwork:server:disconnect", [...this.owner["peers"].values()].map(v => v.id)).catch(ignoreMessageBridgeDisposedError)
    }

    protected sendRequest<T extends keyof ServerMessages>(request: T, data: Parameters<ServerMessages[T]>[0]) {
        return this.owner.messageBridge.sendRequest(request, data) as Promise<ReturnType<ServerMessages[T]>>
    }
}

export class VirtualModemClient extends VirtualRouter {
    public context = DIContext.current
    public messageBridge = this.context.inject(MessageBridge)

    constructor() {
        super(new ModemParentFacade())
        void ((this.parent as ModemParentFacade).owner = this)

        const handlers: {
            [P in keyof ClientMessages]: (...args: Parameters<ClientMessages[P]>) => Promise<ReturnType<ClientMessages[P]>>
        } = {
            "virtualNetwork:client:openConnection": async (connection) => {
                if (!(typeof connection == "object" && connection != null)) invalidPayload()
                if (!(typeof connection.id == "string")) invalidPayload()
                if (!(typeof connection.client == "string")) invalidPayload()
                if (!(typeof connection.server == "string")) invalidPayload()

                return this.childFacade.openConnection(connection)
            },
            "virtualNetwork:client:closeConnection": async ({ targetID, connection, reason }) => {
                if (!(typeof targetID == "string")) invalidPayload()
                if (!(typeof connection == "string")) invalidPayload()
                if (!(typeof reason == "string")) invalidPayload()

                return this.childFacade.closeConnection(targetID, connection, reason)
            },
            "virtualNetwork:client:receivePacket": async (packet) => {
                if (!(typeof packet == "object" && packet != null)) invalidPayload()
                if (!(typeof packet.connection == "string")) invalidPayload()
                if (!(typeof packet.source == "string")) invalidPayload()
                if (!(typeof packet.target == "string")) invalidPayload()

                return this.childFacade.receivePacket(packet)
            }
        }

        this.messageBridge.onRequest.add(this, (event) => {
            if (event.type in handlers) {
                event.handle((data) => {
                    return handlers[event.type as keyof ClientMessages](data)
                })
            }
        })
    }
}