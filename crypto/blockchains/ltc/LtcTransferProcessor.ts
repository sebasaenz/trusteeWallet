/**
 * @version 0.20
 */

import DogeTransferProcessor from '../doge/DogeTransferProcessor'
import { BlocksoftBlockchainTypes } from '../BlocksoftBlockchainTypes'

export default class LtcTransferProcessor extends DogeTransferProcessor implements BlocksoftBlockchainTypes.TransferProcessor {

    _trezorServerCode = 'LTC_TREZOR_SERVER'

    _builderSettings: BlocksoftBlockchainTypes.BuilderSettings = {
        minOutputDustReadable: 0.000005,
        minChangeDustReadable: 0.00001,
        feeMaxReadable: 0.2, // for tx builder
        feeMaxAutoReadable2: 0.2, // for fee calc,
        feeMaxAutoReadable6: 0.1, // for fee calc
        feeMaxAutoReadable12: 0.05, // for fee calc
        changeTogether: true
    }

    canRBF(data: BlocksoftBlockchainTypes.DbAccount, transaction: BlocksoftBlockchainTypes.DbTransaction): boolean {
        return false
    }
}
