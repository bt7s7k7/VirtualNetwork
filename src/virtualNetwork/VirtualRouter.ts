import { joinIterable, makeRandomID } from "../comTypes/util"
import { DISPOSE } from "../eventLib/Disposable"
import { EventListener } from "../eventLib/EventListener"
import { Registry } from "../registry/Registry"
import { AccessDeniedError, ConnectionRejectedError, InvalidConnectionError, PeerNotFoundError, VirtualNetworkInternals } from "./types"

interface PeerHandle {
    id: string
    name: string
    facade: VirtualNetworkInternals.NetworkChildFacade
}

const PeersRegistry = Registry.define<PeerHandle>()
    .addKeyShared("facade")
    .addKey("id")
    .build()

const ConnectionRegistry = Registry.define<VirtualNetworkInternals.Connection>()
    .addKeyShared("client")
    .addKeyShared("server")
    .addKey("id")
    .build()


export class RouterParentFacadeImpl implements VirtualNetworkInternals.NetworkParentFacade {
    protected get peers() { return this.owner["peers"] }
    protected get connections() { return this.owner["connections"] }

    public async registerPeer(name: string, facade: VirtualNetworkInternals.NetworkChildFacade): Promise<string> {
        const id = (await this.owner["parent"]?.registerPeer(name, this.owner["childFacade"])) ?? makeRandomID()

        const peerHandle: PeerHandle = {
            id, facade: facade, name
        }

        this.peers.register(peerHandle)

        return id
    }

    public async removePeer(id: string) {
        const peer = this.peers.id.tryFind(id)
        if (peer) {
            const connections = new Set(joinIterable(this.connections.client.tryFindAll(id) ?? [], this.connections.server.tryFindAll(id) ?? []))
            for (const connection of connections) {
                this.closeConnection(id, connection.id, "peer disconnected")
            }

            this.peers.unregister(peer)

            if (this.owner["parent"]) {
                await this.owner["parent"].removePeer(id)
            }
        }
    }

    public async openConnection(clientID: string, serverID: string): Promise<VirtualNetworkInternals.Connection> {
        const client = this.peers.id.tryFind(clientID)
        if (!client) throw new AccessDeniedError(clientID)

        const server = this.peers.id.tryFind(serverID)
        if (server) {
            const connection: VirtualNetworkInternals.Connection = {
                id: makeRandomID(),
                client: clientID,
                server: serverID
            }

            const success = await server.facade.openConnection(connection)
            if (!success) throw new ConnectionRejectedError(serverID)

            this.connections.register(connection)

            return connection
        } else if (this.owner["parent"]) {
            return this.owner["parent"].openConnection(clientID, serverID)
        } else {
            throw new PeerNotFoundError(serverID)
        }
    }

    public async closeConnection(sourceID: string, connectionID: string, reason: string) {
        const source = this.peers.id.tryFind(sourceID)
        if (!source) throw new AccessDeniedError(sourceID)

        const connection = this.connections.id.tryFind(connectionID)
        if (!connection) {
            await this.owner["parent"]?.closeConnection(sourceID, connectionID, reason)
            return
        }

        const targetID = connection.client == sourceID ? connection.server : connection.server == sourceID ? connection.client : null
        if (targetID == null) throw new AccessDeniedError(sourceID)

        const target = this.peers.id.find(targetID)
        this.connections.unregister(connection)
        target.facade.closeConnection(targetID, connection.id, reason)
    }

    public async getPeers(): Promise<VirtualNetworkInternals.PeerInfo[]> {
        if (this.owner["parent"]) {
            return this.owner["parent"].getPeers()
        } else {
            return [...this.peers.values()].map(({ id, name }) => ({ id, name }))
        }
    }

    public async sendPacket(packet: VirtualNetworkInternals.Packet) {
        const source = this.peers.id.tryFind(packet.source)
        if (!source) throw new AccessDeniedError(packet.source)

        const connection = this.connections.id.tryFind(packet.connection)
        if (!connection) {
            if (this.owner["parent"]) {
                await this.owner["parent"].sendPacket(packet)
                return
            } else {
                throw new InvalidConnectionError(packet.connection)
            }
        }

        if (!connection) throw new InvalidConnectionError(packet.connection)

        const valid = (
            (packet.source == connection.client && packet.target == connection.server) ||
            (packet.target == connection.client && packet.source == connection.server)
        )

        if (!valid) throw new InvalidConnectionError(packet.connection)

        const target = this.peers.id.find(packet.target)
        target.facade.receivePacket(packet)
    }

    public disconnect(delegate: VirtualNetworkInternals.NetworkChildFacade) {
        const peers = this.peers.facade.findAll(delegate)
        for (const peer of peers) {
            this.removePeer(peer.id)
        }
    }

    constructor(
        protected readonly owner: VirtualRouter
    ) { }
}

class RouterChildFacadeImpl implements VirtualNetworkInternals.NetworkChildFacade {
    protected get peers() { return this.owner["peers"] }

    public async closeConnection(targetID: string, connection: string, reason: string): Promise<void> {
        const target = this.peers.id.find(targetID)
        return target.facade.closeConnection(targetID, connection, reason)
    }

    public openConnection(connection: VirtualNetworkInternals.Connection): Promise<boolean> {
        const target = this.peers.id.find(connection.server)
        return target.facade.openConnection(connection)
    }

    public async receivePacket(packet: VirtualNetworkInternals.Packet): Promise<void> {
        const target = this.peers.id.find(packet.target)
        return target.facade.receivePacket(packet)
    }

    constructor(
        protected readonly owner: VirtualRouter
    ) { }
}

export class VirtualRouter extends EventListener {
    protected peers = new PeersRegistry()
    protected connections = new ConnectionRegistry()

    protected parentFacade = new RouterParentFacadeImpl(this)
    protected childFacade = new RouterChildFacadeImpl(this)

    public [DISPOSE]() {
        if (this.parent) {
            this.parent.disconnect(this.childFacade)
        }

        super[DISPOSE]()
    }

    public connect() {
        return this.parentFacade
    }

    constructor(
        protected readonly parent: VirtualNetworkInternals.NetworkParentFacade | null = null
    ) { super() }
}