import { delayedPromise } from "../../comTypes/util"
import { ConnectionRejectedError } from "../../virtualNetwork/types"
import { VirtualPeer } from "../../virtualNetwork/VirtualPeer"
import { VirtualRouter } from "../../virtualNetwork/VirtualRouter"

describe("VirtualPeer", () => {
    it("Should create a peer", async () => {
        const router = new VirtualRouter()
        const peer = await VirtualPeer.make(router.connect())

        expect(router["peers"].id.tryFind(peer.id)?.facade).toBe(peer["facade"])
    })

    it("Should reject a connection", async () => {
        const router = new VirtualRouter()
        const client = await VirtualPeer.make(router.connect())
        const server = await VirtualPeer.make(router.connect())
        expect.assertions(1)

        try {
            await client.connect(server.id)
        } catch (err) {
            expect(err).toBeInstanceOf(ConnectionRejectedError)
        }
    })

    it("Should create a connection", async () => {
        const router = new VirtualRouter()
        const client = await VirtualPeer.make(router.connect())
        const server = await VirtualPeer.make(router.connect())

        server.enableHost()
        server.onConnection.add(null, (serverConnection) => {
            delayedPromise(1).then(() => {
                expect(serverConnection.id).toBe(clientConnection.id)
            })
        })

        const clientConnection = await client.connect(server.id)
        expect(clientConnection).toBeTruthy()

        await delayedPromise(2)

        expect.assertions(2)
    })

    it("Should send packets", async () => {
        const root = new VirtualRouter()
        const leaf1 = new VirtualRouter(root.connect())
        const leaf2 = new VirtualRouter(root.connect())
        const client = await VirtualPeer.make(leaf1.connect())
        const server = await VirtualPeer.make(leaf2.connect())

        const data1 = {}
        const data2 = {}

        let receive1 = null
        let receive2 = null

        server.enableHost()
        server.onConnection.add(null, (serverConnection) => {
            serverConnection.onMessage.add(null, (data) => {
                receive1 = data
                serverConnection.send(data2)
            })

        })

        const clientConnection = await client.connect(server.id)
        clientConnection.onMessage.add(null, (data) => {
            receive2 = data
        })

        clientConnection.send(data1)

        await delayedPromise(1)

        expect(receive1).toBe(data1)
        expect(receive2).toBe(data2)
    })

    it("Should close a connection", async () => {
        const root = new VirtualRouter()
        const leaf1 = new VirtualRouter(root.connect())
        const leaf2 = new VirtualRouter(root.connect())
        const client = await VirtualPeer.make(leaf1.connect())
        const server = await VirtualPeer.make(leaf2.connect())

        server.enableHost()

        server.onConnection.add(null, (serverConnection) => {
            serverConnection.onEnd.add(null, ({ reason }) => {
                expect(reason).toBe("test")
            })
        })

        const connection = await client.connect(server.id)

        await delayedPromise(1)

        connection.end("test")

        await delayedPromise(1)
    })

    it("Should close on dispose on client connection", async () => {
        const root = new VirtualRouter()
        const leaf1 = new VirtualRouter(root.connect())
        const leaf2 = new VirtualRouter(root.connect())
        const client = await VirtualPeer.make(leaf1.connect())
        const server = await VirtualPeer.make(leaf2.connect())

        server.enableHost()
        expect.assertions(1)

        server.onConnection.add(null, (serverConnection) => {
            serverConnection.onEnd.add(null, ({ reason }) => {
                expect(reason).toBe("connection disposed")
            })
        })

        const connection = await client.connect(server.id)

        await delayedPromise(1)

        connection.dispose()

        await delayedPromise(1)
    })

    it("Should close on dispose on client", async () => {
        const root = new VirtualRouter()
        const leaf1 = new VirtualRouter(root.connect())
        const leaf2 = new VirtualRouter(root.connect())
        const client = await VirtualPeer.make(leaf1.connect())
        const server = await VirtualPeer.make(leaf2.connect())

        server.enableHost()
        expect.assertions(1)

        server.onConnection.add(null, (serverConnection) => {
            serverConnection.onEnd.add(null, ({ reason }) => {
                expect(reason).toBe("peer disconnected")
            })
        })

        const connection = await client.connect(server.id)

        await delayedPromise(1)

        client.dispose()

        await delayedPromise(1)
    })

    it("Should close on dispose on server connection", async () => {
        const root = new VirtualRouter()
        const leaf1 = new VirtualRouter(root.connect())
        const leaf2 = new VirtualRouter(root.connect())
        const client = await VirtualPeer.make(leaf1.connect())
        const server = await VirtualPeer.make(leaf2.connect())

        server.enableHost()
        expect.assertions(1)

        server.onConnection.add(null, (serverConnection) => {
            delayedPromise(1).then(() => {
                serverConnection.dispose()
            })
        })

        const connection = await client.connect(server.id)
        connection.onEnd.add(null, ({ reason }) => {
            expect(reason).toBe("connection disposed")
        })

        await delayedPromise(2)
    })

    it("Should close on dispose on server", async () => {
        const root = new VirtualRouter()
        const leaf1 = new VirtualRouter(root.connect())
        const leaf2 = new VirtualRouter(root.connect())
        const client = await VirtualPeer.make(leaf1.connect())
        const server = await VirtualPeer.make(leaf2.connect())

        server.enableHost()
        expect.assertions(1)

        server.onConnection.add(null, (serverConnection) => {
            delayedPromise(1).then(() => {
                server.dispose()
            })
        })

        const connection = await client.connect(server.id)
        connection.onEnd.add(null, ({ reason }) => {
            expect(reason).toBe("peer disconnected")
        })

        await delayedPromise(2)
    })
})
