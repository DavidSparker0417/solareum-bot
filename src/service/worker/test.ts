const assert = require('node:assert');
import {
    Worker, MessageChannel, MessagePort, isMainThread, parentPort, workerData
} from 'worker_threads';
import { ChainModel } from '../../models/chain.model.js';
import { connect } from '../../utils/connect.js';

if (isMainThread) {
    const subChannel = new MessageChannel();

    const worker = new Worker(__filename, {
        workerData: {
            id: '1'
        }
    })

    worker.postMessage({ childPort: subChannel.port1 }, [subChannel.port1]);
    subChannel.port2.on('message', (value) => {
        // console.log('>>> to worker', JSON.stringify(value).length);
        subChannel.port2.postMessage(value);
    });
} else {
    // console.log('++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++', workerData.id)

    parentPort?.once('message', async (value) => {
        let childPort: MessagePort
        let msgCount = 0
        let payloadSize = 0
        let tickNow = (new Date()).getTime()

        await connect()

        if (childPort === undefined) {
            childPort = value.childPort

            childPort.on('message', (value) => {
                msgCount += 1
                payloadSize += JSON.stringify(value).length
                // console.log('>>> from worker', JSON.stringify(value).length)
                childPort.postMessage(value);
            })
        }

        assert(childPort instanceof MessagePort)
        childPort.postMessage([...Array(1000).keys()]);

        while (true) {
            let tick = (new Date()).getTime()
            if (tick > tickNow + 5000) {
                tickNow += 5000
                const chainInfo = await ChainModel.findOne({ name: 'bsc' })
                console.log('>>>', msgCount, payloadSize, chainInfo)
            }

            await new Promise((resolve) => {
                setTimeout(() => resolve(undefined), 1000)
            })
        }
    });
}
