import { makeRandomID } from "../comTypes/util"
import { ClientEventListener } from "../eventLib/ClientEventListener"
import { Disposable, DISPOSE, isObjectDisposed } from "../eventLib/Disposable"
import { EventEmitter } from "../eventLib/EventEmitter"
import { VirtualNetworkInternals } from "./types"

class PeerChildFacadeImpl implements VirtualNetworkInternals.NetworkChildFacade {
    protected owner: VirtualPeer = null!

    public async closeConnection(sourceID: string, connectionID: string, reason: string): Promise<void> {
        const connection = this.owner["connections"].get(connectionID)
        if (!connection) return

        connection.onEnd.emit({ reason })
        this.owner["connections"].delete(connectionID)
        ClientEventListener.prototype[DISPOSE].apply(connection)
    }

    public async openConnection(connection: VirtualNetworkInternals.Connection): Promise<boolean> {
        if (!this.owner["hostEnabled"]) return false

        const connectionHandle = new VirtualPeer.Connection(connection.id, connection.client, this.owner)
        this.owner.onConnection.emit(connectionHandle)

        if (isObjectDisposed(connectionHandle)) return false

        this.owner["connections"].set(connectionHandle.id, connectionHandle)

        return true
    }

    public async receivePacket(packet: VirtualNetworkInternals.Packet): Promise<void> {
        const connection = this.owner["connections"].get(packet.connection)
        if (!connection) return

        connection.onPacket.emit(packet.data)
    }
}


export class VirtualPeer extends Disposable {
    protected hostEnabled = false
    protected connections = new Map<string, VirtualPeer.Connection>()

    public readonly onConnection = new EventEmitter<VirtualPeer.Connection>()

    public [DISPOSE]() {
        super[DISPOSE]()

        this.parent.disconnect(this.facade)
    }

    public enableHost() {
        this.hostEnabled = true
    }

    public async connect(serverID: string) {
        const connection = await this.parent.openConnection(this.id, serverID)
        const connectionHandle = new VirtualPeer.Connection(connection.id, connection.server, this)
        this.connections.set(connectionHandle.id, connectionHandle)
        return connectionHandle
    }

    public getPeers() {
        return this.parent.getPeers()
    }

    protected constructor(
        public readonly id: string,
        public readonly name: string,
        protected readonly parent: VirtualNetworkInternals.NetworkParentFacade,
        protected readonly facade: PeerChildFacadeImpl
    ) { super() }

    public static async make(parent: VirtualNetworkInternals.NetworkParentFacade, name = "anon." + makeRandomID()) {
        const facade = new PeerChildFacadeImpl()
        const id = await parent.registerPeer(name, facade)

        const peer = new VirtualPeer(id, name, parent, facade)
        facade["owner"] = peer

        return peer
    }
}

export namespace VirtualPeer {
    export class Connection extends ClientEventListener {
        public readonly onPacket = new EventEmitter<any>()
        public readonly onEnd = new EventEmitter<{ reason: string }>()

        public [DISPOSE]() {
            this.end("connection disposed")
        }

        public end(reason: string) {
            this.owner["parent"].closeConnection(this.owner.id, this.id, reason)
            super[DISPOSE]()
        }

        public send(data: any) {
            const packet: VirtualNetworkInternals.Packet = {
                connection: this.id,
                source: this.owner.id,
                target: this.peer,
                data
            }

            return this.owner["parent"].sendPacket(packet)
        }

        constructor(
            public readonly id: string,
            public readonly peer: string,
            public readonly owner: VirtualPeer
        ) { super() }
    }
}