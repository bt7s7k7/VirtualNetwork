import { delayedPromise } from "../../comTypes/util"
import { IDProvider } from "../../dependencyInjection/commonServices/IDProvider"
import { MessageBridge } from "../../dependencyInjection/commonServices/MessageBridge"
import { DIContext } from "../../dependencyInjection/DIContext"
import { VirtualPeer } from "../../virtualNetwork/VirtualPeer"
import { VirtualRouter } from "../../virtualNetwork/VirtualRouter"
import { VirtualModemClient, VirtualModemServer } from "../../virtualNetworkModem/VirtualModem"

describe("VirtualModem", () => {
    it("Should register and unregister a peer", async () => {
        const context = new DIContext()
        context.provide(IDProvider, () => new IDProvider.Incremental())
        context.provide(MessageBridge, () => new MessageBridge.Dummy())

        const root = new VirtualRouter()
        const server = context.instantiate(() => new VirtualModemServer(root.connect()))
        const client = context.instantiate(() => new VirtualModemClient())
        const leaf = new VirtualRouter(client.connect())

        const peer = await VirtualPeer.make(leaf.connect())
        expect(root["peers"].id.tryFind(peer.id)).toBeTruthy()
        peer.dispose()

        await delayedPromise(1)
        expect([...root["peers"].values()].length).toBe(0)
    })

    it("Should throw on unregistered peer", async () => {
        const context = new DIContext()
        context.provide(IDProvider, () => new IDProvider.Incremental())
        context.provide(MessageBridge, () => new MessageBridge.Dummy())

        const root = new VirtualRouter()
        const server = context.instantiate(() => new VirtualModemServer(root.connect()))
        const client = context.instantiate(() => new VirtualModemClient())

        await expect(client["parent"]!.openConnection("invalid", "invalid")).rejects.toBeInstanceOf(MessageBridge.ServerError)
    })

    it("Should send packets", async () => {
        const context1 = new DIContext()
        context1.provide(IDProvider, () => new IDProvider.Incremental())
        context1.provide(MessageBridge, () => new MessageBridge.Dummy())

        const root = new VirtualRouter()
        const server1 = context1.instantiate(() => new VirtualModemServer(root.connect()))
        const client1 = context1.instantiate(() => new VirtualModemClient())
        const leaf1 = new VirtualRouter(client1.connect())

        const context2 = new DIContext()
        context2.provide(IDProvider, () => new IDProvider.Incremental())
        context2.provide(MessageBridge, () => new MessageBridge.Dummy())

        const server2 = context2.instantiate(() => new VirtualModemServer(root.connect()))
        const client2 = context2.instantiate(() => new VirtualModemClient())
        const leaf2 = new VirtualRouter(client2.connect())

        const client = await VirtualPeer.make(leaf1.connect())
        const server = await VirtualPeer.make(leaf2.connect())

        const data1 = { label: "data1" }
        const data2 = { label: "data2" }

        let receive1 = null
        let receive2 = null

        server.enableHost()
        server.onConnection.add(null, (serverConnection) => {
            serverConnection.onPacket.add(null, (data) => {
                receive1 = data
                serverConnection.send(data2)
            })

        })

        const clientConnection = await client.connect(server.id)
        clientConnection.onPacket.add(null, (data) => {
            receive2 = data
        })

        clientConnection.send(data1)

        await delayedPromise(1)

        expect(receive1).toMatchObject(data1)
        expect(receive2).toMatchObject(data2)
    })

    it("Should remove all peer on client dispose", async () => {
        const context = new DIContext()
        context.provide(IDProvider, () => new IDProvider.Incremental())
        context.provide(MessageBridge, () => new MessageBridge.Dummy())

        const root = new VirtualRouter()
        const server = context.instantiate(() => new VirtualModemServer(root.connect()))
        const client = context.instantiate(() => new VirtualModemClient())
        const leaf = new VirtualRouter(client.connect())

        const peer = await VirtualPeer.make(leaf.connect())
        client.dispose()

        await delayedPromise(1)
        expect([...root["peers"].values()].length).toBe(0)
    })

    it("Should remove all peer on server dispose", async () => {
        const context = new DIContext()
        context.provide(IDProvider, () => new IDProvider.Incremental())
        context.provide(MessageBridge, () => new MessageBridge.Dummy())

        const root = new VirtualRouter()
        const server = context.instantiate(() => new VirtualModemServer(root.connect()))
        const client = context.instantiate(() => new VirtualModemClient())
        const leaf = new VirtualRouter(client.connect())

        const peer = await VirtualPeer.make(leaf.connect())
        server.dispose()

        await delayedPromise(1)
        expect([...root["peers"].values()].length).toBe(0)
    })
})