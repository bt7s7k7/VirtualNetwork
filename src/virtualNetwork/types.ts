
export class PeerNotFoundError extends Error {
    private _isClientError = true

    constructor(peer: string) {
        super(`Peer with id "${peer}" was not found`)
        this.name = "PeerNotFoundError"
    }
}

export class ConnectionRejectedError extends Error {
    private _isClientError = true

    constructor(peer: string) {
        super(`Connection to peer "${peer}" was rejected`)
        this.name = "ConnectionRejectedError"
    }
}

export class AccessDeniedError extends Error {
    private _isClientError = true

    constructor(peer: string) {
        super(`Tried to perform operation on behalf of peer "${peer}", who is not registered`)
        this.name = "AccessDeniedError"
    }
}

export class InvalidConnectionError extends Error {
    private _isClientError = true

    constructor(connection: string) {
        super(`Tried to send a packet through a connection "${connection}", but such connection does not exist`)
        this.name = "InvalidConnectionError"
    }
}

export namespace VirtualNetworkInternals {
    export interface Connection {
        id: string
        client: string
        server: string
    }

    export interface Packet {
        source: string
        target: string
        connection: string
        data: any
    }

    export interface PeerInfo {
        id: string
        name: string
    }

    export interface NetworkChildFacade {
        openConnection(connection: Connection): Promise<boolean>
        receivePacket(packet: Packet): Promise<void>
        closeConnection(targetID: string, connection: string, reason: string): Promise<void>
    }

    export interface NetworkParentFacade {
        registerPeer(name: string, facade: NetworkChildFacade): Promise<string>
        removePeer(id: string): Promise<void>
        openConnection(clientID: string, serverID: string): Promise<Connection>
        closeConnection(sourceID: string, connectionID: string, reason: string): Promise<void>
        getPeers(): Promise<PeerInfo[]>
        findPeersByName(name: string): Promise<string[]>
        sendPacket(packet: Packet): Promise<void>
        disconnect(delegate: NetworkChildFacade): void
    }

}
