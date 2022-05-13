import { delayedPromise } from "../../comTypes/util"
import { VirtualNetworkInternals } from "../../virtualNetwork/types"
import { VirtualRouter } from "../../virtualNetwork/VirtualRouter"

function makeFacade(impl: Partial<VirtualNetworkInternals.NetworkChildFacade> = {}): VirtualNetworkInternals.NetworkChildFacade {
    return {
        closeConnection: jest.fn(impl.closeConnection),
        openConnection: jest.fn(impl.openConnection),
        receivePacket: jest.fn(impl.receivePacket)
    }
}

async function makePeer(parent: VirtualNetworkInternals.NetworkParentFacade, impl?: Parameters<typeof makeFacade>[0]) {
    const facade = makeFacade(impl)
    const id = await parent.registerPeer("test", facade)
    return { facade, id, parent, dispose: () => parent.disconnect(facade) }
}

describe("VirtualRouter", () => {
    it("Should register a peer directly", async () => {
        const router = new VirtualRouter()
        const peer = await makePeer(router.connect())

        expect(router["peers"].id.tryFind(peer.id)?.facade).toBe(peer.facade)
    })

    it("Should register a peer all the way to root", async () => {
        const root = new VirtualRouter()
        const leaf = new VirtualRouter(root.connect())
        const peer = await makePeer(leaf.connect())

        expect(leaf["peers"].id.tryFind(peer.id)?.facade).toBe(peer.facade)
        expect(root["peers"].id.tryFind(peer.id)?.facade).toBe(leaf["childFacade"])
    })

    it("Should unregister a peer correctly", async () => {
        const router = new VirtualRouter()
        const peer = await makePeer(router.connect())

        peer.dispose()

        await delayedPromise(1)

        expect([...router["peers"].values()].length).toBe(0)
    })

    it("Should unregister a peer when a connecting router is disposed", async () => {
        const root = new VirtualRouter()
        const leaf = new VirtualRouter(root.connect())
        const peer = await makePeer(leaf.connect())

        leaf.dispose()

        await delayedPromise(1)

        expect([...root["peers"].values()].length).toBe(0)
    })

    it("Should create a connection", async () => {
        const root = new VirtualRouter()
        const router = new VirtualRouter(root.connect())
        const server = await makePeer(router.connect(), { openConnection: async () => true })
        const client = await makePeer(router.connect())

        const connection = await client.parent.openConnection(client.id, server.id)

        expect(connection).toBeTruthy()
        expect(router["connections"].client.tryFind(client.id)).toBe(connection)
        expect(router["connections"].server.tryFind(server.id)).toBe(connection)

        expect([...root["connections"].values()].length).toBe(0)
    })

    it("Should send packets", async () => {
        const root = new VirtualRouter()
        const leaf1 = new VirtualRouter(root.connect())
        const leaf2 = new VirtualRouter(root.connect())
        const server = await makePeer(leaf1.connect(), { openConnection: async () => true })
        const client = await makePeer(leaf2.connect())

        const connection = await client.parent.openConnection(client.id, server.id)

        {
            const packet: VirtualNetworkInternals.Packet = {
                connection: connection.id,
                data: null,
                source: client.id,
                target: server.id
            }

            await client.parent.sendPacket(packet)

            expect(server.facade.receivePacket).toBeCalledWith(packet)
            expect(client.facade.receivePacket).not.toBeCalled()
        }


        void (server.facade.receivePacket as jest.Mock).mockClear()
        void (client.facade.receivePacket as jest.Mock).mockClear()

        {
            const packet: VirtualNetworkInternals.Packet = {
                connection: connection.id,
                data: null,
                source: server.id,
                target: client.id
            }

            await server.parent.sendPacket(packet)

            expect(client.facade.receivePacket).toBeCalledWith(packet)
            expect(server.facade.receivePacket).not.toBeCalled()
        }
    })

    it("Should close a connection", async () => {
        const root = new VirtualRouter()
        const leaf1 = new VirtualRouter(root.connect())
        const leaf2 = new VirtualRouter(root.connect())
        const server = await makePeer(leaf1.connect(), { openConnection: async () => true })
        const client = await makePeer(leaf2.connect())

        {
            const connection = await client.parent.openConnection(client.id, server.id)

            client.parent.closeConnection(client.id, connection.id, "terminated")

            expect(server.facade.closeConnection).toBeCalledWith(server.id, connection.id, "terminated")
            expect(client.facade.closeConnection).not.toBeCalled()

            expect([...root["connections"].values()].length).toBe(0)
        }

        void (server.facade.closeConnection as jest.Mock).mockClear()
        void (client.facade.closeConnection as jest.Mock).mockClear()

        {
            const connection = await client.parent.openConnection(client.id, server.id)

            server.parent.closeConnection(server.id, connection.id, "terminated")

            expect(client.facade.closeConnection).toBeCalledWith(client.id, connection.id, "terminated")
            expect(server.facade.closeConnection).not.toBeCalled()

            expect([...root["connections"].values()].length).toBe(0)
        }
    })
})
